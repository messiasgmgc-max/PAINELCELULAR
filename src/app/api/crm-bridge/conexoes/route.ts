import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import {
  autenticarBridgeAvancado,
  crmBridgeJson,
  crmBridgeOptionsResponse,
  resolverLojaAutorizada,
} from '@/lib/crm-bridge/auth';
import { obterConfigCrmLoja } from '@/lib/crm-bridge/lojaConfig';
import { getCleanEvolutionUrl } from '@/lib/whatsappService';

export async function OPTIONS(req: NextRequest) {
  return crmBridgeOptionsResponse(req);
}

function getEvoCreds() {
  const baseUrl = (process.env.CRM_EVOLUTION_API_URL || getCleanEvolutionUrl()).replace(/\/+$/, '');
  const apiKey = (process.env.EVOLUTION_API_KEY || '').trim();
  return { baseUrl, apiKey };
}

async function obterInstanciasPermitidasLoja(lojaId: string): Promise<Set<string>> {
  const permitidas = new Set<string>();
  const [cfgRes, sessRes] = await Promise.all([
    obterConfigCrmLoja(lojaId),
    supabaseAdmin.from('whatsapp_sessions').select('session_name').eq('loja_id', lojaId),
  ]);

  if (cfgRes.config.evolution_instance_name) {
    permitidas.add(cfgRes.config.evolution_instance_name.trim());
  }
  for (const row of (sessRes.data || []) as Array<Record<string, unknown>>) {
    const s = String(row.session_name || '').trim();
    if (s) permitidas.add(s);
  }
  return permitidas;
}

/**
 * GET /api/crm-bridge/conexoes
 * Lista instâncias ativas na Evolution API isoladas estritamente por loja
 * (apenas super_admin / master vê todas).
 */
export async function GET(req: NextRequest) {
  const auth = await autenticarBridgeAvancado(req, { requireGestao: true });
  if (!auth.ok) {
    return crmBridgeJson({ ok: false, error: auth.error }, auth.status || 401, req);
  }

  const loja = await resolverLojaAutorizada(req, auth);
  if (!loja) {
    return crmBridgeJson({ ok: false, error: 'Loja não identificada.' }, 404, req);
  }

  const { baseUrl, apiKey } = getEvoCreds();
  if (!apiKey) {
    return crmBridgeJson({ ok: false, error: 'EVOLUTION_API_KEY não configurada.' }, 503, req);
  }

  try {
    const res = await fetch(`${baseUrl}/instance/fetchInstances`, {
      headers: { apikey: apiKey },
      cache: 'no-store',
    });
    const data = await res.json();
    if (!res.ok) {
      return crmBridgeJson(
        { ok: false, error: 'Erro ao consultar Evolution API.', details: data },
        res.status,
        req
      );
    }

    const ehGlobal = auth.nivel === 'master' || Boolean(auth.superAdmin);
    const permitidas = ehGlobal ? null : await obterInstanciasPermitidasLoja(loja.id);

    const listaBruta = Array.isArray(data) ? data : [];
    const lista = listaBruta.filter((inst: Record<string, unknown>) => {
      if (!permitidas) return true;
      const nome = String(inst.name || inst.instanceName || '').trim();
      return permitidas.has(nome);
    });

    return crmBridgeJson(
      {
        ok: true,
        loja,
        escopoGlobal: ehGlobal,
        total: lista.length,
        instancias: lista.map((inst: Record<string, unknown>) => ({
          id: inst.id || null,
          name: inst.name || inst.instanceName || '',
          connectionStatus: inst.connectionStatus || inst.status || 'unknown',
          ownerJid: inst.ownerJid || null,
          profileName: inst.profileName || null,
          number: inst.number || null,
        })),
      },
      200,
      req
    );
  } catch (err) {
    return crmBridgeJson(
      { ok: false, error: err instanceof Error ? err.message : 'Falha de rede na Evolution API.' },
      502,
      req
    );
  }
}

/**
 * POST /api/crm-bridge/conexoes
 * Ações operacionais de gestão de conexões (restart / logout), protegidas por loja.
 */
export async function POST(req: NextRequest) {
  const auth = await autenticarBridgeAvancado(req, { requireGestao: true });
  if (!auth.ok) {
    return crmBridgeJson({ ok: false, error: auth.error }, auth.status || 401, req);
  }

  const loja = await resolverLojaAutorizada(req, auth);
  if (!loja) {
    return crmBridgeJson({ ok: false, error: 'Loja não identificada.' }, 404, req);
  }

  const { baseUrl, apiKey } = getEvoCreds();
  if (!apiKey) {
    return crmBridgeJson({ ok: false, error: 'EVOLUTION_API_KEY não configurada.' }, 503, req);
  }

  try {
    const body = await req.json();
    const action = String(body?.action || '').trim();
    const instanceName = String(body?.instanceName || '').trim();

    if (!instanceName || !['restart', 'logout'].includes(action)) {
      return crmBridgeJson(
        { ok: false, error: 'Informe action ("restart" ou "logout") e instanceName.' },
        400,
        req
      );
    }

    const ehGlobal = auth.nivel === 'master' || Boolean(auth.superAdmin);
    if (!ehGlobal) {
      const permitidas = await obterInstanciasPermitidasLoja(loja.id);
      if (!permitidas.has(instanceName)) {
        return crmBridgeJson(
          { ok: false, error: 'Esta instância WhatsApp não pertence à sua loja.' },
          403,
          req
        );
      }
    }

    if (action === 'restart') {
      const res = await fetch(`${baseUrl}/instance/restart/${encodeURIComponent(instanceName)}`, {
        method: 'POST',
        headers: { apikey: apiKey },
      });
      const data = await res.json().catch(() => ({}));
      return crmBridgeJson(
        { ok: res.ok, action, instanceName, data },
        res.ok ? 200 : res.status,
        req
      );
    }

    const res = await fetch(`${baseUrl}/instance/logout/${encodeURIComponent(instanceName)}`, {
      method: 'DELETE',
      headers: { apikey: apiKey },
    });
    const data = await res.json().catch(() => ({}));
    return crmBridgeJson(
      { ok: res.ok, action, instanceName, data },
      res.ok ? 200 : res.status,
      req
    );
  } catch (err) {
    return crmBridgeJson(
      { ok: false, error: err instanceof Error ? err.message : 'Erro ao executar ação.' },
      500,
      req
    );
  }
}
