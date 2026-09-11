import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PROGRESSO_ENTRADA, estadoDaCena, interpolar } from './timeline3d';

describe('Linha do tempo 3D de /assinar', () => {
  it('interpola por trechos e segura as pontas', () => {
    assert.equal(interpolar(-1, [0, 1], [10, 20]), 10);
    assert.equal(interpolar(0.5, [0, 1], [10, 20]), 15);
    assert.equal(interpolar(2, [0, 1], [10, 20]), 20);
    assert.equal(interpolar(0.5, [0, 0.5, 1], [0, 7, 100]), 7);
    assert.throws(() => interpolar(0, [0], [1, 2]));
  });

  for (const mobile of [false, true]) {
    const nome = mobile ? 'celular' : 'desktop';

    it(`${nome}: começa fechado/afastado, sem interface, com texto de abertura`, () => {
      const c = estadoDaCena(0, mobile);
      if (!mobile) assert.ok(c.tampa < -80);
      assert.ok(c.escala < 0.7);
      assert.equal(c.ui, 0);
      assert.equal(c.intro, 1);
      assert.equal(c.chassi, 1);
    });

    it(`${nome}: termina em identidade para a página real assumir sem corte`, () => {
      for (const p of [PROGRESSO_ENTRADA, 1, 1.5]) {
        const c = estadoDaCena(p, mobile);
        assert.deepEqual(
          [c.tampa, c.inclinacao, c.giro, c.escala, c.deslocY, c.ui, c.brilho, c.chassi, c.raio, c.intro, c.botoes],
          [0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0],
          `p=${p}`
        );
      }
    });

    it(`${nome}: aproximação e interface nunca voltam atrás ao rolar para baixo`, () => {
      let anterior = estadoDaCena(0, mobile);
      for (let i = 1; i <= 200; i += 1) {
        const atual = estadoDaCena(i / 200, mobile);
        assert.ok(atual.escala >= anterior.escala - 1e-9, `escala caiu em ${i / 200}`);
        assert.ok(atual.ui >= anterior.ui - 1e-9, `ui caiu em ${i / 200}`);
        assert.ok(atual.chassi <= anterior.chassi + 1e-9, `chassi voltou em ${i / 200}`);
        anterior = atual;
      }
    });
  }

  it('desktop: a tampa abre de vez antes da câmera entrar na tela', () => {
    assert.ok(estadoDaCena(0.45).tampa > 0);
    assert.ok(estadoDaCena(0.45).ui === 1);
  });
});
