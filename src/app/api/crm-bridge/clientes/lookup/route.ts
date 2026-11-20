import { NextRequest } from 'next/server';
import {
  autenticarBridge,
  crmBridgeJson,
  crmBridgeOptionsResponse,
  resolverLojaBridge,
} from '@/lib/crm-bridge/auth';
import { lookupClienteBridge } from '@/lib/crm-bridge/queries';

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
  const telefone = sp.get('telefone') || sp.get('phone') || undefined;
  const cpf = sp.get('cpf') || undefined;
  const nome = sp.get('nome') || sp.get('name') || undefined;

  if (!telefone && !cpf && !nome) {
    return crmBridgeJson(
      { ok: false, error: 'Informe telefone, cpf ou nome para consulta.' },
      400
    );
  }

  const resultado = await lookupClienteBridge(loja.id, { telefone, cpf, nome });
  return crmBridgeJson({
    ok: true,
    loja,
    ...resultado,
  });
}
