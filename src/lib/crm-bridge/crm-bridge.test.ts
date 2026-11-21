import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { origemPermitidaCrm, segredoIgual } from './auth';
import { validarImeiLuhn } from './imei';
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

  it('valida allowlist de origens CORS do CRM Bridge', () => {
    assert.equal(origemPermitidaCrm('https://app.phonecenter.tech'), true);
    assert.equal(origemPermitidaCrm('https://crm.phonecenter.tech'), true);
    assert.equal(origemPermitidaCrm('https://loja1.crm.phonecenter.tech'), true);
    assert.equal(origemPermitidaCrm('http://localhost:3000'), true);

    assert.equal(origemPermitidaCrm('https://evil.com'), false);
    assert.equal(origemPermitidaCrm('https://crm.phonecenter.tech.evil.com'), false);
    assert.equal(origemPermitidaCrm(null), false);
    assert.equal(origemPermitidaCrm(''), false);
  });

  it('valida IMEI de 15 dígitos via algoritmo Luhn GSMA', () => {
    const ok = validarImeiLuhn('490154203237518');
    assert.equal(ok.valido, true);
    assert.equal(ok.limpo, '490154203237518');

    const formatado = validarImeiLuhn('490154-20-323751-8');
    assert.equal(formatado.valido, true);
    assert.equal(formatado.limpo, '490154203237518');

    const luhnInvalido = validarImeiLuhn('490154203237519');
    assert.equal(luhnInvalido.valido, false);

    const repetido = validarImeiLuhn('111111111111111');
    assert.equal(repetido.valido, false);

    const curto = validarImeiLuhn('4901542032');
    assert.equal(curto.valido, false);
  });
});
