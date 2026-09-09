import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { avaliarRuidoDeGrupo } from './ruido';

const ruido = (t: string) => avaliarRuidoDeGrupo(t).ehRuido;

describe('Filtro de ruído em grupo', () => {
  it('descarta o xingamento que fez o bot responder no grupo', () => {
    // Caso real: "Fdp" virou "⚠️ Acesso Restrito: comando operacional...".
    assert.equal(ruido('Fdp'), true);
    assert.equal(ruido('vsf'), true);
    assert.equal(ruido('pqp'), true);
    assert.equal(ruido('que porra é essa'), true);
  });

  it('descarta reação e interjeição', () => {
    for (const t of ['kkkk', 'rsrs', 'hahaha', 'ok', 'blz', 'valeu', 'bom dia', 'aham', '👍', '...']) {
      assert.equal(ruido(t), true, `deveria descartar "${t}"`);
    }
  });

  it('descarta palavra solta sem intenção', () => {
    assert.equal(ruido('Lucas'), true);
    assert.equal(ruido('amanha'), true);
  });

  it('deixa passar comando explícito, sempre', () => {
    assert.equal(ruido('!estoque'), false);
    assert.equal(ruido('!config comandos'), false);
    // Mesmo um comando com xingamento junto continua sendo comando.
    assert.equal(ruido('!vender fdp'), false);
  });

  it('deixa passar pedido operacional de verdade', () => {
    for (const t of [
      'vendi o 13 pro pro Lucas por 2500',
      'cadastra um iphone 12 128gb por 1800',
      'quanto ta o 15 pro max?',
      'quem ta devendo?',
      'abater 300 do joao',
      'tem iphone 11 no estoque?',
      'qual o faturamento da semana',
      'muda o preço do 13 pro pra 3000',
    ]) {
      assert.equal(ruido(t), false, `não deveria descartar "${t}"`);
    }
  });

  it('xingamento COM pedido junto passa — o pedido é legítimo', () => {
    assert.equal(ruido('porra, cadastra o iphone 12 aí'), false);
    assert.equal(ruido('caralho, quanto ta o 15 pro?'), false);
  });

  it('mensagem vazia é ruído', () => {
    assert.equal(ruido(''), true);
    assert.equal(ruido('   '), true);
  });

  it('informa o motivo, para o log do suporte', () => {
    assert.equal(avaliarRuidoDeGrupo('Fdp').motivo, 'xingamento/desabafo');
    assert.equal(avaliarRuidoDeGrupo('kkkk').motivo, 'risada/reação');
    assert.equal(avaliarRuidoDeGrupo('ok').motivo, 'interjeição');
    assert.equal(avaliarRuidoDeGrupo('!estoque').motivo, 'comando explícito');
  });
});
