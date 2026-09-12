import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classificarBusca,
  filtroBuscaAuditoria,
  formatarValorAuditoria,
  listarMudancas,
  montarLinhaDoTempo,
  rotuloOrigem,
  tituloDoRegistro,
  type LinhaAuditoria,
} from './linhaDoTempo';

describe('Classificação da busca', () => {
  it('IMEI com ou sem separadores, id de registro e texto', () => {
    assert.deepEqual(classificarBusca(' 358012 345678 901 '), { tipo: 'imei', valor: '358012345678901' });
    assert.deepEqual(classificarBusca('2D2E56A8-CB8E-4E0A-9548-5C520CF5EED2'), { tipo: 'registro', valor: '2d2e56a8-cb8e-4e0a-9548-5c520cf5eed2' });
    assert.deepEqual(classificarBusca('Maria'), { tipo: 'texto', valor: 'Maria' });
    assert.deepEqual(classificarBusca('  '), { tipo: 'vazia', valor: '' });
  });

  it('filtro do PostgREST por tipo', () => {
    assert.equal(
      filtroBuscaAuditoria({ tipo: 'imei', valor: '358012345678901' }),
      'depois->>imei.eq.358012345678901,antes->>imei.eq.358012345678901,depois->>numeroSerie.eq.358012345678901'
    );
    assert.equal(filtroBuscaAuditoria({ tipo: 'registro', valor: 'abc' }), 'registro_id.eq.abc');
    assert.match(filtroBuscaAuditoria({ tipo: 'texto', valor: 'Ma,ria' })!, /depois->>nome\.ilike\.%Ma ria%/);
    assert.equal(filtroBuscaAuditoria({ tipo: 'texto', valor: ',' }), null);
    assert.equal(filtroBuscaAuditoria({ tipo: 'vazia', valor: '' }), null);
  });
});

describe('Mudanças de um evento', () => {
  it('UPDATE mostra só os campos alterados, sem updated_at', () => {
    const mudancas = listarMudancas({
      operacao: 'UPDATE',
      antes: { preco: 4000, status: 'disponivel', updated_at: '2026-01-01T00:00:00Z', cor: 'Preto' },
      depois: { preco: 4200.5, status: 'vendido', updated_at: '2026-02-01T00:00:00Z', cor: 'Preto' },
      campos_alterados: ['status', 'preco', 'updated_at'],
    });
    assert.deepEqual(mudancas, [
      { campo: 'preco', antes: '4000', depois: '4200,50' },
      { campo: 'status', antes: 'disponivel', depois: 'vendido' },
    ]);
  });

  it('sem campos_alterados compara antes e depois', () => {
    const mudancas = listarMudancas({ operacao: 'UPDATE', antes: { a: 1, b: [1] }, depois: { a: 1, b: [1, 2] }, campos_alterados: null });
    assert.deepEqual(mudancas, [{ campo: 'b', antes: '1 item(ns)', depois: '2 item(ns)' }]);
  });

  it('INSERT lista o que foi preenchido; DELETE o que existia', () => {
    assert.deepEqual(listarMudancas({ operacao: 'INSERT', antes: null, depois: { nome: 'Ana', cpf: null, ativo: true }, campos_alterados: null }), [
      { campo: 'ativo', antes: '—', depois: 'sim' },
      { campo: 'nome', antes: '—', depois: 'Ana' },
    ]);
    assert.deepEqual(listarMudancas({ operacao: 'DELETE', antes: { nome: 'Ana' }, depois: null, campos_alterados: null }), [
      { campo: 'nome', antes: 'Ana', depois: '—' },
    ]);
  });

  it('formata datas, números e textos longos', () => {
    assert.equal(formatarValorAuditoria(null), '—');
    assert.equal(formatarValorAuditoria(false), 'não');
    assert.equal(formatarValorAuditoria('x'.repeat(130)).length, 120);
    assert.match(formatarValorAuditoria('2026-09-10T12:00:00Z'), /2026/);
    assert.equal(formatarValorAuditoria({ a: 1 }), '{"a":1}');
  });
});

describe('Título e linha do tempo', () => {
  it('descreve o registro por tabela', () => {
    assert.equal(tituloDoRegistro('aparelhos', { marca: 'Apple', modelo: 'iPhone 13', capacidade: '128GB', imei: '358012345678901' }), 'Apple iPhone 13 128GB · IMEI 358012345678901');
    assert.equal(tituloDoRegistro('vendas', { valor: 4400, clienteNome: 'Maria' }), 'Venda R$ 4.400,00 — Maria');
    assert.equal(tituloDoRegistro('ordens_servico', { numeroOS: 7, clienteNome: 'João' }), 'OS #7 — João');
    assert.equal(tituloDoRegistro('clientes', null), 'Cliente');
  });

  it('ordena do mais recente para o mais antigo e identifica quem e de onde', () => {
    const base: Omit<LinhaAuditoria, 'id' | 'criado_em'> = {
      loja_id: 'l', tabela: 'aparelhos', registro_id: 'r', operacao: 'UPDATE',
      antes: { status: 'disponivel' }, depois: { status: 'vendido' }, campos_alterados: ['status'],
      usuario_id: null, usuario_email: null, origem: 'servidor', lote_id: 'lote-1',
    };
    const eventos = montarLinhaDoTempo([
      { ...base, id: 1, criado_em: '2026-09-01T10:00:00Z' },
      { ...base, id: 3, criado_em: '2026-09-02T10:00:00Z', usuario_email: 'ana@loja.com', origem: 'web' },
      { ...base, id: 2, criado_em: '2026-09-02T10:00:00Z' },
    ]);
    assert.deepEqual(eventos.map((e) => e.id), ['3', '2', '1']);
    assert.equal(eventos[0].quem, 'ana@loja.com');
    assert.equal(eventos[0].origem, 'Painel (navegador)');
    assert.equal(eventos[1].quem, 'Sistema');
    assert.equal(eventos[0].operacaoRotulo, 'Alterado');
    assert.equal(eventos[0].loteId, 'lote-1');
  });

  it('origem desconhecida aparece como veio', () => {
    assert.equal(rotuloOrigem('bot'), 'Bot do WhatsApp');
    assert.equal(rotuloOrigem('importacao_csv'), 'importacao_csv');
    assert.equal(rotuloOrigem(null), 'Não informada');
  });
});
