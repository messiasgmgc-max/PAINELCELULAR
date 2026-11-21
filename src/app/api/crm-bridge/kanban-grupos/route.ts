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
  enviarTextoWhatsApp,
  getCleanEvolutionUrl,
  getEvolutionConfig,
} from '@/lib/whatsappService';

export async function OPTIONS(req: NextRequest) {
  return crmBridgeOptionsResponse(req);
}

/**
 * GET /api/crm-bridge/kanban-grupos
 * Lista grupos reais da instância WhatsApp da loja mesclados com as colunas do Kanban.
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

  const [{ config }, kanbanRes, evoDefault] = await Promise.all([
    obterConfigCrmLoja(loja.id),
    supabaseAdmin.from('crm_kanban_grupos').select('*').eq('loja_id', loja.id),
    getEvolutionConfig(loja.id),
  ]);

  const migrationPendente = Boolean(kanbanRes.error?.message?.includes('does not exist'));
  const salvosMap = new Map<string, Record<string, unknown>>();
  for (const row of (kanbanRes.data || []) as Array<Record<string, unknown>>) {
    salvosMap.set(String(row.grupo_jid), row);
  }

  const instanceName = config.evolution_instance_name || evoDefault.instanceName;
  const evolutionUrl = (process.env.CRM_EVOLUTION_API_URL || getCleanEvolutionUrl()).replace(
    /\/+$/,
    ''
  );
  const apiKey = (process.env.EVOLUTION_API_KEY || evoDefault.apiKey || '').trim();

  const grupos: Array<{
    grupoJid: string;
    grupoNome: string;
    coluna: string;
    notas: string;
    participantes?: number;
    ultimoDisparoEm?: string | null;
  }> = [];

  if (apiKey && instanceName) {
    try {
      const res = await fetch(
        `${evolutionUrl}/group/fetchAllGroups/${encodeURIComponent(instanceName)}?getParticipants=false`,
        { headers: { apikey: apiKey }, cache: 'no-store' }
      );
      if (res.ok) {
        const payload = await res.json();
        const raw = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.groups)
            ? payload.groups
            : [];
        for (const g of raw as Array<Record<string, unknown>>) {
          const jid = String(g.id || '');
          if (!jid.endsWith('@g.us')) continue;
          const salvo = salvosMap.get(jid);
          grupos.push({
            grupoJid: jid,
            grupoNome: String(g.subject || g.name || salvo?.grupo_nome || 'Grupo WhatsApp'),
            coluna: String(salvo?.coluna || 'fornecedores'),
            notas: String(salvo?.notas || ''),
            participantes: Number(g.size || 0) || undefined,
            ultimoDisparoEm: salvo?.ultimo_disparo_em ? String(salvo.ultimo_disparo_em) : null,
          });
          salvosMap.delete(jid);
        }
      }
    } catch {
      // Fallback para grupos já salvos no banco
    }
  }

  // Inclui grupos salvos manualmente ou em cache do banco que não vieram da API agora
  for (const salvo of salvosMap.values()) {
    grupos.push({
      grupoJid: String(salvo.grupo_jid),
      grupoNome: String(salvo.grupo_nome || 'Grupo'),
      coluna: String(salvo.coluna || 'fornecedores'),
      notas: String(salvo.notas || ''),
      ultimoDisparoEm: salvo.ultimo_disparo_em ? String(salvo.ultimo_disparo_em) : null,
    });
  }

  return crmBridgeJson(
    {
      ok: true,
      loja,
      instanceName,
      grupos,
      migrationPendente,
    },
    200,
    req
  );
}

/**
 * PUT /api/crm-bridge/kanban-grupos
 * Move um grupo de coluna no Kanban de Grupos ou atualiza notas.
 */
export async function PUT(req: NextRequest) {
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
    const grupoJid = String(body.grupoJid || '').trim();
    const grupoNome = String(body.grupoNome || 'Grupo WhatsApp').trim();
    const coluna = ['fornecedores', 'atacado_vip', 'cotacao_dia', 'fechados'].includes(
      String(body.coluna)
    )
      ? String(body.coluna)
      : 'fornecedores';

    if (!grupoJid) {
      return crmBridgeJson({ ok: false, error: 'Informe grupoJid.' }, 400, req);
    }

    const { data, error } = await supabaseAdmin
      .from('crm_kanban_grupos')
      .upsert(
        {
          loja_id: loja.id,
          grupo_jid: grupoJid,
          grupo_nome: grupoNome,
          coluna,
          notas: String(body.notas || ''),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'loja_id,grupo_jid' }
      )
      .select('*')
      .single();

    if (error) {
      return crmBridgeJson({ ok: false, error: error.message }, 500, req);
    }

    return crmBridgeJson({ ok: true, grupo: data }, 200, req);
  } catch (err) {
    return crmBridgeJson(
      { ok: false, error: err instanceof Error ? err.message : 'Erro ao mover grupo.' },
      500,
      req
    );
  }
}

/**
 * POST /api/crm-bridge/kanban-grupos
 * Dispara uma mensagem ou lista de atacado diretamente no grupo selecionado.
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
    const grupoJid = String(body.grupoJid || '').trim();
    const mensagem = String(body.mensagem || '').trim();
    if (!grupoJid || !mensagem) {
      return crmBridgeJson({ ok: false, error: 'Informe grupoJid e mensagem.' }, 400, req);
    }

    const envio = await enviarTextoWhatsApp({
      lojaId: loja.id,
      telefone: grupoJid,
      texto: mensagem,
    });

    if (!envio.success) {
      return crmBridgeJson(
        { ok: false, error: envio.error || 'Falha ao enviar para o grupo.' },
        502,
        req
      );
    }

    await supabaseAdmin
      .from('crm_kanban_grupos')
      .update({ ultimo_disparo_em: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('loja_id', loja.id)
      .eq('grupo_jid', grupoJid);

    return crmBridgeJson({ ok: true, enviado: true, grupoJid }, 200, req);
  } catch (err) {
    return crmBridgeJson(
      { ok: false, error: err instanceof Error ? err.message : 'Erro ao disparar para grupo.' },
      500,
      req
    );
  }
}
