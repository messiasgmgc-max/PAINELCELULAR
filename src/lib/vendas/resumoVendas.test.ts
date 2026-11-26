import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Venda } from '@/lib/db/types';
import {
  calcularMargemVenda,
  calcularResumoVendas,
  formatarDataHoraVendaCurta,
  obterIniciaisComprador,
} from './resumoVendas';

function criarVenda(overrides: Partial<Venda> = {}): Venda {
  return {
    id: 'v-1',
    clienteNome: 'Maria Silva',
    itens: [],
    valor: 5000,
    custo: 4000,
    lucro: 1000,
    percentualLucro: 20,
    dataPagamento: '2026-11-26T14:30:00Z',
    status: 'pago',
    metodo: 'pix',
    lojaId: 'loja-1',
    ...overrides,
  };
}

describe('resumo de vendas do período', () => {
  it('soma faturamento, lucro, margem e ticket ignorando vendas canceladas', () => {
    const vendas: Venda[] = [
      criarVenda({ id: 'v-1', valor: 6000, lucro: 1200, status: 'pago' }),
      criarVenda({
        id: 'v-2',
        valor: 4000,
        lucro: 800,
        status: 'parcial',
        valorPago: 1500,
        saldoDevedor: 2500,
        descricao: 'Venda ATACADO - Lojista BH',
      }),
      criarVenda({
        id: 'v-3',
        valor: 9000,
        lucro: 2000,
        status: 'cancelado',
      }),
    ];

    const resumo = calcularResumoVendas(vendas);
    assert.equal(resumo.totalRegistros, 3);
    assert.equal(resumo.totalValidas, 2);
    assert.equal(resumo.totalCanceladas, 1);
    assert.equal(resumo.totalVarejo, 1);
    assert.equal(resumo.totalAtacado, 1);
    assert.equal(resumo.vendasPagas, 1);
    assert.equal(resumo.vendasEmAberto, 1);
    assert.equal(resumo.faturamentoTotal, 10000);
    assert.equal(resumo.lucroTotal, 2000);
    assert.equal(resumo.margemMedia, 20);
    assert.equal(resumo.ticketMedio, 5000);
    assert.equal(resumo.valorEmAberto, 2500);
  });

  it('formata datas relativas (Hoje, Ontem, DD/MM) e iniciais', () => {
    const agora = new Date(2026, 10, 26, 16, 0);
    assert.ok(formatarDataHoraVendaCurta(new Date(2026, 10, 26, 14, 15), agora).startsWith('Hoje • '));
    assert.ok(formatarDataHoraVendaCurta(new Date(2026, 10, 25, 9, 5), agora).startsWith('Ontem • '));
    assert.ok(formatarDataHoraVendaCurta(new Date(2026, 10, 10, 11, 30), agora).includes('10/11'));

    assert.equal(obterIniciaisComprador('Rodrigo Celulares BH'), 'RB');
    assert.equal(obterIniciaisComprador('Ana'), 'AN');
    assert.equal(calcularMargemVenda(5000, 1000), 20);
    assert.equal(calcularMargemVenda(0, 100), null);
  });
});
