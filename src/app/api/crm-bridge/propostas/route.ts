import { NextRequest } from 'next/server';
import {
  autenticarBridge,
  crmBridgeJson,
  crmBridgeOptionsResponse,
  resolverLojaBridge,
} from '@/lib/crm-bridge/auth';
import { criarPropostaBridge, listarPropostasBridge } from '@/lib/crm-bridge/fase5';

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

  const limit = Number(req.nextUrl.searchParams.get('limit') || 30);
  const propostas = await listarPropostasBridge(loja.id, Number.isFinite(limit) ? limit : 30);
  return crmBridgeJson({ ok: true, loja, total: propostas.length, propostas });
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
    const valorAparelho = Number(body?.valorAparelho || 0);
    const modeloNovo = String(body?.modeloNovo || '').trim();
    if (!modeloNovo || !Number.isFinite(valorAparelho) || valorAparelho <= 0) {
      return crmBridgeJson(
        { ok: false, error: 'Informe modeloNovo e valorAparelho (> 0).' },
        400
      );
    }

    const origin = req.nextUrl.origin;
    const { proposta, urlPublica } = await criarPropostaBridge(loja.id, loja.nome, {
      clienteNome: body.clienteNome ? String(body.clienteNome) : undefined,
      clienteTelefone: body.clienteTelefone ? String(body.clienteTelefone) : undefined,
      vendedorNome: body.vendedorNome ? String(body.vendedorNome) : undefined,
      modeloNovo,
      valorAparelho,
      valorTrocaManual:
        body.valorTrocaManual != null ? Number(body.valorTrocaManual) : undefined,
      entradaPix: body.entradaPix != null ? Number(body.entradaPix) : 0,
      validadeHoras: body.validadeHoras != null ? Number(body.validadeHoras) : 48,
      origin,
      troca: body.troca?.modelo
        ? {
            modelo: String(body.troca.modelo),
            capacidade: String(body.troca.capacidade || '128GB'),
            condicoes: body.troca.condicoes || {},
          }
        : undefined,
    });

    return crmBridgeJson({ ok: true, loja, proposta, urlPublica }, 201);
  } catch (err) {
    return crmBridgeJson(
      { ok: false, error: err instanceof Error ? err.message : 'Erro ao criar proposta.' },
      500
    );
  }
}
