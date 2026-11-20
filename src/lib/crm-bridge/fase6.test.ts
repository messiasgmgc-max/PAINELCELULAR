import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calcularCrc16Pix, gerarBrCodePix, gerarSlugLoja } from './fase6';

describe('CRM Bridge — Fase 6 (Pix EMV & Multi-Loja)', () => {
  it('gera BR Code Pix EMV válido com CRC16-CCITT conferido', () => {
    const code = gerarBrCodePix({
      chavePix: 'contato@phonecenter.tech',
      nomeRecebedor: 'PhoneCenter Imports',
      cidade: 'Belo Horizonte',
      valor: 250.5,
      txid: 'RES12345',
      descricao: 'Sinal iPhone 16 Pro',
    });

    assert.ok(code.startsWith('000201'));
    assert.ok(code.includes('br.gov.bcb.pix'));
    assert.ok(code.includes('5406250.50'));
    assert.ok(code.includes('5802BR'));

    // Valida integridade do CRC16 nos últimos 4 dígitos
    const semCrc = code.slice(0, -4);
    const crc = code.slice(-4);
    assert.equal(crc, calcularCrc16Pix(semCrc));
  });

  it('normaliza slug de loja para subdomínio multi-tenant seguro', () => {
    assert.equal(gerarSlugLoja('Lucas Imports 031 — BH!'), 'lucas-imports-031-bh');
    assert.equal(gerarSlugLoja('Águia Célulares & Tech'), 'aguia-celulares-tech');
  });
});
