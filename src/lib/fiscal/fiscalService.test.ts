import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mapearFormaPagamentoSEFAZ, apenasNumeros, montarPayloadNFCe, montarPayloadNFe } from './fiscalService';
import { FocusNFeClient } from './focusNfeClient';
import { DadosFiscaisLoja } from './types';

const mockDadosFiscais: DadosFiscaisLoja = {
  ativo: true,
  ambiente: 'homologacao',
  cnpj: '12.345.678/0001-90',
  inscricao_estadual: '123456789',
  razao_social: 'Phone Center Telecom Comercio LTDA',
  nome_fantasia: 'Phone Center',
  regime_tributario: '1',
  id_csc: '000001',
  csc: 'ABCDEF123456',
  serie_nfce: '1',
  numero_nfce_atual: 10,
  serie_nfe: '1',
  numero_nfe_atual: 5,
  cfop_padrao_nfce: '5102',
  cfop_padrao_nfe: '5102',
  ncm_padrao_smartphones: '8517.13.00',
  ncm_padrao_acessorios: '8517.79.00',
  emitir_automatico_pdv: true,
  enviar_danfe_email_cliente: true
};

describe('Módulo Fiscal - Regras e Formatação', () => {
  it('deve limpar caracteres não numéricos corretamente', () => {
    assert.equal(apenasNumeros('12.345.678/0001-90'), '12345678000190');
    assert.equal(apenasNumeros('(11) 98765-4321'), '11987654321');
    assert.equal(apenasNumeros('8517.13.00'), '85171300');
  });

  it('deve mapear métodos de pagamento do Phone Center para códigos da SEFAZ', () => {
    assert.equal(mapearFormaPagamentoSEFAZ('pix'), '17');
    assert.equal(mapearFormaPagamentoSEFAZ('dinheiro'), '01');
    assert.equal(mapearFormaPagamentoSEFAZ('cartao_credito'), '03');
    assert.equal(mapearFormaPagamentoSEFAZ('cartao_debito'), '04');
    assert.equal(mapearFormaPagamentoSEFAZ('debito'), '04');
    assert.equal(mapearFormaPagamentoSEFAZ('boleto'), '15');
    assert.equal(mapearFormaPagamentoSEFAZ('fiado'), '05');
    assert.equal(mapearFormaPagamentoSEFAZ('trade_in'), '99');
    assert.equal(mapearFormaPagamentoSEFAZ('desconhecido'), '99');
  });

  it('deve montar payload de NFC-e (modelo 65) com cálculo de itens, NCM e pagamentos', () => {
    const venda = {
      id: 'venda-123',
      valor: 4500,
      itens: [
        {
          aparelhoId: 'ap-1',
          descricao: 'iPhone 13 128GB Azul',
          quantidade: 1,
          valorExibir: 4200,
          desconto: 100
        },
        {
          id: 'peca-2',
          descricao: 'Capa Anti-Impacto Transparente',
          quantidade: 2,
          valorExibir: 200,
          desconto: 0
        }
      ],
      pagamentos: [
        { metodo: 'pix', valor: 4000 },
        { metodo: 'cartao_credito', valor: 500 }
      ]
    };

    const cliente = {
      nome: 'Carlos Eduardo da Silva',
      cpf: '123.456.789-00',
      email: 'carlos@exemplo.com'
    };

    const payload = montarPayloadNFCe(venda, cliente, mockDadosFiscais);

    assert.equal(payload.natureza_operacao, 'VENDA AO CONSUMIDOR');
    assert.equal(payload.tipo_documento, 1);
    assert.equal(payload.cnpj_emitente, '12345678000190');
    assert.equal(payload.cpf_destinatario, '12345678900');
    assert.equal(payload.nome_destinatario, 'Carlos Eduardo da Silva');
    assert.equal(payload.email_destinatario, 'carlos@exemplo.com');

    // Itens
    assert.equal(payload.itens.length, 2);
    // Smartphone NCM
    assert.equal(payload.itens[0].codigo_ncm, '85171300');
    assert.equal(payload.itens[0].valor_unitario_comercial, '4200.00');
    assert.equal(payload.itens[0].valor_desconto, '100.00');
    assert.equal(payload.itens[0].icms_situacao_tributaria, '102');

    // Acessório NCM
    assert.equal(payload.itens[1].codigo_ncm, '85177900');
    assert.equal(payload.itens[1].quantidade_comercial, 2);

    // Formas de Pagamento
    assert.equal(payload.formas_pagamento.length, 2);
    assert.equal(payload.formas_pagamento[0].forma_pagamento, '17'); // Pix
    assert.equal(payload.formas_pagamento[0].valor_pagamento, '4000.00');
    assert.equal(payload.formas_pagamento[1].forma_pagamento, '03'); // Cartão
    assert.equal(payload.formas_pagamento[1].valor_pagamento, '500.00');
  });

  it('deve montar payload de NF-e (modelo 55 - Atacado/PJ) com dados completos de destinatário', () => {
    const venda = {
      id: 'venda-456',
      valor: 8000,
      itens: [
        {
          aparelhoId: 'ap-10',
          descricao: 'Lote 2x iPhone 12 64GB',
          quantidade: 2,
          valorExibir: 4000,
          desconto: 0
        }
      ],
      pagamentos: [
        { metodo: 'pix', valor: 8000 }
      ]
    };

    const clientePJ = {
      nome: 'Lojista SP Eletrônicos LTDA',
      cnpj: '98.765.432/0001-11',
      inscricao_estadual: '987654321',
      email: 'contato@lojistasp.com',
      endereco: {
        logradouro: 'Rua Santa Ifigênia',
        numero: '100',
        bairro: 'República',
        municipio: 'São Paulo',
        uf: 'SP',
        cep: '01207-000'
      }
    };

    const payload = montarPayloadNFe(venda, clientePJ, mockDadosFiscais);

    assert.equal(payload.natureza_operacao, 'VENDA DE MERCADORIAS');
    assert.equal(payload.cnpj_destinatario, '98765432000111');
    assert.equal(payload.inscricao_estadual_destinatario, '987654321');
    assert.equal(payload.consumidor_final, 0); // PJ
    assert.equal(payload.logradouro_destinatario, 'Rua Santa Ifigênia');
    assert.equal(payload.numero_destinatario, '100');
    assert.equal(payload.uf_destinatario, 'SP');
  });

  it('deve formatar URLs de DANFE e XML adequadamente no client Focus NFe', () => {
    const client = new FocusNFeClient('token-fake', 'homologacao');
    const danfeRelativo = '/arquivos/danfe_123.pdf';
    const danfeAbsoluto = 'https://s3.amazonaws.com/focusnfe/danfe.pdf';

    assert.equal(
      client.getDanfeUrl(danfeRelativo),
      'https://homologacao.focusnfe.com.br/v2/arquivos/danfe_123.pdf'
    );
    assert.equal(client.getDanfeUrl(danfeAbsoluto), danfeAbsoluto);
    assert.equal(client.getDanfeUrl(undefined), undefined);
  });
});
