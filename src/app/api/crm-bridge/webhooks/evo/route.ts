import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import {
  autenticarBridge,
  crmBridgeJson,
  crmBridgeOptionsResponse,
  resolverLojaBridge,
} from '@/lib/crm-bridge/auth';
import {
  extrairReferralAnuncio,
  registrarLeadAnuncioBridge,
} from '@/lib/crm-bridge/fase5';

export async function OPTIONS() {
  return crmBridgeOptionsResponse();
}

/**
 * Receptor de webhooks do PhoneCenterCRM (EvoCRM).
 * - Registra eventos relevantes na auditoria (logs_sistema)
 * - Captura automaticamente Leads de Anúncio (Meta Click-to-WhatsApp / Instagram Ads / UTM)
 *   para a tabela crm_leads_anuncio!
 */
export async function POST(req: NextRequest) {
  const auth = autenticarBridge(req);
  if (!auth.ok) {
    return crmBridgeJson({ ok: false, error: auth.error }, auth.status || 401);
  }

  const loja = await resolverLojaBridge(req);
  try {
    const payload = (await req.json()) as Record<string, unknown>;
    const evento = String(payload?.event || payload?.type || 'crm_webhook');
    const conv = (payload.conversation || {}) as Record<string, unknown>;
    const meta = (conv.meta || {}) as Record<string, unknown>;
    const contato = (payload.contact || meta.sender || {}) as Record<string, unknown>;

    const referral = extrairReferralAnuncio(payload);
    let leadAnuncioSalvo = false;

    if (referral && loja?.id) {
      try {
        await registrarLeadAnuncioBridge(
          loja.id,
          referral,
          {
            nome: String(contato.name || ''),
            telefone: String(contato.phone_number || ''),
          },
          { evento, conversationId: conv.id || null }
        );
        leadAnuncioSalvo = true;
      } catch {
        // Não bloqueia webhook se migration ainda não foi aplicada
      }
    }

    try {
      await supabaseAdmin.from('logs_sistema').insert({
        loja_id: loja?.id || null,
        tipo: `crm:${evento}`,
        mensagem: JSON.stringify({
          evento,
          contatoNome: contato?.name || null,
          contatoTelefone: contato?.phone_number || null,
          referral,
          leadAnuncioSalvo,
          recebidoEm: new Date().toISOString(),
        }).slice(0, 4000),
      });
    } catch {
      // Falha silenciosa de log não rejeita webhook
    }

    return crmBridgeJson({
      ok: true,
      received: true,
      event: evento,
      lojaId: loja?.id || null,
      hasAdReferral: Boolean(referral),
      leadAnuncioSalvo,
    });
  } catch (err) {
    return crmBridgeJson(
      { ok: false, error: err instanceof Error ? err.message : 'Payload inválido.' },
      400
    );
  }
}
