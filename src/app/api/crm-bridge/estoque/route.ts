import { NextRequest } from 'next/server';
import {
  autenticarBridge,
  crmBridgeJson,
  crmBridgeOptionsResponse,
  resolverLojaBridge,
} from '@/lib/crm-bridge/auth';
import {
  buscarEstoqueBridge,
  formatarItemEstoqueWhatsapp,
} from '@/lib/crm-bridge/queries';

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

  const sp = req.nextUrl.searchParams;
  const q = sp.get('q') || '';
  const categoria = sp.get('categoria') || undefined;
  const condicao = sp.get('condicao') || undefined;
  const maxPrecoRaw = sp.get('max_preco');
  const maxPreco = maxPrecoRaw ? Number(maxPrecoRaw) : undefined;
  const limit = sp.get('limit') ? Number(sp.get('limit')) : 30;

  const itens = await buscarEstoqueBridge(loja.id, {
    q,
    categoria,
    condicao,
    maxPreco: Number.isFinite(maxPreco) ? maxPreco : undefined,
    limit: Number.isFinite(limit) ? limit : 30,
  });

  return crmBridgeJson({
    ok: true,
    loja,
    total: itens.length,
    itens: itens.map((item) => ({
      ...item,
      textoWhatsapp: formatarItemEstoqueWhatsapp(item, loja.nome),
    })),
  });
}
