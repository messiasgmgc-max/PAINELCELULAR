import type { SupabaseClient } from '@supabase/supabase-js';
import { condicaoParaDevolucao, limparObservacoesDeVenda } from './vendasDevolucao';

/**
 * Devolver ao estoque um aparelho listado no Histórico de Saídas.
 *
 * A saída pode ter vindo de dois caminhos:
 *  - VENDA: existe uma linha em `vendas` cujo `itens[].aparelhoId` é este
 *    aparelho. Além de reativar o aparelho, a venda precisa deixar de cobrá-lo.
 *  - BAIXA MANUAL: não há venda; basta reativar.
 *
 * O aparelho não guarda o id da venda, então ela é localizada pelo `aparelhoId`
 * dentro do JSONB `itens`.
 */

export interface ItemVenda {
  aparelhoId?: string;
  descricao?: string;
  total?: number;
  valorExibir?: number;
  valorInterno?: number;
  quantidade?: number;
  condicao?: string;
  condicaoOriginal?: string;
  [k: string]: unknown;
}

export interface VendaParaRecalculo {
  id: string;
  itens?: ItemVenda[];
  valor?: number;
  custo?: number;
  descontoTotal?: number;
  valorPago?: number;
  saldoDevedor?: number;
  status?: string;
}

export interface AtualizacaoVenda {
  itens: ItemVenda[];
  valor: number;
  custo: number;
  lucro: number;
  percentualLucro: number;
  /** Só presente quando a venda tinha saldo em aberto. */
  saldoDevedor?: number;
  status?: string;
}

export type AcaoNaVenda =
  | { tipo: 'nenhuma' }
  | { tipo: 'excluir'; vendaId: string }
  | ({ tipo: 'atualizar'; vendaId: string } & AtualizacaoVenda);

/** Soma o que um item representa de venda, respeitando a quantidade. */
function totalDoItem(item: ItemVenda): number {
  const total = Number(item.total ?? NaN);
  if (Number.isFinite(total)) return total;
  const unitario = Number(item.valorExibir ?? 0);
  const qtd = Number(item.quantidade ?? 1) || 1;
  return unitario * qtd;
}

/** `valorInterno` é custo UNITÁRIO: precisa multiplicar pela quantidade. */
function custoDoItem(item: ItemVenda): number {
  const unitario = Number(item.valorInterno ?? 0);
  const qtd = Number(item.quantidade ?? 1) || 1;
  return unitario * qtd;
}

/**
 * Decide o que fazer com a venda quando um dos seus aparelhos volta ao estoque.
 *
 * Venda de um item só deixa de ter razão de existir e é removida. Venda com
 * vários itens continua válida: sai apenas o item devolvido e os totais são
 * refeitos a partir do que sobrou, preservando o desconto global e reajustando
 * o saldo em aberto quando a venda era fiada.
 */
export function planejarAjusteDaVenda(
  venda: VendaParaRecalculo | null | undefined,
  aparelhoId: string
): AcaoNaVenda {
  if (!venda) return { tipo: 'nenhuma' };

  const itens = Array.isArray(venda.itens) ? venda.itens : [];
  const restantes = itens.filter((i) => i?.aparelhoId !== aparelhoId);

  // Nenhum item saiu: a venda não referencia este aparelho.
  if (restantes.length === itens.length) return { tipo: 'nenhuma' };

  if (restantes.length === 0) return { tipo: 'excluir', vendaId: venda.id };

  const bruto = restantes.reduce((s, i) => s + totalDoItem(i), 0);

  // O desconto global fica na venda, não nos itens. Mantê-lo fora do cálculo
  // faria o valor subir sozinho ao remover um item.
  const desconto = Math.max(0, Number(venda.descontoTotal ?? 0));
  const valor = Number(Math.max(0, bruto - desconto).toFixed(2));
  const custo = Number(restantes.reduce((s, i) => s + custoDoItem(i), 0).toFixed(2));
  const lucro = Number((valor - custo).toFixed(2));

  const atualizacao: AtualizacaoVenda = {
    itens: restantes,
    valor,
    custo,
    lucro,
    percentualLucro: custo > 0 ? Number(((lucro / custo) * 100).toFixed(2)) : 0,
  };

  // Venda fiada: se o valor cai, o saldo devedor precisa cair junto — senão o
  // cliente continua devendo por um aparelho que voltou para a prateleira.
  const saldoAtual = Number(venda.saldoDevedor ?? 0);
  if (saldoAtual > 0) {
    const pago = Number(venda.valorPago ?? 0);
    const novoSaldo = Number(Math.max(0, valor - pago).toFixed(2));
    atualizacao.saldoDevedor = novoSaldo;
    atualizacao.status = novoSaldo <= 0.01 ? 'pago' : pago > 0 ? 'parcial' : 'pendente';
  }

  return { tipo: 'atualizar', vendaId: venda.id, ...atualizacao };
}

export interface ResultadoDevolucao {
  ok: boolean;
  mensagem: string;
  vendaAjustada: AcaoNaVenda['tipo'];
}

/** Colunas necessárias para recalcular a venda sem perder invariantes. */
const COLUNAS_VENDA = 'id, itens, valor, custo, descontoTotal, valorPago, saldoDevedor, status';

/**
 * Localiza a venda que ainda cobra este aparelho.
 *
 * O `aparelhoId` mora dentro do JSONB `itens`, então filtramos no banco com
 * `contains` em vez de trazer a tabela inteira e varrer em memória — uma loja
 * com mais vendas do que o limite de leitura simplesmente não encontraria a
 * venda, e a devolução ficaria silenciosamente pela metade.
 */
async function localizarVendaDoAparelho(
  supabase: SupabaseClient,
  aparelhoId: string,
  lojaId: string | null
): Promise<VendaParaRecalculo | null> {
  const base = () => {
    let q = supabase.from('vendas').select(COLUNAS_VENDA);
    if (lojaId) q = q.eq('loja_id', lojaId);
    return q;
  };

  const { data, error } = await base().contains('itens', [{ aparelhoId }]).limit(5);

  if (!error) {
    return ((data || []) as VendaParaRecalculo[])[0] || null;
  }

  // `contains` exige que `itens` seja jsonb. Se a coluna for json ou text em
  // alguma instalação, o filtro falha — aí caímos para a varredura, que é lenta
  // mas não inventa um resultado vazio.
  console.warn('[Devolução] Filtro por itens falhou, varrendo vendas:', error.message);

  const { data: todas, error: erroVarredura } = await base().limit(5000);
  if (erroVarredura) throw erroVarredura;

  return (
    ((todas || []) as VendaParaRecalculo[]).find((v) =>
      (Array.isArray(v.itens) ? v.itens : []).some((i) => i?.aparelhoId === aparelhoId)
    ) || null
  );
}

export async function devolverAparelhoAoEstoque(
  supabase: SupabaseClient,
  params: { aparelhoId: string; lojaId: string | null }
): Promise<ResultadoDevolucao> {
  const { aparelhoId, lojaId } = params;

  const { data: aparelho, error: erroAparelho } = await supabase
    .from('aparelhos')
    .select('id, marca, modelo, observacoes, condicao')
    .eq('id', aparelhoId)
    .maybeSingle();

  if (erroAparelho) throw erroAparelho;
  if (!aparelho) {
    return { ok: false, mensagem: 'Aparelho não encontrado.', vendaAjustada: 'nenhuma' };
  }

  const vendaAlvo = await localizarVendaDoAparelho(supabase, aparelhoId, lojaId);

  const itemDaVenda = vendaAlvo
    ? (Array.isArray(vendaAlvo.itens) ? vendaAlvo.itens : []).find((i) => i?.aparelhoId === aparelhoId)
    : undefined;

  const acao = planejarAjusteDaVenda(vendaAlvo, aparelhoId);

  // A venda é ajustada ANTES de reativar o aparelho: se algo falhar aqui, o
  // aparelho continua baixado e a operação pode ser repetida. Na ordem inversa,
  // uma falha deixaria o aparelho no estoque e a venda ainda cobrando por ele.
  if (acao.tipo === 'excluir') {
    const { error } = await supabase.from('vendas').delete().eq('id', acao.vendaId);
    if (error) throw error;
  } else if (acao.tipo === 'atualizar') {
    const { tipo: _tipo, vendaId, ...campos } = acao;
    const { error } = await supabase.from('vendas').update(campos).eq('id', vendaId);
    if (error) throw error;
  }

  // A condição original fica no item da venda; o aparelho já foi sobrescrito
  // com 'vendido' na baixa. condicaoParaDevolucao ignora 'vendido', então o
  // segundo candidato entra como fallback de verdade.
  const { error: erroUpdate } = await supabase
    .from('aparelhos')
    .update({
      ativo: true,
      condicao: condicaoParaDevolucao({
        condicaoOriginal: itemDaVenda?.condicaoOriginal,
        condicao: itemDaVenda?.condicao || aparelho.condicao,
      }),
      status: 'disponivel',
      cliente: null,
      clienteId: null,
      observacoes: limparObservacoesDeVenda(aparelho.observacoes),
    })
    .eq('id', aparelhoId);

  if (erroUpdate) throw erroUpdate;

  const nome = `${aparelho.marca || ''} ${aparelho.modelo || ''}`.trim() || 'Aparelho';
  const complemento =
    acao.tipo === 'excluir'
      ? ' A venda correspondente foi removida.'
      : acao.tipo === 'atualizar'
        ? ' O item saiu da venda e os totais foram recalculados.'
        : '';

  return { ok: true, mensagem: `${nome} voltou para o estoque.${complemento}`, vendaAjustada: acao.tipo };
}
