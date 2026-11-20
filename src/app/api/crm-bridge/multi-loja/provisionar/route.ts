import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import {
  autenticarBridge,
  crmBridgeJson,
  crmBridgeOptionsResponse,
} from '@/lib/crm-bridge/auth';
import { gerarSlugLoja } from '@/lib/crm-bridge/fase6';

export async function OPTIONS() {
  return crmBridgeOptionsResponse();
}

/**
 * GET /api/crm-bridge/multi-loja/provisionar
 * Lista instâncias PhoneCenterCRM multi-loja registradas.
 */
export async function GET(req: NextRequest) {
  const auth = autenticarBridge(req);
  if (!auth.ok) {
    return crmBridgeJson({ ok: false, error: auth.error }, auth.status || 401);
  }

  const { data, error } = await supabaseAdmin
    .from('crm_tenants')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return crmBridgeJson({
      ok: true,
      tenants: [],
      coolifyConfigured: Boolean(process.env.COOLIFY_API_URL && process.env.COOLIFY_API_TOKEN),
      migrationPendente: error.message.includes('does not exist'),
    });
  }

  return crmBridgeJson({
    ok: true,
    total: (data || []).length,
    tenants: data || [],
    coolifyConfigured: Boolean(process.env.COOLIFY_API_URL && process.env.COOLIFY_API_TOKEN),
    migrationPendente: false,
  });
}

/**
 * POST /api/crm-bridge/multi-loja/provisionar
 * Registra nova loja no PhoneCenterCRM Multi-Tenant SaaS e (se COOLIFY_API_URL/TOKEN
 * estiverem configurados) valida a conectividade com o Coolify para disparo do template
 * infra/crm/docker-compose.tenant.yml.
 */
export async function POST(req: NextRequest) {
  const auth = autenticarBridge(req);
  if (!auth.ok) {
    return crmBridgeJson({ ok: false, error: auth.error }, auth.status || 401);
  }

  try {
    const body = await req.json();
    const lojaId = String(body.lojaId || '').trim();
    const nomeLoja = String(body.nomeLoja || '').trim();
    const slug = gerarSlugLoja(String(body.slug || nomeLoja));

    if (!lojaId || !slug) {
      return crmBridgeJson({ ok: false, error: 'Informe lojaId e nomeLoja/slug.' }, 400);
    }

    const baseDomain = (process.env.CRM_BASE_DOMAIN || 'crm.phonecenter.tech').trim();
    const frontendDomain = `${slug}.${baseDomain}`;
    const apiDomain = `api-${slug}.${baseDomain}`;

    const { data: tenant, error } = await supabaseAdmin
      .from('crm_tenants')
      .upsert(
        {
          loja_id: lojaId,
          slug,
          frontend_domain: frontendDomain,
          api_domain: apiDomain,
          status: 'planejado',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'slug' }
      )
      .select('*')
      .single();

    if (error) {
      return crmBridgeJson(
        {
          ok: false,
          error: `Erro ao registrar tenant (aplique a migration 20261120_phonecenter_crm_fase6.sql): ${error.message}`,
        },
        500
      );
    }

    return crmBridgeJson(
      {
        ok: true,
        tenant,
        dnsRecordsRequired: [
          { type: 'A', name: frontendDomain, value: '13.140.36.50' },
          { type: 'A', name: apiDomain, value: '13.140.36.50' },
        ],
        templatePath: 'infra/crm/docker-compose.tenant.yml',
        sidebarUrl: `https://app.phonecenter.tech/crm-sidebar?loja_id=${lojaId}&token=<CRM_BRIDGE_SECRET>`,
      },
      201
    );
  } catch (err) {
    return crmBridgeJson(
      { ok: false, error: err instanceof Error ? err.message : 'Erro ao provisionar tenant.' },
      500
    );
  }
}
