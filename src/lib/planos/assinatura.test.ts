import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  lerAssinatura,
  podeGerenciarAssinatura,
  registrarCancelamento,
  registrarReativacao,
} from './assinatura';

const agora = new Date('2026-09-11T15:00:00Z');

describe('Cancelamento da assinatura', () => {
  it('sem registro, a assinatura está ativa', () => {
    assert.equal(lerAssinatura(null, '2026-10-05').cancelada, false);
    assert.equal(lerAssinatura({ outraConfig: 1 }, '2026-10-05').cancelada, false);
  });

  it('cancelar mantém o acesso até o vencimento pago e preserva as outras configurações', () => {
    const config = registrarCancelamento(
      { limite_aprovacao_manual: 5000 },
      { motivo: '  Preço alto ', por: 'Lucas', agora, dataVencimento: '2026-10-05T00:00:00Z' }
    );
    assert.equal(config.limite_aprovacao_manual, 5000);

    const estado = lerAssinatura(config, '2026-10-05');
    assert.deepEqual(estado, {
      cancelada: true,
      canceladaEm: '2026-09-11T15:00:00.000Z',
      motivo: 'Preço alto',
      canceladaPor: 'Lucas',
      acessoAte: '2026-10-05',
    });
  });

  it('pagar de novo depois de cancelar reativa sozinho', () => {
    const config = registrarCancelamento({}, { por: 'Lucas', agora, dataVencimento: '2026-10-05' });
    assert.equal(lerAssinatura(config, '2026-11-04').cancelada, false);
  });

  it('desfazer o cancelamento volta para ativa', () => {
    const cancelada = registrarCancelamento({}, { por: 'Lucas', agora, dataVencimento: '2026-10-05' });
    const reativada = registrarReativacao(cancelada, { por: 'Lucas', agora });
    assert.equal(lerAssinatura(reativada, '2026-10-05').cancelada, false);
  });

  it('só dono ou gerente pode cancelar', () => {
    assert.ok(podeGerenciarAssinatura('admin'));
    assert.ok(podeGerenciarAssinatura('gerente'));
    assert.ok(podeGerenciarAssinatura('super_admin'));
    assert.ok(!podeGerenciarAssinatura('vendedor'));
    assert.ok(!podeGerenciarAssinatura('operador'));
    assert.ok(!podeGerenciarAssinatura(undefined));
  });
});
