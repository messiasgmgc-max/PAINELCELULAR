import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { condicaoParaDevolucao, limparObservacoesDeVenda } from './vendasDevolucao';

describe('Condição do aparelho ao desfazer a venda', () => {
  it('usa a condição registrada na venda', () => {
    assert.equal(condicaoParaDevolucao({ condicaoOriginal: 'novo' }), 'novo');
    assert.equal(condicaoParaDevolucao({ condicaoOriginal: 'usado' }), 'usado');
    assert.equal(condicaoParaDevolucao({ condicaoOriginal: 'danificado' }), 'danificado');
  });

  it('um lacrado não volta como seminovo', () => {
    // Era o bug do "cancelar venda" antigo: devolvia tudo como seminovo fixo.
    assert.equal(condicaoParaDevolucao({ condicaoOriginal: 'novo' }), 'novo');
    assert.equal(condicaoParaDevolucao({ condicao: 'Lacrado' }), 'novo');
  });

  it('aceita a condição em caixa alta e com acento, como vem da importação', () => {
    assert.equal(condicaoParaDevolucao({ condicao: 'SEMINOVO' }), 'seminovo');
    assert.equal(condicaoParaDevolucao({ condicao: 'NOVO' }), 'novo');
    assert.equal(condicaoParaDevolucao({ condicaoOriginal: 'Danificado' }), 'danificado');
  });

  it('prefere a condição da venda à do item quando as duas existem', () => {
    assert.equal(
      condicaoParaDevolucao({ condicaoOriginal: 'novo', condicao: 'seminovo' }),
      'novo'
    );
  });

  it('ignora "vendido", que é o estado da baixa e não a condição real', () => {
    assert.equal(condicaoParaDevolucao({ condicaoOriginal: 'vendido', condicao: 'novo' }), 'novo');
    assert.equal(condicaoParaDevolucao({ condicaoOriginal: 'vendido' }), 'seminovo');
  });

  it('cai no padrão quando não há informação nenhuma', () => {
    assert.equal(condicaoParaDevolucao({}), 'seminovo');
    assert.equal(condicaoParaDevolucao(null), 'seminovo');
    assert.equal(condicaoParaDevolucao({ condicao: '', condicaoOriginal: '  ' }), 'seminovo');
    assert.equal(condicaoParaDevolucao({ condicao: 'coisa estranha' }), 'seminovo');
  });
});

describe('Limpeza das observações ao devolver', () => {
  it('remove a marca de baixa deixada pela venda', () => {
    assert.equal(limparObservacoesDeVenda('BAIXA_ESTOQUE:2026-01-01 | Aparelho da vitrine'), 'Aparelho da vitrine');
  });

  it('remove a marca de venda varejo/atacado', () => {
    assert.equal(limparObservacoesDeVenda('Venda VAREJO para Lucas | Tela trocada'), 'Tela trocada');
    assert.equal(limparObservacoesDeVenda('Venda ATACADO lote 3 | Sem detalhes'), 'Sem detalhes');
  });

  it('preserva a observação legítima da loja', () => {
    assert.equal(limparObservacoesDeVenda('Bateria 87% - risco na traseira'), 'Bateria 87% - risco na traseira');
  });

  it('devolve null quando não sobra nada, em vez de string vazia', () => {
    assert.equal(limparObservacoesDeVenda('BAIXA_ESTOQUE:2026-01-01'), null);
    assert.equal(limparObservacoesDeVenda(''), null);
    assert.equal(limparObservacoesDeVenda(null), null);
    assert.equal(limparObservacoesDeVenda(undefined), null);
  });
});
