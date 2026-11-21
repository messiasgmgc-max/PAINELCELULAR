import { NextRequest } from 'next/server';
import {
  autenticarBridgeAvancado,
  crmBridgeJson,
  crmBridgeOptionsResponse,
  resolverLojaAutorizada,
} from '@/lib/crm-bridge/auth';
import {
  MODELOS_UPGRADE_DISPONIVEIS,
  simularPropostaBridge,
} from '@/lib/crm-bridge/queries';

export async function OPTIONS(req: NextRequest) {
  return crmBridgeOptionsResponse(req);
}

export async function GET(req: NextRequest) {
  const auth = await autenticarBridgeAvancado(req);
  if (!auth.ok) {
    return crmBridgeJson({ ok: false, error: auth.error }, auth.status || 401, req);
  }
  return crmBridgeJson(
    {
      ok: true,
      modelosTroca: MODELOS_UPGRADE_DISPONIVEIS,
      capacidades: ['64GB', '128GB', '256GB', '512GB', '1TB'],
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
    const valorAparelho = Number(body?.valorAparelho || 0);
    if (!Number.isFinite(valorAparelho) || valorAparelho <= 0) {
      return crmBridgeJson(
        { ok: false, error: 'valorAparelho deve ser maior que zero.' },
        400,
        req
      );
    }

    const simulacao = await simularPropostaBridge(loja.id, {
      nomeLoja: loja.nome,
      modeloNovo: body.modeloNovo ? String(body.modeloNovo) : undefined,
      valorAparelho,
      valorTrocaManual:
        body.valorTrocaManual != null ? Number(body.valorTrocaManual) : undefined,
      entradaPix: body.entradaPix != null ? Number(body.entradaPix) : 0,
      troca: body.troca?.modelo
        ? {
            modelo: String(body.troca.modelo),
            capacidade: String(body.troca.capacidade || '128GB'),
            condicoes: body.troca.condicoes || {},
          }
        : undefined,
    });

    return crmBridgeJson(
      {
        ok: true,
        loja,
        ...simulacao,
      },
      200,
      req
    );
  } catch (err) {
    return crmBridgeJson(
      { ok: false, error: err instanceof Error ? err.message : 'Erro ao simular proposta.' },
      500,
      req
    );
  }
}
