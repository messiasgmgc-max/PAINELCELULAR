import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import {
  autenticarBridgeAvancado,
  crmBridgeJson,
  crmBridgeOptionsResponse,
  resolverLojaAutorizada,
} from '@/lib/crm-bridge/auth';
import { obterConfigCrmLoja } from '@/lib/crm-bridge/lojaConfig';
import {
  RegraRodizio,
  selecionarProximoAgenteRodizio,
  SETORES_PADRAO_RODIZIO,
} from '@/lib/crm-bridge/rodizio';

export async function OPTIONS(req: NextRequest) {
  return crmBridgeOptionsResponse(req);
}

/**
 * GET /api/crm-bridge/rodizio
 * Lista regras de rodízio por setor + lista de membros da equipe da loja.
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

  const [regrasRes, perfisRes, tecnicosRes] = await Promise.all([
    supabaseAdmin.from('crm_rodizio_regras').select('*').eq('loja_id', loja.id),
    supabaseAdmin.from('perfis').select('id, nome, role').eq('loja_id', loja.id),
    supabaseAdmin.from('tecnicos').select('id, nome, cargo').eq('loja_id', loja.id).eq('ativo', true),
  ]);

  const migrationPendente = Boolean(regrasRes.error?.message?.includes('does not exist'));
  const porSetor = new Map<string, Record<string, unknown>>();
  for (const r of (regrasRes.data || []) as Array<Record<string, unknown>>) {
    porSetor.set(String(r.setor).toLowerCase(), r);
  }

  const regras: RegraRodizio[] = SETORES_PADRAO_RODIZIO.map((padrao) => {
    const salvo = porSetor.get(padrao.setor.toLowerCase());
    if (!salvo) return padrao;
    return {
      setor: String(salvo.setor || padrao.setor),
      ativo: Boolean(salvo.ativo),
      estrategia: String(salvo.estrategia || 'round_robin'),
      limite_simultaneo: Number(salvo.limite_simultaneo || 8),
      respeitar_online: Boolean(salvo.respeitar_online),
      horario_inicio: String(salvo.horario_inicio || '09:00'),
      horario_fim: String(salvo.horario_fim || '19:00'),
      dias_semana: Array.isArray(salvo.dias_semana) ? (salvo.dias_semana as number[]) : [1, 2, 3, 4, 5, 6],
      agentes: Array.isArray(salvo.agentes) ? (salvo.agentes as RegraRodizio['agentes']) : [],
      ultimo_indice: Number(salvo.ultimo_indice ?? -1),
    };
  });

  // Adiciona eventuais setores customizados criados pela loja
  for (const r of (regrasRes.data || []) as Array<Record<string, unknown>>) {
    const s = String(r.setor || '');
    if (s && !regras.some((x) => x.setor.toLowerCase() === s.toLowerCase())) {
      regras.push({
        setor: s,
        ativo: Boolean(r.ativo),
        estrategia: String(r.estrategia || 'round_robin'),
        limite_simultaneo: Number(r.limite_simultaneo || 8),
        respeitar_online: Boolean(r.respeitar_online),
        horario_inicio: String(r.horario_inicio || '09:00'),
        horario_fim: String(r.horario_fim || '19:00'),
        dias_semana: Array.isArray(r.dias_semana) ? (r.dias_semana as number[]) : [1, 2, 3, 4, 5, 6],
        agentes: Array.isArray(r.agentes) ? (r.agentes as RegraRodizio['agentes']) : [],
        ultimo_indice: Number(r.ultimo_indice ?? -1),
      });
    }
  }

  const nomesSet = new Set<string>();
  for (const p of (perfisRes.data || []) as Array<Record<string, unknown>>) {
    if (p.nome) nomesSet.add(String(p.nome).trim());
  }
  for (const t of (tecnicosRes.data || []) as Array<Record<string, unknown>>) {
    if (t.nome) nomesSet.add(String(t.nome).trim());
  }

  return crmBridgeJson(
    {
      ok: true,
      loja,
      regras,
      equipeDisponivel: Array.from(nomesSet).sort(),
      migrationPendente,
    },
    200,
    req
  );
}

/**
 * PUT /api/crm-bridge/rodizio
 * Cria ou atualiza a regra de rodízio de um setor.
 */
export async function PUT(req: NextRequest) {
  const auth = await autenticarBridgeAvancado(req, { requireGestao: true });
  if (!auth.ok) {
    return crmBridgeJson({ ok: false, error: auth.error }, auth.status || 401, req);
  }

  const loja = await resolverLojaAutorizada(req, auth);
  if (!loja) {
    return crmBridgeJson({ ok: false, error: 'Nenhuma loja ativa encontrada.' }, 404, req);
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const setor = String(body.setor || '').trim();
    if (!setor) {
      return crmBridgeJson({ ok: false, error: 'Informe o setor do rodízio.' }, 400, req);
    }

    const agentesBrutos = Array.isArray(body.agentes) ? body.agentes : [];
    const agentes = agentesBrutos
      .map((a) =>
        typeof a === 'string'
          ? { nome: a.trim(), ativo: true }
          : {
              nome: String((a as Record<string, unknown>).nome || '').trim(),
              ativo: (a as Record<string, unknown>).ativo !== false,
            }
      )
      .filter((a) => a.nome);

    const { data, error } = await supabaseAdmin
      .from('crm_rodizio_regras')
      .upsert(
        {
          loja_id: loja.id,
          setor,
          ativo: body.ativo !== false,
          estrategia: String(body.estrategia || 'round_robin'),
          limite_simultaneo: Math.max(1, Number(body.limite_simultaneo || 8)),
          respeitar_online: body.respeitar_online !== false,
          horario_inicio: String(body.horario_inicio || '09:00'),
          horario_fim: String(body.horario_fim || '19:00'),
          dias_semana: Array.isArray(body.dias_semana) ? body.dias_semana : [1, 2, 3, 4, 5, 6],
          agentes,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'loja_id,setor' }
      )
      .select('*')
      .single();

    if (error) {
      return crmBridgeJson({ ok: false, error: error.message }, 500, req);
    }

    return crmBridgeJson({ ok: true, regra: data }, 200, req);
  } catch (err) {
    return crmBridgeJson(
      { ok: false, error: err instanceof Error ? err.message : 'Erro ao salvar rodízio.' },
      500,
      req
    );
  }
}

/**
 * POST /api/crm-bridge/rodizio
 * Seleciona o próximo agente elegível e (opcionalmente) atribui a conversa no EvoCRM.
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
    const setor = String(body.setor || 'Vendas').trim();
    const conversationId = body.conversationId ? String(body.conversationId).trim() : '';

    const { data: regraDb } = await supabaseAdmin
      .from('crm_rodizio_regras')
      .select('*')
      .eq('loja_id', loja.id)
      .ilike('setor', setor)
      .maybeSingle();

    if (!regraDb) {
      return crmBridgeJson(
        { ok: false, error: `Regra de rodízio para "${setor}" não configurada ainda.` },
        404,
        req
      );
    }

    const selecao = selecionarProximoAgenteRodizio(
      regraDb as unknown as RegraRodizio,
      (body.statusAgentes as Record<string, { status?: string; conversasAbertas?: number }>) || undefined
    );

    if (selecao.agenteSelecionado) {
      await supabaseAdmin
        .from('crm_rodizio_regras')
        .update({ ultimo_indice: selecao.proximoIndice, updated_at: new Date().toISOString() })
        .eq('id', regraDb.id);
    }

    let atribuidoNoCrm = false;
    if (conversationId && selecao.agenteSelecionado) {
      try {
        const { config: cfg } = await obterConfigCrmLoja(loja.id);
        const token = (cfg.crm_access_token || process.env.CRM_EVO_ACCESS_TOKEN || '').trim();
        if (token) {
          const apiUrl = (
            cfg.crm_api_url ||
            process.env.CRM_EVO_API_URL ||
            'https://api-crm.phonecenter.tech'
          ).replace(/\/+$/, '');
          const agentsRes = await fetch(`${apiUrl}/api/v1/agents`, {
            headers: { Authorization: `Bearer ${token}`, api_access_token: token },
          });
          if (agentsRes.ok) {
            const agentsJson = (await agentsRes.json()) as unknown;
            const lista = Array.isArray(agentsJson)
              ? agentsJson
              : (((agentsJson as Record<string, unknown>)?.payload || []) as Array<
                  Record<string, unknown>
                >);
            const match = (lista as Array<Record<string, unknown>>).find((ag) =>
              String(ag.name || '')
                .toLowerCase()
                .includes(selecao.agenteSelecionado!.toLowerCase())
            );
            if (match?.id) {
              const assignRes = await fetch(
                `${apiUrl}/api/v1/conversations/${encodeURIComponent(conversationId)}/assignments`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                    api_access_token: token,
                  },
                  body: JSON.stringify({ assignee_id: match.id }),
                }
              );
              atribuidoNoCrm = assignRes.ok;
            }
          }
        }
      } catch {
        // segue
      }
    }

    return crmBridgeJson(
      {
        ok: true,
        setor,
        agenteSelecionado: selecao.agenteSelecionado,
        proximoIndice: selecao.proximoIndice,
        motivoFallback: selecao.motivoFallback || null,
        atribuidoNoCrm,
      },
      200,
      req
    );
  } catch (err) {
    return crmBridgeJson(
      { ok: false, error: err instanceof Error ? err.message : 'Erro no rodízio.' },
      500,
      req
    );
  }
}
