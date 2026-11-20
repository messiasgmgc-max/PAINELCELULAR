import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import {
  autenticarBridge,
  crmBridgeJson,
  crmBridgeOptionsResponse,
  resolverLojaBridge,
} from '@/lib/crm-bridge/auth';
import { criarReservaPixBridge } from '@/lib/crm-bridge/fase6';

export async function OPTIONS() {
  return crmBridgeOptionsResponse();
}

export async function GET(req: NextRequest) {
  const auth = autenticarBridge(req);
  if (!auth.ok) {
    return crmBridgeJson({ ok: false, error: auth.error }, auth.status || 401);
  }

  const loja = await resolverLojaBridge(req);
  if (!loja) {
    return crmBridgeJson({ ok: false, error: 'Nenhuma loja ativa encontrada.' }, 404);
  }

  const { data, error } = await supabaseAdmin
    .from('crm_reservas_pix')
    .select('*')
    .eq('loja_id', loja.id)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) {
    return crmBridgeJson({
      ok: true,
      loja,
      reservas: [],
      migrationPendente: error.message.includes('does not exist'),
    });
  }

  return crmBridgeJson({
    ok: true,
    loja,
    total: (data || []).length,
    reservas: data || [],
    migrationPendente: false,
  });
}

export async function POST(req: NextRequest) {
  const auth = autenticarBridge(req);
  if (!auth.ok) {
    return crmBridgeJson({ ok: false, error: auth.error }, auth.status || 401);
  }

  const loja = await resolverLojaBridge(req);
  if (!loja) {
    return crmBridgeJson({ ok: false, error: 'Nenhuma loja ativa encontrada.' }, 404);
  }

  try {
    const body = await req.json();
    const aparelhoModelo = String(body?.aparelhoModelo || '').trim();
    const valorSinal = Number(body?.valorSinal || 0);
    if (!aparelhoModelo || !Number.isFinite(valorSinal) || valorSinal <= 0) {
      return crmBridgeJson(
        { ok: false, error: 'Informe aparelhoModelo e valorSinal (> 0).' },
        400
      );
    }

    const res = await criarReservaPixBridge(loja.id, loja.nome, {
      aparelhoId: body.aparelhoId ? String(body.aparelhoId) : undefined,
      aparelhoModelo,
      clienteNome: body.clienteNome ? String(body.clienteNome) : undefined,
      clienteTelefone: body.clienteTelefone ? String(body.clienteTelefone) : undefined,
      valorSinal,
      chavePixManual: body.chavePix ? String(body.chavePix) : undefined,
      cidade: body.cidade ? String(body.cidade) : undefined,
    });

    return crmBridgeJson({ ok: true, loja, ...res }, 201);
  } catch (err) {
    return crmBridgeJson(
      { ok: false, error: err instanceof Error ? err.message : 'Erro ao gerar sinal Pix.' },
      400
    );
  }
}

export async function PATCH(req: NextRequest) {
  const auth = autenticarBridge(req);
  if (!auth.ok) {
    return crmBridgeJson({ ok: false, error: auth.error }, auth.status || 401);
  }

  const loja = await resolverLojaBridge(req);
  if (!loja) {
    return crmBridgeJson({ ok: false, error: 'Nenhuma loja ativa encontrada.' }, 404);
  }

  try {
    const body = await req.json();
    const id = String(body.id || '').trim();
    const status = body.status === 'cancelado' ? 'cancelado' : 'pago';
    if (!id) {
      return crmBridgeJson({ ok: false, error: 'Informe id da reserva.' }, 400);
    }

    const { data, error } = await supabaseAdmin
      .from('crm_reservas_pix')
      .update({
        status,
        pago_em: status === 'pago' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('loja_id', loja.id)
      .select('*')
      .single();

    if (error || !data) {
      return crmBridgeJson({ ok: false, error: error?.message || 'Reserva não encontrada.' }, 404);
    }

    return crmBridgeJson({ ok: true, reserva: data });
  } catch (err) {
    return crmBridgeJson(
      { ok: false, error: err instanceof Error ? err.message : 'Erro ao atualizar reserva.' },
      500
    );
  }
}
