import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { textoGarantiaPadrao } from './garantia';

describe('Garantia padrão da loja', () => {
  it('usa os dias configurados', () => {
    assert.equal(textoGarantiaPadrao(180), '180 dias');
    assert.equal(textoGarantiaPadrao('365'), '365 dias');
  });

  it('sem configuração válida, fica em 90 dias', () => {
    for (const valor of [undefined, null, 0, -5, 'abc']) {
      assert.equal(textoGarantiaPadrao(valor), '90 dias', String(valor));
    }
  });
});
