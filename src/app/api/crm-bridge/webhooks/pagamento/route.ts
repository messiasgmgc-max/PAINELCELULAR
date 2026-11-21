import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import {
  autenticarBridgeAvancado,
  crmBridgeJson,
  crmBridgeOptionsResponse,
} from '@/lib/crm-bridge/auth';
import {
  efetivarConfirmacaoReservaPix,
  verificarStatusPagamentoMercadoPago,
} from '@/lib/crm-bridge/fase6';
import { obterConfigCrmLoja } from '@/lib/crm-bridge/lojaConfig';

export async function OPTIONS(req: NextRequest) {
  return crmBridgeOptionsResponse(req);
}

/**
 * Webhook de confirmação automática de Pix/Reserva (Asaas ou Mercado Pago).
 * - Exige token válido (?token=<webhook_token_da_loja> ou CRM_BRIDGE_SECRET)
 * - Para Mercado Pago: valida obrigatoriamente via GET /v1/payments/{id} que status === 'approved'
 * - Reserva o IMEI no estoque, alerta o time e confirma no WhatsApp do cliente.
 */
export async function POST(req: NextRequest) {
  const auth = await autenticarBridgeAvancado(req, {
    allowWebhookToken: true,
    skipPlanGate: true,
  });
  if (!auth.ok) {
    return crmBridgeJson({ ok: false, error: auth.error }, auth.status || 401, req);
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const event = String(body.event || body.action || '').trim();
    const type = String(
      body.type || body.topic || req.nextUrl.searchParams.get('type') || req.nextUrl.searchParams.get('topic') || ''
    ).toLowerCase();
    const payment = (body.payment || body.data || {}) as Record<string, unknown>;

    const chargeId = String(
      payment.id ||
        req.nextUrl.searchParams.get('data.id') ||
        req.nextUrl.searchParams.get('id') ||
        body.id ||
        ''
    ).trim();
    const externalRef = String(
      payment.externalReference || payment.external_reference || ''
    ).trim();

    const ehAsaasConfirmado = ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'].includes(event);
    const ehMercadoPagoPayment =
      type === 'payment' || event.toLowerCase().includes('payment');

    if (!ehAsaasConfirmado && !ehMercadoPagoPayment) {
      return crmBridgeJson({ ok: true, ignored: true, event, type }, 200, req);
    }

    if (!chargeId && !externalRef) {
      return crmBridgeJson({ ok: true, ignored: true, reason: 'Sem identificador de cobrança.' }, 200, req);
    }

    // Localiza a reserva correspondente
    let query = supabaseAdmin.from('crm_reservas_pix').select('*');
    if (auth.lojaId && !auth.superAdmin) {
      query = query.eq('loja_id', auth.lojaId);
    }
    if (chargeId) {
      query = query.eq('provedor_charge_id', chargeId);
    } else {
      query = query.eq('protocolo', externalRef);
    }

    const { data: reservas } = await query.limit(1);
    const reserva = (reservas?.[0] as Record<string, unknown> | undefined) || null;

    if (!reserva) {
      return crmBridgeJson(
        { ok: true, ignored: true, reason: 'Reserva não encontrada para este pagamento.' },
        200,
        req
      );
    }

    const lojaId = String(reserva.loja_id || '');
    const provedor = String(reserva.provedor || '');

    // Mercado Pago NUNCA baixa por 'payment.updated' sem checar GET /v1/payments/{id} === 'approved'
    if (ehMercadoPagoPayment && !ehAsaasConfirmado && (provedor === 'mercadopago' || chargeId)) {
      const { config: cfgLoja } = await obterConfigCrmLoja(lojaId);
      const mpToken = (
        cfgLoja.mercadopago_access_token ||
        process.env.MERCADOPAGO_ACCESS_TOKEN ||
        ''
      ).trim();

      if (!mpToken || !chargeId) {
        return crmBridgeJson(
          { ok: true, ignored: true, reason: 'Token Mercado Pago ausente para verificação.' },
          200,
          req
        );
      }

      const check = await verificarStatusPagamentoMercadoPago(chargeId, mpToken);
      if (!check.approved) {
        return crmBridgeJson(
          {
            ok: true,
            ignored: true,
            reason: `Pagamento Mercado Pago ainda não aprovado (status: ${check.status}).`,
            mpStatus: check.status,
          },
          200,
          req
        );
      }
    }

    const resultado = await efetivarConfirmacaoReservaPix(String(reserva.id), lojaId);

    return crmBridgeJson(
      {
        ok: true,
        confirmed: true,
        updated: resultado.updated,
        estoqueReservado: resultado.estoqueReservado,
        whatsappEnviado: resultado.whatsappEnviado,
        reserva: resultado.reserva,
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
