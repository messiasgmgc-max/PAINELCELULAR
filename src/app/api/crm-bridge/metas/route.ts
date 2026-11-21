import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import {
  autenticarBridgeAvancado,
  crmBridgeJson,
  crmBridgeOptionsResponse,
  resolverLojaAutorizada,
} from '@/lib/crm-bridge/auth';
import { vendaConta } from '@/lib/vendas/situacao';

export async function OPTIONS(req: NextRequest) {
  return crmBridgeOptionsResponse(req);
}

function resolverMesReferencia(mesRaw?: string | null): string {
  const m = String(mesRaw || '').trim();
  if (/^\d{4}-\d{2}$/.test(m)) return m;
  return new Date().toISOString().slice(0, 7);
}

/**
 * GET /api/crm-bridge/metas?mes=YYYY-MM
 * Cruza metas cadastradas com as vendas reais do mês no Supabase (Minha Evolução).
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

  const mes = resolverMesReferencia(req.nextUrl.searchParams.get('mes'));
  const [anoStr, mesStr] = mes.split('-');
  const inicio = new Date(Date.UTC(Number(anoStr), Number(mesStr) - 1, 1, 0, 0, 0)).toISOString();
  const fim = new Date(Date.UTC(Number(anoStr), Number(mesStr), 1, 0, 0, 0)).toISOString();

  const [metasRes, vendasRes] = await Promise.all([
    supabaseAdmin
      .from('crm_metas_vendedores')
      .select('*')
      .eq('loja_id', loja.id)
      .eq('mes_referencia', mes),
    supabaseAdmin
      .from('vendas')
      .select('id, valor, status, ativo, "dataPagamento", vendedor')
      .eq('loja_id', loja.id)
      .gte('dataPagamento', inicio)
      .lt('dataPagamento', fim)
      .limit(2000),
  ]);

  const migrationPendente = Boolean(metasRes.error?.message?.includes('does not exist'));
  const metasMap = new Map<
    string,
    {
      vendedor: string;
      metaFaturamento: number;
      metaQuantidade: number;
      comissaoPercentual: number;
    }
  >();

  for (const m of (metasRes.data || []) as Array<Record<string, unknown>>) {
    const nome = String(m.vendedor_nome || '').trim();
    if (!nome) continue;
    metasMap.set(nome.toLowerCase(), {
      vendedor: nome,
      metaFaturamento: Number(m.meta_faturamento) || 0,
      metaQuantidade: Number(m.meta_quantidade) || 0,
      comissaoPercentual: Number(m.comissao_percentual) || 0,
    });
  }

  const vendasValidas = ((vendasRes.data || []) as Array<Record<string, unknown>>).filter(
    (v) => v.ativo !== false && vendaConta({ status: v.status })
  );

  const realizado = new Map<
    string,
    { nome: string; quantidade: number; faturamento: number }
  >();

  for (const v of vendasValidas) {
    const nome = String(v.vendedor || '').trim() || 'Equipe Loja';
    const key = nome.toLowerCase();
    const cur = realizado.get(key) || { nome, quantidade: 0, faturamento: 0 };
    cur.quantidade += 1;
    cur.faturamento += Number(v.valor) || 0;
    realizado.set(key, cur);
  }

  const chaves = new Set([...metasMap.keys(), ...realizado.keys()]);
  const evolucao = Array.from(chaves)
    .map((key) => {
      const meta = metasMap.get(key);
      const real = realizado.get(key);
      const vendedor = meta?.vendedor || real?.nome || 'Equipe Loja';
      const faturamento = Math.round((real?.faturamento || 0) * 100) / 100;
      const quantidade = real?.quantidade || 0;
      const metaFat = meta?.metaFaturamento || 0;
      const metaQtd = meta?.metaQuantidade || 0;
      const comissaoPct = meta?.comissaoPercentual || 0;
      const comissaoEstimada = Math.round(faturamento * (comissaoPct / 100) * 100) / 100;
      const progressoFatPct =
        metaFat > 0 ? Math.min(200, Math.round((faturamento / metaFat) * 1000) / 10) : 0;
      const progressoQtdPct =
        metaQtd > 0 ? Math.min(200, Math.round((quantidade / metaQtd) * 1000) / 10) : 0;

      return {
        vendedor,
        faturamento,
        quantidade,
        ticketMedio: quantidade > 0 ? Math.round((faturamento / quantidade) * 100) / 100 : 0,
        metaFaturamento: metaFat,
        metaQuantidade: metaQtd,
        comissaoPercentual: comissaoPct,
        comissaoEstimada,
        progressoFatPct,
        progressoQtdPct,
      };
    })
    .sort((a, b) => b.faturamento - a.faturamento);

  const totalFaturamento = evolucao.reduce((acc, e) => acc + e.faturamento, 0);
  const totalMeta = evolucao.reduce((acc, e) => acc + e.metaFaturamento, 0);

  return crmBridgeJson(
    {
      ok: true,
      loja,
      mes,
      migrationPendente,
      resumo: {
        totalFaturamento: Math.round(totalFaturamento * 100) / 100,
        totalMeta: Math.round(totalMeta * 100) / 100,
        totalVendas: vendasValidas.length,
        progressoGeralPct:
          totalMeta > 0 ? Math.round((totalFaturamento / totalMeta) * 1000) / 10 : 0,
      },
      evolucao,
    },
    200,
    req
  );
}

/**
 * PUT /api/crm-bridge/metas
 * Define ou atualiza meta mensal e % comissão de um vendedor.
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
    const mes = resolverMesReferencia(body.mes ? String(body.mes) : undefined);
    const vendedorNome = String(body.vendedorNome || '').trim();
    if (!vendedorNome) {
      return crmBridgeJson({ ok: false, error: 'Informe vendedorNome.' }, 400, req);
    }

    const { data, error } = await supabaseAdmin
      .from('crm_metas_vendedores')
      .upsert(
        {
          loja_id: loja.id,
          mes_referencia: mes,
          vendedor_nome: vendedorNome,
          meta_faturamento: Math.max(0, Number(body.metaFaturamento) || 0),
          meta_quantidade: Math.max(0, Math.trunc(Number(body.metaQuantidade) || 0)),
          comissao_percentual: Math.max(0, Math.min(100, Number(body.comissaoPercentual) || 0)),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'loja_id,mes_referencia,vendedor_nome' }
      )
      .select('*')
      .single();

    if (error) {
      return crmBridgeJson({ ok: false, error: error.message }, 500, req);
    }

    return crmBridgeJson({ ok: true, meta: data }, 200, req);
  } catch (err) {
    return crmBridgeJson(
      { ok: false, error: err instanceof Error ? err.message : 'Erro ao salvar meta.' },
      500,
      req
    );
  }
}
