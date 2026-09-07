import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classificarTipoVenda, processarAnaliticaVendas } from './vendasAnalyticsHelper';

describe('vendasAnalyticsHelper - Analítica e Agregação de Vendas', () => {
  it('deve classificar corretamente Atacado vs Varejo por tipoEntrega e descricao', () => {
    assert.equal(classificarTipoVenda({ tipoEntrega: 'Atacado / Lojista' }), 'Atacado');
    assert.equal(classificarTipoVenda({ tipoEntrega: 'Atacado' }), 'Atacado');
    assert.equal(classificarTipoVenda({ descricao: 'Venda atacado 2 pecas' }), 'Atacado');
    assert.equal(classificarTipoVenda({ tipoEntrega: 'Varejo' }), 'Varejo');
    assert.equal(classificarTipoVenda({ tipoEntrega: 'Retirada' }), 'Varejo');
    assert.equal(classificarTipoVenda({}), 'Varejo');
  });

  it('deve agregar vendas de Hoje, Semana e Mês separando Varejo e Atacado', () => {
    const dataRef = new Date('2026-09-15T15:00:00.000Z');

    const vendasMock = [
      // Venda hoje - Atacado
      {
        id: '1',
        clienteNome: 'Lucas Lojista',
        valor: 2500,
        tipoEntrega: 'Atacado',
        descricao: 'iPhone 13 Pro 128gb',
        itens: [{ descricao: 'iPhone 13 Pro 128gb' }],
        dataPagamento: '2026-09-15T12:00:00.000Z',
        status: 'pago',
        metodo: 'pix',
      },
      // Venda hoje - Varejo
      {
        id: '2',
        clienteNome: 'Mariana Silva',
        valor: 1800,
        tipoEntrega: 'Varejo',
        descricao: 'iPhone 12 64gb',
        itens: [{ descricao: 'iPhone 12 64gb' }],
        dataPagamento: '2026-09-15T10:00:00.000Z',
        status: 'pago',
        metodo: 'cartao_credito',
      },
      // Venda 3 dias atrás (dentro da semana e do mês) - Varejo
      {
        id: '3',
        clienteNome: 'Carlos Eduardo',
        valor: 3200,
        tipoEntrega: 'Varejo',
        descricao: 'iPhone 14 128gb',
        itens: [{ descricao: 'iPhone 14 128gb' }],
        dataPagamento: '2026-09-12T14:00:00.000Z',
        status: 'pago',
        metodo: 'pix',
      },
      // Venda dia 01/09 (dentro do mês, mas mais de 7 dias atrás) - Atacado
      {
        id: '4',
        clienteNome: 'CL',
        valor: 21400,
        tipoEntrega: 'Atacado',
        descricao: 'Lote 4 aparelhos',
        itens: [{ descricao: '4 aparelhos atacado' }],
        dataPagamento: '2026-09-01T10:00:00.000Z',
        status: 'pendente',
        saldoDevedor: 21400,
        metodo: 'fiado',
      },
      // Venda mês passado (agosto/2026) - fora do mês
      {
        id: '5',
        clienteNome: 'Cliente Antigo',
        valor: 1500,
        tipoEntrega: 'Varejo',
        descricao: 'iPhone 11',
        dataPagamento: '2026-08-25T10:00:00.000Z',
        status: 'pago',
        metodo: 'pix',
      },
    ];

    const analitica = processarAnaliticaVendas(vendasMock, vendasMock, dataRef);

    // Hoje: 1 atacado (2500) + 1 varejo (1800) = 4300
    assert.equal(analitica.hoje.qtd, 2);
    assert.equal(analitica.hoje.total, 4300);
    assert.equal(analitica.hoje.varejo, 1800);
    assert.equal(analitica.hoje.varejoQtd, 1);
    assert.equal(analitica.hoje.atacado, 2500);
    assert.equal(analitica.hoje.atacadoQtd, 1);
    assert.ok(analitica.hoje.resumoTexto.includes('Total: R$ 4.300,00 (2 vendas)'));
    assert.ok(analitica.hoje.resumoTexto.includes('Varejo: R$ 1.800,00 (1)'));
    assert.ok(analitica.hoje.resumoTexto.includes('Atacado: R$ 2.500,00 (1)'));

    // Semana: Vendas 1, 2 e 3 = 4300 + 3200 = 7500
    assert.equal(analitica.semana.qtd, 3);
    assert.equal(analitica.semana.total, 7500);
    assert.equal(analitica.semana.varejo, 5000);
    assert.equal(analitica.semana.atacado, 2500);

    // Mês: Vendas 1, 2, 3 e 4 = 7500 + 21400 = 28900
    assert.equal(analitica.mes.qtd, 4);
    assert.equal(analitica.mes.total, 28900);
    assert.equal(analitica.mes.varejo, 5000);
    assert.equal(analitica.mes.atacado, 23900);

    // Histórico Atacado do Mês
    assert.ok(analitica.historicoAtacadoMes.includes('Lucas Lojista'));
    assert.ok(analitica.historicoAtacadoMes.includes('CL'));
    assert.ok(analitica.historicoAtacadoMes.includes('21.400,00'));

    // Histórico Geral Recente
    assert.ok(analitica.historicoRecente.includes('Lucas Lojista'));
    assert.ok(analitica.historicoRecente.includes('Mariana Silva'));
  });
});
