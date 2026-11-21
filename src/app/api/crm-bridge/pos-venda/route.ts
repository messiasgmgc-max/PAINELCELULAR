import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import {
  autenticarBridgeAvancado,
  crmBridgeJson,
  crmBridgeOptionsResponse,
  resolverLojaAutorizada,
} from '@/lib/crm-bridge/auth';
import { obterConfigCrmLoja, salvarConfigCrmLoja } from '@/lib/crm-bridge/lojaConfig';
import {
  executarPosVendaLoja,
  identificarElegiveisPosVenda,
  listarRegrasPosVendaLoja,
} from '@/lib/crm-bridge/posVenda';

export async function OPTIONS(req: NextRequest) {
  return crmBridgeOptionsResponse(req);
}

/**
 * GET /api/crm-bridge/pos-venda
 * Retorna configuração, réguas de pós-venda, fila de elegíveis hoje e log de disparos.
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

  const [{ config }, { regras, migrationPendente }, elegiveis, disparosRes] = await Promise.all([
    obterConfigCrmLoja(loja.id),
    listarRegrasPosVendaLoja(loja.id),
    identificarElegiveisPosVenda(loja.id, loja.nome).catch(() => []),
    supabaseAdmin
      .from('crm_pos_venda_disparos')
      .select('*')
      .eq('loja_id', loja.id)
      .order('created_at', { ascending: false })
      .limit(30),
  ]);

  return crmBridgeJson(
    {
      ok: true,
      loja,
      posVendaAtivo: config.pos_venda_ativo,
      googleReviewUrl: config.google_review_url,
      regras,
      totalElegiveis: elegiveis.length,
      elegiveisPreview: elegiveis.slice(0, 20),
      disparos: disparosRes.data || [],
      migrationPendente,
    },
    200,
    req
  );
}

/**
 * PUT /api/crm-bridge/pos-venda
 * Salva configurações do motor de Pós-Venda Automático ("PhoneCenter Turbo") e réguas.
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

    if (body.posVendaAtivo !== undefined || body.googleReviewUrl !== undefined) {
      await salvarConfigCrmLoja(loja.id, {
        ...(body.posVendaAtivo !== undefined ? { pos_venda_ativo: Boolean(body.posVendaAtivo) } : {}),
        ...(body.googleReviewUrl !== undefined
          ? { google_review_url: String(body.googleReviewUrl || '') }
          : {}),
      });
    }

    if (Array.isArray(body.regras)) {
      const agora = new Date().toISOString();
      const rows = (body.regras as Array<Record<string, unknown>>).map((r) => ({
        loja_id: loja.id,
        tipo: String(r.tipo),
        ativo: Boolean(r.ativo),
        dias_apos: Math.max(0, Number(r.dias_apos || 0)),
        template_mensagem: String(r.template_mensagem || ''),
        incluir_avaliacao_upgrade: Boolean(r.incluir_avaliacao_upgrade),
        updated_at: agora,
      }));
      if (rows.length > 0) {
        const { error } = await supabaseAdmin
          .from('crm_pos_venda_regras')
          .upsert(rows, { onConflict: 'loja_id,tipo' });
        if (error) {
          return crmBridgeJson({ ok: false, error: error.message }, 500, req);
        }
      }
    }

    const { regras } = await listarRegrasPosVendaLoja(loja.id);
    return crmBridgeJson({ ok: true, loja, regras }, 200, req);
  } catch (err) {
    return crmBridgeJson(
      { ok: false, error: err instanceof Error ? err.message : 'Erro ao salvar réguas.' },
      500,
      req
    );
  }
}

/**
 * POST /api/crm-bridge/pos-venda
 * Executa o motor de pós-venda para a loja (ou para todas as lojas ativas via Cron master).
 */
export async function POST(req: NextRequest) {
  const auth = await autenticarBridgeAvancado(req, { requireGestao: true });
  if (!auth.ok) {
    return crmBridgeJson({ ok: false, error: auth.error }, auth.status || 401, req);
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const dryRun = Boolean(body.dryRun);
    const limit = body.limit ? Number(body.limit) : 20;
    const regraTipo = body.regraTipo ? String(body.regraTipo) : undefined;

    if (body.todasLojas === true && (auth.nivel === 'master' || auth.superAdmin)) {
      const { data: configsAtivas } = await supabaseAdmin
        .from('crm_loja_configs')
        .select('loja_id')
        .eq('pos_venda_ativo', true);

      const resultados = [];
      for (const row of (configsAtivas || []) as Array<Record<string, unknown>>) {
        const lid = String(row.loja_id);
        const { data: lojaDb } = await supabaseAdmin
          .from('lojas')
          .select('nome')
          .eq('id', lid)
          .maybeSingle();
        const r = await executarPosVendaLoja(lid, String(lojaDb?.nome || 'PhoneCenter'), {
          dryRun,
          limit,
          regraTipo,
        });
        resultados.push({ lojaId: lid, ...r });
      }
      return crmBridgeJson({ ok: true, multiLoja: true, resultados }, 200, req);
    }

    const loja = await resolverLojaAutorizada(req, auth);
    if (!loja) {
      return crmBridgeJson({ ok: false, error: 'Nenhuma loja ativa encontrada.' }, 404, req);
    }

    const resultado = await executarPosVendaLoja(loja.id, loja.nome, {
      dryRun,
      limit,
      regraTipo,
    });

    return crmBridgeJson({ ok: true, loja, ...resultado }, 200, req);
  } catch (err) {
    return crmBridgeJson(
      { ok: false, error: err instanceof Error ? err.message : 'Erro ao executar pós-venda.' },
      500,
      req
    );
  }
}
