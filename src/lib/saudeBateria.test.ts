import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatarSaudeBateria } from './utils';

describe('Saúde da bateria para exibição', () => {
  it('lê a coluna saude_bateria, que é a que existe no banco', () => {
    // saudeBateria (camelCase) não existe como coluna; parte do código lia só ela.
    assert.equal(formatarSaudeBateria({ saude_bateria: '92%' }), '92%');
  });

  it('aceita os formatos que estão gravados hoje', () => {
    assert.equal(formatarSaudeBateria({ saude_bateria: '92%' }), '92%');
    assert.equal(formatarSaudeBateria({ saude_bateria: '77%' }), '77%');
    assert.equal(formatarSaudeBateria({ saude_bateria: '100% (Lacrado)' }), '100%');
    assert.equal(formatarSaudeBateria({ saude_bateria: '84' }), '84%');
    assert.equal(formatarSaudeBateria({ saude_bateria: ' 80 % ' }), '80%');
  });

  it('aceita as variantes de campo usadas pelo resto do código', () => {
    assert.equal(formatarSaudeBateria({ saudeBateria: '88%' }), '88%');
    assert.equal(formatarSaudeBateria({ bateria: '73' }), '73%');
  });

  it('prefere saude_bateria quando há mais de uma variante', () => {
    assert.equal(formatarSaudeBateria({ saude_bateria: '90%', saudeBateria: '10%' }), '90%');
  });

  it('devolve vazio quando não há informação, para não poluir a tela', () => {
    assert.equal(formatarSaudeBateria({}), '');
    assert.equal(formatarSaudeBateria(null), '');
    assert.equal(formatarSaudeBateria(undefined), '');
    assert.equal(formatarSaudeBateria({ saude_bateria: '' }), '');
    assert.equal(formatarSaudeBateria({ saude_bateria: '   ' }), '');
    assert.equal(formatarSaudeBateria({ saude_bateria: 'sem informação' }), '');
  });

  it('descarta valores fora da faixa de uma porcentagem', () => {
    assert.equal(formatarSaudeBateria({ saude_bateria: '0%' }), '');
    assert.equal(formatarSaudeBateria({ saude_bateria: '999' }), '');
  });
});
