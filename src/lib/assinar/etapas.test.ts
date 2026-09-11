import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ETAPA_REVELADA, estadoDaEtapa, etapaEmDestaque, janelaDaEtapa } from './etapas';

describe('Etapas 3D do "Como funciona" de /assinar', () => {
  const TOTAL = 4;

  it('janelas escalonadas: primeira começa em 0, última termina antes do fim da seção', () => {
    assert.equal(janelaDaEtapa(0, TOTAL).inicio, 0);
    assert.ok(janelaDaEtapa(TOTAL - 1, TOTAL).fim <= 0.9);
    for (let i = 1; i < TOTAL; i += 1) {
      assert.ok(janelaDaEtapa(i, TOTAL).inicio > janelaDaEtapa(i - 1, TOTAL).inicio);
    }
  });

  it('antes da janela a carta está escondida e deitada; depois, reta', () => {
    const antes = estadoDaEtapa(0, 2, TOTAL);
    assert.equal(antes.opacidade, 0);
    assert.ok(antes.rotX > 45);
    assert.ok(antes.z < 0);
    for (let i = 0; i < TOTAL; i += 1) {
      assert.deepEqual(estadoDaEtapa(1, i, TOTAL), { ...ETAPA_REVELADA });
    }
  });

  it('ao rolar para baixo a carta só sobe (nunca volta a deitar)', () => {
    for (let i = 0; i < TOTAL; i += 1) {
      let anterior = estadoDaEtapa(0, i, TOTAL);
      for (let passo = 1; passo <= 100; passo += 1) {
        const atual = estadoDaEtapa(passo / 100, i, TOTAL);
        assert.ok(atual.opacidade >= anterior.opacidade);
        assert.ok(atual.rotX <= anterior.rotX);
        anterior = atual;
      }
    }
  });

  it('valores inválidos ficam no começo; etapa em destaque acompanha o progresso', () => {
    assert.equal(estadoDaEtapa(Number.NaN, 0, TOTAL).opacidade, 0);
    assert.equal(etapaEmDestaque(0, TOTAL), -1);
    assert.equal(etapaEmDestaque(1, TOTAL), TOTAL - 1);
    assert.equal(etapaEmDestaque(0.2, TOTAL), 0);
  });
});
