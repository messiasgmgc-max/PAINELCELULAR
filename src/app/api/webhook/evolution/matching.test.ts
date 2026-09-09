import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canonizar, pontuar, ranquear, melhorOuAmbiguo, distancia } from './matching';

const ESTOQUE = [
  'Apple iPhone 13 Pro 256GB Azul',
  'Apple iPhone 13 128GB Meia-noite',
  'Apple iPhone 15 Pro Max 256GB Titânio',
  'Apple iPhone 15 Pro 128GB Natural',
  'Samsung Galaxy S24 Ultra 512GB Preto',
  'Xiaomi Redmi Note 13 256GB Azul',
];

describe('Normalização de texto do lojista', () => {
  it('tira acento, caixa e pontuação', () => {
    assert.equal(canonizar('Titânio!!'), 'titanio');
    assert.equal(canonizar('  Meia-Noite  '), 'meia noite');
  });

  it('expande abreviações coladas ao número', () => {
    assert.equal(canonizar('15pm'), '15 promax');
    assert.equal(canonizar('13pro'), '13 pro');
    assert.equal(canonizar('15 pro max'), '15 promax');
    assert.equal(canonizar('128gb'), '128gb');
    assert.equal(canonizar('128 gb'), '128gb');
  });

  it('corrige apelidos e erros de marca', () => {
    assert.equal(canonizar('ip 13'), 'iphone 13');
    assert.equal(canonizar('xiomi'), 'xiaomi');
    assert.equal(canonizar('samsug'), 'samsung');
  });
});

describe('Pontuação de similaridade', () => {
  it('acerta o modelo pela abreviação que o lojista usa', () => {
    const alvo = 'Apple iPhone 15 Pro Max 256GB Titânio';
    assert.ok(pontuar('15pm', alvo) > 0.9, 'abreviação 15pm deveria casar');
    assert.ok(pontuar('15 pro max', alvo) > 0.9);
  });

  it('não confunde números de modelo diferentes', () => {
    assert.ok(pontuar('13 pro', 'Apple iPhone 15 Pro 128GB Natural') < 0.5);
    assert.ok(pontuar('iphone 15', 'Apple iPhone 13 128GB Meia-noite') < 0.5);
  });

  it('tolera erro de digitação em palavra longa', () => {
    assert.ok(pontuar('xiomi redmi', 'Xiaomi Redmi Note 13 256GB Azul') > 0.8);
    assert.ok(pontuar('samsug galaxy', 'Samsung Galaxy S24 Ultra 512GB Preto') > 0.8);
  });

  it('ignora termo vazio', () => {
    assert.equal(pontuar('', 'Apple iPhone 13'), 0);
    assert.equal(pontuar('iphone', ''), 0);
  });
});

describe('Ranqueamento contra o estoque', () => {
  it('"15pm" traz o Pro Max no topo, não o Pro comum', () => {
    const r = ranquear('15pm', ESTOQUE, (x) => x);
    assert.ok(r.length > 0);
    assert.match(r[0].item, /15 Pro Max/);
  });

  it('"13 pro" não traz o iPhone 13 simples à frente', () => {
    const r = ranquear('13 pro', ESTOQUE, (x) => x);
    assert.match(r[0].item, /13 Pro/);
  });

  it('descarta candidatos irrelevantes', () => {
    const r = ranquear('macbook', ESTOQUE, (x) => x);
    assert.equal(r.length, 0);
  });
});

describe('Decisão entre escolher e perguntar', () => {
  it('escolhe sozinho quando há um vencedor claro', () => {
    const r = ranquear('galaxy s24 ultra', ESTOQUE, (x) => x);
    const { escolhido, ambiguos } = melhorOuAmbiguo(r);
    assert.ok(escolhido);
    assert.match(escolhido as string, /S24 Ultra/);
    assert.equal(ambiguos.length, 0);
  });

  it('pergunta quando dois candidatos empatam', () => {
    const duplicado = ['Apple iPhone 13 Pro 256GB Azul', 'Apple iPhone 13 Pro 256GB Preto'];
    const r = ranquear('13 pro 256', duplicado, (x) => x);
    const { escolhido, ambiguos } = melhorOuAmbiguo(r);
    assert.equal(escolhido, null);
    assert.equal(ambiguos.length, 2);
  });

  it('não escolhe nada quando não há candidato', () => {
    const { escolhido, ambiguos } = melhorOuAmbiguo([]);
    assert.equal(escolhido, null);
    assert.equal(ambiguos.length, 0);
  });
});

describe('Distância de edição', () => {
  it('mede trocas simples', () => {
    assert.equal(distancia('iphone', 'iphone'), 0);
    assert.equal(distancia('xiomi', 'xiaomi'), 1);
    assert.equal(distancia('', 'abc'), 3);
  });
});
