import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizarTextoWhatsApp } from './whatsappFormatting';

describe('whatsappFormatting - Sanitização e formatação para WhatsApp', () => {
  it('deve converter markdown duplo de IA para negrito único do WhatsApp', () => {
    const raw = 'O lojista **CL** possui um saldo de **R$ 21.400,00** em aberto.';
    const sanitized = sanitizarTextoWhatsApp(raw);
    assert.equal(sanitized, 'O lojista *CL* possui um saldo de *R$ 21.400,00* em aberto.');
  });

  it('deve limpar asteriscos triplos', () => {
    const raw = '***Total a pagar:*** R$ 500,00';
    const sanitized = sanitizarTextoWhatsApp(raw);
    assert.equal(sanitized, '*Total a pagar:* R$ 500,00');
  });

  it('deve corrigir espacos adjacentes que quebram o negrito no WhatsApp', () => {
    const raw = '📋 *EXTRATO DE CONTA - LUCAS IMPORTS *';
    const sanitized = sanitizarTextoWhatsApp(raw);
    assert.equal(sanitized, '📋 *EXTRATO DE CONTA - LUCAS IMPORTS*');
  });

  it('deve desaninhar asteriscos em marcadores', () => {
    const raw = '*• *CL:* R$ 21.400,00*';
    const sanitized = sanitizarTextoWhatsApp(raw);
    assert.ok(!sanitized.includes('*• *'));
    assert.ok(sanitized.includes('• *CL:*'));
  });

  it('deve reduzir quebras de linha excessivas', () => {
    const raw = 'Linha 1\n\n\n\n\nLinha 2';
    const sanitized = sanitizarTextoWhatsApp(raw);
    assert.equal(sanitized, 'Linha 1\n\nLinha 2');
  });
});
