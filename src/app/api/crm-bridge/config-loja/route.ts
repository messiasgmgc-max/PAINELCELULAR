import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import {
  autenticarBridgeAvancado,
  crmBridgeJson,
  crmBridgeOptionsResponse,
  resolverLojaAutorizada,
} from '@/lib/crm-bridge/auth';
import {
  garantirTokensLoja,
  gerarTokenSeguroLoja,
  obterConfigCrmLoja,
  salvarConfigCrmLoja,
} from '@/lib/crm-bridge/lojaConfig';

export async function OPTIONS(req: NextRequest) {
  return crmBridgeOptionsResponse(req);
}

function mascararSegredo(valor: string): string {
  if (!valor) return '';
  if (valor.length <= 8) return '••••••••';
  return `${valor.slice(0, 4)}••••${valor.slice(-4)}`;
}

/**
 * GET /api/crm-bridge/config-loja
 * Retorna a configuração CRM isolada da loja (autenticada via sessão do gestor ou token).
 */
export async function GET(req: NextRequest) {
  const auth = await autenticarBridgeAvancado(req, { requireGestao: true });
  if (!auth.ok) {
    return crmBridgeJson({ ok: false, error: auth.error }, auth.status || 401, req);
  }

  const loja = await resolverLojaAutorizada(req, auth);
  if (!loja) {
    return crmBridgeJson({ ok: false, error: 'Nenhuma loja ativa encontrada.' }, 404, req);
  }

  const tokens = await garantirTokensLoja(loja.id);
  const { config, migrationPendente } = await obterConfigCrmLoja(loja.id);
  const ehGlobal = auth.nivel === 'master' || Boolean(auth.superAdmin);

  let lojas: Array<{ id: string; nome: string }> = [loja];
  if (ehGlobal && req.nextUrl.searchParams.get('listar_lojas') === '1') {
    const { data } = await supabaseAdmin
      .from('lojas')
      .select('id, nome')
      .eq('ativo', true)
      .order('nome', { ascending: true })
      .limit(100);
    lojas = (data || []).map((l: Record<string, unknown>) => ({
      id: String(l.id),
      nome: String(l.nome || 'Loja'),
    }));
  }

  return crmBridgeJson(
    {
      ok: true,
      loja,
      lojas,
      escopoGlobal: ehGlobal,
      migrationPendente: migrationPendente || tokens.migrationPendente,
      config: {
        ...config,
        bridge_token: tokens.bridgeToken || config.bridge_token,
        webhook_token: tokens.webhookToken || config.webhook_token,
        crm_access_token: mascararSegredo(config.crm_access_token),
        crm_access_token_configurado: Boolean(config.crm_access_token),
        mercadopago_access_token: mascararSegredo(config.mercadopago_access_token),
        mercadopago_configurado: Boolean(config.mercadopago_access_token),
        asaas_api_key: mascararSegredo(config.asaas_api_key),
        asaas_configurado: Boolean(config.asaas_api_key),
        meta_capi_access_token: mascararSegredo(config.meta_capi_access_token),
        meta_capi_configurado: Boolean(config.meta_capi_access_token),
      },
    },
    200,
    req
  );
}

/**
 * PUT /api/crm-bridge/config-loja
 * Salva as configurações CRM/Pix/Meta/Evolution/Pós-Venda/SLA/Telefonia desta loja no Supabase.
 */
export async function PUT(req: NextRequest) {
  const auth = await autenticarBridgeAvancado(req, { requireGestao: true });
  if (!auth.ok) {
    return crmBridgeJson({ ok: false, error: auth.error }, auth.status || 401, req);
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const loja = await resolverLojaAutorizada(
      req,
      auth,
      body.loja_id ? String(body.loja_id) : undefined
    );
    if (!loja) {
      return crmBridgeJson({ ok: false, error: 'Loja não encontrada.' }, 404, req);
    }

    const ehGlobal = auth.nivel === 'master' || Boolean(auth.superAdmin);
    const patch: Record<string, unknown> = {};
    const camposSimples = [
      'crm_ativo',
      'crm_frontend_url',
      'crm_api_url',
      'evolution_instance_name',
      'espelhar_webhook_crm',
      'pix_key',
      'pix_city',
      'pix_provedor',
      'asaas_customer_id',
      'meta_pixel_id',
      'whatsapp_bio_numero',
      'google_review_url',
      'pos_venda_ativo',
      'telefonia_ativo',
      'telefonia_provedor',
      'telefonia_ramal_url',
      'sla_alerta_minutos',
      'sla_critico_minutos',
      'evo_team_id',
      'evo_inbox_id',
    ];
    for (const k of camposSimples) {
      if (body[k] !== undefined) patch[k] = body[k];
    }

    if (ehGlobal && (body.modo_tenant === 'compartilhado' || body.modo_tenant === 'isolado')) {
      patch.modo_tenant = body.modo_tenant;
    }

    const camposSecretos = [
      'crm_access_token',
      'mercadopago_access_token',
      'asaas_api_key',
      'meta_capi_access_token',
    ];
    for (const k of camposSecretos) {
      const val = typeof body[k] === 'string' ? body[k].trim() : '';
      if (val && !val.includes('••••')) {
        patch[k] = val;
      }
    }

    const salva = await salvarConfigCrmLoja(loja.id, patch);
    return crmBridgeJson(
      {
        ok: true,
        loja,
        config: {
          ...salva,
          crm_access_token: mascararSegredo(salva.crm_access_token),
          mercadopago_access_token: mascararSegredo(salva.mercadopago_access_token),
          asaas_api_key: mascararSegredo(salva.asaas_api_key),
          meta_capi_access_token: mascararSegredo(salva.meta_capi_access_token),
        },
      },
      200,
      req
    );
  } catch (err) {
    return crmBridgeJson(
      { ok: false, error: err instanceof Error ? err.message : 'Erro ao salvar configuração.' },
      500,
      req
    );
  }
}

/**
 * POST /api/crm-bridge/config-loja
 * Rotaciona tokens isolados da loja (bridge_token ou webhook_token).
 */
export async function POST(req: NextRequest) {
  const auth = await autenticarBridgeAvancado(req, { requireGestao: true });
  if (!auth.ok) {
    return crmBridgeJson({ ok: false, error: auth.error }, auth.status || 401, req);
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const loja = await resolverLojaAutorizada(
      req,
      auth,
      body.loja_id ? String(body.loja_id) : undefined
    );
    if (!loja) {
      return crmBridgeJson({ ok: false, error: 'Loja não encontrada.' }, 404, req);
    }

    const action = String(body.action || '').trim();
    if (action === 'rotacionar_bridge_token') {
      const novo = gerarTokenSeguroLoja('pc_loja');
      const salva = await salvarConfigCrmLoja(loja.id, { bridge_token: novo });
      return crmBridgeJson({ ok: true, bridge_token: salva.bridge_token }, 200, req);
    }

    if (action === 'rotacionar_webhook_token') {
      const novo = gerarTokenSeguroLoja('pc_wh');
      const salva = await salvarConfigCrmLoja(loja.id, { webhook_token: novo });
      return crmBridgeJson({ ok: true, webhook_token: salva.webhook_token }, 200, req);
    }

    return crmBridgeJson(
      { ok: false, error: 'Ação inválida. Use rotacionar_bridge_token ou rotacionar_webhook_token.' },
      400,
      req
    );
  } catch (err) {
    return crmBridgeJson(
      { ok: false, error: err instanceof Error ? err.message : 'Erro ao rotacionar token.' },
      500,
      req
    );
  }
}
