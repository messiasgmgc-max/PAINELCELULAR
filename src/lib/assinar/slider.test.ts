import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deslocamentosDaCortina, posicaoPorPonteiro, posicaoPorTecla, rotuloDoSlider } from './slider';

describe('Slider antes x depois de /assinar', () => {
  it('converte o ponteiro em % da largura, segurando nas pontas', () => {
    assert.equal(posicaoPorPonteiro(150, 100, 200), 25);
    assert.equal(posicaoPorPonteiro(50, 100, 200), 0);
    assert.equal(posicaoPorPonteiro(900, 100, 200), 100);
    assert.equal(posicaoPorPonteiro(150, 100, 0), 50);
    assert.equal(posicaoPorPonteiro(Number.NaN, 100, 200), 50);
  });

  it('teclado anda em passos e respeita os limites', () => {
    assert.equal(posicaoPorTecla(50, 'ArrowRight'), 55);
    assert.equal(posicaoPorTecla(50, 'ArrowLeft', 10), 40);
    assert.equal(posicaoPorTecla(98, 'ArrowUp'), 100);
    assert.equal(posicaoPorTecla(2, 'ArrowDown'), 0);
    assert.equal(posicaoPorTecla(50, 'PageUp'), 75);
    assert.equal(posicaoPorTecla(50, 'Home'), 0);
    assert.equal(posicaoPorTecla(50, 'End'), 100);
    assert.equal(posicaoPorTecla(50, 'Enter'), null);
  });

  it('cortina: recorte e conteúdo se anulam (conteúdo parado)', () => {
    for (const p of [0, 12.5, 50, 100]) {
      const { recorte, conteudo } = deslocamentosDaCortina(p);
      assert.equal(recorte + conteudo, 0, `p=${p}`);
    }
    assert.deepEqual(deslocamentosDaCortina(100), { recorte: 0, conteudo: 0 });
    assert.ok(!Object.is(deslocamentosDaCortina(100).recorte, -0));
    assert.deepEqual(deslocamentosDaCortina(30), { recorte: -70, conteudo: 70 });
  });

  it('rótulo acessível descreve os dois lados', () => {
    assert.equal(rotuloDoSlider(30), '30% mostrando o sistema, 70% mostrando caderno e planilha');
  });
});
