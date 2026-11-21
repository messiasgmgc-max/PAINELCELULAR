import { NextRequest } from 'next/server';
import {
  autenticarBridgeAvancado,
  crmBridgeJson,
  crmBridgeOptionsResponse,
  obterSegredoBridge,
  resolverLojaAutorizada,
} from '@/lib/crm-bridge/auth';

export async function OPTIONS(req: NextRequest) {
  return crmBridgeOptionsResponse(req);
}

export async function GET(req: NextRequest) {
  const configurado = Boolean(obterSegredoBridge());
  const auth = await autenticarBridgeAvancado(req, { skipPlanGate: true });

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
          'POST /api/crm-bridge/enviar-mensagem',
          'POST /api/crm-bridge/pre-venda',
          'GET|PUT|POST /api/crm-bridge/pos-venda',
          'GET|PUT|POST /api/crm-bridge/rodizio',
          'GET|POST|PATCH /api/crm-bridge/campanhas',
          'GET|POST|PATCH /api/crm-bridge/telefonia',
          'GET /api/crm-bridge/imei',
          'GET|PUT /api/crm-bridge/metas',
          'GET|PUT|POST /api/crm-bridge/kanban-grupos',
          'GET|POST|DELETE /api/crm-bridge/academy',
          'POST /api/crm-bridge/avaliar-foto-troca',
          'POST /api/crm-bridge/mcp',
        ],
      },
      200,
      req
    );
  }

  const loja = await resolverLojaAutorizada(req, auth);
  return crmBridgeJson(
    {
      ok: true,
      service: 'PhoneCenter CRM Bridge',
      configured: configurado,
      authenticated: true,
      authNivel: auth.nivel,
      loja: loja ? { id: loja.id, nome: loja.nome } : null,
    },
    200,
    req
  );
}
