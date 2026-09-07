import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { consolidarFiadoCompleto, formatarTextoExtrato } from './fiadoHelper';

describe('fiadoHelper - Consolidação Completa de Fiado (Vendas + Baixas de Estoque + Extrato)', () => {
  it('deve somar exatamente R$ 21.400,00 para o lojista CL com a venda de 4 aparelhos', () => {
    const devedoresCadastrados = [
      {
        nome: 'CL',
        saldo_devedor: 10750,
        telefone: '31971568409',
        whatsapp: '31971568409',
      },
    ];

    // 2 vendas registradas na tabela vendas
    const vendasBanco = [
      {
        id: 'venda-1',
        clienteNome: 'CL',
        valor: 7150,
        valorPago: 0,
        saldoDevedor: 7150,
        metodo: 'fiado',
        status: 'pendente',
        tipoEntrega: 'Atacado / Lojista',
        descricao: 'Venda ATACADO (Lote 1 itens) para CL',
        itens: [
          {
            aparelhoId: 'ap-1',
            descricao: 'Apple iPhone 17 Pro Max - 256GB 🔵 (ID: 78133991)',
            valorExibir: 7150,
          },
        ],
      },
      {
        id: 'venda-2',
        clienteNome: 'CL',
        valor: 3000,
        valorPago: 0,
        saldoDevedor: 3000,
        metodo: 'fiado',
        status: 'pendente',
        tipoEntrega: 'Atacado',
        descricao: 'Venda ATACADO - iPhone 14 Pro para CL',
        itens: [
          {
            aparelhoId: 'ap-2',
            descricao: 'Apple iPhone 14 Pro - 256GB ⚪️  Branco (IMEI/ID: 3679)',
            valorExibir: 3000,
          },
        ],
      },
    ];

    // 2 aparelhos vendidos em atacado a fiado via baixa de estoque
    const aparelhos = [
      {
        id: 'ap-3',
        modelo: 'iPhone 17 Pro Max',
        marca: 'Apple',
        cor: '⚪️',
        capacidade: '256GB',
        imei: '7591',
        preco: 300,
        observacoes: 'BAIXA_ESTOQUE:2026-09-07T01:26:50.490Z:Venda ATACADO para CL por R$ 7250.00 | Pgto: fiado | IMEI: 7591',
      },
      {
        id: 'ap-4',
        modelo: 'iPhone 15 Pro Max',
        marca: 'Apple',
        cor: '⚪️  Branco',
        capacidade: '256GB',
        imei: '8278',
        preco: 300,
        observacoes: 'BAIXA_ESTOQUE:2026-09-05T15:00:00.000Z:Venda ATACADO para CL por R$ 4000.00 | Pgto: fiado | IMEI: 8278',
      },
      // Aparelho que já está na venda 1 para garantir que não duplica
      {
        id: 'ap-1',
        modelo: 'iPhone 17 Pro Max',
        marca: 'Apple',
        observacoes: 'BAIXA_ESTOQUE:2026-09-05T15:00:00.000Z:Venda ATACADO para CL por R$ 7150.00 | Pgto: fiado',
      },
    ];

    const resultado = consolidarFiadoCompleto(
      devedoresCadastrados,
      vendasBanco,
      aparelhos,
      'Lucas Imports',
      '31999999999'
    );

    assert.equal(resultado.totalFiadoEmAberto, 21400);
    assert.equal(resultado.devedores.length, 1);

    const lojistaCL = resultado.devedores[0];
    assert.equal(lojistaCL.nome, 'CL');
    assert.equal(lojistaCL.saldo, 21400);
    assert.equal(lojistaCL.totalAparelhos, 4);

    const extratoTexto = formatarTextoExtrato(lojistaCL, 'Lucas Imports', '31999999999');
    assert.ok(extratoTexto.includes('Extrato - Lucas Imports'));
    assert.ok(extratoTexto.includes('21.400,00'));
    assert.ok(extratoTexto.includes('4 un'));
    assert.ok(extratoTexto.includes('iPhone 17 Pro Max'));
    assert.ok(extratoTexto.includes('iPhone 14 Pro'));
    assert.ok(extratoTexto.includes('iPhone 15 Pro Max'));
    assert.ok(extratoTexto.includes('7591'));
    assert.ok(extratoTexto.includes('8278'));
    assert.ok(extratoTexto.includes('31999999999'));
  });
});
