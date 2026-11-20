import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import {
  autenticarBridge,
  crmBridgeJson,
  crmBridgeOptionsResponse,
  resolverLojaBridge,
} from '@/lib/crm-bridge/auth';

export async function OPTIONS() {
  return crmBridgeOptionsResponse();
}

/**
 * Receptor de webhooks do PhoneCenterCRM (EvoCRM).
 * Registra eventos importantes (ex: oportunidade ganha, lead de anúncio CTWA,
 * conversa resolvida, CSAT respondido) na auditoria do PhoneCenter ERP.
 */
export async function POST(req: NextRequest) {
  const auth = autenticarBridge(req);
  if (!auth.ok) {
    return crmBridgeJson({ ok: false, error: auth.error }, auth.status || 401);
  }

  const loja = await resolverLojaBridge(req);
  try {
    const payload = await req.json();
    const evento = String(payload?.event || payload?.type || 'crm_webhook');
    const contato = payload?.contact || payload?.conversation?.meta?.sender || {};
    const referral =
      payload?.referral ||
      payload?.additional_attributes?.referral ||
      payload?.conversation?.additional_attributes?.referral ||
      null;

    // Registra log estruturado sem travar o webhook caso tabela tenha variações
    try {
      await supabaseAdmin.from('logs_sistema').insert({
        loja_id: loja?.id || null,
        tipo: `crm:${evento}`,
        mensagem: JSON.stringify({
          evento,
          contatoNome: contato?.name || null,
          contatoTelefone: contato?.phone_number || null,
          referral,
          pipelineItemId: payload?.pipeline_item?.id || null,
          recebidoEm: new Date().toISOString(),
        }).slice(0, 4000),
      });
    } catch {
      // Falha silenciosa de log não deve rejeitar webhook do CRM
    }

    return crmBridgeJson({
      ok: true,
      received: true,
      event: evento,
      lojaId: loja?.id || null,
      hasAdReferral: Boolean(referral),
    });
  } catch (err) {
    return crmBridgeJson(
      { ok: false, error: err instanceof Error ? err.message : 'Payload inválido.' },
      400
    );
  }
}
