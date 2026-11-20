import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { segredoIgual } from './auth';
import {
  calcularTabelaParcelamento,
  formatarItemEstoqueWhatsapp,
  sufixoTelefoneComparacao,
} from './queries';

describe('CRM Bridge — Auth & Utilitários', () => {
  it('valida segredos com timing-safe equality', () => {
    assert.equal(segredoIgual('abc12345', 'abc12345'), true);
    assert.equal(segredoIgual('abc12345', 'abc12346'), false);
    assert.equal(segredoIgual('', 'abc12345'), false);
    assert.equal(segredoIgual('curto', 'muito-mais-longo'), false);
  });

  it('normaliza telefone brasileiro/internacional para os últimos 8 dígitos', () => {
    assert.equal(sufixoTelefoneComparacao('+55 (31) 99876-5432'), '98765432');
    assert.equal(sufixoTelefoneComparacao('3198765432'), '98765432');
    assert.equal(sufixoTelefoneComparacao(''), '');
  });

  it('calcula parcelamento com repasse de taxa da maquininha', () => {
    const tabela = calcularTabelaParcelamento(1000, [
      { parcelas: 1, porcentagem: 0 },
      { parcelas: 10, porcentagem: 10 },
    ]);
    assert.equal(tabela.length, 2);
    assert.equal(tabela[0].totalComTaxa, 1000);
    assert.equal(tabela[1].parcelas, 10);
    assert.equal(tabela[1].totalComTaxa, 1111.11);
    assert.equal(tabela[1].valorParcela, 111.11);
  });

  it('formata mensagem de estoque pronta para WhatsApp', () => {
    const txt = formatarItemEstoqueWhatsapp(
      {
        id: '1',
        codigo: 'IP16-01',
        marca: 'Apple',
        modelo: 'iPhone 16 Pro Max',
        capacidade: '256GB',
        cor: 'Titânio Natural',
        condicao: 'seminovo',
        saudeBateria: '98%',
        preco: 7290,
        precoAtacado: null,
        quantidade: 1,
        categoria: 'aparelho',
        observacoes: '',
        imeiFinal: '••••1234',
      },
      'PhoneCenter'
    );
    assert.match(txt, /iPhone 16 Pro Max/);
    assert.match(txt, /256GB • Titânio Natural/);
    assert.match(txt, /98%/);
    assert.match(txt, /PhoneCenter/);
  });
});
