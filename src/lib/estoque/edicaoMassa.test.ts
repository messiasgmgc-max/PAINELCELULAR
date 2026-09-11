import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  agruparPorModelo,
  coresUsadas,
  montarAlteracao,
  observacaoAtual,
  trocarObservacao,
  type AparelhoEditavel,
} from './edicaoMassa';

function ap(id: string, extra: Partial<AparelhoEditavel> = {}): AparelhoEditavel {
  return { id, ativo: true, status: 'disponivel', condicao: 'seminovo', modelo: 'iPhone 16 Pro Max', ...extra };
}

describe('Edição em massa do estoque', () => {
  it('agrupa só o que está no estoque, por modelo, em ordem natural', () => {
    const grupos = agruparPorModelo([
      ap('a', { modelo: 'Apple iPhone 16 Pro Max', capacidade: '512GB' }),
      ap('b', { modelo: 'iPhone 16 Pro Max', capacidade: '256GB' }),
      ap('c', { modelo: 'iPhone 11' }),
      ap('d', { modelo: 'iPhone 11', ativo: false, status: 'vendido' }),
      ap('e', { modelo: 'iPhone 14', status: 'cliente', ativo: false }),
    ]);
    assert.deepEqual(grupos.map((g) => g.modelo), ['iPhone 11', 'iPhone 16 Pro Max']);
    assert.deepEqual(grupos[1].aparelhos.map((a) => a.id), ['b', 'a']);
    assert.equal(grupos[0].aparelhos.length, 1);
  });

  it('cores do modelo vêm da mais usada para a menos', () => {
    const cores = coresUsadas('iPhone 16 Pro Max', [
      ap('a', { cor: '🔘  Natural' }),
      ap('b', { cor: '⚫️  Preto' }),
      ap('c', { cor: '🔘  Natural', ativo: false, status: 'vendido' }),
      ap('d', { modelo: 'iPhone 11', cor: 'Roxo' }),
    ]);
    assert.deepEqual(cores, ['🔘  Natural', '⚫️  Preto']);
  });

  it('troca a observação sem perder ID, bateria e IMEI', () => {
    const atual = 'Obs: (PIXEL NA TELA) | ID: 68794043 | Bateria: 89% | IMEI: 3367';
    assert.equal(observacaoAtual(atual), '(PIXEL NA TELA)');
    assert.equal(trocarObservacao(atual, 'TELA TROCADA'), 'Obs: TELA TROCADA | ID: 68794043 | Bateria: 89% | IMEI: 3367');
    assert.equal(trocarObservacao(atual, ''), 'ID: 68794043 | Bateria: 89% | IMEI: 3367');
    assert.equal(trocarObservacao('ID: 1 | IMEI: 2', 'BG | TG'), 'Obs: BG / TG | ID: 1 | IMEI: 2');
    assert.equal(trocarObservacao(null, 'NOVO'), 'Obs: NOVO');
  });

  it('observação antiga sem "Obs:" também é substituída', () => {
    assert.equal(observacaoAtual('TELA QUEBRADA | ID: 9 | IMEI: 1'), 'TELA QUEBRADA');
    assert.equal(trocarObservacao('TELA QUEBRADA | ID: 9 | IMEI: 1', 'OK'), 'Obs: OK | ID: 9 | IMEI: 1');
  });

  it('só manda o que muda de verdade', () => {
    const aparelho = ap('a', { cor: '🔘  Natural', capacidade: '256GB', observacoes: 'Obs: X | ID: 1' });
    assert.equal(montarAlteracao(aparelho, { cor: '🔘  Natural', capacidade: null, observacao: null }), null);
    assert.deepEqual(montarAlteracao(aparelho, { cor: '⚫️  Preto', capacidade: '256GB', observacao: null }), { cor: '⚫️  Preto' });
    assert.deepEqual(montarAlteracao(aparelho, { cor: null, capacidade: '512GB', observacao: 'Y' }), {
      capacidade: '512GB',
      observacoes: 'Obs: Y | ID: 1',
    });
    assert.equal(montarAlteracao(aparelho, { cor: '  ', capacidade: null, observacao: 'X' }), null);
    assert.deepEqual(montarAlteracao(aparelho, { cor: null, capacidade: null, observacao: '' }), { observacoes: 'ID: 1' });
  });
});
