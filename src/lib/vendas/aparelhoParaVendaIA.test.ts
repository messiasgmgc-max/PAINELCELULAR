import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { escolherAparelhoParaVendaIA } from './aparelhoParaVendaIA';

const azul8822 = { id: 'azul', modelo: 'IPhone 17 Pro Max', capacidade: '256GB', cor: 'Azul ', imei: '358206130528822' };
const silverMp = { id: 'silver', modelo: 'iPhone 17 Pro Max', capacidade: '256GB', cor: '⚪  Silver', imei: '6305' };
const laranja = { id: 'laranja', modelo: 'iPhone 17 Pro Max', capacidade: '256GB', cor: '🟠  Laranja', imei: '3278' };
const onze = { id: 'onze', modelo: 'iPhone 11', capacidade: '64GB', cor: 'Preto', imei: '6305' };

describe('Aparelho da venda lida pela IA', () => {
  it('caso real: IMEI fora do estoque não pega outro 17 Pro Max', () => {
    const escolha = escolherAparelhoParaVendaIA({
      aparelhos: [azul8822],
      imei: '358015861866305',
      modelo: 'Apple iPhone 17 Pro Max',
      capacidade: '256GB',
      cor: 'Silver',
    });
    assert.deepEqual(escolha, { tipo: 'criar' });
  });

  it('IMEI completo igual casa', () => {
    const escolha = escolherAparelhoParaVendaIA({ aparelhos: [azul8822, laranja], imei: '358206130528822' });
    assert.equal(escolha.tipo === 'estoque' && escolha.aparelho.id, 'azul');
  });

  it('final de IMEI da lista MP só casa com o mesmo modelo', () => {
    const certo = escolherAparelhoParaVendaIA({ aparelhos: [silverMp, onze], imei: '358015861866305', modelo: 'iPhone 17 Pro Max' });
    assert.equal(certo.tipo === 'estoque' && certo.aparelho.id, 'silver');

    const outroModelo = escolherAparelhoParaVendaIA({ aparelhos: [onze], imei: '358015861866305', modelo: 'iPhone 17 Pro Max' });
    assert.deepEqual(outroModelo, { tipo: 'criar' });
  });

  it('sem IMEI: um único aparelho do modelo, capacidade e cor', () => {
    const escolha = escolherAparelhoParaVendaIA({
      aparelhos: [azul8822, silverMp, laranja],
      modelo: '17 pro max',
      capacidade: '256',
      cor: 'silver',
    });
    assert.equal(escolha.tipo === 'estoque' && escolha.aparelho.id, 'silver');
  });

  it('sem IMEI e com mais de um candidato: não escolhe sozinho', () => {
    const escolha = escolherAparelhoParaVendaIA({ aparelhos: [azul8822, silverMp, laranja], modelo: 'iPhone 17 Pro Max', capacidade: '256GB' });
    assert.equal(escolha.tipo, 'ambiguo');
    assert.equal(escolha.tipo === 'ambiguo' && escolha.candidatos.length, 3);
  });

  it('capacidade diferente não casa', () => {
    const escolha = escolherAparelhoParaVendaIA({ aparelhos: [azul8822], modelo: 'iPhone 17 Pro Max', capacidade: '512GB' });
    assert.deepEqual(escolha, { tipo: 'criar' });
  });
});
