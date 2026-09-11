import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ehEstadoAmbiguoLegado,
  estaNoEstoque,
  montarMovimentacoes,
  patchRestauracao,
  patchSaida,
  validarPatchCiclo,
  ehAparelhoDeCliente,
  patchAparelhoDeCliente,
} from './ciclo';

describe('Estar no estoque', () => {
  it('aparelho ativo e disponível está no estoque', () => {
    assert.equal(estaNoEstoque({ ativo: true, status: 'disponivel', condicao: 'seminovo' }), true);
  });

  it('manutenção continua contando como estoque da loja', () => {
    assert.equal(estaNoEstoque({ ativo: true, status: 'manutencao', condicao: 'seminovo' }), true);
  });

  it('vendido, baixado ou inativo não está no estoque', () => {
    assert.equal(estaNoEstoque({ ativo: false, status: 'vendido' }), false);
    assert.equal(estaNoEstoque({ ativo: false, status: 'baixado' }), false);
    assert.equal(estaNoEstoque({ ativo: false, status: 'disponivel' }), false);
  });

  it('tolera o legado: condicao="vendido" ainda tira do estoque', () => {
    assert.equal(estaNoEstoque({ ativo: true, status: 'disponivel', condicao: 'vendido' }), false);
  });

  it('status ausente é tratado como disponível', () => {
    assert.equal(estaNoEstoque({ ativo: true }), true);
    assert.equal(estaNoEstoque(null), false);
  });
});

describe('Assinatura das remontagens com defeito', () => {
  it('reconhece ativo=false + status=disponivel + condicao=vendido', () => {
    // Exatamente os 158 aparelhos que só a conferência física resolve.
    assert.equal(ehEstadoAmbiguoLegado({ ativo: false, status: 'disponivel', condicao: 'vendido' }), true);
    assert.equal(ehEstadoAmbiguoLegado({ ativo: false, status: null, condicao: 'vendido' }), true);
  });

  it('não confunde com venda de verdade nem com baixa comum', () => {
    assert.equal(ehEstadoAmbiguoLegado({ ativo: false, status: 'vendido', condicao: 'vendido' }), false);
    assert.equal(ehEstadoAmbiguoLegado({ ativo: false, status: 'disponivel', condicao: 'seminovo' }), false);
    assert.equal(ehEstadoAmbiguoLegado({ ativo: true, status: 'disponivel', condicao: 'vendido' }), false);
  });
});

describe('Validação das escritas de ciclo de vida', () => {
  it('recusa condicao="vendido" — foi isso que corrompeu 112 aparelhos', () => {
    assert.throws(() => validarPatchCiclo({ ativo: false, condicao: 'vendido' }), /condicao/);
  });

  it('recusa tirar do estoque sem dizer por quê', () => {
    assert.throws(() => validarPatchCiclo({ ativo: false }), /exige status/);
    assert.throws(() => validarPatchCiclo({ ativo: false, status: 'disponivel' }), /exige status/);
  });

  it('recusa vendido/baixado com ativo=true', () => {
    assert.throws(() => validarPatchCiclo({ status: 'vendido' }), /exige ativo=false/);
    assert.throws(() => validarPatchCiclo({ ativo: true, status: 'baixado' }), /exige ativo=false/);
  });

  it('recusa status e motivo fora do vocabulário', () => {
    assert.throws(() => validarPatchCiclo({ status: 'sumiu' }), /não pertence/);
    assert.throws(() => validarPatchCiclo({ ...patchSaida('baixado', 'baixa_massa'), motivo_saida: 'xingamento' }), /motivo_saida/);
  });

  it('aceita os patches padronizados e edições sem ciclo', () => {
    assert.doesNotThrow(() => validarPatchCiclo(patchSaida('vendido', 'venda')));
    assert.doesNotThrow(() => validarPatchCiclo(patchSaida('baixado', 'baixa_manual')));
    assert.doesNotThrow(() => validarPatchCiclo(patchRestauracao()));
    assert.doesNotThrow(() => validarPatchCiclo({ preco: 3200, condicao: 'novo' }));
  });

  it('saída preenche data e motivo; restauração limpa ambos e não toca na condição', () => {
    const quando = new Date('2026-09-10T12:16:38.000Z');
    assert.deepEqual(patchSaida('baixado', 'baixa_massa', quando), {
      ativo: false,
      status: 'baixado',
      data_saida: '2026-09-10T12:16:38.000Z',
      motivo_saida: 'baixa_massa',
    });

    const r = patchRestauracao();
    assert.equal(r.data_saida, null);
    assert.equal(r.motivo_saida, null);
    assert.equal('condicao' in r, false);
  });
});

describe('Montagem da trilha de auditoria', () => {
  const base = {
    tipo: 'baixa' as const,
    origem: 'remontar_mercadophone' as const,
    loteId: '11111111-1111-4111-8111-111111111111',
    campos: ['ativo', 'status', 'condicao'],
  };

  it('registra antes e depois de cada aparelho com o mesmo lote', () => {
    const linhas = montarMovimentacoes({
      ...base,
      antes: [
        { id: 'a1', loja_id: 'L', ativo: true, status: 'disponivel', condicao: 'novo' },
        { id: 'a2', loja_id: 'L', ativo: true, status: 'disponivel', condicao: 'seminovo' },
      ],
      patch: { ativo: false, status: 'baixado' },
    });

    assert.equal(linhas.length, 2);
    assert.ok(linhas.every((l) => l.lote_id === base.loteId));
    assert.deepEqual(linhas[0].valor_anterior, { ativo: true, status: 'disponivel', condicao: 'novo' });
    // A condição física sobrevive à baixa.
    assert.deepEqual(linhas[0].valor_novo, { ativo: false, status: 'baixado', condicao: 'novo' });
  });

  it('usa a loja padrão quando a linha não tem loja, e omite quando nenhuma existe', () => {
    const comPadrao = montarMovimentacoes({ ...base, antes: [{ id: 'a1', ativo: true }], patch: {}, lojaIdPadrao: 'L' });
    assert.equal(comPadrao[0].loja_id, 'L');

    const semNenhuma = montarMovimentacoes({ ...base, antes: [{ id: 'a1', ativo: true }], patch: {} });
    assert.equal(semNenhuma.length, 0);
  });

  it('descarta usuario_id que não é uuid para não quebrar o insert', () => {
    const [linha] = montarMovimentacoes({
      ...base,
      antes: [{ id: 'a1', loja_id: 'L', ativo: true }],
      patch: {},
      usuarioId: 'lucasimports031',
      usuarioNome: 'Lucas',
    });
    assert.equal(linha.usuario_id, null);
    assert.equal(linha.usuario_nome, 'Lucas');
  });
});

describe('Celular do cliente na OS', () => {
  it('não conta como estoque nem vai para o PDV', () => {
    assert.equal(estaNoEstoque({ ativo: false, status: 'cliente', condicao: 'usado' }), false);
    assert.equal(ehAparelhoDeCliente({ ativo: false, status: 'cliente' }), true);
    assert.equal(ehAparelhoDeCliente({ ativo: true, status: 'disponivel' }), false);
  });

  it('só existe fora do estoque', () => {
    assert.doesNotThrow(() => validarPatchCiclo(patchAparelhoDeCliente()));
    assert.throws(() => validarPatchCiclo({ status: 'cliente' }), /exige ativo=false/);
    assert.throws(() => validarPatchCiclo({ ativo: true, status: 'cliente' }), /exige ativo=false/);
  });
});
