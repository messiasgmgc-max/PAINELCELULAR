import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  filtroTextoLogs,
  intervaloDoPeriodo,
  lerFiltrosLogs,
  montarConsultaLogs,
  offsetSeguro,
  separarPagina,
  termoParaIlike,
} from './filtros';

describe('Período dos logs', () => {
  const agora = new Date('2026-09-11T12:00:00Z');

  it('chips viram início relativo; todos não filtra', () => {
    assert.deepEqual(intervaloDoPeriodo('hoje', {}, agora), { inicio: '2026-09-10T12:00:00.000Z', fim: null });
    assert.equal(intervaloDoPeriodo('7dias', {}, agora).inicio, '2026-09-04T12:00:00.000Z');
    assert.equal(intervaloDoPeriodo('30dias', {}, agora).inicio, '2026-08-12T12:00:00.000Z');
    assert.deepEqual(intervaloDoPeriodo('todos', {}, agora), { inicio: null, fim: null });
  });

  it('período escolhido ignora datas inválidas', () => {
    const i = intervaloDoPeriodo('personalizado', { inicio: '2026-09-01', fim: 'ontem' }, agora);
    assert.ok(i.inicio);
    assert.equal(i.fim, null);
  });
});

describe('Filtros vindos da URL', () => {
  it('quem não é administrador fica preso à própria loja', () => {
    const params = new URLSearchParams({ lojaId: 'outra-loja', tipo: 'Venda', usuario: 'Ana@Loja.com', termo: ' 3580 ', offset: '50' });
    const f = lerFiltrosLogs(params, { lojaId: 'minha-loja', superAdmin: false });
    assert.equal(f.lojaId, 'minha-loja');
    assert.equal(f.tipo, 'venda');
    assert.equal(f.usuario, 'ana@loja.com');
    assert.equal(f.termo, '3580');
    assert.equal(f.offset, 50);
    assert.equal(f.limite, 50);
  });

  it('administrador escolhe a loja; "todas" ou vazio é visão global', () => {
    assert.equal(lerFiltrosLogs(new URLSearchParams({ lojaId: 'x' }), { lojaId: null, superAdmin: true }).lojaId, 'x');
    assert.equal(lerFiltrosLogs(new URLSearchParams({ lojaId: 'todas' }), { lojaId: 'y', superAdmin: true }).lojaId, null);
    assert.equal(lerFiltrosLogs(new URLSearchParams(), { lojaId: 'y', superAdmin: true }).lojaId, null);
  });

  it('datas inválidas e offset estranho não passam', () => {
    const f = lerFiltrosLogs(new URLSearchParams({ inicio: 'x', fim: '2026-09-01T00:00:00Z', offset: '-3' }), { lojaId: 'l', superAdmin: false });
    assert.equal(f.inicio, null);
    assert.equal(f.fim, '2026-09-01T00:00:00.000Z');
    assert.equal(f.offset, 0);
    assert.equal(offsetSeguro('abc'), 0);
    assert.equal(offsetSeguro(10_000_000), 100_000);
  });
});

describe('Busca de texto segura para o PostgREST', () => {
  it('remove vírgula, parênteses, aspas e curingas', () => {
    assert.equal(termoParaIlike(' a,b(c)"d\'e%f_g '), '%a b c d e f g%');
    assert.equal(termoParaIlike(' , '), null);
  });

  it('monta o or() nas quatro colunas', () => {
    assert.equal(filtroTextoLogs('imei 358'), 'acao.ilike.%imei 358%,detalhes.ilike.%imei 358%,usuario_email.ilike.%imei 358%,usuario_nome.ilike.%imei 358%');
    assert.equal(filtroTextoLogs(null), null);
  });
});

describe('Paginação', () => {
  it('a linha extra indica que há mais', () => {
    const r = separarPagina([1, 2, 3], 2, 10);
    assert.deepEqual(r, { itens: [1, 2], temMais: true, proximoOffset: 12 });
    assert.equal(separarPagina([1], 2, 0).temMais, false);
  });

  it('querystring só leva o que foi preenchido', () => {
    const q = montarConsultaLogs({ lojaId: 'todas', tipo: 'todos', usuario: ' ', termo: 'x', intervalo: { inicio: 'i', fim: null }, offset: 0 });
    assert.equal(q.toString(), 'termo=x&inicio=i');
  });
});
