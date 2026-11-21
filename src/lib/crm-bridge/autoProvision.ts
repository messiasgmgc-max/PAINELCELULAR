import { supabaseAdmin } from '@/integrations/supabase/server';
import { verificarPermissaoRecursoPlano } from '@/lib/planos-config';
import { gerarSlugLoja } from './fase6';
import { registrarLog } from '@/lib/logger';

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
    return { liberado: false, planoTipo: 'entrada', planoStatus: 'inativo', motivo: 'Loja não encontrada.' };
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

/**
 * Disparado automaticamente quando uma loja paga/ativa o plano Avançado (PIX ou Cartão):
 * 1) Garante registro isolado em `crm_tenants` (`<slug>.crm.phonecenter.tech`)
 * 2) Inicializa `crm_loja_configs` para a loja no Supabase
 * 3) Se COOLIFY_API_URL + COOLIFY_API_TOKEN + COOLIFY_PROJECT_UUID + COOLIFY_SERVER_UUID
 *    estiverem configurados, solicita a criação da stack Docker isolada via Coolify API!
 * Nunca lança erro que derrube o fluxo de aprovação de pagamento.
 */
export async function autoProvisionarCrmAoPagarPlano(input: {
  lojaId: string;
  nomeLoja?: string | null;
  planoTipo?: string | null;
}): Promise<{ triggered: boolean; slug?: string; status?: string; reason?: string }> {
  try {
    if (!verificarPermissaoRecursoPlano(input.planoTipo, 'crm_omnichannel')) {
      return { triggered: false, reason: 'Plano contratado não inclui PhoneCenterCRM.' };
    }

    const baseDomain = (process.env.CRM_BASE_DOMAIN || 'crm.phonecenter.tech').trim();
    let slug = gerarSlugLoja(input.nomeLoja || '');
    if (!slug) slug = `loja-${input.lojaId.slice(0, 8)}`;

    // Verifica se a loja já tem um tenant cadastrado
    const { data: existente } = await supabaseAdmin
      .from('crm_tenants')
      .select('id, slug, frontend_domain, api_domain, status')
      .eq('loja_id', input.lojaId)
      .maybeSingle();

    if (existente?.id) {
      return { triggered: false, slug: existente.slug, status: existente.status, reason: 'Tenant já existe.' };
    }

    // Evita colisão de slug entre lojas com nomes parecidos
    const { data: colisao } = await supabaseAdmin
      .from('crm_tenants')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();
    if (colisao?.id) {
      slug = `${slug}-${input.lojaId.slice(0, 4)}`;
    }

    const frontendDomain = `${slug}.${baseDomain}`;
    const apiDomain = `api-${slug}.${baseDomain}`;

    let statusFinal: 'planejado' | 'provisionando' | 'ativo' | 'erro' = 'planejado';
    let coolifyUuid = '';

    // Se Coolify API estiver configurada, dispara criação automática da instância isolada!
    const coolifyUrl = (process.env.COOLIFY_API_URL || '').trim().replace(/\/+$/, '');
    const coolifyToken = (process.env.COOLIFY_API_TOKEN || '').trim();
    const projectUuid = (process.env.COOLIFY_PROJECT_UUID || '').trim();
    const serverUuid = (process.env.COOLIFY_SERVER_UUID || '').trim();
    const envName = (process.env.COOLIFY_ENVIRONMENT_NAME || 'production').trim();

    if (coolifyUrl && coolifyToken && projectUuid && serverUuid) {
      try {
        const res = await fetch(`${coolifyUrl}/api/v1/services`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${coolifyToken}`,
          },
          body: JSON.stringify({
            name: `phonecenter-crm-${slug}`,
            description: `PhoneCenterCRM isolado para ${input.nomeLoja || slug} (${input.lojaId})`,
            project_uuid: projectUuid,
            server_uuid: serverUuid,
            environment_name: envName,
            instant_deploy: false,
          }),
        });
        if (res.ok) {
          const d = await res.json().catch(() => ({}));
          coolifyUuid = String(d?.uuid || '');
          statusFinal = 'provisionando';
        }
      } catch {
        statusFinal = 'planejado';
      }
    }

    await supabaseAdmin.from('crm_tenants').insert({
      loja_id: input.lojaId,
      slug,
      frontend_domain: frontendDomain,
      api_domain: apiDomain,
      coolify_service_uuid: coolifyUuid,
      status: statusFinal,
    });

    await supabaseAdmin.from('crm_loja_configs').upsert(
      {
        loja_id: input.lojaId,
        crm_ativo: true,
        crm_frontend_url: `https://${frontendDomain}`,
        crm_api_url: `https://${apiDomain}`,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'loja_id' }
    );

    await registrarLog({
      loja_id: input.lojaId,
      tipo_evento: 'plano',
      acao: 'Instância PhoneCenterCRM registrada automaticamente (Plano Avançado)',
      detalhes: `Domínio: https://${frontendDomain} | Status: ${statusFinal}${coolifyUuid ? ` | Coolify UUID: ${coolifyUuid}` : ''}`,
    });

    return { triggered: true, slug, status: statusFinal };
  } catch (err) {
    console.warn('[AutoProvision CRM] Aviso não-bloqueante:', err);
    return {
      triggered: false,
      reason: err instanceof Error ? err.message : 'Erro não-bloqueante ao provisionar CRM.',
    };
  }
}
