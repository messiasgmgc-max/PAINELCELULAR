import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectarFormularioOuPedidoVenda,
  formatarMensagemPreviaNotinha,
  interpretarReacaoNotinha,
  interpretarTextoCorrecaoVenda,
  cruzarAparelhoComEstoque,
  limparNomeModelo,
  modelosSaoCompativeis,
  type PropostaNotinha,
} from './notinhaAutomatica';

test('detectarFormularioOuPedidoVenda identifica formulário completo da Lucas Imports', () => {
  const texto = `Para finalizar seu pedido, preencha os dados abaixo 👇

Data da compra: 06/11/2026

👤 DADOS PESSOAIS
• Nome completo: Lucas Alves de Andrade
• CPF: 14180644673
• Telefone / WhatsApp: 31 999096222
• E-mail: alveiraslucas@gmail.com

🏠 ENDEREÇO PARA ENTREGA
• Rua / Avenida: Antônio Alves de Oliveira
• Número: 365
• Bairro: Brasileia
• Cidade: Betim
• CEP: 32600334

💳 FORMA DE PAGAMENTO
Valor total: 4.776,77
Forma de pagamento:
( ) Pix  
(X) Cartão de crédito  
( ) Dinheiro  
(X) Upgrade - Modelo: iPhone 16

Modelo: 17 pro Max 256gb azul lacrado imei 350015753668064`;

  const resultado = detectarFormularioOuPedidoVenda(texto);
  assert.ok(resultado);
  assert.equal(resultado.cliente.nome, 'Lucas Alves de Andrade');
  assert.equal(resultado.cliente.cpf, '14180644673');
  assert.equal(resultado.aparelho.modelo, 'iPhone 17 Pro Max');
  assert.equal(resultado.aparelho.capacidade?.toLowerCase(), '256gb');
  assert.equal(resultado.aparelho.cor?.toLowerCase(), 'azul');
  assert.equal(resultado.aparelho.imei, '350015753668064');
  assert.equal(resultado.valorTotal, 4776.77);
  assert.equal(resultado.isUpgrade, true);
  assert.equal(resultado.tradeIn?.modelo, 'iPhone 16');
});

test('detectarFormularioOuPedidoVenda identifica vendas simples em texto', () => {
  const texto = 'Vendido iPhone 15 128gb preto por 3500 para Carlos no Pix';
  const resultado = detectarFormularioOuPedidoVenda(texto);
  assert.ok(resultado);
  assert.equal(resultado.aparelho.modelo, 'iPhone 15');
  assert.equal(resultado.valorTotal, 3500);
  assert.equal(resultado.cliente.nome, 'Carlos');
});

test('cruzarAparelhoComEstoque valida IMEI disponível em estoque', () => {
  const estoque = [
    {
      id: 'ap-1',
      modelo: 'iPhone 17 Pro Max',
      capacidade: '256GB',
      cor: 'Azul',
      imei: '350015753668064',
      preco: 5000,
      custo: 4000,
      status: 'disponivel',
      ativo: true,
    },
  ];

  const cruzamento = cruzarAparelhoComEstoque(estoque, {
    modelo: 'iPhone 17 Pro Max',
    imei: '350015753668064',
  });

  assert.equal(cruzamento.status, 'confirmado');
  assert.equal(cruzamento.aparelhoEncontrado?.id, 'ap-1');
  assert.equal(cruzamento.aparelhoEncontrado?.imei, '350015753668064');
});

test('cruzarAparelhoComEstoque detecta se o aparelho já saiu do estoque', () => {
  const estoque = [
    {
      id: 'ap-2',
      modelo: 'iPhone 13 Pro Max',
      imei: '359999999999999',
      status: 'vendido',
      ativo: false,
      data_saida: '2026-11-05T10:00:00Z',
    },
  ];

  const cruzamento = cruzarAparelhoComEstoque(estoque, {
    modelo: 'iPhone 13 Pro Max',
    imei: '359999999999999',
  });

  assert.equal(cruzamento.status, 'ja_vendido');
  assert.ok(cruzamento.mensagem.includes('já consta como vendido'));
});

test('formatarMensagemPreviaNotinha gera layout claro com instrução de reação', () => {
  const proposta: PropostaNotinha = {
    id: 'prop-123',
    clienteNome: 'Lucas Alves',
    cpf: '14180644673',
    modelo: 'iPhone 17 Pro Max',
    capacidade: '256GB',
    cor: 'Azul',
    imei: '350015753668064',
    statusEstoque: 'Confirmado no estoque ✅',
    valorTotal: 4776.77,
    formaPagamento: 'Cartão de crédito',
    isUpgrade: true,
    modeloTroca: 'iPhone 16',
    enderecoEntrega: 'Rua Antônio Alves de Oliveira, 365 - Betim',
  };

  const msg = formatarMensagemPreviaNotinha(proposta);
  assert.ok(msg.includes('PRÉVIA DA NOTINHA'));
  assert.ok(msg.includes('Lucas Alves'));
  assert.ok(msg.includes('iPhone 17 Pro Max'));
  assert.ok(msg.includes('350015753668064'));
  assert.ok(msg.includes('4.776,77'));
  assert.ok(msg.includes('Reaja com ✅'));
  assert.ok(msg.includes('Reaja com ❌'));
});

test('interpretarReacaoNotinha identifica aprovação e recusa', () => {
  assert.equal(interpretarReacaoNotinha('✅'), 'confirmar');
  assert.equal(interpretarReacaoNotinha('💚'), 'confirmar');
  assert.equal(interpretarReacaoNotinha('👍'), 'confirmar');
  assert.equal(interpretarReacaoNotinha('❌'), 'cancelar');
  assert.equal(interpretarReacaoNotinha('👎'), 'cancelar');
  assert.equal(interpretarReacaoNotinha('😂'), null);
});

test('interpretarTextoCorrecaoVenda atualiza campos específicos', () => {
  const correcaoValor = interpretarTextoCorrecaoVenda('o valor certo é 4800');
  assert.equal(correcaoValor?.campo, 'valor');
  assert.equal(correcaoValor?.valor, 4800);

  const correcaoImei = interpretarTextoCorrecaoVenda('o imei correto é 350015753668064');
  assert.equal(correcaoImei?.campo, 'imei');
  assert.equal(correcaoImei?.valor, '350015753668064');
});

test('limparNomeModelo higieniza menções a RAM, memória e conjunções residuais', () => {
  assert.equal(limparNomeModelo('POCO F8 Pro, 12GB de RAM e 512GB de memória'), 'POCO F8 Pro');
  assert.equal(limparNomeModelo('Xiaomi POCO F8 Pro, 12GB de RAM e 512GB de memória'), 'Xiaomi POCO F8 Pro');
  assert.equal(limparNomeModelo('iPhone 16 Pro 256GB Desert lacrado'), 'iPhone 16 Pro');
  assert.equal(limparNomeModelo('Samsung S24 Ultra 512GB cinza seminovo'), 'Samsung S24 Ultra');
});

test('modelosSaoCompativeis valida compatibilidade para buffer de fotos', () => {
  assert.equal(modelosSaoCompativeis('POCO F8 Pro 512GB', 'POCO F8 Pro'), true);
  assert.equal(modelosSaoCompativeis('iPhone 16 Pro', '16 Pro'), true);
  assert.equal(modelosSaoCompativeis('Xiaomi POCO F8 Pro', 'POCO F8 Pro'), true);
  assert.equal(modelosSaoCompativeis('iPhone 16 Pro', 'Galaxy S24 Ultra'), false);
  assert.equal(modelosSaoCompativeis('iPhone 13', 'iPhone 15 Pro Max'), false);
});

test('detectarFormularioOuPedidoVenda ignora checkbox vazio de Upgrade / Troca', () => {
  const textoMarlon = `👤 DADOS PESSOAIS
Nome: Marlon Vitor da Rocha
CPF: 073.647.106-55
Telefone: 31988887777

💳 FORMA DE PAGAMENTO
Valor total: 4.999,99
cartao_credito
Upgrade / Troca: ( ) Outro:

Modelo: POCO F8 Pro, 12GB de RAM e 512GB de memória`;

  const parsed = detectarFormularioOuPedidoVenda(textoMarlon);
  assert.ok(parsed);
  assert.equal(parsed.isUpgrade, false);
  assert.equal(parsed.tradeIn, null);
  assert.ok(parsed.aparelho.modelo?.includes('POCO F8 Pro'));
  assert.ok(!parsed.aparelho.modelo?.includes('de RAM'));
  assert.ok(!parsed.aparelho.modelo?.includes('de memória'));
});

