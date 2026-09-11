import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { VendaItem } from '@/lib/db/types';
import { aplicarEdicaoItem, dataDaVendaEditada, dataLocalDoCampo, totalDoItem } from './itemVenda';
import { extrairAparelhoEImeiDaVenda, obterDataHoraVenda } from '@/lib/utils';

const itemLais: VendaItem = {
  id: '1789078995413',
  descricao: 'Apple IPhone 17 Pro Max 256GB Silver (Lacrado)',
  observacao: 'IMEI: 358015861866305',
  quantidade: 1,
  valorInterno: 5400,
  valorExibir: 7700,
  desconto: 0,
  tipoDesconto: 'R$',
  total: 7700,
};

describe('Item do carrinho', () => {
  it('total com desconto em reais e em porcentagem', () => {
    assert.equal(totalDoItem({ valorExibir: 7700, desconto: 200, tipoDesconto: 'R$', quantidade: 1 }), 7500);
    assert.equal(totalDoItem({ valorExibir: 1000, desconto: 10, tipoDesconto: '%', quantidade: 2 }), 1800);
    assert.equal(totalDoItem({ valorExibir: 50, desconto: 0, tipoDesconto: 'R$', quantidade: 0 }), 50);
  });

  it('editar refaz o total e mantém o vínculo com o aparelho', () => {
    const editado = aplicarEdicaoItem({ ...itemLais, aparelhoId: 'ap-1' }, { valorInterno: 7150, valorExibir: 7800, desconto: 100 });
    assert.equal(editado.total, 7700);
    assert.equal(editado.valorInterno, 7150);
    assert.equal(editado.aparelhoId, 'ap-1');
    assert.equal(editado.id, itemLais.id);
  });

  it('custo unitário da outra tela anda junto', () => {
    const comCamposExtras = { ...itemLais, custoUnitario: 7150, valorUnitario: 7700, lucroUnitario: 550 } as VendaItem;
    const editado = aplicarEdicaoItem(comCamposExtras, { valorInterno: 7000 }) as VendaItem & Record<string, number>;
    assert.equal(editado.custoUnitario, 7000);
    assert.equal(editado.lucroUnitario, 700);
    assert.equal('custoUnitario' in aplicarEdicaoItem(itemLais, { valorInterno: 1 }), false);
  });

  it('descrição vazia vira item avulso', () => {
    assert.equal(aplicarEdicaoItem(itemLais, { descricao: '   ' }).descricao, 'Item Avulso');
  });
});

describe('Data e IMEI da venda', () => {
  it('data e hora do formulário (sem fuso) são hora local, não UTC', () => {
    // Antes "2026-09-10T19:23" ia para o banco como 19:23 UTC: cada edição recuava 3 horas.
    assert.equal(obterDataHoraVenda('2026-09-10T19:23'), new Date(2026, 8, 10, 19, 23).toISOString());
    assert.equal(obterDataHoraVenda('2026-09-10T22:23:00.000Z'), '2026-09-10T22:23:00.000Z');
    assert.equal(obterDataHoraVenda('2026-09-10T19:23:00-03:00'), '2026-09-10T19:23:00-03:00');
  });

  it('IMEI guardado na observação do item aparece na lista', () => {
    const info = extrairAparelhoEImeiDaVenda({ itens: [itemLais] }, []);
    assert.equal(info.imei, '358015861866305');
    assert.equal(info.nomeAparelho, 'Apple IPhone 17 Pro Max 256GB Silver (Lacrado)');
  });
});

describe('Editar registro: data da venda', () => {
  const original = new Date(2026, 8, 10, 19, 23, 0).toISOString();

  it('sem mudar a data, o horário original fica', () => {
    assert.equal(dataDaVendaEditada(original, dataLocalDoCampo(new Date(original))), original);
  });

  it('mudando a data, mantém o horário da venda', () => {
    assert.equal(dataDaVendaEditada(original, '2026-09-12'), new Date(2026, 8, 12, 19, 23, 0).toISOString());
  });

  it('sem data original válida, quem chama decide', () => {
    assert.equal(dataDaVendaEditada(undefined, '2026-09-12'), null);
  });
});
