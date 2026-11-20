import { NextRequest } from 'next/server';
import {
  autenticarBridge,
  crmBridgeJson,
  crmBridgeOptionsResponse,
  resolverLojaBridge,
} from '@/lib/crm-bridge/auth';
import { obterRankingVendasBridge } from '@/lib/crm-bridge/queries';

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

  const diasParam = Number(req.nextUrl.searchParams.get('dias') || 30);
  const ranking = await obterRankingVendasBridge(
    loja.id,
    Number.isFinite(diasParam) ? diasParam : 30
  );

  return crmBridgeJson({
    ok: true,
    loja,
    ...ranking,
  });
}
