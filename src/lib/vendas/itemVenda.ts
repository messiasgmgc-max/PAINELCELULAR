import type { VendaItem } from '@/lib/db/types';

/**
 * Conta de um item do carrinho do PDV: preço com desconto (R$ ou %) vezes a quantidade.
 * Usada ao editar um item já adicionado, com a mesma regra de quando ele entra no carrinho.
 */
export function totalDoItem(item: Pick<VendaItem, 'valorExibir' | 'desconto' | 'tipoDesconto' | 'quantidade'>): number {
  const valor = Number(item.valorExibir) || 0;
  const desconto = Number(item.desconto) || 0;
  const quantidade = Math.max(1, Number(item.quantidade) || 1);
  const descontoEmReais = item.tipoDesconto === '%' ? valor * (desconto / 100) : desconto;
  return Number(((valor - descontoEmReais) * quantidade).toFixed(2));
}

/**
 * Item com os campos editados e o total refeito. A tela "Editar registro" grava custo e
 * preço também em custoUnitario/valorUnitario/lucroUnitario; quando existem, andam juntos,
 * senão cada tela mostra um custo diferente para a mesma venda.
 */
export function aplicarEdicaoItem(original: VendaItem, edicao: Partial<VendaItem>): VendaItem {
  const item: VendaItem & Record<string, unknown> = {
    ...original,
    ...edicao,
    descricao: String(edicao.descricao ?? original.descricao ?? '').trim() || 'Item Avulso',
    observacao: String(edicao.observacao ?? original.observacao ?? '').trim(),
    quantidade: Math.max(1, Number(edicao.quantidade ?? original.quantidade) || 1),
    valorInterno: Math.max(0, Number(edicao.valorInterno ?? original.valorInterno) || 0),
    valorExibir: Math.max(0, Number(edicao.valorExibir ?? original.valorExibir) || 0),
    desconto: Math.max(0, Number(edicao.desconto ?? original.desconto) || 0),
    tipoDesconto: (edicao.tipoDesconto ?? original.tipoDesconto) === '%' ? '%' : 'R$',
  };
  item.total = totalDoItem(item);

  const extra = original as unknown as Record<string, unknown>;
  if ('custoUnitario' in extra) item.custoUnitario = item.valorInterno;
  if ('valorUnitario' in extra) item.valorUnitario = item.valorExibir;
  if ('lucroUnitario' in extra) item.lucroUnitario = Number((item.valorExibir - item.valorInterno).toFixed(2));
  return item;
}

/** Data local (AAAA-MM-DD) de um momento, para campos type="date". */
export function dataLocalDoCampo(momento: Date): string {
  return new Date(momento.getTime() - momento.getTimezoneOffset() * 60000).toISOString().split('T')[0];
}

/**
 * Momento da venda depois de editar só a data: o horário original fica. A tela
 * "Editar registro" usava a hora da edição, e a venda das 19:23 virou 09:48.
 */
export function dataDaVendaEditada(original: string | null | undefined, novaData: string): string | null {
  const antes = original ? new Date(original) : null;
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(novaData || '').trim());
  if (!antes || isNaN(antes.getTime())) return null;
  if (!partes || dataLocalDoCampo(antes) === novaData) return antes.toISOString();
  const [, ano, mes, dia] = partes.map(Number);
  return new Date(ano, mes - 1, dia, antes.getHours(), antes.getMinutes(), antes.getSeconds()).toISOString();
}
