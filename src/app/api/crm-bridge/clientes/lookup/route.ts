import { NextRequest } from 'next/server';
import {
  autenticarBridgeAvancado,
  crmBridgeJson,
  crmBridgeOptionsResponse,
  resolverLojaAutorizada,
} from '@/lib/crm-bridge/auth';
import { lookupClienteBridge } from '@/lib/crm-bridge/queries';

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

  const sp = req.nextUrl.searchParams;
  const telefone = sp.get('telefone') || sp.get('phone') || undefined;
  const cpf = sp.get('cpf') || undefined;
  const nome = sp.get('nome') || sp.get('name') || undefined;

  if (!telefone && !cpf && !nome) {
    return crmBridgeJson(
      { ok: false, error: 'Informe telefone, cpf ou nome para consulta.' },
      400,
      req
    );
  }

  const resultado = await lookupClienteBridge(loja.id, { telefone, cpf, nome });
  return crmBridgeJson(
    {
      ok: true,
      loja,
      ...resultado,
    },
    200,
    req
  );
}
