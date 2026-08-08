import { Venda, VendaItem, Aparelho, Cliente } from '@/lib/db/types';

export interface VendasPorPeriodo {
  periodo: string;
  total: number;
  custo: number;
  lucro: number;
  quantidade: number;
}

export type PosPagamentoItem = {
  id: string;
  metodo: Venda['metodo'];
  valor: number;
  parcelas: number;
};

export type PosPagamentoState = {
  metodo: Venda['metodo'];
  parcelas: number;
  detalhes: string;
  valorPago: number;
  status: Venda['status'];
  garantia: string;
  descontoGlobal: number;
  tipoDescontoGlobal: 'R$' | '%';
  pagamentos: PosPagamentoItem[];
};

export interface CartItem {
  id: string;
  aparelhoId?: string;
  pecaId?: string;
  descricao: string;
  quantidade: number;
  precoUnitario: number;
  custoUnitario: number;
  tipo: 'aparelho' | 'peca' | 'servico' | 'outros';
}
