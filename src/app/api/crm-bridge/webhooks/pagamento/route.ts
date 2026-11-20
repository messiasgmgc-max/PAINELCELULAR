import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import {
  autenticarBridge,
  crmBridgeJson,
  crmBridgeOptionsResponse,
} from '@/lib/crm-bridge/auth';

export async function OPTIONS() {
  return crmBridgeOptionsResponse();
}

/**
 * Webhook de confirmação automática de Pix/Reserva (Asaas ou Mercado Pago).
 * Exige ?token=<CRM_BRIDGE_SECRET> na URL cadastrada no gateway.
 */
export async function POST(req: NextRequest) {
  const auth = autenticarBridge(req);
  if (!auth.ok) {
    return crmBridgeJson({ ok: false, error: auth.error }, auth.status || 401);
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const event = String(body.event || body.action || '');
    const payment = (body.payment || body.data || {}) as Record<string, unknown>;
    const chargeId = String(payment.id || body.id || '').trim();
    const externalRef = String(payment.externalReference || payment.external_reference || '').trim();

    const confirmado =
      ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'].includes(event) ||
      event.includes('payment.updated') ||
      String(payment.status || '').toLowerCase() === 'approved';

    if (!confirmado || (!chargeId && !externalRef)) {
      return crmBridgeJson({ ok: true, ignored: true, event });
    }

    let query = supabaseAdmin
      .from('crm_reservas_pix')
      .update({
        status: 'pago',
        pago_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (chargeId) {
      query = query.eq('provedor_charge_id', chargeId);
    } else {
      query = query.eq('protocolo', externalRef);
    }

    const { data } = await query.select('id, protocolo, aparelho_modelo, status');

    return crmBridgeJson({
      ok: true,
      confirmed: true,
      updated: data || [],
    });
  } catch (err) {
    return crmBridgeJson(
      { ok: false, error: err instanceof Error ? err.message : 'Payload inválido.' },
      400
    );
  }
}
