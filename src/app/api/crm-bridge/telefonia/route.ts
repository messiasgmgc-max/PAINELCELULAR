import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import {
  autenticarBridgeAvancado,
  crmBridgeJson,
  crmBridgeOptionsResponse,
  resolverLojaAutorizada,
} from '@/lib/crm-bridge/auth';
import { obterConfigCrmLoja } from '@/lib/crm-bridge/lojaConfig';
import { lookupClienteBridge } from '@/lib/crm-bridge/queries';

export async function OPTIONS(req: NextRequest) {
  return crmBridgeOptionsResponse(req);
}

/**
 * GET /api/crm-bridge/telefonia
 * Lista histórico de chamadas e retorna a chamada ativa (últimos 5 min) já enriquecida
 * com o perfil Cliente 360º (compras, garantias e OS).
 */
export async function GET(req: NextRequest) {
  const auth = await autenticarBridgeAvancado(req);
  if (!auth.ok) {
    return crmBridgeJson({ ok: false, error: auth.error }, auth.status || 401, req);
  }

  const loja = await resolverLojaAutorizada(req, auth);
  if (!loja) {
    return crmBridgeJson({ ok: false, error: 'Nenhuma loja ativa encontrada.' }, 404, req);
  }

  const [{ config }, chamadasRes] = await Promise.all([
    obterConfigCrmLoja(loja.id),
    supabaseAdmin
      .from('crm_chamadas_telefonia')
      .select('*')
      .eq('loja_id', loja.id)
      .order('created_at', { ascending: false })
      .limit(40),
  ]);

  if (chamadasRes.error) {
    return crmBridgeJson(
      {
        ok: true,
        loja,
        telefoniaAtivo: config.telefonia_ativo,
        provedor: config.telefonia_provedor,
        ramalUrl: config.telefonia_ramal_url,
        chamadas: [],
        chamadaAtiva: null,
        cliente360Ativo: null,
        migrationPendente: chamadasRes.error.message.includes('does not exist'),
      },
      200,
      req
    );
  }

  const chamadas = (chamadasRes.data || []) as Array<Record<string, unknown>>;
  const limite5Min = Date.now() - 5 * 60 * 1000;
  const chamadaAtiva =
    chamadas.find((c) => {
      const st = String(c.status || '');
      const ts = Date.parse(String(c.created_at || ''));
      return (st === 'tocando' || st === 'em_andamento') && Number.isFinite(ts) && ts >= limite5Min;
    }) || null;

  let cliente360Ativo = null;
  if (chamadaAtiva?.telefone) {
    cliente360Ativo = await lookupClienteBridge(loja.id, {
      telefone: String(chamadaAtiva.telefone),
    }).catch(() => null);
  }

  return crmBridgeJson(
    {
      ok: true,
      loja,
      telefoniaAtivo: config.telefonia_ativo,
      provedor: config.telefonia_provedor,
      ramalUrl: config.telefonia_ramal_url,
      chamadas,
      chamadaAtiva,
      cliente360Ativo,
      migrationPendente: false,
    },
    200,
    req
  );
}

/**
 * POST /api/crm-bridge/telefonia
 * Registra chamada de entrada ou saída (Click-to-Call) e vincula automaticamente ao Cliente 360º.
 */
export async function POST(req: NextRequest) {
  const auth = await autenticarBridgeAvancado(req);
  if (!auth.ok) {
    return crmBridgeJson({ ok: false, error: auth.error }, auth.status || 401, req);
  }

  const loja = await resolverLojaAutorizada(req, auth);
  if (!loja) {
    return crmBridgeJson({ ok: false, error: 'Nenhuma loja ativa encontrada.' }, 404, req);
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const telefone = String(body.telefone || '').trim();
    if (!telefone) {
      return crmBridgeJson({ ok: false, error: 'Informe o telefone da chamada.' }, 400, req);
    }

    const direcao = body.direcao === 'saida' ? 'saida' : 'entrada';
    const status = ['tocando', 'em_andamento', 'finalizada', 'perdida'].includes(
      String(body.status)
    )
      ? String(body.status)
      : direcao === 'saida'
        ? 'em_andamento'
        : 'tocando';

    const cli = await lookupClienteBridge(loja.id, { telefone }).catch(() => null);

    const { data, error } = await supabaseAdmin
      .from('crm_chamadas_telefonia')
      .insert({
        loja_id: loja.id,
        direcao,
        telefone,
        cliente_id: cli?.cliente?.id || null,
        cliente_nome: String(body.clienteNome || cli?.cliente?.nome || '').trim(),
        agente_nome: String(body.agenteNome || auth.usuario?.nome || 'Atendente').trim(),
        ramal: String(body.ramal || '').trim(),
        status,
        duracao_seg: Math.max(0, Math.trunc(Number(body.duracaoSeg) || 0)),
        anotacoes: String(body.anotacoes || '').trim(),
        protocolo_externo: String(body.protocoloExterno || '').trim(),
      })
      .select('*')
      .single();

    if (error) {
      return crmBridgeJson({ ok: false, error: error.message }, 500, req);
    }

    return crmBridgeJson({ ok: true, chamada: data, cliente360: cli }, 201, req);
  } catch (err) {
    return crmBridgeJson(
      { ok: false, error: err instanceof Error ? err.message : 'Erro ao registrar chamada.' },
      500,
      req
    );
  }
}

/**
 * PATCH /api/crm-bridge/telefonia
 * Atualiza status, duração e anotações da chamada (com envio opcional para nota privada do CRM).
 */
export async function PATCH(req: NextRequest) {
  const auth = await autenticarBridgeAvancado(req);
  if (!auth.ok) {
    return crmBridgeJson({ ok: false, error: auth.error }, auth.status || 401, req);
  }

  const loja = await resolverLojaAutorizada(req, auth);
  if (!loja) {
    return crmBridgeJson({ ok: false, error: 'Nenhuma loja ativa encontrada.' }, 404, req);
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const id = String(body.id || '').trim();
    if (!id) {
      return crmBridgeJson({ ok: false, error: 'Informe id da chamada.' }, 400, req);
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (['tocando', 'em_andamento', 'finalizada', 'perdida'].includes(String(body.status))) {
      patch.status = String(body.status);
    }
    if (body.duracaoSeg != null) {
      patch.duracao_seg = Math.max(0, Math.trunc(Number(body.duracaoSeg) || 0));
    }
    if (body.anotacoes !== undefined) {
      patch.anotacoes = String(body.anotacoes || '');
    }

    const { data, error } = await supabaseAdmin
      .from('crm_chamadas_telefonia')
      .update(patch)
      .eq('id', id)
      .eq('loja_id', loja.id)
      .select('*')
      .single();

    if (error || !data) {
      return crmBridgeJson({ ok: false, error: error?.message || 'Chamada não encontrada.' }, 404, req);
    }

    if (body.conversationId && body.anotacoes) {
      try {
        const { config: cfg } = await obterConfigCrmLoja(loja.id);
        const token = (cfg.crm_access_token || process.env.CRM_EVO_ACCESS_TOKEN || '').trim();
        if (token) {
          const apiUrl = (
            cfg.crm_api_url ||
            process.env.CRM_EVO_API_URL ||
            'https://api-crm.phonecenter.tech'
          ).replace(/\/+$/, '');
          await fetch(
            `${apiUrl}/api/v1/conversations/${encodeURIComponent(String(body.conversationId))}/messages`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
                api_access_token: token,
              },
              body: JSON.stringify({
                content: `📞 Registro de Ligação (${data.direcao === 'saida' ? 'Saída' : 'Entrada'} • ${data.telefone}):\n${String(body.anotacoes)}`,
                message_type: 'outgoing',
                private: true,
              }),
            }
          );
        }
      } catch {
        // Não bloqueia
      }
    }

    return crmBridgeJson({ ok: true, chamada: data }, 200, req);
  } catch (err) {
    return crmBridgeJson(
      { ok: false, error: err instanceof Error ? err.message : 'Erro ao atualizar chamada.' },
      500,
      req
    );
  }
}
