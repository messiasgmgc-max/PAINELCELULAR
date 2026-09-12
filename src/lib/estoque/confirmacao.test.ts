import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { quantidadeDigitadaConfere } from './confirmacao';

describe('quantidadeDigitadaConfere', () => {
  it('confere a quantidade exata, com espaços ou separador de milhar', () => {
    assert.equal(quantidadeDigitadaConfere('112', 112), true);
    assert.equal(quantidadeDigitadaConfere(' 112 ', 112), true);
    assert.equal(quantidadeDigitadaConfere('1.200', 1200), true);
  });

  it('recusa número diferente, texto e vazio', () => {
    assert.equal(quantidadeDigitadaConfere('111', 112), false);
    assert.equal(quantidadeDigitadaConfere('Phone Center', 112), false);
    assert.equal(quantidadeDigitadaConfere('', 112), false);
    assert.equal(quantidadeDigitadaConfere(null, 112), false);
    assert.equal(quantidadeDigitadaConfere('12a', 12), false);
  });

  it('nunca libera operação sem aparelho afetado', () => {
    assert.equal(quantidadeDigitadaConfere('0', 0), false);
  });
});
