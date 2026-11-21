import { readFileSync } from 'fs';
import { join } from 'path';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { registrarLog } from '@/lib/logger';
import { verificarPermissaoRecursoPlano } from '@/lib/planos-config';
import { gerarSlugLoja } from './fase6';
import { garantirTokensLoja, salvarConfigCrmLoja } from './lojaConfig';

export interface VerificacaoPlanoCrm {
  liberado: boolean;
  planoTipo: string;
  planoStatus: string;
  motivo?: string;
}

/**
 * Garante que a loja tem o plano mais caro ('avancado') ativo para usar o PhoneCenterCRM.
 */
export async function verificarPlanoCrmLoja(lojaId: string): Promise<VerificacaoPlanoCrm> {
  if (process.env.CRM_SKIP_PLAN_GATE === 'true') {
    return { liberado: true, planoTipo: 'avancado', planoStatus: 'ativo' };
  }

  const { data: loja } = await supabaseAdmin
    .from('lojas')
    .select('id, nome, plano_tipo, plano_status, ativo')
    .eq('id', lojaId)
    .maybeSingle();

  if (!loja) {
    return {
      liberado: false,
      planoTipo: 'entrada',
      planoStatus: 'inativo',
      motivo: 'Loja não encontrada.',
    };
  }

  const planoTipo = String(loja.plano_tipo || 'entrada').toLowerCase();
  const planoStatus = String(loja.plano_status || '').toLowerCase();
  if (planoStatus === 'vitalicio') {
    return { liberado: true, planoTipo: 'avancado', planoStatus };
  }

  const temRecurso = verificarPermissaoRecursoPlano(planoTipo, 'crm_omnichannel');

  if (!temRecurso) {
    return {
      liberado: false,
      planoTipo,
      planoStatus,
      motivo: 'O PhoneCenterCRM Omnichannel é exclusivo do plano Avançado.',
    };
  }

  if (loja.ativo === false || ['suspenso', 'cancelado', 'expirado'].includes(planoStatus)) {
    return {
      liberado: false,
      planoTipo,
      planoStatus,
      motivo: 'Assinatura do plano Avançado inativa ou pendente.',
    };
  }

  return { liberado: true, planoTipo, planoStatus };
}

async function criarTeamNoEvoCrmCompartilhado(nomeTeam: string): Promise<number | null> {
  const accessToken = (process.env.CRM_EVO_ACCESS_TOKEN || '').trim();
  if (!accessToken) return null;
  const apiUrl = (process.env.CRM_EVO_API_URL || 'https://api-crm.phonecenter.tech').replace(
    /\/+$/,
    ''
  );
  try {
    const res = await fetch(`${apiUrl}/api/v1/teams`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        api_access_token: accessToken,
      },
      body: JSON.stringify({
        name: nomeTeam,
        description: `Time isolado PhoneCenterCRM: ${nomeTeam}`,
        allow_auto_assign: true,
      }),
    });
    if (!res.ok) return null;
    const d = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const teamId = Number(d.id || (d.payload as Record<string, unknown> | undefined)?.id || 0);
    return teamId > 0 ? teamId : null;
  } catch {
    return null;
  }
}

/**
 * Provisiona uma loja no PhoneCenterCRM:
 * - modo 'compartilhado' (padrão R$ 299): zero RAM extra na VPS; gera bridge_token/webhook_token
 *   isolados, configura crm_loja_configs apontando p/ stack compartilhada e cria Team dedicado no EvoCRM.
 * - modo 'isolado' (Enterprise): envia docker-compose.tenant.yml (base64 docker_compose_raw) para
 *   Coolify API quando configurada, criando stack exclusiva <slug>.crm.phonecenter.tech.
 */
export async function autoProvisionarCrmAoPagarPlano(input: {
  lojaId: string;
  nomeLoja?: string | null;
  planoTipo?: string | null;
  slugManual?: string | null;
  modo?: 'compartilhado' | 'isolado';
  forcarReprovisionamento?: boolean;
}): Promise<{
  triggered: boolean;
  slug?: string;
  status?: string;
  modo?: 'compartilhado' | 'isolado';
  bridgeToken?: string;
  webhookToken?: string;
  evoTeamId?: number | null;
  reason?: string;
}> {
  try {
    if (!input.forcarReprovisionamento && !verificarPermissaoRecursoPlano(input.planoTipo, 'crm_omnichannel')) {
      return { triggered: false, reason: 'Plano contratado não inclui PhoneCenterCRM.' };
    }

    const modo: 'compartilhado' | 'isolado' =
      input.modo === 'isolado' ? 'isolado' : 'compartilhado';
    const baseDomain = (process.env.CRM_BASE_DOMAIN || 'crm.phonecenter.tech').trim();
    const sharedFrontendUrl = (
      process.env.CRM_SHARED_FRONTEND_URL || `https://${baseDomain}`
    )
      .trim()
      .replace(/\/+$/, '');
    const sharedApiUrl = (
      process.env.CRM_SHARED_API_URL || `https://api-${baseDomain}`
    )
      .trim()
      .replace(/\/+$/, '');

    let slug = gerarSlugLoja(input.slugManual || input.nomeLoja || '');
    if (!slug) slug = `loja-${input.lojaId.slice(0, 8)}`;

    const { data: existente } = await supabaseAdmin
      .from('crm_tenants')
      .select('id, slug, frontend_domain, api_domain, status, modo')
      .eq('loja_id', input.lojaId)
      .maybeSingle();

    if (existente?.id && !input.forcarReprovisionamento) {
      const tokens = await garantirTokensLoja(input.lojaId);
      return {
        triggered: false,
        slug: existente.slug,
        status: existente.status,
        modo: (existente.modo as 'compartilhado' | 'isolado') || modo,
        bridgeToken: tokens.bridgeToken,
        webhookToken: tokens.webhookToken,
        reason: 'Tenant já existe.',
      };
    }

    // Evita colisão de slug entre lojas
    if (!existente?.id) {
      const { data: colisao } = await supabaseAdmin
        .from('crm_tenants')
        .select('id')
        .eq('slug', slug)
        .maybeSingle();
      if (colisao?.id) {
        slug = `${slug}-${input.lojaId.slice(0, 4)}`;
      }
    } else {
      slug = String(existente.slug);
    }

    // Mantém frontend_domain único em crm_tenants mesmo no modo compartilhado
    const frontendDomainTenant =
      modo === 'isolado' ? `${slug}.${baseDomain}` : `${slug}.shared.${baseDomain}`;
    const apiDomainTenant =
      modo === 'isolado' ? `api-${slug}.${baseDomain}` : `api-${slug}.shared.${baseDomain}`;

    const frontendUrlConfig =
      modo === 'isolado' ? `https://${slug}.${baseDomain}` : sharedFrontendUrl;
    const apiUrlConfig = modo === 'isolado' ? `https://api-${slug}.${baseDomain}` : sharedApiUrl;

    let statusFinal: 'planejado' | 'provisionando' | 'ativo' | 'erro' =
      modo === 'compartilhado' ? 'ativo' : 'planejado';
    let coolifyUuid = '';
    let evoTeamId: number | null = null;

    if (modo === 'compartilhado') {
      evoTeamId = await criarTeamNoEvoCrmCompartilhado(
        String(input.nomeLoja || slug).trim()
      );
    } else {
      const coolifyUrl = (process.env.COOLIFY_API_URL || '').trim().replace(/\/+$/, '');
      const coolifyToken = (process.env.COOLIFY_API_TOKEN || '').trim();
      const projectUuid = (process.env.COOLIFY_PROJECT_UUID || '').trim();
      const serverUuid = (process.env.COOLIFY_SERVER_UUID || '').trim();
      const envName = (process.env.COOLIFY_ENVIRONMENT_NAME || 'production').trim();

      if (coolifyUrl && coolifyToken && projectUuid && serverUuid) {
        try {
          const composeRaw = readFileSync(
            join(process.cwd(), 'infra', 'crm', 'docker-compose.tenant.yml'),
            'utf8'
          );
          const dockerComposeBase64 = Buffer.from(composeRaw, 'utf8').toString('base64');

          const res = await fetch(`${coolifyUrl}/api/v1/services`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${coolifyToken}`,
            },
            body: JSON.stringify({
              type: 'dockercompose',
              name: `phonecenter-crm-${slug}`,
              description: `PhoneCenterCRM isolado para ${input.nomeLoja || slug} (${input.lojaId})`,
              project_uuid: projectUuid,
              server_uuid: serverUuid,
              environment_name: envName,
              docker_compose_raw: dockerComposeBase64,
              instant_deploy: false,
            }),
          });
          if (res.ok) {
            const d = (await res.json().catch(() => ({}))) as Record<string, unknown>;
            coolifyUuid = String(d?.uuid || '');
            statusFinal = 'provisionando';
          }
        } catch {
          statusFinal = 'planejado';
        }
      }
    }

    const tokens = await garantirTokensLoja(input.lojaId);

    await salvarConfigCrmLoja(input.lojaId, {
      crm_ativo: true,
      crm_frontend_url: frontendUrlConfig,
      crm_api_url: apiUrlConfig,
      modo_tenant: modo,
      ...(evoTeamId ? { evo_team_id: evoTeamId } : {}),
    });

    const tenantPayload = {
      loja_id: input.lojaId,
      slug,
      frontend_domain: frontendDomainTenant,
      api_domain: apiDomainTenant,
      coolify_service_uuid: coolifyUuid,
      status: statusFinal,
      modo,
      updated_at: new Date().toISOString(),
    };

    const { error: tenantErr } = existente?.id
      ? await supabaseAdmin.from('crm_tenants').update(tenantPayload).eq('id', existente.id)
      : await supabaseAdmin.from('crm_tenants').insert(tenantPayload);

    if (tenantErr && tenantErr.message?.includes('modo')) {
      const { modo: _omitModo, ...semModo } = tenantPayload;
      if (existente?.id) {
        await supabaseAdmin.from('crm_tenants').update(semModo).eq('id', existente.id);
      } else {
        await supabaseAdmin.from('crm_tenants').insert(semModo);
      }
    }

    await registrarLog({
      loja_id: input.lojaId,
      tipo_evento: 'plano',
      acao: `Instância PhoneCenterCRM provisionada (${modo})`,
      detalhes: `URL: ${frontendUrlConfig} | Status: ${statusFinal}${evoTeamId ? ` | Team #${evoTeamId}` : ''}${coolifyUuid ? ` | Coolify UUID: ${coolifyUuid}` : ''}`,
    });

    return {
      triggered: true,
      slug,
      status: statusFinal,
      modo,
      bridgeToken: tokens.bridgeToken,
      webhookToken: tokens.webhookToken,
      evoTeamId,
    };
  } catch (err) {
    console.warn('[AutoProvision CRM] Aviso não-bloqueante:', err);
    return {
      triggered: false,
      reason: err instanceof Error ? err.message : 'Erro não-bloqueante ao provisionar CRM.',
    };
  }
}
