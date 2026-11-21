import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import {
  autenticarBridgeAvancado,
  crmBridgeJson,
  crmBridgeOptionsResponse,
} from '@/lib/crm-bridge/auth';
import { autoProvisionarCrmAoPagarPlano } from '@/lib/crm-bridge/autoProvision';
import { gerarSlugLoja } from '@/lib/crm-bridge/fase6';

export async function OPTIONS(req: NextRequest) {
  return crmBridgeOptionsResponse(req);
}

/**
 * GET /api/crm-bridge/multi-loja/provisionar
 * Lista instâncias PhoneCenterCRM multi-loja registradas + lojas ativas (Super Admin / Master).
 */
export async function GET(req: NextRequest) {
  const auth = await autenticarBridgeAvancado(req, { requireMaster: true, skipPlanGate: true });
  if (!auth.ok) {
    return crmBridgeJson({ ok: false, error: auth.error }, auth.status || 401, req);
  }

  const [tenantsRes, lojasRes] = await Promise.all([
    supabaseAdmin.from('crm_tenants').select('*').order('created_at', { ascending: false }),
    supabaseAdmin
      .from('lojas')
      .select('id, nome')
      .eq('ativo', true)
      .order('nome', { ascending: true })
      .limit(100),
  ]);

  if (tenantsRes.error) {
    return crmBridgeJson(
      {
        ok: true,
        tenants: [],
        lojas: lojasRes.data || [],
        coolifyConfigured: Boolean(process.env.COOLIFY_API_URL && process.env.COOLIFY_API_TOKEN),
        migrationPendente: tenantsRes.error.message.includes('does not exist'),
      },
      200,
      req
    );
  }

  return crmBridgeJson(
    {
      ok: true,
      total: (tenantsRes.data || []).length,
      tenants: tenantsRes.data || [],
      lojas: lojasRes.data || [],
      coolifyConfigured: Boolean(process.env.COOLIFY_API_URL && process.env.COOLIFY_API_TOKEN),
      migrationPendente: false,
    },
    200,
    req
  );
}

/**
 * POST /api/crm-bridge/multi-loja/provisionar
 * Provisiona loja em modo 'compartilhado' (padrão escalável R$ 299) ou 'isolado' (Enterprise Coolify).
 */
export async function POST(req: NextRequest) {
  const auth = await autenticarBridgeAvancado(req, { requireMaster: true, skipPlanGate: true });
  if (!auth.ok) {
    return crmBridgeJson({ ok: false, error: auth.error }, auth.status || 401, req);
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const lojaId = String(body.lojaId || '').trim();
    const nomeLoja = String(body.nomeLoja || '').trim();
    const slugManual = gerarSlugLoja(String(body.slug || nomeLoja));
    const modo: 'compartilhado' | 'isolado' =
      body.modo === 'isolado' ? 'isolado' : 'compartilhado';

    if (!lojaId || !slugManual) {
      return crmBridgeJson({ ok: false, error: 'Informe lojaId e nomeLoja/slug.' }, 400, req);
    }

    const resProv = await autoProvisionarCrmAoPagarPlano({
      lojaId,
      nomeLoja: nomeLoja || slugManual,
      slugManual,
      modo,
      forcarReprovisionamento: true,
    });

    const { data: tenant } = await supabaseAdmin
      .from('crm_tenants')
      .select('*')
      .eq('loja_id', lojaId)
      .maybeSingle();

    const baseDomain = (process.env.CRM_BASE_DOMAIN || 'crm.phonecenter.tech').trim();
    const origin = req.nextUrl.origin || 'https://app.phonecenter.tech';
    const tokenUso = resProv.bridgeToken || '<BRIDGE_TOKEN_DA_LOJA>';

    return crmBridgeJson(
      {
        ok: true,
        modo,
        tenant,
        bridgeToken: resProv.bridgeToken || '',
        webhookToken: resProv.webhookToken || '',
        evoTeamId: resProv.evoTeamId || null,
        dnsRecordsRequired:
          modo === 'isolado'
            ? [
                { type: 'A', name: `${resProv.slug || slugManual}.${baseDomain}`, value: '13.140.36.50' },
                { type: 'A', name: `api-${resProv.slug || slugManual}.${baseDomain}`, value: '13.140.36.50' },
              ]
            : [],
        templatePath:
          modo === 'isolado' ? 'infra/crm/docker-compose.tenant.yml' : 'stack-compartilhada',
        sidebarUrl: `${origin}/crm-sidebar?loja_id=${lojaId}&token=${encodeURIComponent(tokenUso)}`,
      },
      201,
      req
    );
  } catch (err) {
    return crmBridgeJson(
      { ok: false, error: err instanceof Error ? err.message : 'Erro ao provisionar tenant.' },
      500,
      req
    );
  }
}
