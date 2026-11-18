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

export interface DataFechamentoResolvida {
  valido: boolean;
  dataIso: string; // YYYY-MM-DD
  dataExibicao: string; // DD/MM/YYYY
  ehHoje: boolean;
  erro?: string;
}

const ERRO_DATA_INVALIDA_FECHAMENTO =
  '⚠️ *Data inválida para fechamento!*\n' +
  'Use um dos formatos:\n' +
  '• *!fechamento* (hoje)\n' +
  '• *!fechamento ontem*\n' +
  '• *!fechamento 15/11*\n' +
  '• *!fechamento 15/11/2026*';

function formatarIsoParaBr(dataIso: string): string {
  return `${dataIso.slice(8, 10)}/${dataIso.slice(5, 7)}/${dataIso.slice(0, 4)}`;
}

function criarDataIsoValidada(ano: number, mes: number, dia: number): string | null {
  if (!Number.isInteger(ano) || !Number.isInteger(mes) || !Number.isInteger(dia)) return null;
  if (ano < 2020 || ano > 2100 || mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;

  const dt = new Date(Date.UTC(ano, mes - 1, dia));
  if (
    dt.getUTCFullYear() !== ano ||
    dt.getUTCMonth() + 1 !== mes ||
    dt.getUTCDate() !== dia
  ) {
    return null;
  }

  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function deslocarDiasIso(baseIso: string, deltaDias: number): string {
  const dt = new Date(`${baseIso}T12:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + deltaDias);
  return dt.toISOString().slice(0, 10);
}

/**
 * Resolve a data alvo para `!fechamento [data]` no padrão YYYY-MM-DD (Brasília).
 * Aceita vazio/`hoje`, `ontem`, `anteontem`, `DD/MM`, `DD/MM/YYYY`, `DD-MM-YYYY` ou `YYYY-MM-DD`.
 */
export function resolverDataFechamentoDia(
  entrada?: string,
  hojeBrPadrao?: string
): DataFechamentoResolvida {
  const hojeBr = hojeBrPadrao || obterDataHojeBrasilia();
  let arg = String(entrada || '')
    .trim()
    .replace(/^!(?:fechamentodia|fechamento|resumodia)\b/i, '')
    .trim()
    .replace(/^(?:do\s+dia|da\s+data|no\s+dia|dia|de|em)\s+/i, '')
    .trim();

  if (!arg || /^hoje$/i.test(arg)) {
    return {
      valido: true,
      dataIso: hojeBr,
      dataExibicao: formatarIsoParaBr(hojeBr),
      ehHoje: true,
    };
  }

  if (/^ontem$/i.test(arg)) {
    const dataIso = deslocarDiasIso(hojeBr, -1);
    return {
      valido: true,
      dataIso,
      dataExibicao: formatarIsoParaBr(dataIso),
      ehHoje: false,
    };
  }

  if (/^anteontem$/i.test(arg)) {
    const dataIso = deslocarDiasIso(hojeBr, -2);
    return {
      valido: true,
      dataIso,
      dataExibicao: formatarIsoParaBr(dataIso),
      ehHoje: false,
    };
  }

  const matchBr = arg.match(/^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?$/);
  if (matchBr) {
    const dia = Number(matchBr[1]);
    const mes = Number(matchBr[2]);
    const anoBruto = matchBr[3];
    const ano = !anoBruto
      ? Number(hojeBr.slice(0, 4))
      : anoBruto.length === 2
        ? 2000 + Number(anoBruto)
        : Number(anoBruto);

    const dataIso = criarDataIsoValidada(ano, mes, dia);
    if (dataIso) {
      return {
        valido: true,
        dataIso,
        dataExibicao: formatarIsoParaBr(dataIso),
        ehHoje: dataIso === hojeBr,
      };
    }
    return {
      valido: false,
      dataIso: hojeBr,
      dataExibicao: '',
      ehHoje: false,
      erro: ERRO_DATA_INVALIDA_FECHAMENTO,
    };
  }

  const matchIso = arg.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (matchIso) {
    const dataIso = criarDataIsoValidada(
      Number(matchIso[1]),
      Number(matchIso[2]),
      Number(matchIso[3])
    );
    if (dataIso) {
      return {
        valido: true,
        dataIso,
        dataExibicao: formatarIsoParaBr(dataIso),
        ehHoje: dataIso === hojeBr,
      };
    }
  }

  return {
    valido: false,
    dataIso: hojeBr,
    dataExibicao: '',
    ehHoje: false,
    erro: ERRO_DATA_INVALIDA_FECHAMENTO,
  };
}

/**
 * Gera o resumo operacional de fechamento do dia (entradas, saídas, vendas varejo/atacado,
 * vendas de atacado pendentes com valor R$ 0,00 e saldo atual de estoque ativo),
 * aceitando opcionalmente uma data específica (ex.: `!fechamento 15/11/2026` ou `!fechamento ontem`).
 */
export async function gerarRelatorioFechamentoDia(
  supabase: SupabaseClient,
  lojaId: string,
  nomeLoja: string = 'Phone Center',
  textoComandoOuData?: string
): Promise<string> {
  const dataRes = resolverDataFechamentoDia(textoComandoOuData);
  if (!dataRes.valido) {
    return dataRes.erro || ERRO_DATA_INVALIDA_FECHAMENTO;
  }

  const inicioDoDiaIso = new Date(`${dataRes.dataIso}T00:00:00.000-03:00`).toISOString();
  const fimDoDiaIso = new Date(`${dataRes.dataIso}T23:59:59.999-03:00`).toISOString();
  const dataExibicao = dataRes.dataExibicao;

  const [movsRes, vendasRes, estoqueRes] = await Promise.all([
    supabase
      .from('movimentacoes_estoque')
      .select('id, tipo, created_at')
      .eq('loja_id', lojaId)
      .in('tipo', ['entrada', 'baixa'])
      .gte('created_at', inicioDoDiaIso)
      .lte('created_at', fimDoDiaIso),
    supabase
      .from('vendas')
      .select('id, clienteNome, valor, lucro, tipoEntrega, status, dataPagamento, itens')
      .eq('loja_id', lojaId)
      .gte('dataPagamento', inicioDoDiaIso)
      .lte('dataPagamento', fimDoDiaIso)
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

  const labelPeriodo = dataRes.ehHoje ? 'hoje' : 'no dia';
  const linhas: string[] = [
    `📊 *FECHAMENTO DO DIA — ${nomeLoja.toUpperCase()} (${dataExibicao})*`,
    '──────────────────────────',
    `📥 *Entradas ${labelPeriodo}:* ${entradasHoje} aparelho(s)`,
    `📤 *Vendas ${labelPeriodo}:* ${totalVendas} (${qtdVarejo} varejo · ${qtdAtacado} atacado)`,
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
