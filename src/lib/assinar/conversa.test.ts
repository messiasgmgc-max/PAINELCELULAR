import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PAUSA_FINAL_MS, ROTEIRO_CONVERSA, duracaoDoRoteiro, estadoDaConversa, proximaMudancaEm } from './conversa';

describe('Simulação de conversa no WhatsApp de /assinar', () => {
  it('o cliente pergunta do 15 Pro Max e o bot responde com estoque e preço', () => {
    assert.equal(ROTEIRO_CONVERSA[0].autor, 'cliente');
    assert.match(ROTEIRO_CONVERSA[0].linhas.join(' '), /15 Pro Max/);
    const respostaBot = ROTEIRO_CONVERSA.find((m) => m.autor === 'bot');
    assert.ok(respostaBot);
    assert.match(respostaBot.linhas.join(' '), /estoque/i);
    assert.match(respostaBot.linhas.join(' '), /R\$/);
  });

  it('roteiro em ordem de tempo e duração com a pausa final', () => {
    for (let i = 1; i < ROTEIRO_CONVERSA.length; i += 1) {
      assert.ok(ROTEIRO_CONVERSA[i].aparecerEmMs > ROTEIRO_CONVERSA[i - 1].aparecerEmMs);
    }
    const ultima = ROTEIRO_CONVERSA[ROTEIRO_CONVERSA.length - 1];
    assert.equal(duracaoDoRoteiro(), ultima.aparecerEmMs + PAUSA_FINAL_MS);
  });

  it('mensagens aparecem em sequência e o bot digita antes de responder', () => {
    assert.deepEqual(estadoDaConversa(0), { visiveis: 0, digitando: false });
    assert.deepEqual(estadoDaConversa(800), { visiveis: 1, digitando: false });
    assert.deepEqual(estadoDaConversa(2000), { visiveis: 1, digitando: true });
    assert.deepEqual(estadoDaConversa(2700), { visiveis: 2, digitando: false });
    assert.equal(estadoDaConversa(duracaoDoRoteiro() - 1).visiveis, ROTEIRO_CONVERSA.length);
  });

  it('repete em ciclo e aguenta tempo inválido', () => {
    assert.deepEqual(estadoDaConversa(duracaoDoRoteiro() + 800), estadoDaConversa(800));
    assert.deepEqual(estadoDaConversa(Number.NaN), { visiveis: 0, digitando: false });
    assert.deepEqual(estadoDaConversa(100, []), { visiveis: 0, digitando: false });
  });

  it('próxima mudança aponta para o próximo marco do roteiro', () => {
    assert.equal(proximaMudancaEm(0), 700);
    assert.equal(proximaMudancaEm(700), 1500 - 700); // bot começa a digitar em 2600-1100
    const fim = duracaoDoRoteiro();
    assert.equal(proximaMudancaEm(fim - 10), 10);
  });
});
