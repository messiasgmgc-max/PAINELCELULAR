import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MENSAGEM_RECIBO_PADRAO,
  base64DoPdf,
  lerConfigReciboWhatsapp,
  montarMensagemRecibo,
  nomeArquivoRecibo,
  salvarConfigReciboWhatsapp,
} from './reciboWhatsapp';

describe('Recibo no WhatsApp', () => {
  it('começa desligado e com a mensagem padrão', () => {
    assert.deepEqual(lerConfigReciboWhatsapp(null), { ativo: false, mensagem: MENSAGEM_RECIBO_PADRAO });
    assert.deepEqual(lerConfigReciboWhatsapp({ recibo_whatsapp: { ativo: 'sim' } }), { ativo: false, mensagem: MENSAGEM_RECIBO_PADRAO });
  });

  it('salvar não apaga as outras configurações da loja', () => {
    const atual = { assinatura: { status: 'ativa' }, recibo_whatsapp: { ativo: false, mensagem: 'x' } };
    const nova = salvarConfigReciboWhatsapp(atual, { ativo: true, mensagem: '  Oi {cliente}  ' });
    assert.deepEqual(nova.assinatura, { status: 'ativa' });
    assert.deepEqual(lerConfigReciboWhatsapp(nova), { ativo: true, mensagem: 'Oi {cliente}' });
    assert.equal(lerConfigReciboWhatsapp(salvarConfigReciboWhatsapp(null, { ativo: true, mensagem: '' })).mensagem, MENSAGEM_RECIBO_PADRAO);
  });

  it('preenche as variáveis da mensagem', () => {
    const texto = montarMensagemRecibo('Oi {cliente}, compra #{venda} na {loja}: {aparelho} por {valor}. {outra}', {
      cliente: 'Laís Fernandes',
      loja: 'Lucas Imports',
      vendaId: 'bd1a4e8d-5a3e-4684-aab3-0d30b4106952',
      valor: 7700,
      aparelho: 'iPhone 17 Pro Max 256GB',
    });
    assert.equal(texto, 'Oi Laís, compra #106952 na Lucas Imports: iPhone 17 Pro Max 256GB por R$ 7.700,00. {outra}');
  });

  it('nome do arquivo e conteúdo do PDF', () => {
    assert.equal(nomeArquivoRecibo('e889e8da-b19d-4289-a4a2-bac8955d06e6'), 'Recibo-5D06E6.pdf');
    assert.equal(base64DoPdf('data:application/pdf;filename=generated.pdf;base64,JVBERi0xLjMK'), 'JVBERi0xLjMK');
    assert.equal(base64DoPdf('iVBORw0KGgo='), null);
    assert.equal(base64DoPdf('JVBER' + 'A'.repeat(20), 10), null);
    assert.equal(base64DoPdf(123), null);
  });
});
