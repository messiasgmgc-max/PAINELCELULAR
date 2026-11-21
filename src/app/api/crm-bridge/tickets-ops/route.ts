import { NextRequest } from 'next/server';
import {
  autenticarBridgeAvancado,
  crmBridgeJson,
  crmBridgeOptionsResponse,
  resolverLojaAutorizada,
  type AuthBridgeContext,
} from '@/lib/crm-bridge/auth';
import { obterConfigCrmLoja } from '@/lib/crm-bridge/lojaConfig';

export async function OPTIONS(req: NextRequest) {
  return crmBridgeOptionsResponse(req);
}

async function getEvoCrmConfig(req: NextRequest, auth: AuthBridgeContext) {
  const loja = await resolverLojaAutorizada(req, auth);
  const cfg = loja ? (await obterConfigCrmLoja(loja.id)).config : null;
  const apiUrl = (
    cfg?.crm_api_url ||
    process.env.CRM_EVO_API_URL ||
    'https://api-crm.phonecenter.tech'
  ).replace(/\/+$/, '');
  const accessToken = (cfg?.crm_access_token || process.env.CRM_EVO_ACCESS_TOKEN || '').trim();
  return { apiUrl, accessToken, loja };
}

async function evoFetch(
  req: NextRequest,
  auth: AuthBridgeContext,
  path: string,
  init: RequestInit = {}
) {
  const { apiUrl, accessToken } = await getEvoCrmConfig(req, auth);
  if (!accessToken) {
    throw new Error(
      'Token do CRM não configurado para esta loja (configure em /crm-config no Supabase).'
    );
  }
  const res = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      api_access_token: accessToken,
      ...(init.headers || {}),
    },
    cache: 'no-store',
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  return { ok: res.ok, status: res.status, data: json };
}

function extrairPayloadConversas(raw: unknown): Array<Record<string, unknown>> {
  const obj = (raw || {}) as Record<string, unknown>;
  const dataObj = (obj.data || {}) as Record<string, unknown>;
  const payload = dataObj.payload || obj.payload || obj.data || [];
  return Array.isArray(payload) ? (payload as Array<Record<string, unknown>>) : [];
}

async function listarTodasConversasAbertas(
  req: NextRequest,
  auth: AuthBridgeContext,
  opts: { inboxId?: number; maxPages?: number } = {}
): Promise<Array<Record<string, unknown>>> {
  const maxPages = Math.min(Math.max(opts.maxPages || 10, 1), 20);
  const todas: Array<Record<string, unknown>> = [];
  const vistos = new Set<string>();

  for (let page = 1; page <= maxPages; page++) {
    const qs = new URLSearchParams({ status: 'open', page: String(page) });
    if (opts.inboxId) qs.set('inbox_id', String(opts.inboxId));

    const res = await evoFetch(req, auth, `/api/v1/conversations?${qs.toString()}`);
    if (!res.ok) {
      if (page === 1) {
        throw new Error(`Falha ao listar conversas no CRM (HTTP ${res.status}).`);
      }
      break;
    }

    const lote = extrairPayloadConversas(res.data);
    if (lote.length === 0) break;

    let novosNoLote = 0;
    for (const conv of lote) {
      const id = String(conv.id || '');
      if (id && !vistos.has(id)) {
        vistos.add(id);
        todas.push(conv);
        novosNoLote += 1;
      }
    }
    if (novosNoLote === 0 || lote.length < 15) break;
  }

  return todas;
}

async function obterOuCriarSourceIdDestino(
  req: NextRequest,
  auth: AuthBridgeContext,
  contactId: number | string,
  destinoInboxId: number
): Promise<string | undefined> {
  try {
    const cRes = await evoFetch(req, auth, `/api/v1/contacts/${contactId}`);
    if (cRes.ok && cRes.data) {
      const payload = ((cRes.data as Record<string, unknown>).payload ||
        cRes.data) as Record<string, unknown>;
      const inboxes = Array.isArray(payload.contact_inboxes)
        ? (payload.contact_inboxes as Array<Record<string, unknown>>)
        : [];
      const match = inboxes.find((ci) => {
        const ib = (ci.inbox || {}) as Record<string, unknown>;
        return Number(ci.inbox_id || ib.id) === destinoInboxId && ci.source_id;
      });
      if (match?.source_id) return String(match.source_id);
    }
  } catch {
    // continua para tentativa de criação
  }

  try {
    const ciRes = await evoFetch(req, auth, `/api/v1/contacts/${contactId}/contact_inboxes`, {
      method: 'POST',
      body: JSON.stringify({ inbox_id: destinoInboxId }),
    });
    if (ciRes.ok && ciRes.data) {
      const d = ciRes.data as Record<string, unknown>;
      const payload = (d.payload || d) as Record<string, unknown>;
      if (payload.source_id) return String(payload.source_id);
    }
  } catch {
    // fallback sem source_id
  }
  return undefined;
}

/**
 * GET /api/crm-bridge/tickets-ops
 * Lista inboxes/conexões do PhoneCenterCRM e resumo de atendimentos abertos.
 */
export async function GET(req: NextRequest) {
  const auth = await autenticarBridgeAvancado(req, { requireGestao: true });
  if (!auth.ok) {
    return crmBridgeJson({ ok: false, error: auth.error }, auth.status || 401, req);
  }

  const { accessToken } = await getEvoCrmConfig(req, auth);
  if (!accessToken) {
    return crmBridgeJson(
      {
        ok: true,
        configured: false,
        inboxes: [],
        message:
          'Configure o Access Token do CRM desta loja em /crm-config (Supabase) para habilitar operações em massa de tickets.',
      },
      200,
      req
    );
  }

  try {
    const [inboxesRes, convsRes] = await Promise.all([
      evoFetch(req, auth, '/api/v1/inboxes'),
      evoFetch(req, auth, '/api/v1/conversations?status=open&page=1'),
    ]);

    const inboxesPayload = inboxesRes.data as Record<string, unknown> | unknown[];
    const inboxes = Array.isArray(inboxesPayload)
      ? inboxesPayload
      : ((inboxesPayload?.payload || inboxesPayload?.data || []) as unknown[]);

    const convsPayload = convsRes.data as Record<string, unknown>;
    const meta = (convsPayload?.data as Record<string, unknown>)?.meta || convsPayload?.meta || {};

    return crmBridgeJson(
      {
        ok: true,
        configured: true,
        inboxes,
        meta,
      },
      200,
      req
    );
  } catch (err) {
    return crmBridgeJson(
      { ok: false, error: err instanceof Error ? err.message : 'Erro ao consultar EvoCRM.' },
      502,
      req
    );
  }
}

/**
 * POST /api/crm-bridge/tickets-ops
 * Utilitários operacionais de gestão de atendimentos (paginação completa):
 * - action: 'fechar_todos' | 'fechar_por_filtro' | 'fechar_conexoes_removidas'
 * - action: 'migrar_conexao' (com resolução de contact_inbox source_id)
 */
export async function POST(req: NextRequest) {
  const auth = await autenticarBridgeAvancado(req, { requireGestao: true });
  if (!auth.ok) {
    return crmBridgeJson({ ok: false, error: auth.error }, auth.status || 401, req);
  }

  try {
    const body = await req.json();
    const action = String(body?.action || '').trim();

    if (
      action === 'fechar_todos' ||
      action === 'fechar_por_filtro' ||
      action === 'fechar_conexoes_removidas'
    ) {
      const inboxId = body.inboxId ? Number(body.inboxId) : undefined;
      const diasInativo = body.diasInativo ? Number(body.diasInativo) : 0;
      const limiteCorte =
        diasInativo > 0 ? Date.now() - diasInativo * 86400 * 1000 : Number.MAX_SAFE_INTEGER;

      const convs = await listarTodasConversasAbertas(req, auth, { inboxId, maxPages: 10 });

      let inboxesAtivasIds: Set<number> | null = null;
      if (action === 'fechar_conexoes_removidas') {
        const inboxesRes = await evoFetch(req, auth, '/api/v1/inboxes');
        const inboxesPayload = inboxesRes.data as Record<string, unknown> | unknown[];
        const listaInboxes = (
          Array.isArray(inboxesPayload)
            ? inboxesPayload
            : inboxesPayload?.payload || inboxesPayload?.data || []
        ) as Array<Record<string, unknown>>;
        inboxesAtivasIds = new Set(listaInboxes.map((i) => Number(i.id)).filter(Boolean));
      }

      const alvos = convs.filter((c) => {
        if (action === 'fechar_conexoes_removidas' && inboxesAtivasIds) {
          const cid = Number(c.inbox_id || 0);
          return !cid || !inboxesAtivasIds.has(cid);
        }
        if (diasInativo <= 0) return true;
        const ts = Number(c.last_activity_at || c.timestamp || 0) * 1000;
        return ts > 0 && ts <= limiteCorte;
      });

      let encerrados = 0;
      for (const conv of alvos.slice(0, 250)) {
        const id = conv.id;
        if (!id) continue;
        const r = await evoFetch(req, auth, `/api/v1/conversations/${id}/toggle_status`, {
          method: 'POST',
          body: JSON.stringify({ status: 'resolved' }),
        });
        if (r.ok) encerrados += 1;
      }

      return crmBridgeJson(
        {
          ok: true,
          action,
          analisados: convs.length,
          elegiveis: alvos.length,
          encerrados,
        },
        200,
        req
      );
    }

    if (action === 'migrar_conexao') {
      const origemInboxId = Number(body.origemInboxId || 0);
      const destinoInboxId = Number(body.destinoInboxId || 0);
      if (!origemInboxId || !destinoInboxId || origemInboxId === destinoInboxId) {
        return crmBridgeJson(
          { ok: false, error: 'Informe origemInboxId e destinoInboxId distintos.' },
          400,
          req
        );
      }

      const convs = await listarTodasConversasAbertas(req, auth, {
        inboxId: origemInboxId,
        maxPages: 10,
      });

      let migrados = 0;
      for (const conv of convs.slice(0, 150)) {
        const meta = (conv.meta || {}) as Record<string, unknown>;
        const sender = (meta.sender || {}) as Record<string, unknown>;
        const contactId = sender.id as string | number | undefined;
        if (!contactId) continue;

        const sourceId = await obterOuCriarSourceIdDestino(req, auth, contactId, destinoInboxId);
        const createBody: Record<string, unknown> = {
          inbox_id: destinoInboxId,
          contact_id: contactId,
          status: 'open',
          message: {
            content: `🔄 Atendimento migrado automaticamente da conexão #${origemInboxId} (ticket anterior #${conv.id}).`,
            private: true,
          },
        };
        if (sourceId) createBody.source_id = sourceId;

        const createRes = await evoFetch(req, auth, '/api/v1/conversations', {
          method: 'POST',
          body: JSON.stringify(createBody),
        });

        if (createRes.ok && conv.id) {
          await evoFetch(req, auth, `/api/v1/conversations/${conv.id}/toggle_status`, {
            method: 'POST',
            body: JSON.stringify({ status: 'resolved' }),
          });
          migrados += 1;
        }
      }

      return crmBridgeJson(
        {
          ok: true,
          action,
          origemInboxId,
          destinoInboxId,
          encontrados: convs.length,
          migrados,
        },
        200,
        req
      );
    }

    return crmBridgeJson(
      {
        ok: false,
        error:
          'Ação inválida. Use fechar_todos, fechar_por_filtro, fechar_conexoes_removidas ou migrar_conexao.',
      },
      400,
      req
    );
  } catch (err) {
    return crmBridgeJson(
      { ok: false, error: err instanceof Error ? err.message : 'Erro operacional.' },
      500,
      req
    );
  }
}
