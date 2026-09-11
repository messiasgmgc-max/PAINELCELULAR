import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TILT_NEUTRO,
  anguloDeRepouso,
  anguloPorArraste,
  inclinacaoPorArraste,
  tiltPorOrientacao,
  tiltPorPonteiro,
} from './tilt';

describe('Tilt 3D de /assinar', () => {
  it('ponteiro no centro deixa o cartão reto e o brilho no meio', () => {
    assert.deepEqual(tiltPorPonteiro(150, 100, 300, 200), { rotX: 0, rotY: 0, brilhoX: 50, brilhoY: 50 });
  });

  it('cantos levam ao ângulo máximo com o sinal certo', () => {
    // Canto superior direito: lado direito vai para trás (rotY+) e o topo vem para a frente (rotX+).
    assert.deepEqual(tiltPorPonteiro(300, 0, 300, 200, 10), { rotX: 10, rotY: 10, brilhoX: 100, brilhoY: 0 });
    // Canto inferior esquerdo.
    assert.deepEqual(tiltPorPonteiro(0, 200, 300, 200, 10), { rotX: -10, rotY: -10, brilhoX: 0, brilhoY: 100 });
  });

  it('fora do cartão segura na borda; tamanho inválido fica neutro', () => {
    assert.deepEqual(tiltPorPonteiro(900, -500, 300, 200, 8), tiltPorPonteiro(300, 0, 300, 200, 8));
    assert.deepEqual(tiltPorPonteiro(10, 10, 0, 200), { ...TILT_NEUTRO });
    assert.equal(tiltPorPonteiro(Number.NaN, 10, 300, 200).rotY, 0);
  });

  it('giroscópio: relativo à postura inicial, com teto e fallback neutro', () => {
    const ref = { beta: 40, gamma: 0 };
    assert.deepEqual(tiltPorOrientacao(40, 0, ref), { ...TILT_NEUTRO });
    assert.equal(tiltPorOrientacao(40, 12.5, ref, 6, 25).rotY, 3);
    assert.equal(tiltPorOrientacao(40, 90, ref, 6, 25).rotY, 6);
    assert.equal(tiltPorOrientacao(90, 0, ref, 6, 25).rotX, -6);
    assert.deepEqual(tiltPorOrientacao(40, 10, null), { ...TILT_NEUTRO });
    assert.deepEqual(tiltPorOrientacao(null, 10, ref), { ...TILT_NEUTRO });
    assert.deepEqual(tiltPorOrientacao(Number.NaN, 10, ref), { ...TILT_NEUTRO });
  });

  it('iPhone: arraste soma ao ângulo e o repouso volta para a frente mais próxima', () => {
    assert.equal(anguloPorArraste(0, 100, 0.6), 60);
    assert.equal(anguloPorArraste(360, -50, 1), 310);
    assert.equal(anguloPorArraste(20, Number.NaN), 20);
    assert.equal(anguloDeRepouso(170), 0);
    assert.equal(anguloDeRepouso(190), 360);
    assert.equal(anguloDeRepouso(-200), -360);
    assert.equal(anguloDeRepouso(-10), 0);
    assert.ok(!Object.is(anguloDeRepouso(-10), -0));
    assert.equal(anguloDeRepouso(Number.POSITIVE_INFINITY), 0);
  });

  it('iPhone: inclinação vertical nunca passa do limite', () => {
    assert.equal(inclinacaoPorArraste(0, -1000, 18), 18);
    assert.equal(inclinacaoPorArraste(0, 1000, 18), -18);
    assert.equal(inclinacaoPorArraste(4, 8, 18, 0.5), 0);
  });
});
