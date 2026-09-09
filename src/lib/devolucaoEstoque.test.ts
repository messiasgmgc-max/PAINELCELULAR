import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { planejarAjusteDaVenda } from './devolucaoEstoque';

describe('Ajuste da venda ao devolver um aparelho', () => {
  it('venda de um item só é removida por inteiro', () => {
    const acao = planejarAjusteDaVenda(
      { id: 'v1', itens: [{ aparelhoId: 'ap1', total: 2500, valorInterno: 2000 }], valor: 2500 },
      'ap1'
    );
    assert.equal(acao.tipo, 'excluir');
    assert.equal(acao.tipo === 'excluir' && acao.vendaId, 'v1');
  });

  it('venda com vários itens perde só o item devolvido e recalcula os totais', () => {
    const acao = planejarAjusteDaVenda(
      {
        id: 'v2',
        itens: [
          { aparelhoId: 'ap1', total: 2500, valorInterno: 2000 },
          { aparelhoId: 'ap2', total: 3000, valorInterno: 2200 },
        ],
        valor: 5500,
      },
      'ap1'
    );
    assert.equal(acao.tipo, 'atualizar');
    if (acao.tipo !== 'atualizar') return;
    assert.equal(acao.itens.length, 1);
    assert.equal(acao.itens[0].aparelhoId, 'ap2');
    assert.equal(acao.valor, 3000);
    assert.equal(acao.custo, 2200);
    assert.equal(acao.lucro, 800);
  });

  it('não mexe na venda quando ela não cobra esse aparelho', () => {
    const acao = planejarAjusteDaVenda(
      { id: 'v3', itens: [{ aparelhoId: 'outro', total: 100 }] },
      'ap1'
    );
    assert.equal(acao.tipo, 'nenhuma');
  });

  it('baixa manual, sem venda nenhuma, não gera ação', () => {
    assert.equal(planejarAjusteDaVenda(null, 'ap1').tipo, 'nenhuma');
    assert.equal(planejarAjusteDaVenda(undefined, 'ap1').tipo, 'nenhuma');
  });

  it('venda sem itens não gera ação', () => {
    assert.equal(planejarAjusteDaVenda({ id: 'v4', itens: [] }, 'ap1').tipo, 'nenhuma');
    assert.equal(planejarAjusteDaVenda({ id: 'v5' }, 'ap1').tipo, 'nenhuma');
  });

  it('usa valorExibir quando o item não tem total', () => {
    const acao = planejarAjusteDaVenda(
      {
        id: 'v6',
        itens: [
          { aparelhoId: 'ap1', total: 1000 },
          { aparelhoId: 'ap2', valorExibir: 1500, valorInterno: 900 },
        ],
      },
      'ap1'
    );
    assert.equal(acao.tipo === 'atualizar' && acao.valor, 1500);
    assert.equal(acao.tipo === 'atualizar' && acao.lucro, 600);
  });

  it('margem fica zero quando não há custo, em vez de dividir por zero', () => {
    const acao = planejarAjusteDaVenda(
      {
        id: 'v7',
        itens: [
          { aparelhoId: 'ap1', total: 500 },
          { aparelhoId: 'ap2', total: 800, valorInterno: 0 },
        ],
      },
      'ap1'
    );
    assert.equal(acao.tipo === 'atualizar' && acao.percentualLucro, 0);
    assert.equal(acao.tipo === 'atualizar' && acao.lucro, 800);
  });
});

describe('Invariantes preservadas no recálculo', () => {
  it('mantém o desconto global da venda em vez de inflar o valor', () => {
    const acao = planejarAjusteDaVenda(
      {
        id: 'v8',
        descontoTotal: 200,
        itens: [
          { aparelhoId: 'ap1', total: 1000 },
          { aparelhoId: 'ap2', total: 2000, valorInterno: 1500 },
        ],
      },
      'ap1'
    );
    // 2000 restante - 200 de desconto = 1800 (antes daria 2000)
    assert.equal(acao.tipo === 'atualizar' && acao.valor, 1800);
  });

  it('multiplica o custo unitário pela quantidade', () => {
    const acao = planejarAjusteDaVenda(
      {
        id: 'v9',
        itens: [
          { aparelhoId: 'ap1', total: 100 },
          { aparelhoId: 'ap2', total: 900, valorInterno: 100, quantidade: 3 },
        ],
      },
      'ap1'
    );
    assert.equal(acao.tipo === 'atualizar' && acao.custo, 300);
    assert.equal(acao.tipo === 'atualizar' && acao.lucro, 600);
  });

  it('venda fiada: o saldo devedor cai junto com o valor', () => {
    const acao = planejarAjusteDaVenda(
      {
        id: 'v10',
        status: 'parcial',
        valorPago: 500,
        saldoDevedor: 2500,
        itens: [
          { aparelhoId: 'ap1', total: 1000 },
          { aparelhoId: 'ap2', total: 2000 },
        ],
      },
      'ap1'
    );
    assert.equal(acao.tipo === 'atualizar' && acao.valor, 2000);
    // 2000 de valor - 500 já pagos = 1500 ainda devidos
    assert.equal(acao.tipo === 'atualizar' && acao.saldoDevedor, 1500);
    assert.equal(acao.tipo === 'atualizar' && acao.status, 'parcial');
  });

  it('venda fiada quitada pela devolução vira paga, sem saldo negativo', () => {
    const acao = planejarAjusteDaVenda(
      {
        id: 'v11',
        valorPago: 3000,
        saldoDevedor: 1000,
        itens: [
          { aparelhoId: 'ap1', total: 1000 },
          { aparelhoId: 'ap2', total: 2500 },
        ],
      },
      'ap1'
    );
    assert.equal(acao.tipo === 'atualizar' && acao.saldoDevedor, 0);
    assert.equal(acao.tipo === 'atualizar' && acao.status, 'pago');
  });

  it('venda à vista não ganha campos de saldo', () => {
    const acao = planejarAjusteDaVenda(
      { id: 'v12', saldoDevedor: 0, itens: [{ aparelhoId: 'ap1', total: 1 }, { aparelhoId: 'ap2', total: 2 }] },
      'ap1'
    );
    assert.equal(acao.tipo === 'atualizar' && acao.saldoDevedor, undefined);
    assert.equal(acao.tipo === 'atualizar' && acao.status, undefined);
  });

  it('desconto maior que o restante não gera valor negativo', () => {
    const acao = planejarAjusteDaVenda(
      { id: 'v13', descontoTotal: 5000, itens: [{ aparelhoId: 'ap1', total: 1000 }, { aparelhoId: 'ap2', total: 100 }] },
      'ap1'
    );
    assert.equal(acao.tipo === 'atualizar' && acao.valor, 0);
  });
});
