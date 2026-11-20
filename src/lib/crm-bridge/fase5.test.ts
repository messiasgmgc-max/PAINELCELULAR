import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extrairReferralAnuncio,
  formatarResumoPropostaCurto,
  gerarProtocoloProposta,
  gerarTokenPublicoProposta,
  montarUrlPublicaProposta,
} from './fase5';

describe('CRM Bridge — Fase 5 (Propostas & Leads CTWA)', () => {
  it('gera protocolo #PROP-XXXX e token URL-safe', () => {
    assert.match(gerarProtocoloProposta(), /^#PROP-\d{4}$/);
    const tok = gerarTokenPublicoProposta();
    assert.ok(tok.length >= 16);
    assert.equal(
      montarUrlPublicaProposta(tok, 'https://app.phonecenter.tech/'),
      `https://app.phonecenter.tech/proposta/${tok}`
    );
  });

  it('extrai referral Click-to-WhatsApp de payload Meta/Evolution', () => {
    const ref = extrairReferralAnuncio({
      referral: {
        source_type: 'ad',
        source_id: '1202199999',
        source_url: 'https://www.instagram.com/p/abc',
        headline: 'iPhone 16 Pro em 18x',
        body: 'Aceitamos seu usado na troca',
        ctwa_clid: 'CTWA_XYZ_999',
      },
    });
    assert.ok(ref);
    assert.equal(ref.origem, 'instagram_ad');
    assert.equal(ref.sourceId, '1202199999');
    assert.equal(ref.ctwaClid, 'CTWA_XYZ_999');
    assert.equal(ref.adHeadline, 'iPhone 16 Pro em 18x');
  });

  it('extrai atribuição via UTMs quando não há objeto referral', () => {
    const ref = extrairReferralAnuncio({
      conversation: {
        additional_attributes: {
          utm_source: 'google_ads',
          utm_campaign: 'iphone-seminovo-bh',
        },
      },
    });
    assert.ok(ref);
    assert.equal(ref.origem, 'google_ads');
    assert.equal(ref.campaignName, 'iphone-seminovo-bh');
  });

  it('retorna null quando payload não tem referral nem UTM', () => {
    assert.equal(extrairReferralAnuncio({ event: 'message_created' }), null);
  });

  it('formata resumo curto da proposta', () => {
    const s = formatarResumoPropostaCurto({
      protocolo: '#PROP-4421',
      modelo_novo: 'iPhone 15 Pro 256GB',
      saldo_financiar: 3500,
      status: 'enviada',
    });
    assert.match(s, /#PROP-4421/);
    assert.match(s, /iPhone 15 Pro 256GB/);
    assert.match(s, /enviada/);
  });
});
