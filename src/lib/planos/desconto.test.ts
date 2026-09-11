import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarDesconto, formatarDataCurta, lerDescontoLoja } from './desconto';

const agora = new Date('2026-09-10T15:00:00Z'); // 12h em Brasília

describe('Desconto na mensalidade da loja', () => {
  it('sem desconto a cobrança fica igual', () => {
    assert.equal(lerDescontoLoja(null), null);
    assert.equal(lerDescontoLoja({ desconto_percentual: 0 }), null);
    assert.equal(lerDescontoLoja({ desconto_percentual: 'abc' }), null);
    assert.deepEqual(aplicarDesconto(99.9, null), { valorOriginal: 99.9, valorFinal: 99.9, economia: 0 });
  });

  it('aplica o percentual com arredondamento em centavos', () => {
    const desconto = lerDescontoLoja({ desconto_percentual: '20.00', desconto_motivo: ' parceiro ' }, agora);
    assert.deepEqual(desconto, { percentual: 20, validoAte: null, motivo: 'parceiro' });
    assert.deepEqual(aplicarDesconto(99.9, desconto), { valorOriginal: 99.9, valorFinal: 79.92, economia: 19.98 });
    assert.equal(aplicarDesconto(269.7, lerDescontoLoja({ desconto_percentual: 15 }, agora)).valorFinal, 229.25);
  });

  it('vale até o fim do último dia no horário de Brasília', () => {
    assert.ok(lerDescontoLoja({ desconto_percentual: 10, desconto_valido_ate: '2026-09-10' }, agora));
    // 01h UTC do dia 11 ainda é dia 10 em Brasília.
    assert.ok(lerDescontoLoja({ desconto_percentual: 10, desconto_valido_ate: '2026-09-10' }, new Date('2026-09-11T01:00:00Z')));
    assert.equal(lerDescontoLoja({ desconto_percentual: 10, desconto_valido_ate: '2026-09-09' }, agora), null);
  });

  it('não passa do limite nem cobra menos que R$ 1', () => {
    const desconto = lerDescontoLoja({ desconto_percentual: 100 }, agora);
    assert.equal(desconto?.percentual, 90);
    assert.equal(aplicarDesconto(5, desconto).valorFinal, 1);
    assert.equal(aplicarDesconto(0.5, desconto).valorFinal, 0.5);
  });

  it('formata a data para a tela', () => {
    assert.equal(formatarDataCurta('2026-12-31'), '31/12/2026');
  });
});
