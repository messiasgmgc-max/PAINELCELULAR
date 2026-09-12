import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { patchRestauracao, patchSaida } from './ciclo';
import {
  agruparLotesEmMassa,
  carregarPlanoDesfazer,
  executarDesfazerLote,
  planejarDesfazerLote,
  valoresIguais,
  type MovimentacaoLote,
} from './desfazerLote';
import { aplicarMudancaEstoque, registrarEntradaEstoque } from './movimentacoes';
import { criarSupabaseFake } from './testes/supabaseFake';

const LOTE = '11111111-1111-4111-8111-111111111111';
const AGORA = new Date('2026-09-11T15:00:00Z');

function aparelho(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    loja_id: 'LOJA',
    modelo: 'iPhone 13',
    preco: 3000,
    observacoes: null,
    ativo: true,
    status: 'disponivel',
    condicao: 'seminovo',
    data_saida: null,
    motivo_saida: null,
    ...extra,
  };
}

/** O fake não preenche created_at: carimba as movimentações gravadas até aqui. */
function carimbar(movs: Array<Record<string, unknown>>, iso: string) {
  for (const m of movs) if (!m.created_at) m.created_at = iso;
}

function mov(parcial: Partial<MovimentacaoLote>): MovimentacaoLote {
  return {
    aparelho_id: 'a1',
    tipo: 'baixa',
    origem: 'deletar_estoque',
    lote_id: LOTE,
    created_at: '2026-09-11T12:00:00Z',
    ...parcial,
  };
}

describe('valoresIguais', () => {
  it('tolera o formato que o banco devolve', () => {
    assert.equal(valoresIguais('2026-09-11T12:00:00.000Z', '2026-09-11T12:00:00+00:00'), true);
    assert.equal(valoresIguais(3000, '3000'), true);
    assert.equal(valoresIguais(null, undefined), true);
    assert.equal(valoresIguais(null, ''), false);
    assert.equal(valoresIguais({ a: 1 }, { a: 1 }), true);
    assert.equal(valoresIguais('disponivel', 'baixado'), false);
  });
});

describe('agruparLotesEmMassa', () => {
  it('lista só operações em massa das últimas 24 h e marca as já desfeitas', () => {
    const movs: MovimentacaoLote[] = [
      mov({ aparelho_id: 'a1', usuario_nome: 'Lucas' }),
      mov({ aparelho_id: 'a2', tipo: 'baixa' }),
      mov({ lote_id: 'venda-1', origem: 'venda', tipo: 'venda' }),
      mov({ lote_id: 'antigo', origem: 'conferencia', created_at: '2026-09-10T14:00:00Z' }),
      mov({ lote_id: 'manual-1', origem: 'manual', tipo: 'entrada' }),
      mov({ lote_id: 'forn-1', origem: 'manual', tipo: 'entrada', aparelho_id: 'b1' }),
      mov({ lote_id: 'forn-1', origem: 'manual', tipo: 'entrada', aparelho_id: 'b2' }),
      mov({
        lote_id: 'desfaz-1',
        origem: 'desfazer_lote',
        tipo: 'restauracao',
        observacao: `Desfaz o lote ${LOTE} (Baixar todo o estoque).`,
        created_at: '2026-09-11T13:00:00Z',
      }),
    ];

    const lotes = agruparLotesEmMassa(movs, AGORA);

    assert.deepEqual(lotes.map((l) => l.loteId).sort(), [LOTE, 'forn-1'].sort());
    const baixa = lotes.find((l) => l.loteId === LOTE)!;
    assert.equal(baixa.quantidade, 2);
    assert.equal(baixa.usuarioNome, 'Lucas');
    assert.equal(baixa.desfeito, true);
    assert.equal(baixa.porTipo.baixa, 2);
    assert.equal(baixa.expiraEm, '2026-09-12T12:00:00.000Z');
  });
});

describe('planejarDesfazerLote', () => {
  const baixa = patchSaida('baixado', 'baixa_massa', new Date('2026-09-11T12:00:00Z'));
  const movBaixa = (id: string) =>
    mov({
      aparelho_id: id,
      valor_anterior: { ativo: true, status: 'disponivel', data_saida: null, motivo_saida: null },
      valor_novo: { ativo: false, status: 'baixado', data_saida: baixa.data_saida, motivo_saida: 'baixa_massa' },
      antes: aparelho(id),
    });

  it('devolve ao estado anterior só quem não mudou depois; os outros viram conflito', () => {
    const plano = planejarDesfazerLote({
      loteId: LOTE,
      movimentacoes: [movBaixa('a1'), movBaixa('a2'), movBaixa('a3'), movBaixa('a4')],
      posteriores: [
        mov({ aparelho_id: 'a2', lote_id: 'venda-9', origem: 'venda', tipo: 'venda', created_at: '2026-09-11T13:00:00Z' }),
      ],
      atuais: [
        // O banco devolve o timestamp com +00:00.
        aparelho('a1', { ...baixa, data_saida: '2026-09-11T12:00:00+00:00' }),
        aparelho('a2', { ativo: false, status: 'vendido', motivo_saida: 'venda' }),
        aparelho('a3', { ...baixa, preco: 2800, ativo: true, status: 'disponivel', data_saida: null, motivo_saida: null }),
      ],
      agora: AGORA,
    });

    assert.equal(plano.expirado, false);
    assert.deepEqual(plano.reverter.map((i) => i.aparelhoId), ['a1']);
    assert.deepEqual(plano.reverter[0].patch, patchRestauracao());
    assert.equal(plano.reverter[0].tipo, 'restauracao');

    const motivos = Object.fromEntries(plano.conflitos.map((c) => [c.aparelhoId, c.motivo]));
    assert.deepEqual(motivos, { a2: 'movimentado_depois', a3: 'mudou_depois', a4: 'nao_encontrado' });
  });

  it('aparelho cadastrado pelo lote volta a não estar no estoque (baixa)', () => {
    const plano = planejarDesfazerLote({
      loteId: LOTE,
      movimentacoes: [
        mov({
          origem: 'importar_mercadophone',
          tipo: 'entrada',
          valor_anterior: null,
          valor_novo: { ativo: true, status: 'disponivel', condicao: 'seminovo' },
        }),
      ],
      posteriores: [],
      atuais: [aparelho('a1')],
      agora: AGORA,
    });
    assert.equal(plano.reverter.length, 1);
    assert.equal(plano.reverter[0].criadoNoLote, true);
    assert.equal(plano.reverter[0].patch.status, 'baixado');
  });

  it('não regrava estado que o ciclo de vida recusa (legado ambíguo)', () => {
    const plano = planejarDesfazerLote({
      loteId: LOTE,
      movimentacoes: [
        mov({
          origem: 'restaurar_estoque',
          tipo: 'restauracao',
          valor_anterior: { ativo: false, status: 'disponivel', condicao: 'vendido', data_saida: null, motivo_saida: null },
          valor_novo: { ativo: true, status: 'disponivel', condicao: 'vendido', data_saida: null, motivo_saida: null },
        }),
      ],
      posteriores: [],
      atuais: [aparelho('a1', { condicao: 'vendido' })],
      agora: AGORA,
    });
    assert.equal(plano.reverter.length, 0);
    assert.equal(plano.conflitos[0].motivo, 'estado_invalido');
  });

  it('passadas 24 horas, o lote expira', () => {
    const plano = planejarDesfazerLote({
      loteId: LOTE,
      movimentacoes: [movBaixa('a1')],
      posteriores: [],
      atuais: [aparelho('a1', baixa)],
      agora: new Date('2026-09-12T12:00:01Z'),
    });
    assert.equal(plano.expirado, true);
  });
});

describe('desfazer de ponta a ponta', () => {
  it('baixa total desfeita: volta quem não mudou, não toca no vendido depois e registra novo lote', async () => {
    const fake = criarSupabaseFake({
      aparelhos: [aparelho('a1', { condicao: 'novo' }), aparelho('a2'), aparelho('a3', { status: 'manutencao' })],
    });

    const baixaTotal = await aplicarMudancaEstoque(fake.client, {
      ids: ['a1', 'a2', 'a3'],
      patch: patchSaida('baixado', 'baixa_massa', new Date('2026-09-11T12:00:00Z')),
      tipo: 'baixa',
      origem: 'deletar_estoque',
      lojaId: 'LOJA',
    });
    carimbar(fake.tabelas.movimentacoes_estoque, '2026-09-11T12:00:01Z');
    const primeira = fake.tabelas.movimentacoes_estoque[0];
    assert.equal(primeira.antes.modelo, 'iPhone 13', 'a auditoria guarda a linha inteira em `antes`');

    // Depois da baixa, a2 foi reativado e vendido por outra tela.
    await aplicarMudancaEstoque(fake.client, { ids: ['a2'], patch: patchRestauracao(), tipo: 'restauracao', origem: 'manual', lojaId: 'LOJA' });
    await aplicarMudancaEstoque(fake.client, { ids: ['a2'], patch: patchSaida('vendido', 'venda'), tipo: 'venda', origem: 'venda', lojaId: 'LOJA' });
    carimbar(fake.tabelas.movimentacoes_estoque, '2026-09-11T13:00:00Z');

    const { plano } = await carregarPlanoDesfazer(fake.client, 'LOJA', baixaTotal.loteId, AGORA);
    assert.deepEqual(plano.reverter.map((i) => i.aparelhoId).sort(), ['a1', 'a3']);
    assert.deepEqual(plano.conflitos.map((c) => c.aparelhoId), ['a2']);

    const r = await executarDesfazerLote(fake.client, plano, { lojaId: 'LOJA', usuarioNome: 'Lucas' });

    assert.equal(r.revertidos, 2);
    assert.deepEqual(r.ignoradosNaHora, []);
    const porId = Object.fromEntries(fake.tabelas.aparelhos.map((a) => [a.id, a]));
    assert.equal(porId.a1.ativo, true);
    assert.equal(porId.a1.status, 'disponivel');
    assert.equal(porId.a1.condicao, 'novo');
    assert.equal(porId.a3.status, 'manutencao', 'volta para manutenção, não para disponível');
    assert.equal(porId.a2.status, 'vendido', 'o vendido depois não é tocado');

    const reversao = fake.tabelas.movimentacoes_estoque.filter((m) => m.lote_id === r.loteId);
    assert.equal(reversao.length, 2);
    assert.ok(reversao.every((m) => m.origem === 'desfazer_lote'));
    assert.match(reversao[0].observacao, new RegExp(baixaTotal.loteId));
  });

  it('desfaz a importação: o aparelho cadastrado pelo lote sai do estoque', async () => {
    const fake = criarSupabaseFake({ aparelhos: [aparelho('n1')] });
    const entrada = await registrarEntradaEstoque(fake.client, {
      aparelhos: [aparelho('n1')],
      origem: 'importar_mercadophone',
      lojaId: 'LOJA',
    });
    carimbar(fake.tabelas.movimentacoes_estoque, '2026-09-11T12:00:00Z');

    const { plano } = await carregarPlanoDesfazer(fake.client, 'LOJA', entrada.loteId, AGORA);
    const r = await executarDesfazerLote(fake.client, plano, { lojaId: 'LOJA' });

    assert.equal(r.revertidos, 1);
    assert.equal(fake.tabelas.aparelhos[0].status, 'baixado');
    assert.equal(fake.tabelas.aparelhos[0].ativo, false);
  });

  it('quem mudou entre a prévia e o clique fica de fora', async () => {
    const fake = criarSupabaseFake({ aparelhos: [aparelho('a1')] });
    const baixaTotal = await aplicarMudancaEstoque(fake.client, {
      ids: ['a1'],
      patch: patchSaida('baixado', 'baixa_massa'),
      tipo: 'baixa',
      origem: 'deletar_estoque',
      lojaId: 'LOJA',
    });
    carimbar(fake.tabelas.movimentacoes_estoque, '2026-09-11T12:00:00Z');
    const { plano } = await carregarPlanoDesfazer(fake.client, 'LOJA', baixaTotal.loteId, AGORA);

    // Alguém muda o status direto no banco depois da prévia.
    fake.tabelas.aparelhos[0].status = 'vendido';

    const r = await executarDesfazerLote(fake.client, plano, { lojaId: 'LOJA' });
    assert.equal(r.revertidos, 0);
    assert.deepEqual(r.ignoradosNaHora, ['a1']);
    assert.equal(fake.tabelas.aparelhos[0].status, 'vendido');
  });
});
