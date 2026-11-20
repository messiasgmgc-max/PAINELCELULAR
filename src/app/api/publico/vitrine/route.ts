import { NextRequest } from 'next/server';
import {
  crmBridgeJson,
  crmBridgeOptionsResponse,
  resolverLojaBridge,
} from '@/lib/crm-bridge/auth';
import { buscarEstoqueBridge } from '@/lib/crm-bridge/queries';

export async function OPTIONS() {
  return crmBridgeOptionsResponse();
}

/**
 * Endpoint público (somente leitura, sem custo/IMEI/clientes) que alimenta
 * a página Link na Bio + Vitrine WhatsApp (/bio).
 */
export async function GET(req: NextRequest) {
  const loja = await resolverLojaBridge(req);
  if (!loja) {
    return crmBridgeJson({ ok: false, error: 'Loja não encontrada.' }, 404);
  }

  const q = req.nextUrl.searchParams.get('q') || '';
  const condicao = req.nextUrl.searchParams.get('condicao') || undefined;

  const itens = await buscarEstoqueBridge(loja.id, { q, condicao, limit: 60 });

  return crmBridgeJson({
    ok: true,
    loja: { id: loja.id, nome: loja.nome },
    total: itens.length,
    itens: itens.map((i) => ({
      id: i.id,
      marca: i.marca,
      modelo: i.modelo,
      capacidade: i.capacidade,
      cor: i.cor,
      condicao: i.condicao,
      saudeBateria: i.saudeBateria,
      preco: i.preco,
      categoria: i.categoria,
    })),
  });
}
