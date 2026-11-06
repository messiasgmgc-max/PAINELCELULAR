import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizarECompletarVendaParsed, normalizarNomeModelo, extrairCorDeTexto } from './parseVendaTexto';

describe('Parsing e Sanitização de Venda com IA e Regex', () => {
  it('normaliza nomes de modelos Apple sem prefixo', () => {
    assert.equal(normalizarNomeModelo('17 pro max'), 'iPhone 17 pro max');
    assert.equal(normalizarNomeModelo('16'), 'iPhone 16');
    assert.equal(normalizarNomeModelo('iPhone 15 Pro'), 'iPhone 15 Pro');
    assert.equal(normalizarNomeModelo('Galaxy S24 Ultra'), 'Galaxy S24 Ultra');
  });

  it('processa corretamente formulário de atendimento com Upgrade em checkbox (X)', () => {
    const textoFormulario = `Para finalizar seu pedido, preencha os dados abaixo 👇

Data da compra:

👤 DADOS PESSOAIS
•⁠  ⁠Nome completo:  Lucas Alves de Andrade 
•⁠  ⁠CPF:  14180644673
•⁠  ⁠Data de nascimento:  22011999
•⁠  ⁠Telefone / WhatsApp:  31 999096222
•⁠  ⁠E-mail:  alveiraslucas@gmail.clm

🏠 ENDEREÇO PARA ENTREGA
•⁠  ⁠Rua / Avenida:  Antônio Alves de Oliveira
•⁠  ⁠Número:  365
•⁠  ⁠Complemento:  Casa
•⁠  ⁠Bairro:  Brasileia 
•⁠  ⁠Cidade:  Betim 
•⁠  ⁠CEP:  32600334

💳 FORMA DE PAGAMENTO
Valor total: 4.776,77
Forma de pagamento:
( ) Pix  
(X) Cartão de crédito  
( ) Cartão de débito  
( ) Dinheiro  
(X) Upgrade - Modelo: iPhone 16
( ) Outro: __

Modelo: 17 pro Max 256gb azul  lacrado imei 350015753668064`;

    // Mesmo se a IA Groq retornar sem upgrade (simulando falha da IA)
    const simulacaoRespostaIAFalha = {
      cliente: {
        nome: 'Lucas Alves de Andrade',
        cpf: '14180644673',
        telefone: '31 999096222',
        email: 'alveiraslucas@gmail.clm',
      },
      aparelho: {
        modelo: '17 pro Max',
        capacidade: '256GB',
        cor: 'Azul',
        condicao: 'novo',
        imei: '350015753668064',
      },
      isUpgrade: false,
      tradeIn: null,
      formaPagamento: 'cartao_credito',
      valorTotal: 4776.77,
    };

    const final = sanitizarECompletarVendaParsed(simulacaoRespostaIAFalha as any, textoFormulario);

    // 1. Upgrade deve ser ativado com modelo iPhone 16 e marca Apple
    assert.equal(final.isUpgrade, true);
    assert.ok(final.tradeIn, 'tradeIn deve existir');
    assert.equal(final.tradeIn?.modelo, 'iPhone 16');
    assert.equal(final.tradeIn?.marca, 'Apple');

    // 2. Aparelho vendido deve ser iPhone 17 Pro Max
    assert.ok(final.aparelho.modelo?.toLowerCase().includes('17 pro max'));
    assert.equal(final.aparelho.marca, 'Apple');
    assert.equal(final.aparelho.capacidade, '256GB');
    assert.equal(final.aparelho.cor, 'Azul');
    assert.equal(final.aparelho.condicao, 'novo');
    assert.equal(final.aparelho.imei, '350015753668064');

    // 3. Pagamento e valores
    assert.equal(final.formaPagamento, 'cartao_credito');
    assert.equal(final.valorVolta, 4776.77);
    assert.equal(final.pagamentos?.[0]?.metodo, 'cartao_credito');
    assert.equal(final.pagamentos?.[0]?.valor, 4776.77);

    // 4. Dados do cliente
    assert.equal(final.cliente.nome, 'Lucas Alves de Andrade');
    assert.equal(final.cliente.email, 'alveiraslucas@gmail.clm');
    assert.equal(final.cliente.dataNascimento, '22/01/1999');
  });

  it('funciona puramente com fallback de regex sem retorno da IA', () => {
    const textoFormulario = `💳 FORMA DE PAGAMENTO
Valor total: 3.500,00
Forma de pagamento:
(X) Pix  
( ) Cartão de crédito  
(X) Upgrade - Modelo: 13 Pro 128GB

Modelo: 15 Pro 128gb titânio lacrado imei 350015753668099`;

    const final = sanitizarECompletarVendaParsed(null, textoFormulario);

    assert.equal(final.isUpgrade, true);
    assert.ok(final.tradeIn);
    assert.ok(final.tradeIn?.modelo?.toLowerCase().includes('13 pro'));
    assert.equal(final.tradeIn?.marca, 'Apple');
    assert.equal(final.formaPagamento, 'pix');
    assert.equal(final.valorVolta, 3500);
    assert.ok(final.aparelho.modelo?.toLowerCase().includes('15 pro'));
    assert.equal(final.aparelho.capacidade, '128GB');
    assert.equal(final.aparelho.imei, '350015753668099');
    assert.equal(final.aparelho.condicao, 'novo');
  });

  it('reconhece cores a partir de emojis e termos especiais', () => {
    assert.equal(extrairCorDeTexto('🖤'), 'Preto');
    assert.equal(extrairCorDeTexto('🤍'), 'Branco');
    assert.equal(extrairCorDeTexto('🏜️'), 'Desert');
    assert.equal(extrairCorDeTexto('🏜'), 'Desert');
    assert.equal(extrairCorDeTexto('🔘'), 'Titânio Natural');
    assert.equal(extrairCorDeTexto('🩶'), 'Titânio Natural');
    assert.equal(extrairCorDeTexto('💙'), 'Azul');
    assert.equal(extrairCorDeTexto('💛'), 'Dourado');
    assert.equal(extrairCorDeTexto('🩷'), 'Rosa');
    assert.equal(extrairCorDeTexto('❤️'), 'Vermelho');
    assert.equal(extrairCorDeTexto('❤'), 'Vermelho');
    assert.equal(extrairCorDeTexto('titânio deserto'), 'Desert');
    assert.equal(extrairCorDeTexto('desert titanium'), 'Desert');
    assert.equal(extrairCorDeTexto('natural titanium'), 'Titânio Natural');
  });

  it('reconhece IMEI de 4 dígitos (final do IMEI) e cor por emoji no formulário de pedido', () => {
    const textoPedido = `👤 DADOS PESSOAIS
Nome: Guilherme Messias
Telefone: 31993586377

💳 FORMA DE PAGAMENTO
Valor total: 5.200,00
Pix

Modelo: iPhone 16 Pro 256gb 🏜️
Cor: 🏜️
Final do IMEI: 4567`;

    const final = sanitizarECompletarVendaParsed(null, textoPedido);

    assert.ok(final.aparelho.modelo?.toLowerCase().includes('16 pro'));
    assert.equal(final.aparelho.capacidade, '256GB');
    assert.equal(final.aparelho.cor, 'Desert');
    assert.equal(final.aparelho.imei, '4567');
    assert.equal(final.valorTotal, 5200);
    assert.equal(final.cliente.nome, 'Guilherme Messias');
  });
});
