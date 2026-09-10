import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { patchRestauracao, patchSaida } from './ciclo';
import { aplicarMudancaEstoque, registrarEntradaEstoque } from './movimentacoes';
import { criarSupabaseFake } from './testes/supabaseFake';

function aparelho(id: string, extra: Record<string, unknown> = {}) {
  return { id, loja_id: 'LOJA', ativo: true, status: 'disponivel', condicao: 'seminovo', data_saida: null, motivo_saida: null, ...extra };
}

describe('aplicarMudancaEstoque', () => {
  it('aplica a mudança e grava uma movimentação por aparelho, com o mesmo lote', async () => {
    const fake = criarSupabaseFake({ aparelhos: [aparelho('a1', { condicao: 'novo' }), aparelho('a2')] });

    const r = await aplicarMudancaEstoque(fake.client, {
      ids: ['a1', 'a2'],
      patch: patchSaida('baixado', 'baixa_manual'),
      tipo: 'baixa',
      origem: 'manual',
      lojaId: 'LOJA',
      usuarioNome: 'Lucas',
    });

    assert.equal(r.afetados, 2);
    assert.equal(r.auditoriaRegistrada, true);

    const [a1] = fake.tabelas.aparelhos;
    assert.equal(a1.ativo, false);
    assert.equal(a1.status, 'baixado');
    assert.equal(a1.condicao, 'novo', 'a condição física precisa sobreviver à baixa');
    assert.equal(a1.motivo_saida, 'baixa_manual');
    assert.ok(a1.data_saida);

    const movs = fake.tabelas.movimentacoes_estoque;
    assert.equal(movs.length, 2);
    assert.ok(movs.every((m) => m.lote_id === r.loteId));
    assert.equal(movs[0].tipo, 'baixa');
    assert.equal(movs[0].valor_anterior.ativo, true);
    assert.equal(movs[0].valor_novo.status, 'baixado');
  });

  it('recusa condicao="vendido" antes de tocar no banco', async () => {
    const fake = criarSupabaseFake({ aparelhos: [aparelho('a1')] });

    await assert.rejects(
      aplicarMudancaEstoque(fake.client, {
        ids: ['a1'],
        patch: { ativo: false, status: 'vendido', condicao: 'vendido' } as never,
        tipo: 'venda',
        origem: 'venda',
      }),
      /condicao/
    );

    assert.equal(fake.chamadas.length, 0);
    assert.equal(fake.tabelas.aparelhos[0].ativo, true);
  });

  it('não altera nem audita aparelho de outra loja', async () => {
    const fake = criarSupabaseFake({
      aparelhos: [aparelho('a1'), aparelho('b1', { loja_id: 'OUTRA' })],
    });

    const r = await aplicarMudancaEstoque(fake.client, {
      ids: ['a1', 'b1'],
      patch: patchSaida('baixado', 'baixa_manual'),
      tipo: 'baixa',
      origem: 'manual',
      lojaId: 'LOJA',
    });

    assert.equal(r.afetados, 1);
    assert.equal(fake.tabelas.aparelhos.find((a) => a.id === 'b1')!.ativo, true);
    assert.equal(fake.tabelas.movimentacoes_estoque.length, 1);
  });

  it('processa lotes grandes em partes e audita todos', async () => {
    const ids = Array.from({ length: 400 }, (_, i) => `a${i}`);
    const fake = criarSupabaseFake({ aparelhos: ids.map((id) => aparelho(id)) });

    const r = await aplicarMudancaEstoque(fake.client, {
      ids,
      patch: patchSaida('baixado', 'baixa_massa'),
      tipo: 'baixa',
      origem: 'deletar_estoque',
    });

    assert.equal(r.afetados, 400);
    const updates = fake.chamadas.filter((c) => c.tabela === 'aparelhos' && c.operacao === 'update');
    assert.ok(updates.length >= 3, 'deve fatiar o in() para não estourar a URL');
    assert.equal(fake.tabelas.movimentacoes_estoque.length, 400);
  });

  it('informa quando a mudança foi aplicada mas a auditoria falhou', async () => {
    const fake = criarSupabaseFake({ aparelhos: [aparelho('a1')] }, { falharInsertEm: ['movimentacoes_estoque'] });

    const r = await aplicarMudancaEstoque(fake.client, {
      ids: ['a1'],
      patch: patchSaida('baixado', 'baixa_manual'),
      tipo: 'baixa',
      origem: 'manual',
    });

    assert.equal(r.afetados, 1);
    assert.equal(r.auditoriaRegistrada, false);
    assert.match(r.erroAuditoria || '', /falha simulada/);
  });

  it('restauração devolve ao estoque sem mexer na condição', async () => {
    const fake = criarSupabaseFake({
      aparelhos: [aparelho('a1', { ativo: false, status: 'baixado', condicao: 'novo', data_saida: '2026-09-10T12:00:00Z', motivo_saida: 'baixa_massa' })],
    });

    await aplicarMudancaEstoque(fake.client, {
      ids: ['a1'],
      patch: patchRestauracao(),
      tipo: 'restauracao',
      origem: 'restaurar_estoque',
    });

    const [a1] = fake.tabelas.aparelhos;
    assert.equal(a1.ativo, true);
    assert.equal(a1.status, 'disponivel');
    assert.equal(a1.condicao, 'novo');
    assert.equal(a1.data_saida, null);
  });
});

describe('registrarEntradaEstoque', () => {
  it('grava entrada com estado inicial e sem estado anterior', async () => {
    const fake = criarSupabaseFake();

    const r = await registrarEntradaEstoque(fake.client, {
      aparelhos: [
        { id: 'n1', loja_id: 'LOJA', ativo: true, status: 'disponivel', condicao: 'novo' },
        { id: 'n2', loja_id: 'LOJA', ativo: true, status: 'disponivel', condicao: 'seminovo' },
      ],
      origem: 'importar_mercadophone',
    });

    assert.equal(r.auditoriaRegistrada, true);
    const movs = fake.tabelas.movimentacoes_estoque;
    assert.equal(movs.length, 2);
    assert.equal(movs[0].tipo, 'entrada');
    assert.equal(movs[0].valor_anterior, null);
    assert.equal(movs[1].aparelho_id, 'n2');
    assert.equal(movs[1].valor_novo.condicao, 'seminovo', 'cada aparelho com o próprio estado');
  });

  it('marca auditoria incompleta quando um aparelho não tem loja identificável', async () => {
    const fake = criarSupabaseFake();

    const r = await registrarEntradaEstoque(fake.client, {
      aparelhos: [
        { id: 'sem-loja', ativo: true },
        { id: 'com-loja', loja_id: 'LOJA', ativo: true, condicao: 'novo' },
      ],
      origem: 'manual',
    });

    assert.equal(r.auditoriaRegistrada, false);
    assert.equal(fake.tabelas.movimentacoes_estoque.length, 1);
    assert.equal(fake.tabelas.movimentacoes_estoque[0].aparelho_id, 'com-loja');
    assert.equal(fake.tabelas.movimentacoes_estoque[0].valor_novo.condicao, 'novo');
  });
});

describe('Revalidação no momento da escrita', () => {
  it('aparelho vendido entre a prévia e o clique não é reativado', async () => {
    // Na prévia os dois estavam baixados; antes do clique, 'a2' foi vendido.
    const fake = criarSupabaseFake({
      aparelhos: [
        aparelho('a1', { ativo: false, status: 'baixado' }),
        aparelho('a2', { ativo: false, status: 'vendido', condicao: 'novo' }),
      ],
    });

    const r = await aplicarMudancaEstoque(fake.client, {
      ids: ['a1', 'a2'],
      patch: patchRestauracao(),
      tipo: 'restauracao',
      origem: 'restaurar_estoque',
      filtroElegivel: (estado) => estado.status !== 'vendido',
    });

    assert.equal(r.afetados, 1);
    const a2 = fake.tabelas.aparelhos.find((a) => a.id === 'a2')!;
    assert.equal(a2.ativo, false);
    assert.equal(a2.status, 'vendido');
    assert.equal(fake.tabelas.movimentacoes_estoque.length, 1, 'quem foi filtrado não é auditado como alterado');
  });
});
