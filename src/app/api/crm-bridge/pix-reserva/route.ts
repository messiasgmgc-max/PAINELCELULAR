import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import {
  autenticarBridgeAvancado,
  crmBridgeJson,
  crmBridgeOptionsResponse,
  resolverLojaAutorizada,
} from '@/lib/crm-bridge/auth';
import {
  cancelarELiberarReservaPix,
  criarReservaPixBridge,
  efetivarConfirmacaoReservaPix,
} from '@/lib/crm-bridge/fase6';

export async function OPTIONS(req: NextRequest) {
  return crmBridgeOptionsResponse(req);
}

export async function GET(req: NextRequest) {
  const auth = await autenticarBridgeAvancado(req);
  if (!auth.ok) {
    return crmBridgeJson({ ok: false, error: auth.error }, auth.status || 401, req);
  }

  const loja = await resolverLojaAutorizada(req, auth);
  if (!loja) {
    return crmBridgeJson({ ok: false, error: 'Nenhuma loja ativa encontrada.' }, 404, req);
  }

  const { data, error } = await supabaseAdmin
    .from('crm_reservas_pix')
    .select('*')
    .eq('loja_id', loja.id)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) {
    return crmBridgeJson(
      {
        ok: true,
        loja,
        reservas: [],
        migrationPendente: error.message.includes('does not exist'),
      },
      200,
      req
    );
  }

  return crmBridgeJson(
    {
      ok: true,
      loja,
      total: (data || []).length,
      reservas: data || [],
      migrationPendente: false,
    },
    200,
    req
  );
}

export async function POST(req: NextRequest) {
  const auth = await autenticarBridgeAvancado(req);
  if (!auth.ok) {
    return crmBridgeJson({ ok: false, error: auth.error }, auth.status || 401, req);
  }

  const loja = await resolverLojaAutorizada(req, auth);
  if (!loja) {
    return crmBridgeJson({ ok: false, error: 'Nenhuma loja ativa encontrada.' }, 404, req);
  }

  try {
    const body = await req.json();
    const aparelhoModelo = String(body?.aparelhoModelo || '').trim();
    const valorSinal = Number(body?.valorSinal || 0);
    if (!aparelhoModelo || !Number.isFinite(valorSinal) || valorSinal <= 0) {
      return crmBridgeJson(
        { ok: false, error: 'Informe aparelhoModelo e valorSinal (> 0).' },
        400,
        req
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

    return crmBridgeJson({ ok: true, loja, ...res }, 201, req);
  } catch (err) {
    return crmBridgeJson(
      { ok: false, error: err instanceof Error ? err.message : 'Erro ao gerar sinal Pix.' },
      400,
      req
    );
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await autenticarBridgeAvancado(req);
  if (!auth.ok) {
    return crmBridgeJson({ ok: false, error: auth.error }, auth.status || 401, req);
  }

  const loja = await resolverLojaAutorizada(req, auth);
  if (!loja) {
    return crmBridgeJson({ ok: false, error: 'Nenhuma loja ativa encontrada.' }, 404, req);
  }

  try {
    const body = await req.json();
    const id = String(body.id || '').trim();
    const status = body.status === 'cancelado' ? 'cancelado' : 'pago';
    if (!id) {
      return crmBridgeJson({ ok: false, error: 'Informe id da reserva.' }, 400, req);
    }

    if (status === 'cancelado') {
      const res = await cancelarELiberarReservaPix(id, loja.id);
      if (!res.reserva) {
        return crmBridgeJson({ ok: false, error: 'Reserva não encontrada.' }, 404, req);
      }
      return crmBridgeJson({ ok: true, ...res }, 200, req);
    }

    const res = await efetivarConfirmacaoReservaPix(id, loja.id);
    if (!res.reserva) {
      return crmBridgeJson({ ok: false, error: 'Reserva não encontrada.' }, 404, req);
    }

    return crmBridgeJson({ ok: true, ...res }, 200, req);
  } catch (err) {
    return crmBridgeJson(
      { ok: false, error: err instanceof Error ? err.message : 'Erro ao atualizar reserva.' },
      500,
      req
    );
  }
}
