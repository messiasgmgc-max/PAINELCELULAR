import { NextRequest } from 'next/server';
import {
  autenticarBridgeAvancado,
  crmBridgeJson,
  crmBridgeOptionsResponse,
  resolverLojaAutorizada,
} from '@/lib/crm-bridge/auth';
import { obterConfigCrmLoja } from '@/lib/crm-bridge/lojaConfig';

export async function OPTIONS(req: NextRequest) {
  return crmBridgeOptionsResponse(req);
}

interface CrmAgent {
  id: string | number;
  name: string;
  email: string;
  role: string;
  availability_status?: string;
  confirmed?: boolean;
}

function normalizarAgente(raw: Record<string, unknown>): CrmAgent {
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name || raw.available_name || 'Sem nome'),
    email: String(raw.email || ''),
    role: String(raw.role || 'agent'),
    availability_status: raw.availability_status ? String(raw.availability_status) : undefined,
    confirmed: typeof raw.confirmed === 'boolean' ? raw.confirmed : undefined,
  };
}

function buildCrmHeaders(accessToken: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    api_access_token: accessToken,
    Authorization: `Bearer ${accessToken}`,
  };
}

/**
 * GET /api/crm-bridge/acessos
 * Lista os usuários/agentes com acesso ao CRM da loja selecionada.
 */
export async function GET(req: NextRequest) {
  const auth = await autenticarBridgeAvancado(req, { requireGestao: true });
  if (!auth.ok) {
    return crmBridgeJson({ ok: false, error: auth.error }, auth.status || 401, req);
  }

  const loja = await resolverLojaAutorizada(req, auth);
  if (!loja) {
    return crmBridgeJson({ ok: false, error: 'Nenhuma loja ativa encontrada.' }, 404, req);
  }

  const { config } = await obterConfigCrmLoja(loja.id);
  const apiUrl = (config.crm_api_url || 'https://api-crm.phonecenter.tech').replace(/\/+$/, '');
  const frontendUrl = (config.crm_frontend_url || 'https://crm.phonecenter.tech').replace(/\/+$/, '');
  const accessToken = (config.crm_access_token || '').trim();

  if (!accessToken) {
    return crmBridgeJson(
      {
        ok: true,
        tokenConfigurado: false,
        crm_frontend_url: frontendUrl,
        agentes: [],
        aviso: 'Configure e salve o "CRM API Access Token" acima para gerenciar os logins desta loja.',
      },
      200,
      req
    );
  }

  try {
    const resp = await fetch(`${apiUrl}/api/v1/agents`, {
      method: 'GET',
      headers: buildCrmHeaders(accessToken),
      cache: 'no-store',
    });
    const body = await resp.json().catch(() => null);
    if (!resp.ok) {
      const msg =
        (body && (body.error || body.message)) ||
        `CRM retornou HTTP ${resp.status} ao listar acessos.`;
      return crmBridgeJson(
        { ok: false, tokenConfigurado: true, crm_frontend_url: frontendUrl, error: String(msg) },
        resp.status === 401 ? 401 : 502,
        req
      );
    }

    const listaRaw = Array.isArray(body)
      ? body
      : Array.isArray(body?.payload)
        ? body.payload
        : Array.isArray(body?.data)
          ? body.data
          : [];

    const agentes = listaRaw
      .filter((item: unknown): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      .map(normalizarAgente);

    return crmBridgeJson(
      {
        ok: true,
        tokenConfigurado: true,
        crm_frontend_url: frontendUrl,
        loja,
        agentes,
      },
      200,
      req
    );
  } catch (err) {
    return crmBridgeJson(
      {
        ok: false,
        tokenConfigurado: true,
        crm_frontend_url: frontendUrl,
        error: err instanceof Error ? err.message : 'Falha de rede ao conectar no CRM.',
      },
      502,
      req
    );
  }
}

/**
 * POST /api/crm-bridge/acessos
 * Cria/convida um novo usuário (atendente ou administrador) no CRM da loja.
 */
export async function POST(req: NextRequest) {
  const auth = await autenticarBridgeAvancado(req, { requireGestao: true });
  if (!auth.ok) {
    return crmBridgeJson({ ok: false, error: auth.error }, auth.status || 401, req);
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const loja = await resolverLojaAutorizada(
      req,
      auth,
      body.loja_id ? String(body.loja_id) : undefined
    );
    if (!loja) {
      return crmBridgeJson({ ok: false, error: 'Loja não encontrada.' }, 404, req);
    }

    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const role = body.role === 'administrator' ? 'administrator' : 'agent';
    const password = String(body.password || '').trim();

    if (!name || !email || !email.includes('@')) {
      return crmBridgeJson(
        { ok: false, error: 'Informe um nome e um e-mail válido para criar o acesso.' },
        400,
        req
      );
    }

    const { config } = await obterConfigCrmLoja(loja.id);
    const apiUrl = (config.crm_api_url || 'https://api-crm.phonecenter.tech').replace(/\/+$/, '');
    const frontendUrl = (config.crm_frontend_url || 'https://crm.phonecenter.tech').replace(/\/+$/, '');
    const accessToken = (config.crm_access_token || '').trim();

    if (!accessToken) {
      return crmBridgeJson(
        { ok: false, error: 'Configure e salve o CRM API Access Token da loja antes de criar acessos.' },
        400,
        req
      );
    }

    const payload: Record<string, unknown> = { name, email, role };
    if (password.length >= 6) {
      payload.password = password;
    }

    const resp = await fetch(`${apiUrl}/api/v1/agents`, {
      method: 'POST',
      headers: buildCrmHeaders(accessToken),
      body: JSON.stringify(payload),
    });
    const resData = await resp.json().catch(() => null);

    if (!resp.ok) {
      const msg =
        (resData && (resData.error || resData.message || (Array.isArray(resData.errors) ? resData.errors.join(', ') : ''))) ||
        `Erro HTTP ${resp.status} ao criar acesso no CRM.`;
      return crmBridgeJson({ ok: false, error: String(msg) }, resp.status >= 400 && resp.status < 500 ? resp.status : 502, req);
    }

    const agente =
      resData && typeof resData === 'object'
        ? normalizarAgente((resData.payload || resData.data || resData) as Record<string, unknown>)
        : { id: '', name, email, role };

    return crmBridgeJson(
      {
        ok: true,
        agente,
        crm_frontend_url: frontendUrl,
      },
      201,
      req
    );
  } catch (err) {
    return crmBridgeJson(
      { ok: false, error: err instanceof Error ? err.message : 'Erro ao criar acesso no CRM.' },
      500,
      req
    );
  }
}

/**
 * DELETE /api/crm-bridge/acessos?loja_id=...&agent_id=...
 * Remove o acesso de um usuário/agente do CRM da loja.
 */
export async function DELETE(req: NextRequest) {
  const auth = await autenticarBridgeAvancado(req, { requireGestao: true });
  if (!auth.ok) {
    return crmBridgeJson({ ok: false, error: auth.error }, auth.status || 401, req);
  }

  const loja = await resolverLojaAutorizada(req, auth);
  if (!loja) {
    return crmBridgeJson({ ok: false, error: 'Loja não encontrada.' }, 404, req);
  }

  const agentId = (req.nextUrl.searchParams.get('agent_id') || '').trim();
  if (!agentId) {
    return crmBridgeJson({ ok: false, error: 'agent_id é obrigatório.' }, 400, req);
  }

  const { config } = await obterConfigCrmLoja(loja.id);
  const apiUrl = (config.crm_api_url || 'https://api-crm.phonecenter.tech').replace(/\/+$/, '');
  const accessToken = (config.crm_access_token || '').trim();

  if (!accessToken) {
    return crmBridgeJson(
      { ok: false, error: 'CRM API Access Token não configurado para esta loja.' },
      400,
      req
    );
  }

  try {
    const resp = await fetch(`${apiUrl}/api/v1/agents/${encodeURIComponent(agentId)}`, {
      method: 'DELETE',
      headers: buildCrmHeaders(accessToken),
    });
    if (!resp.ok) {
      const resData = await resp.json().catch(() => null);
      const msg = (resData && (resData.error || resData.message)) || `Erro HTTP ${resp.status} ao remover acesso.`;
      return crmBridgeJson({ ok: false, error: String(msg) }, resp.status >= 400 && resp.status < 500 ? resp.status : 502, req);
    }

    return crmBridgeJson({ ok: true, removed: agentId }, 200, req);
  } catch (err) {
    return crmBridgeJson(
      { ok: false, error: err instanceof Error ? err.message : 'Erro ao remover acesso no CRM.' },
      500,
      req
    );
  }
}
