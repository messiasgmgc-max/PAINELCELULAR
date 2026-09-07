import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { consolidarFiadoLoja } from './fiadoHelper';

describe('fiadoHelper - Consolidação de Fiado & Devedores', () => {
  it('deve somar corretamente lojistas_devedores e vendas fiado pendentes da mesma pessoa (caso CL: 10750 + 10150 = 20900)', () => {
    const devedoresCadastrados = [
      {
        nome: 'CL',
        saldo_devedor: 10750,
        telefone: '31971568409',
        whatsapp: '31971568409',
      },
      {
        nome: 'GF',
        saldo_devedor: 0,
      },
    ];

    const vendasPendentes = [
      {
        clienteNome: 'CL',
        valor: 7150,
        valorPago: 0,
        saldoDevedor: 7150,
        metodo: 'fiado',
        status: 'pendente',
      },
      {
        clienteNome: 'CL',
        valor: 3000,
        valorPago: 0,
        saldoDevedor: 3000,
        metodo: 'fiado',
        status: 'pendente',
      },
      {
        clienteNome: 'Outro Cliente Pago',
        valor: 4400,
        valorPago: 4400,
        saldoDevedor: 0,
        metodo: 'pix',
        status: 'pago',
      },
    ];

    const resultado = consolidarFiadoLoja(devedoresCadastrados, vendasPendentes);

    assert.equal(resultado.totalFiadoEmAberto, 20900);
    assert.equal(resultado.devedores.length, 1);
    assert.equal(resultado.devedores[0].nome, 'CL');
    assert.equal(resultado.devedores[0].saldo, 20900);
    assert.equal(resultado.devedores[0].origem, 'ambos');
    assert.ok(resultado.detalhesDevedoresFormatado.includes('CL'));
    assert.ok(resultado.detalhesDevedoresFormatado.includes('20.900,00'));
  });

  it('deve incluir devedores que só constam em vendas fiado mas ainda não em lojistas_devedores', () => {
    const devedoresCadastrados: any[] = [];
    const vendasPendentes = [
      {
        clienteNome: 'Novo Lojista X',
        valor: 5000,
        valorPago: 2000,
        saldoDevedor: 3000,
        metodo: 'fiado',
        status: 'parcial',
      },
    ];

    const resultado = consolidarFiadoLoja(devedoresCadastrados, vendasPendentes);

    assert.equal(resultado.totalFiadoEmAberto, 3000);
    assert.equal(resultado.devedores.length, 1);
    assert.equal(resultado.devedores[0].nome, 'Novo Lojista X');
    assert.equal(resultado.devedores[0].saldo, 3000);
    assert.equal(resultado.devedores[0].origem, 'venda_fiado');
  });

  it('deve retornar 0 quando não houver débitos pendentes', () => {
    const resultado = consolidarFiadoLoja([], []);
    assert.equal(resultado.totalFiadoEmAberto, 0);
    assert.equal(resultado.devedores.length, 0);
  });
});
