import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import {
  autenticarBridge,
  crmBridgeJson,
  crmBridgeOptionsResponse,
  resolverLojaBridge,
} from '@/lib/crm-bridge/auth';
import { obterConfigCrmLoja, salvarConfigCrmLoja } from '@/lib/crm-bridge/lojaConfig';

export async function OPTIONS() {
  return crmBridgeOptionsResponse();
}

function mascararSegredo(valor: string): string {
  if (!valor) return '';
  if (valor.length <= 8) return '••••••••';
  return `${valor.slice(0, 4)}••••${valor.slice(-4)}`;
}

/**
 * GET /api/crm-bridge/config-loja
 * Retorna a configuração CRM isolada da loja (do Supabase) + lista de lojas
 * disponíveis (quando ?listar_lojas=1) sem expor segredos em texto puro.
 */
export async function GET(req: NextRequest) {
  const auth = autenticarBridge(req);
  if (!auth.ok) {
    return crmBridgeJson({ ok: false, error: auth.error }, auth.status || 401);
  }

  const loja = await resolverLojaBridge(req);
  if (!loja) {
    return crmBridgeJson({ ok: false, error: 'Nenhuma loja ativa encontrada.' }, 404);
  }

  const { config, migrationPendente } = await obterConfigCrmLoja(loja.id);

  let lojas: Array<{ id: string; nome: string }> = [];
  if (req.nextUrl.searchParams.get('listar_lojas') === '1') {
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

  return crmBridgeJson({
    ok: true,
    loja,
    lojas,
    migrationPendente,
    config: {
      ...config,
      crm_access_token: mascararSegredo(config.crm_access_token),
      crm_access_token_configurado: Boolean(config.crm_access_token),
      mercadopago_access_token: mascararSegredo(config.mercadopago_access_token),
      mercadopago_configurado: Boolean(config.mercadopago_access_token),
      asaas_api_key: mascararSegredo(config.asaas_api_key),
      asaas_configurado: Boolean(config.asaas_api_key),
      meta_capi_access_token: mascararSegredo(config.meta_capi_access_token),
      meta_capi_configurado: Boolean(config.meta_capi_access_token),
    },
  });
}

/**
 * PUT /api/crm-bridge/config-loja
 * Salva as configurações CRM/Pix/Meta/Evolution específicas desta loja no Supabase.
 * Campos secretos enviados vazios ou com '••••' mantêm o valor já salvo no banco.
 */
export async function PUT(req: NextRequest) {
  const auth = autenticarBridge(req);
  if (!auth.ok) {
    return crmBridgeJson({ ok: false, error: auth.error }, auth.status || 401);
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const loja = await resolverLojaBridge(req, body.loja_id ? String(body.loja_id) : undefined);
    if (!loja) {
      return crmBridgeJson({ ok: false, error: 'Loja não encontrada.' }, 404);
    }

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
    ];
    for (const k of camposSimples) {
      if (body[k] !== undefined) patch[k] = body[k];
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
    return crmBridgeJson({
      ok: true,
      loja,
      config: {
        ...salva,
        crm_access_token: mascararSegredo(salva.crm_access_token),
        mercadopago_access_token: mascararSegredo(salva.mercadopago_access_token),
        asaas_api_key: mascararSegredo(salva.asaas_api_key),
        meta_capi_access_token: mascararSegredo(salva.meta_capi_access_token),
      },
    });
  } catch (err) {
    return crmBridgeJson(
      { ok: false, error: err instanceof Error ? err.message : 'Erro ao salvar configuração.' },
      500
    );
  }
}
