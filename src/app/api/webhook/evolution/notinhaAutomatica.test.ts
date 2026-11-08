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
  salvarFotoRecente,
  buscarFotoRecente,
  limparFotoRecente,
  salvarPropostaNotinha,
  buscarPropostaNotinhaRecente,
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
  assert.equal(parsed.aparelho.capacidade, '512GB');
  assert.ok(parsed.aparelho.modelo?.includes('POCO F8 Pro'));
  assert.ok(!parsed.aparelho.modelo?.includes('de RAM'));
  assert.ok(!parsed.aparelho.modelo?.includes('de memória'));
});

test('detectarFormularioOuPedidoVenda e formatarMensagemPreviaNotinha tratam Valor total em branco', () => {
  const textoSemValor = `💳 FORMA DE PAGAMENTO
Valor total:
Forma de pagamento:
( ) Pix  
(X) Cartão de crédito  
( ) Upgrade - Modelo:

Modelo: IPhone 15pro 256g`;

  const parsed = detectarFormularioOuPedidoVenda(textoSemValor);
  assert.ok(parsed);
  assert.equal(parsed.valorTotal, null);
  assert.equal(parsed.aparelho.modelo, 'iPhone 15 Pro');
  assert.equal(parsed.aparelho.capacidade, '256GB');

  const proposta: PropostaNotinha = {
    id: 'prop-sem-valor',
    clienteNome: 'Luan Cássio',
    modelo: 'iPhone 15 Pro',
    capacidade: '256GB',
    valorTotal: 0,
    statusEstoque: 'Nenhum aparelho deste modelo disponível no estoque no momento.',
    formaPagamento: 'cartao_credito',
    isUpgrade: false,
  };

  const previa = formatarMensagemPreviaNotinha(proposta);
  assert.ok(previa.includes('Não informado no formulário!'));
  assert.ok(previa.includes('informe o valor respondendo ex: "o valor é 4800"'));
  assert.ok(!previa.includes('R$ 0,00'));
});

test('interpretarTextoCorrecaoVenda aceita valores numéricos diretos e protege contra IMEI', () => {
  const c1 = interpretarTextoCorrecaoVenda('5200');
  assert.equal(c1?.campo, 'valor');
  assert.equal(c1?.valor, 5200);

  const c2 = interpretarTextoCorrecaoVenda('4999.99');
  assert.equal(c2?.campo, 'valor');
  assert.equal(c2?.valor, 4999.99);

  const c3 = interpretarTextoCorrecaoVenda('o valor é 5200');
  assert.equal(c3?.campo, 'valor');
  assert.equal(c3?.valor, 5200);

  // IMEI de 15 dígitos NUNCA deve ser interpretado como valor
  const cImei = interpretarTextoCorrecaoVenda('868972083436361');
  assert.notEqual(cImei?.campo, 'valor');
});

test('limparNomeModelo higieniza template incompleto com "de RAM e de memória"', () => {
  assert.equal(limparNomeModelo('Xiaomi POCO F8 Pro, de RAM e de memória'), 'Xiaomi POCO F8 Pro');
  assert.equal(limparNomeModelo('POCO F8 Pro, de RAM e de memória'), 'POCO F8 Pro');
  assert.equal(limparNomeModelo('iPhone 15pro 256g'), 'iPhone 15 Pro');
});

test('modelosSaoCompativeis reconhece iPhone genérico lido em foto com iPhone 15 Pro', () => {
  assert.equal(modelosSaoCompativeis('iPhone', 'iPhone 15pro 256g'), true);
  assert.equal(modelosSaoCompativeis('iPhone', 'POCO F8 Pro'), false);
  assert.equal(modelosSaoCompativeis('Galaxy', 'iPhone 15 Pro'), false);
});

test('buffer de fotos recentes salva e recupera com latência zero e valida schema do Supabase', async () => {
  const chamadasSupabase: any[] = [];
  const fakeSupabase = {
    from: (tabela: string) => ({
      upsert: async (registro: any) => {
        // Validação estrita do schema do banco de dados real
        if ('expira_em' in registro) {
          throw new Error("PGRST204: Could not find the 'expira_em' column of 'whatsapp_acoes_pendentes'");
        }
        if (tabela === 'whatsapp_acoes_pendentes') {
          if (!['faltando_dados', 'confirmacao'].includes(registro.tipo)) {
            throw new Error("23514: violates check constraint 'whatsapp_acoes_pendentes_tipo_check'");
          }
        }
        chamadasSupabase.push({ tabela, registro });
        return { data: null, error: null };
      },
      select: () => ({
        in: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({ data: [], error: null }),
            }),
          }),
        }),
      }),
      delete: () => ({
        in: async () => ({ data: null, error: null }),
      }),
    }),
  } as any;

  // 1. Salva foto recente
  await salvarFotoRecente(fakeSupabase, 'loja-123', 'grupo@g.us', '553199999999', {
    modelo: 'POCO F8 Pro',
    capacidade: '512GB',
    imei: '868972083436361',
    timestamp: Date.now(),
  });

  // Garante que o Supabase recebeu tipo: 'faltando_dados' e NENHUM expira_em
  assert.ok(chamadasSupabase.length >= 1);
  for (const c of chamadasSupabase) {
    assert.equal(c.registro.tipo, 'faltando_dados');
    assert.equal('expira_em' in c.registro, false);
    assert.ok(c.registro.params.expiraEm > Date.now());
  }

  // 2. Busca foto no buffer (mesmo remetente e mesmo modelo)
  const achado = await buscarFotoRecente(
    fakeSupabase,
    'loja-123',
    'grupo@g.us',
    '553199999999',
    'Xiaomi POCO F8 Pro'
  );
  assert.ok(achado, 'Deve encontrar a foto no buffer em memória');
  assert.equal(achado?.imei, '868972083436361');
  assert.equal(achado?.capacidade, '512GB');

  // 3. Limpa buffer
  await limparFotoRecente(fakeSupabase, 'grupo@g.us', '553199999999');
  const posLimpeza = await buscarFotoRecente(
    fakeSupabase,
    'loja-123',
    'grupo@g.us',
    '553199999999',
    'Xiaomi POCO F8 Pro'
  );
  assert.equal(posLimpeza, null, 'Buffer deve estar vazio após limpeza');
});

test('buffer de propostas de notinhas salva e recupera com latência zero e valida schema do Supabase', async () => {
  const chamadasSupabase: any[] = [];
  const fakeSupabase = {
    from: (tabela: string) => ({
      upsert: async (registro: any) => {
        if ('expira_em' in registro) {
          throw new Error("PGRST204: Could not find the 'expira_em' column of 'whatsapp_acoes_pendentes'");
        }
        if (tabela === 'whatsapp_acoes_pendentes') {
          if (!['faltando_dados', 'confirmacao'].includes(registro.tipo)) {
            throw new Error("23514: violates check constraint 'whatsapp_acoes_pendentes_tipo_check'");
          }
        }
        chamadasSupabase.push({ tabela, registro });
        return { data: null, error: null };
      },
      select: () => ({
        in: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({ data: [], error: null }),
            }),
          }),
        }),
      }),
      delete: () => ({
        in: async () => ({ data: null, error: null }),
      }),
    }),
  } as any;

  const proposta: PropostaNotinha = {
    id: 'prop-teste-1',
    clienteNome: 'Marlon Vitor da Rocha',
    modelo: 'Xiaomi POCO F8 Pro',
    valorTotal: 4999.99,
    formaPagamento: 'cartao_credito',
    statusEstoque: 'Disponível',
    isUpgrade: false,
  };

  // 1. Salva proposta
  await salvarPropostaNotinha(fakeSupabase, 'loja-123', 'grupo@g.us', 'msg-123', proposta);

  assert.ok(chamadasSupabase.length >= 1);
  for (const c of chamadasSupabase) {
    assert.equal(c.registro.tipo, 'confirmacao');
    assert.equal('expira_em' in c.registro, false);
    assert.ok(c.registro.params.expiraEm > Date.now());
  }

  // 2. Busca proposta recente via chaves
  const encontrada = await buscarPropostaNotinhaRecente(
    fakeSupabase,
    ['notinha:grupo@g.us:ultima'],
    'POCO F8 Pro',
    20
  );
  assert.ok(encontrada, 'Deve encontrar a proposta no buffer em memória');
  assert.equal(encontrada?.clienteNome, 'Marlon Vitor da Rocha');
  assert.equal(encontrada?.valorTotal, 4999.99);
});

