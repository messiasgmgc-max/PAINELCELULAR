import { NextRequest } from 'next/server';
import {
  autenticarBridge,
  crmBridgeJson,
  crmBridgeOptionsResponse,
  obterSegredoBridge,
  resolverLojaBridge,
} from '@/lib/crm-bridge/auth';

export async function OPTIONS() {
  return crmBridgeOptionsResponse();
}

export async function GET(req: NextRequest) {
  const configurado = Boolean(obterSegredoBridge());
  const auth = autenticarBridge(req);

  if (!auth.ok) {
    return crmBridgeJson(
      {
        ok: true,
        service: 'PhoneCenter CRM Bridge',
        configured: configurado,
        authenticated: false,
        endpoints: [
          'GET /api/crm-bridge/estoque',
          'GET /api/crm-bridge/clientes/lookup',
          'POST /api/crm-bridge/simular',
          'GET /api/crm-bridge/ranking',
          'POST /api/crm-bridge/webhooks/evo',
          'POST /api/crm-bridge/mcp',
        ],
      },
      200
    );
  }

  const loja = await resolverLojaBridge(req);
  return crmBridgeJson({
    ok: true,
    service: 'PhoneCenter CRM Bridge',
    configured: configurado,
    authenticated: true,
    loja: loja ? { id: loja.id, nome: loja.nome } : null,
  });
}
