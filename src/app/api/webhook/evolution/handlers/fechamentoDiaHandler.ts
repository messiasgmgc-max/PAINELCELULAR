import type { SupabaseClient } from '@supabase/supabase-js';
import { estaNoEstoque, type EstadoCicloAparelho } from '@/lib/estoque/ciclo';
import { vendaCancelada } from '@/lib/vendas/situacao';
import { obterDataHojeBrasilia } from '@/lib/whatsapp/notificarSaidaEstoque';

function moedaBr(valor: number): string {
  return `R$ ${Number(valor || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Gera o resumo operacional de fechamento do dia (entradas, saídas, vendas varejo/atacado,
 * vendas de atacado pendentes com valor R$ 0,00 e saldo atual de estoque ativo).
 */
export async function gerarRelatorioFechamentoDia(
  supabase: SupabaseClient,
  lojaId: string,
  nomeLoja: string = 'Phone Center'
): Promise<string> {
  const dataHojeBr = obterDataHojeBrasilia();
  const inicioDoDiaIso = new Date(`${dataHojeBr}T00:00:00-03:00`).toISOString();
  const dataExibicao = `${dataHojeBr.slice(8, 10)}/${dataHojeBr.slice(5, 7)}/${dataHojeBr.slice(0, 4)}`;

  const [movsRes, vendasRes, estoqueRes] = await Promise.all([
    supabase
      .from('movimentacoes_estoque')
      .select('id, tipo, created_at')
      .eq('loja_id', lojaId)
      .in('tipo', ['entrada', 'baixa'])
      .gte('created_at', inicioDoDiaIso),
    supabase
      .from('vendas')
      .select('id, clienteNome, valor, lucro, tipoEntrega, status, dataPagamento, itens')
      .eq('loja_id', lojaId)
      .gte('dataPagamento', inicioDoDiaIso)
      .order('dataPagamento', { ascending: false }),
    supabase
      .from('aparelhos')
      .select('id, ativo, status, condicao')
      .eq('loja_id', lojaId)
      .eq('ativo', true)
      .not('status', 'in', '(vendido,baixado)'),
  ]);

  const movs = (movsRes.data || []) as Array<{ tipo?: string }>;
  const entradasHoje = movs.filter((m) => m.tipo === 'entrada').length;
  const baixasHoje = movs.filter((m) => m.tipo === 'baixa').length;

  const vendasValidas = ((vendasRes.data || []) as Array<Record<string, any>>).filter(
    (v) => !vendaCancelada(v)
  );

  let qtdVarejo = 0;
  let totalVarejo = 0;
  let lucroVarejo = 0;

  let qtdAtacado = 0;
  let totalAtacado = 0;
  let lucroAtacado = 0;

  const pendentesValorAtacado: Array<{ codigo: string; cliente: string; detalhe: string }> = [];

  for (const v of vendasValidas) {
    const tipoEntrega = String(v.tipoEntrega || v.tipo_entrega || '').trim().toLowerCase();
    const valor = Number(v.valor || 0);
    const lucro = Number(v.lucro || 0);

    if (tipoEntrega === 'atacado') {
      qtdAtacado += 1;
      totalAtacado += valor;
      lucroAtacado += lucro;

      if (valor <= 0) {
        const itensArr = Array.isArray(v.itens) ? v.itens : [];
        const primeiro = itensArr[0] || {};
        const desc = String(primeiro.descricao || 'Aparelho').trim();
        const imei = String(primeiro.imei || '').trim();
        pendentesValorAtacado.push({
          codigo: String(v.id || '').slice(0, 6).toUpperCase() || 'OK',
          cliente: String(v.clienteNome || 'Cliente').trim(),
          detalhe: imei ? `${desc} (${imei})` : desc,
        });
      }
    } else {
      qtdVarejo += 1;
      totalVarejo += valor;
      lucroVarejo += lucro;
    }
  }

  const saldoEstoqueAtivo = ((estoqueRes.data || []) as EstadoCicloAparelho[]).filter(estaNoEstoque).length;
  const totalVendas = qtdVarejo + qtdAtacado;
  const faturamentoTotal = totalVarejo + totalAtacado;
  const lucroTotal = lucroVarejo + lucroAtacado;

  const linhas: string[] = [
    `📊 *FECHAMENTO DO DIA — ${nomeLoja.toUpperCase()} (${dataExibicao})*`,
    '──────────────────────────',
    `📥 *Entradas hoje:* ${entradasHoje} aparelho(s)`,
    `📤 *Vendas hoje:* ${totalVendas} (${qtdVarejo} varejo · ${qtdAtacado} atacado)`,
    `🛠️ *Baixas avulsas:* ${baixasHoje} aparelho(s)`,
    `📦 *Estoque ativo atual:* ${saldoEstoqueAtivo} aparelho(s)`,
    '',
    `💰 *Varejo:* ${moedaBr(totalVarejo)} (${qtdVarejo} venda(s))`,
    `🤝 *Atacado:* ${moedaBr(totalAtacado)} (${qtdAtacado} venda(s))`,
    `💵 *Faturamento Total:* ${moedaBr(faturamentoTotal)}`,
    `📈 *Lucro Estimado:* ${moedaBr(lucroTotal)}`,
  ];

  if (pendentesValorAtacado.length > 0) {
    linhas.push('');
    linhas.push(`⚠️ *Atacado sem valor (R$ 0,00):* ${pendentesValorAtacado.length}`);
    for (const pend of pendentesValorAtacado.slice(0, 8)) {
      linhas.push(`   • #${pend.codigo} *${pend.cliente}* — ${pend.detalhe}`);
    }
    if (pendentesValorAtacado.length > 8) {
      linhas.push(`   _... e mais ${pendentesValorAtacado.length - 8} venda(s)_`);
    }
  }

  linhas.push('──────────────────────────');
  linhas.push('_Resumo automático Phone Center_');

  return linhas.join('\n');
}
