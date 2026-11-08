import test from 'node:test';
import assert from 'node:assert/strict';
import { gerarReciboPdfBuffer } from './gerarReciboPdf';

test('gerarReciboPdfBuffer gera buffer PDF válido contendo cabeçalho e dados de venda', async () => {
  const buffer = await gerarReciboPdfBuffer({
    vendaId: 'e889e8da-b19d-4289-a4a2-bac8955d06e6',
    codigoVenda: '5D06E6',
    dataEmissao: '07/11/2026 16:30',
    loja: {
      nome: 'Lucas Imports',
      cnpj: '12.345.678/0001-90',
      telefone: '31999998888',
      cidade: 'Betim - MG',
    },
    cliente: {
      nome: 'Marlon Vitor da Rocha',
      cpf: '073.647.106-55',
      telefone: '31988887777',
      endereco: 'Rua Principal, 100 - Centro',
    },
    aparelho: {
      modelo: 'POCO F8 Pro',
      capacidade: '512GB',
      cor: 'Preto',
      imei: '868972083436361',
      condicao: 'Novo / Lacrado',
      valor: 4999.99,
    },
    upgrade: {
      ativo: false,
    },
    pagamento: {
      forma: 'cartao_credito',
      valorTotal: 4999.99,
      valorFinal: 4999.99,
    },
    diasGarantia: 90,
    vendedor: 'Lucas',
    linkRecibo: 'https://phonecenter.tech/recibo/e889e8da-b19d-4289-a4a2-bac8955d06e6',
  });

  assert.ok(buffer);
  assert.ok(buffer.length > 1000);
  // Confere assinatura padrão de PDF: %PDF- (hex 25 50 44 46)
  assert.equal(buffer.slice(0, 4).toString(), '%PDF');
});

test('gerarReciboPdfBuffer funciona com upgrade/trade-in', async () => {
  const buffer = await gerarReciboPdfBuffer({
    vendaId: '12345678-b19d-4289-a4a2-bac8955d06e6',
    codigoVenda: '5D06E7',
    loja: { nome: 'Phone Center' },
    cliente: { nome: 'Carlos Andrade' },
    aparelho: { modelo: 'iPhone 16 Pro', valor: 6500 },
    upgrade: {
      ativo: true,
      modelo: 'iPhone 13',
      imei: '350015753668064',
      valor: 2000,
    },
    pagamento: {
      forma: 'pix',
      valorTotal: 6500,
      valorEntrada: 2000,
      valorFinal: 4500,
    },
  });

  assert.ok(buffer);
  assert.ok(buffer.length > 1000);
  assert.equal(buffer.slice(0, 4).toString(), '%PDF');
});

test('gerarReciboPdfBuffer inclui logoUrl e assinaturaUrl em base64 da loja', async () => {
  // PNG 1x1 transparente válido em base64
  const png1x1 =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  const buffer = await gerarReciboPdfBuffer({
    vendaId: '99999999-b19d-4289-a4a2-bac8955d06e6',
    codigoVenda: '999999',
    loja: {
      nome: 'Lucas Imports',
      cnpj: '00.000.000/0000-00',
      telefone: '31994986029',
      endereco: 'Av Gov Valadares 851, Centro - Betim - MG',
      logoUrl: png1x1,
      assinaturaUrl: png1x1,
    },
    cliente: { nome: 'Luan Cássio' },
    aparelho: { modelo: 'iPhone 15 Pro', capacidade: '256GB', imei: '357627943412501', valor: 4800 },
    pagamento: {
      forma: 'cartao_credito',
      valorTotal: 4800,
      valorFinal: 4800,
    },
    diasGarantia: 180,
  });

  assert.ok(buffer);
  assert.ok(buffer.length > 1200);
  assert.equal(buffer.slice(0, 4).toString(), '%PDF');
});
