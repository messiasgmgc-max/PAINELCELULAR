import { NextRequest } from 'next/server';
import {
  autenticarBridgeAvancado,
  crmBridgeJson,
  crmBridgeOptionsResponse,
  resolverLojaAutorizada,
} from '@/lib/crm-bridge/auth';
import { obterRankingVendasBridge } from '@/lib/crm-bridge/queries';

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

  const diasParam = Number(req.nextUrl.searchParams.get('dias') || 30);
  const ranking = await obterRankingVendasBridge(
    loja.id,
    Number.isFinite(diasParam) ? diasParam : 30
  );

  return crmBridgeJson(
    {
      ok: true,
      loja,
      ...ranking,
    },
    200,
    req
  );
}
