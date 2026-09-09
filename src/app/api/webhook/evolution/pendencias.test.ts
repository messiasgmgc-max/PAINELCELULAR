import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  chavePendencia,
  interpretarConfirmacao,
  mesclarParams,
  obterPendencia,
  VALIDADE_PENDENCIA_MS,
} from './pendencias';

function supabaseCom(linha: Record<string, unknown> | null) {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return { maybeSingle: async () => ({ data: linha }) };
            },
          };
        },
      };
    },
  } as never;
}

describe('Chave da pendência', () => {
  it('separa por conversa e por autor', () => {
    assert.notEqual(
      chavePendencia('123@g.us', '5531999990000'),
      chavePendencia('123@g.us', '5531888880000')
    );
  });
});

describe('Interpretação de sim/não', () => {
  it('reconhece as formas comuns de confirmar', () => {
    for (const t of ['sim', 'Sim', 'isso', 'ok', 'beleza', 'pode', 'confirma', 'isso mesmo', 'aham']) {
      assert.equal(interpretarConfirmacao(t), 'sim', `falhou em "${t}"`);
    }
  });

  it('reconhece as formas comuns de cancelar', () => {
    for (const t of ['não', 'nao', 'n', 'cancela', 'esquece', 'errado']) {
      assert.equal(interpretarConfirmacao(t), 'nao', `falhou em "${t}"`);
    }
  });

  it('não trata frase longa como confirmação', () => {
    // "sim, mas muda pra 2600" é uma correção, não um "pode gravar".
    assert.equal(interpretarConfirmacao('sim mas muda pra 2600'), 'indefinido');
    assert.equal(interpretarConfirmacao('vendi o 13 pro pro lucas por 2500'), 'indefinido');
  });

  it('trata vazio como indefinido', () => {
    assert.equal(interpretarConfirmacao(''), 'indefinido');
    assert.equal(interpretarConfirmacao('   '), 'indefinido');
  });
});

describe('Mesclagem de parâmetros', () => {
  it('a resposta nova completa o que faltava', () => {
    const r = mesclarParams(
      { modelo: 'iPhone 13 Pro', comprador: 'Lucas' },
      { valor: 2500 }
    );
    assert.deepEqual(r, { modelo: 'iPhone 13 Pro', comprador: 'Lucas', valor: 2500 });
  });

  it('valor novo sobrescreve o antigo', () => {
    assert.equal(mesclarParams({ valor: 2500 }, { valor: 2600 }).valor, 2600);
  });

  it('campo vazio não apaga o que já tínhamos', () => {
    const r = mesclarParams({ comprador: 'Lucas' }, { comprador: '', valor: 2500 });
    assert.equal(r.comprador, 'Lucas');
    assert.equal(r.valor, 2500);
  });
});

describe('Validade da pendência', () => {
  it('devolve a pendência recente', async () => {
    const p = await obterPendencia(
      supabaseCom({
        tipo: 'faltando_dados',
        action: 'create_venda',
        params: { modelo: 'iPhone 13 Pro' },
        resumo: 'Qual o valor?',
        criado_em: new Date().toISOString(),
      }),
      'chave'
    );
    assert.ok(p);
    assert.equal(p?.action, 'create_venda');
  });

  it('descarta pendência velha em vez de completar assunto antigo', async () => {
    const velha = new Date(Date.now() - VALIDADE_PENDENCIA_MS - 1000).toISOString();
    const p = await obterPendencia(
      supabaseCom({
        tipo: 'faltando_dados',
        action: 'create_venda',
        params: {},
        criado_em: velha,
      }),
      'chave'
    );
    assert.equal(p, null);
  });

  it('sem registro, não há pendência', async () => {
    assert.equal(await obterPendencia(supabaseCom(null), 'chave'), null);
  });
});
