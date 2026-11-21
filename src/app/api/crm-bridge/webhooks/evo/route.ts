import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import {
  autenticarBridgeAvancado,
  crmBridgeJson,
  crmBridgeOptionsResponse,
  resolverLojaAutorizada,
} from '@/lib/crm-bridge/auth';
import {
  dispararMetaCapiPurchase,
  extrairReferralAnuncio,
  registrarLeadAnuncioBridge,
} from '@/lib/crm-bridge/fase5';
import { obterConfigCrmLoja } from '@/lib/crm-bridge/lojaConfig';
import { sufixoTelefoneComparacao } from '@/lib/crm-bridge/queries';
import { registrarLog } from '@/lib/logger';

export async function OPTIONS(req: NextRequest) {
  return crmBridgeOptionsResponse(req);
}

/**
 * Receptor de webhooks do PhoneCenterCRM (EvoCRM).
 * - Registra eventos relevantes na auditoria (logs_sistema via registrarLog)
 * - Captura automaticamente Leads de Anúncio (Meta Click-to-WhatsApp / Instagram Ads / UTM)
 * - Converte leads e dispara Meta CAPI `Purchase` quando oportunidade é marcada como ganha!
 */
export async function POST(req: NextRequest) {
  const auth = await autenticarBridgeAvancado(req, {
    allowWebhookToken: true,
    skipPlanGate: true,
  });
  if (!auth.ok) {
    return crmBridgeJson({ ok: false, error: auth.error }, auth.status || 401, req);
  }

  const loja = await resolverLojaAutorizada(req, auth);
  try {
    const payload = (await req.json()) as Record<string, unknown>;
    const evento = String(payload?.event || payload?.type || 'crm_webhook');
    const conv = (payload.conversation || {}) as Record<string, unknown>;
    const meta = (conv.meta || {}) as Record<string, unknown>;
    const contato = (payload.contact || meta.sender || {}) as Record<string, unknown>;
    const pipelineItem = (payload.pipeline_item || payload.deal || {}) as Record<string, unknown>;

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

    // Conversão automática de Lead CTWA + Meta CAPI quando oportunidade é ganha
    let leadConvertido = false;
    let capiEnviado = false;
    const eventoLower = evento.toLowerCase();
    const statusItem = String(
      pipelineItem.status || payload.status || ''
    ).toLowerCase();
    const ehOportunidadeGanha =
      eventoLower.includes('won') ||
      eventoLower.includes('ganha') ||
      statusItem === 'won' ||
      statusItem === 'ganha';

    if (ehOportunidadeGanha && loja?.id) {
      try {
        const telefoneContato = String(
          contato.phone_number || pipelineItem.phone_number || ''
        ).trim();
        const sufixo = sufixoTelefoneComparacao(telefoneContato);
        const valorVenda = Math.max(
          0,
          Number(pipelineItem.value || pipelineItem.amount || payload.value || 0)
        );

        if (sufixo.length >= 8) {
          const { data: leadsAbertos } = await supabaseAdmin
            .from('crm_leads_anuncio')
            .select('*')
            .eq('loja_id', loja.id)
            .neq('status', 'convertido')
            .ilike('contato_telefone', `%${sufixo}%`)
            .order('created_at', { ascending: false })
            .limit(1);

          const leadAlvo = leadsAbertos?.[0] as Record<string, unknown> | undefined;
          if (leadAlvo?.id) {
            await supabaseAdmin
              .from('crm_leads_anuncio')
              .update({
                status: 'convertido',
                valor_venda: valorVenda > 0 ? valorVenda : Number(leadAlvo.valor_venda) || 0,
                updated_at: new Date().toISOString(),
              })
              .eq('id', leadAlvo.id);
            leadConvertido = true;

            if (valorVenda > 0 && !leadAlvo.capi_enviado) {
              const { config: cfgLoja } = await obterConfigCrmLoja(loja.id);
              const capi = await dispararMetaCapiPurchase({
                telefone: String(leadAlvo.contato_telefone || telefoneContato),
                ctwaClid: String(leadAlvo.ctwa_clid || ''),
                valor: valorVenda,
                eventId: `pc_lead_${leadAlvo.id}`,
                pixelId: cfgLoja.meta_pixel_id || undefined,
                accessToken: cfgLoja.meta_capi_access_token || undefined,
              });
              if (capi.sent) {
                await supabaseAdmin
                  .from('crm_leads_anuncio')
                  .update({ capi_enviado: true, capi_enviado_em: new Date().toISOString() })
                  .eq('id', leadAlvo.id);
                capiEnviado = true;
              }
            }
          }
        }
      } catch {
        // Falha silenciosa para não rejeitar webhook
      }
    }

    await registrarLog({
      loja_id: loja?.id || null,
      tipo_evento: 'info',
      acao: `Webhook CRM: ${evento}`,
      detalhes: JSON.stringify({
        evento,
        contatoNome: contato?.name || null,
        contatoTelefone: contato?.phone_number || null,
        hasAdReferral: Boolean(referral),
        leadAnuncioSalvo,
        leadConvertido,
        capiEnviado,
        recebidoEm: new Date().toISOString(),
      }).slice(0, 2000),
    });

    return crmBridgeJson(
      {
        ok: true,
        received: true,
        event: evento,
        lojaId: loja?.id || null,
        hasAdReferral: Boolean(referral),
        leadAnuncioSalvo,
        leadConvertido,
        capiEnviado,
      },
      200,
      req
    );
  } catch (err) {
    return crmBridgeJson(
      { ok: false, error: err instanceof Error ? err.message : 'Payload inválido.' },
      400,
      req
    );
  }
}
