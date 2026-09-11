import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FILTRO_VENDA_VALIDA, montarCancelamento, vendaCancelada, vendaConta } from './situacao';

describe('Situação da venda', () => {
  it('cancelada ou estornada não conta, com qualquer caixa', () => {
    assert.ok(vendaCancelada({ status: 'cancelado' }));
    assert.ok(vendaCancelada({ status: ' Cancelada ' }));
    assert.ok(vendaCancelada({ status: 'estornado' }));
    assert.equal(vendaConta({ status: 'CANCELADO' }), false);
  });

  it('paga, pendente, parcial e sem status contam', () => {
    for (const status of ['pago', 'pendente', 'parcial', undefined, null, '']) {
      assert.ok(vendaConta({ status }), String(status));
    }
    assert.equal(vendaConta(null), false);
  });

  it('cancelamento guarda quando, quem e por quê', () => {
    const agora = new Date('2026-09-10T12:00:00Z');
    assert.deepEqual(montarCancelamento('  Venda desfeita no PDV ', ' Lucas ', agora), {
      status: 'cancelado',
      cancelada_em: '2026-09-10T12:00:00.000Z',
      cancelada_por: 'Lucas',
      motivo_cancelamento: 'Venda desfeita no PDV',
    });
    assert.equal(montarCancelamento('', null, agora).motivo_cancelamento, 'Venda cancelada');
    assert.equal(montarCancelamento('x', '', agora).cancelada_por, null);
  });

  it('filtro do banco mantém vendas sem status', () => {
    assert.equal(FILTRO_VENDA_VALIDA, 'status.is.null,status.neq.cancelado');
  });
});
