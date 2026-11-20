import { NextRequest } from 'next/server';
import {
  autenticarBridge,
  crmBridgeJson,
  crmBridgeOptionsResponse,
} from '@/lib/crm-bridge/auth';
import { getCleanEvolutionUrl } from '@/lib/whatsappService';

export async function OPTIONS() {
  return crmBridgeOptionsResponse();
}

function getEvoCreds() {
  const baseUrl = (process.env.CRM_EVOLUTION_API_URL || getCleanEvolutionUrl()).replace(/\/+$/, '');
  const apiKey = (process.env.EVOLUTION_API_KEY || '').trim();
  return { baseUrl, apiKey };
}

/**
 * GET /api/crm-bridge/conexoes
 * Lista instâncias ativas na Evolution API (status, nome, número).
 */
export async function GET(req: NextRequest) {
  const auth = autenticarBridge(req);
  if (!auth.ok) {
    return crmBridgeJson({ ok: false, error: auth.error }, auth.status || 401);
  }

  const { baseUrl, apiKey } = getEvoCreds();
  if (!apiKey) {
    return crmBridgeJson({ ok: false, error: 'EVOLUTION_API_KEY não configurada.' }, 503);
  }

  try {
    const res = await fetch(`${baseUrl}/instance/fetchInstances`, {
      headers: { apikey: apiKey },
      cache: 'no-store',
    });
    const data = await res.json();
    if (!res.ok) {
      return crmBridgeJson({ ok: false, error: 'Erro ao consultar Evolution API.', details: data }, res.status);
    }

    const lista = Array.isArray(data) ? data : [];
    return crmBridgeJson({
      ok: true,
      total: lista.length,
      instancias: lista.map((inst: Record<string, unknown>) => ({
        id: inst.id || null,
        name: inst.name || inst.instanceName || '',
        connectionStatus: inst.connectionStatus || inst.status || 'unknown',
        ownerJid: inst.ownerJid || null,
        profileName: inst.profileName || null,
        number: inst.number || null,
      })),
    });
  } catch (err) {
    return crmBridgeJson(
      { ok: false, error: err instanceof Error ? err.message : 'Falha de rede na Evolution API.' },
      502
    );
  }
}

/**
 * POST /api/crm-bridge/conexoes
 * Ações operacionais de gestão de conexões (Print 2 Mercado Phone):
 * - action: 'restart' (reinicia uma instância específica ou todas)
 * - action: 'logout' (desconecta sessão)
 */
export async function POST(req: NextRequest) {
  const auth = autenticarBridge(req);
  if (!auth.ok) {
    return crmBridgeJson({ ok: false, error: auth.error }, auth.status || 401);
  }

  const { baseUrl, apiKey } = getEvoCreds();
  if (!apiKey) {
    return crmBridgeJson({ ok: false, error: 'EVOLUTION_API_KEY não configurada.' }, 503);
  }

  try {
    const body = await req.json();
    const action = String(body?.action || '').trim();
    const instanceName = String(body?.instanceName || '').trim();

    if (action === 'restart' && instanceName) {
      const res = await fetch(`${baseUrl}/instance/restart/${encodeURIComponent(instanceName)}`, {
        method: 'POST',
        headers: { apikey: apiKey },
      });
      const data = await res.json().catch(() => ({}));
      return crmBridgeJson({ ok: res.ok, action, instanceName, data }, res.ok ? 200 : res.status);
    }

    if (action === 'logout' && instanceName) {
      const res = await fetch(`${baseUrl}/instance/logout/${encodeURIComponent(instanceName)}`, {
        method: 'DELETE',
        headers: { apikey: apiKey },
      });
      const data = await res.json().catch(() => ({}));
      return crmBridgeJson({ ok: res.ok, action, instanceName, data }, res.ok ? 200 : res.status);
    }

    return crmBridgeJson(
      { ok: false, error: 'Informe action ("restart" ou "logout") e instanceName.' },
      400
    );
  } catch (err) {
    return crmBridgeJson(
      { ok: false, error: err instanceof Error ? err.message : 'Erro ao executar ação.' },
      500
    );
  }
}
