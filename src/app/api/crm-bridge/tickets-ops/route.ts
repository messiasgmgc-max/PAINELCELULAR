import { NextRequest } from 'next/server';
import {
  autenticarBridge,
  crmBridgeJson,
  crmBridgeOptionsResponse,
} from '@/lib/crm-bridge/auth';

export async function OPTIONS() {
  return crmBridgeOptionsResponse();
}

function getEvoCrmConfig() {
  const apiUrl = (
    process.env.CRM_EVO_API_URL || 'https://api-crm.phonecenter.tech'
  ).replace(/\/+$/, '');
  const accessToken = (process.env.CRM_EVO_ACCESS_TOKEN || '').trim();
  return { apiUrl, accessToken };
}

async function evoFetch(path: string, init: RequestInit = {}) {
  const { apiUrl, accessToken } = getEvoCrmConfig();
  if (!accessToken) {
    throw new Error(
      'CRM_EVO_ACCESS_TOKEN não configurado (gere um Access Token em crm.phonecenter.tech/settings/access-tokens).'
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

/**
 * GET /api/crm-bridge/tickets-ops
 * Lista inboxes/conexões do PhoneCenterCRM e resumo de atendimentos abertos.
 */
export async function GET(req: NextRequest) {
  const auth = autenticarBridge(req);
  if (!auth.ok) {
    return crmBridgeJson({ ok: false, error: auth.error }, auth.status || 401);
  }

  const { accessToken } = getEvoCrmConfig();
  if (!accessToken) {
    return crmBridgeJson({
      ok: true,
      configured: false,
      inboxes: [],
      message:
        'Configure CRM_EVO_ACCESS_TOKEN no Coolify para habilitar operações em massa de tickets.',
    });
  }

  try {
    const [inboxesRes, convsRes] = await Promise.all([
      evoFetch('/api/v1/inboxes'),
      evoFetch('/api/v1/conversations?status=open&page=1'),
    ]);

    const inboxesPayload = inboxesRes.data as Record<string, unknown> | unknown[];
    const inboxes = Array.isArray(inboxesPayload)
      ? inboxesPayload
      : ((inboxesPayload?.payload || inboxesPayload?.data || []) as unknown[]);

    const convsPayload = convsRes.data as Record<string, unknown>;
    const meta = (convsPayload?.data as Record<string, unknown>)?.meta || convsPayload?.meta || {};

    return crmBridgeJson({
      ok: true,
      configured: true,
      inboxes,
      meta,
    });
  } catch (err) {
    return crmBridgeJson(
      { ok: false, error: err instanceof Error ? err.message : 'Erro ao consultar EvoCRM.' },
      502
    );
  }
}

/**
 * POST /api/crm-bridge/tickets-ops
 * Utilitários operacionais de gestão de atendimentos (Print 2 Mercado Phone):
 * - action: 'fechar_todos' | 'fechar_por_filtro' (inboxId, diasInativo)
 * - action: 'migrar_conexao' (origemInboxId, destinoInboxId)
 */
export async function POST(req: NextRequest) {
  const auth = autenticarBridge(req);
  if (!auth.ok) {
    return crmBridgeJson({ ok: false, error: auth.error }, auth.status || 401);
  }

  try {
    const body = await req.json();
    const action = String(body?.action || '').trim();

    if (action === 'fechar_todos' || action === 'fechar_por_filtro') {
      const inboxId = body.inboxId ? Number(body.inboxId) : undefined;
      const diasInativo = body.diasInativo ? Number(body.diasInativo) : 0;
      const limiteCorte =
        diasInativo > 0 ? Date.now() - diasInativo * 86400 * 1000 : Number.MAX_SAFE_INTEGER;

      const qs = new URLSearchParams({ status: 'open', page: '1' });
      if (inboxId) qs.set('inbox_id', String(inboxId));

      const listRes = await evoFetch(`/api/v1/conversations?${qs.toString()}`);
      if (!listRes.ok) {
        return crmBridgeJson(
          { ok: false, error: 'Erro ao listar conversas no EvoCRM.', details: listRes.data },
          listRes.status
        );
      }

      const raw = listRes.data as Record<string, unknown>;
      const payload = (raw?.data as Record<string, unknown>)?.payload || raw?.payload || [];
      const convs = Array.isArray(payload) ? (payload as Array<Record<string, unknown>>) : [];

      const alvos = convs.filter((c) => {
        if (diasInativo <= 0) return true;
        const ts = Number(c.last_activity_at || c.timestamp || 0) * 1000;
        return ts > 0 && ts <= limiteCorte;
      });

      let encerrados = 0;
      for (const conv of alvos.slice(0, 100)) {
        const id = conv.id;
        if (!id) continue;
        const r = await evoFetch(`/api/v1/conversations/${id}/toggle_status`, {
          method: 'POST',
          body: JSON.stringify({ status: 'resolved' }),
        });
        if (r.ok) encerrados += 1;
      }

      return crmBridgeJson({
        ok: true,
        action,
        analisados: convs.length,
        encerrados,
      });
    }

    if (action === 'migrar_conexao') {
      const origemInboxId = Number(body.origemInboxId || 0);
      const destinoInboxId = Number(body.destinoInboxId || 0);
      if (!origemInboxId || !destinoInboxId || origemInboxId === destinoInboxId) {
        return crmBridgeJson(
          { ok: false, error: 'Informe origemInboxId e destinoInboxId distintos.' },
          400
        );
      }

      const listRes = await evoFetch(
        `/api/v1/conversations?status=open&inbox_id=${origemInboxId}&page=1`
      );
      if (!listRes.ok) {
        return crmBridgeJson(
          { ok: false, error: 'Falha ao consultar conversas da conexão de origem.' },
          listRes.status
        );
      }

      const raw = listRes.data as Record<string, unknown>;
      const payload = (raw?.data as Record<string, unknown>)?.payload || raw?.payload || [];
      const convs = Array.isArray(payload) ? (payload as Array<Record<string, unknown>>) : [];

      let migrados = 0;
      for (const conv of convs.slice(0, 50)) {
        const meta = (conv.meta || {}) as Record<string, unknown>;
        const sender = (meta.sender || {}) as Record<string, unknown>;
        const contactId = sender.id;
        if (!contactId) continue;

        const createRes = await evoFetch('/api/v1/conversations', {
          method: 'POST',
          body: JSON.stringify({
            inbox_id: destinoInboxId,
            contact_id: contactId,
            status: 'open',
            message: {
              content: `🔄 Atendimento migrado automaticamente da conexão #${origemInboxId} (ticket anterior #${conv.id}).`,
              private: true,
            },
          }),
        });

        if (createRes.ok && conv.id) {
          await evoFetch(`/api/v1/conversations/${conv.id}/toggle_status`, {
            method: 'POST',
            body: JSON.stringify({ status: 'resolved' }),
          });
          migrados += 1;
        }
      }

      return crmBridgeJson({
        ok: true,
        action,
        origemInboxId,
        destinoInboxId,
        encontrados: convs.length,
        migrados,
      });
    }

    return crmBridgeJson(
      { ok: false, error: 'Ação inválida. Use fechar_todos, fechar_por_filtro ou migrar_conexao.' },
      400
    );
  } catch (err) {
    return crmBridgeJson(
      { ok: false, error: err instanceof Error ? err.message : 'Erro operacional.' },
      500
    );
  }
}
