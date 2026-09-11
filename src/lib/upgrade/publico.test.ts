import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { idValido, LIMITE_FOTOS, montarAvaliacaoPublica, montarVistoriaPublica } from './publico';

const LOJA = '9ede0ad5-733b-44b7-b303-bf640df12a60';
const agora = new Date('2026-09-10T12:00:00Z');

describe('Upgrade público', () => {
  it('só aceita id completo de loja', () => {
    assert.ok(idValido(LOJA));
    assert.ok(!idValido('abc'));
    assert.ok(!idValido(undefined));
  });

  it('avaliação entra pendente, na loja do link, sem campos extras', () => {
    const r = montarAvaliacaoPublica(LOJA, {
      loja_id: 'outra-loja',
      cliente_nome: '  Ana ',
      modelo: 'iPhone 13',
      bateria_saude: 140,
      valor_avaliado: '2500',
      valor_aprovado: 99999,
      status: 'aprovado',
      venda_id: LOJA,
      origem: 'painel',
    }, agora);
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal(r.registro.loja_id, LOJA);
    assert.equal(r.registro.cliente_nome, 'Ana');
    assert.equal(r.registro.status, 'pendente');
    assert.equal(r.registro.origem, 'web_publico');
    assert.equal(r.registro.bateria_saude, 100);
    assert.equal(r.registro.valor_avaliado, 2500);
    assert.equal(r.registro.valor_aprovado, 2500);
    assert.equal('venda_id' in r.registro, false);
  });

  it('avaliação sem nome ou modelo é recusada', () => {
    assert.deepEqual(montarAvaliacaoPublica(LOJA, { modelo: 'iPhone 13' }), { ok: false, erro: 'Informe seu nome.' });
    assert.equal(montarAvaliacaoPublica(LOJA, null).ok, false);
  });

  it('vistoria aceita fotos em data URL e recusa o resto', () => {
    const base = { cliente_nome: 'Ana', modelo: 'iPhone 13', imei: '35-123456-789012-3', motoboy_id: 'x' };
    const ok = montarVistoriaPublica(LOJA, { ...base, fotos: ['data:image/jpeg;base64,AAA'], status_coleta: 'entregue' }, agora);
    assert.ok(ok.ok);
    if (ok.ok) {
      assert.equal(ok.registro.status_coleta, 'coletado');
      assert.equal(ok.registro.imei, '351234567890123');
      assert.equal(ok.registro.motoboy_id, null);
    }
    assert.equal(montarVistoriaPublica(LOJA, { ...base, fotos: ['https://site/foto.jpg'] }).ok, false);
    assert.equal(montarVistoriaPublica(LOJA, { ...base, fotos: Array(LIMITE_FOTOS + 1).fill('data:image/png;base64,A') }).ok, false);
    assert.equal(montarVistoriaPublica(LOJA, { ...base, assinatura_cliente: 'javascript:alert(1)' }).ok, false);
  });
});
