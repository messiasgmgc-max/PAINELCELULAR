import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { contadorTerminou, formatarContador, suavizarSaida, valorDoContador } from './contador';

describe('Contador animado de /assinar', () => {
  it('suavização vai de 0 a 1 sem sair do intervalo', () => {
    assert.equal(suavizarSaida(0), 0);
    assert.equal(suavizarSaida(1), 1);
    assert.equal(suavizarSaida(-3), 0);
    assert.equal(suavizarSaida(9), 1);
    assert.ok(suavizarSaida(0.5) > 0.5, 'ease-out passa da metade na metade do tempo');
  });

  it('começa no início, termina exatamente no fim e nunca volta atrás', () => {
    assert.equal(valorDoContador(0, 7, 0, 1200), 0);
    assert.equal(valorDoContador(0, 7, 1200, 1200), 7);
    assert.equal(valorDoContador(0, 7, 5000, 1200), 7);
    let anterior = -1;
    for (let ms = 0; ms <= 1200; ms += 40) {
      const v = valorDoContador(0, 99.9, ms, 1200);
      assert.ok(v >= anterior, `ms=${ms}`);
      anterior = v;
    }
  });

  it('duração inválida mostra o valor final (sem animação)', () => {
    assert.equal(valorDoContador(0, 12, 10, 0), 12);
    assert.equal(valorDoContador(0, 12, 10, Number.NaN), 12);
    assert.equal(contadorTerminou(10, 0), true);
    assert.equal(contadorTerminou(10, 100), false);
    assert.equal(contadorTerminou(100, 100), true);
  });

  it('formata em pt-BR com casas fixas', () => {
    assert.equal(formatarContador(99.9, 2), '99,90');
    assert.equal(formatarContador(1234), '1.234');
    assert.equal(formatarContador(6.6), '7');
    assert.equal(formatarContador(Number.NaN, 2), '0,00');
  });
});
