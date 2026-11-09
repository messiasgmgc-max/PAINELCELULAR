import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectarFormularioOuPedidoVenda,
  formatarMensagemPreviaNotinha,
  interpretarReacaoNotinha,
  interpretarTextoCorrecaoVenda,
  cruzarAparelhoComEstoque,
  construirPropostaNotinha,
  vincularFotoEmPropostaNotinha,
  limparNomeModelo,
  modelosSaoCompativeis,
  registrarFotoProcessando,
  salvarFotoRecente,
  buscarFotoRecente,
  aguardarEBuscarFotoRecente,
  aguardarEBuscarFotosRecentes,
  aguardarOuVerificarFotoConsumida,
  propostaJaContemImei,
  limparFotoRecente,
  salvarPropostaNotinha,
  buscarPropostaNotinhaRecente,
  limparMencoesBot,
  extrairMensagemMarcadaParaBot,
  type PropostaNotinha,
} from './notinhaAutomatica';
import { gerarReciboPdfBuffer } from '@/lib/recibo/gerarReciboPdf';

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

function criarMockSupabaseAcoesPendentes() {
  const store = new Map<string, any>();

  return {
    store,
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
        store.set(registro.chave, { ...registro });
        return { data: registro, error: null };
      },
      select: () => ({
        in: (_col: string, chaves: string[]) => ({
          eq: (_col2: string, tipo: string) => ({
            order: () => {
              const rows = chaves
                .map((k) => store.get(k))
                .filter((r) => r && r.tipo === tipo);
              const promise = Promise.resolve({ data: rows, error: null }) as any;
              promise.limit = async (n: number) => ({ data: rows.slice(0, n), error: null });
              return promise;
            },
          }),
        }),
        eq: (_col: string, chave: string) => ({
          maybeSingle: async () => ({ data: store.get(chave) || null, error: null }),
        }),
      }),
      delete: () => ({
        in: async (_col: string, chaves: string[]) => {
          for (const k of chaves) store.delete(k);
          return { data: null, error: null };
        },
        eq: async (_col: string, chave: string) => {
          store.delete(chave);
          return { data: null, error: null };
        },
      }),
    }),
  } as any;
}

test('sincronização de fotos e propostas 100% via Supabase (incluindo espera por foto_processando)', async () => {
  const fakeSupabase = criarMockSupabaseAcoesPendentes();

  // 1. Webhook da foto inicia e registra foto_processando
  await registrarFotoProcessando(fakeSupabase, 'loja-123', 'chat-1@s.whatsapp.net', '553199999999');
  assert.ok(fakeSupabase.store.has('foto_processando:chat-1@s.whatsapp.net'));

  // 2. Simula o OCR terminando após 300ms em paralelo enquanto o formulário aguarda
  setTimeout(async () => {
    await salvarFotoRecente(fakeSupabase, 'loja-123', 'chat-1@s.whatsapp.net', '553199999999', {
      modelo: 'iPhone 14 Pro', // Simula até mesmo alucinação de geração da mesma marca pelo OCR
      capacidade: '256GB',
      imei: '357627943412501',
      timestamp: Date.now(),
    });
  }, 300);

  // 3. Webhook do formulário aguarda o OCR terminar e consome a foto automaticamente
  const fotoUnificada = await aguardarEBuscarFotoRecente(
    fakeSupabase,
    'loja-123',
    'chat-1@s.whatsapp.net',
    '553199999999',
    'iPhone 15 Pro'
  );

  assert.ok(fotoUnificada, 'Formulário deve aguardar e receber a foto recém-processada no Supabase');
  assert.equal(fotoUnificada?.imei, '357627943412501');

  // 4. Webhook da foto verifica que a foto já foi consumida pelo formulário e encerra sem duplicar mensagem
  const foiConsumida = await aguardarOuVerificarFotoConsumida(fakeSupabase, 'chat-1@s.whatsapp.net', 500);
  assert.equal(foiConsumida, true, 'Webhook da foto deve detectar que o formulário já consumiu a foto');
});

test('cruzarAparelhoComEstoque vincula IMEI de 15 dígitos da etiqueta com final de 4 dígitos do estoque e não confunde modelos', () => {
  const estoque = [
    {
      id: 'ap-15-base',
      modelo: 'iPhone 15',
      capacidade: '128GB',
      cor: 'Preto',
      imei: '9911',
      preco: 3800,
      status: 'disponivel',
      ativo: true,
    },
    {
      id: 'ap-15-pro-azul',
      modelo: 'iPhone 15 Pro',
      capacidade: '256GB',
      cor: '🔵 Azul',
      imei: '2501',
      preco: 5200,
      custo: 4300,
      status: 'disponivel',
      ativo: true,
    },
    {
      id: 'ap-15-promax',
      modelo: 'iPhone 15 Pro Max',
      capacidade: '256GB',
      cor: 'Natural',
      imei: '8822',
      preco: 6100,
      status: 'disponivel',
      ativo: true,
    },
  ];

  // 1. Etiqueta com IMEI de 15 dígitos (final 2501) bate com o iPhone 15 Pro cadastrado com '2501'
  const porImei15 = cruzarAparelhoComEstoque(estoque, {
    modelo: 'iPhone 15 Pro',
    capacidade: '256GB',
    imei: '357627943412501',
  });
  assert.equal(porImei15.status, 'confirmado');
  assert.equal(porImei15.aparelhoEncontrado?.id, 'ap-15-pro-azul');
  assert.ok(porImei15.mensagem.includes('2501'));
  assert.ok(porImei15.mensagem.includes('357627943412501'));

  // 2. Sem IMEI, buscando 'iPhone 15 Pro 256GB', encontra apenas o iPhone 15 Pro (não mistura com iPhone 15 nem 15 Pro Max)
  const porModeloExato = cruzarAparelhoComEstoque(estoque, {
    modelo: 'iPhone 15 Pro',
    capacidade: '256GB',
  });
  assert.equal(porModeloExato.status, 'confirmado');
  assert.equal(porModeloExato.aparelhoEncontrado?.id, 'ap-15-pro-azul');
});

test('salvarPropostaNotinha e buscarPropostaNotinhaRecente operam 100% via Supabase', async () => {
  const fakeSupabase = criarMockSupabaseAcoesPendentes();

  const proposta: PropostaNotinha = {
    id: 'prop-teste-1',
    clienteNome: 'Luan Cássio de Jesus Tavares Santos',
    modelo: 'iPhone 15 Pro',
    capacidade: '256GB',
    valorTotal: 0,
    formaPagamento: 'cartao_credito',
    statusEstoque: 'Confirmado',
    isUpgrade: false,
  };

  await salvarPropostaNotinha(fakeSupabase, 'loja-123', 'grupo@g.us', 'msg-123', proposta);

  // Mesmo se o OCR da etiqueta ler apenas "iPhone" ou "iPhone 14 Pro" segundos depois, vincula à proposta recente da mesma marca
  const encontrada = await buscarPropostaNotinhaRecente(
    fakeSupabase,
    ['notinha:grupo@g.us:ultima'],
    'iPhone 14 Pro',
    20
  );
  assert.ok(encontrada, 'Deve encontrar a proposta no Supabase');
  assert.equal(encontrada?.clienteNome, 'Luan Cássio de Jesus Tavares Santos');
  assert.equal(encontrada?.modelo, 'iPhone 15 Pro');
});

test('extrairMensagemMarcadaParaBot relê formulário citado e foto citada marcando o bot e unifica os dois', async () => {
  const fakeSupabase = criarMockSupabaseAcoesPendentes();
  const textoFormularioCitado = `👤 DADOS PESSOAIS
Nome: Luan Cássio de Jesus Tavares Santos
CPF: 164.144.496-79
Telefone: 31988776655

💳 FORMA DE PAGAMENTO
Valor total:
Forma de pagamento:
( ) Pix
(X) Cartão de crédito

Modelo: iPhone 15pro 256g`;

  // 1. Usuário marca o bot (@105278892703905 - LID de 15 dígitos!) no formulário e já informa o valor "4800"
  const msgMarcandoFormulario = {
    message: {
      extendedTextMessage: {
        text: '@105278892703905 4800',
        contextInfo: {
          stanzaId: 'msg-form-original-1',
          participant: '5531988776655@s.whatsapp.net',
          mentionedJid: ['105278892703905@lid'],
          quotedMessage: {
            conversation: textoFormularioCitado,
          },
        },
      },
    },
  };

  const extraidoForm = extrairMensagemMarcadaParaBot({
    msgData: msgMarcandoFormulario,
    botPhones: ['5531999990000'],
  });

  assert.equal(extraidoForm.foiMarcado, true);
  assert.equal(extraidoForm.usouMensagemCitada, true);
  assert.equal(extraidoForm.tipoCitado, 'texto');

  const vendaParsed = detectarFormularioOuPedidoVenda(extraidoForm.textoEfetivo);
  assert.ok(vendaParsed);
  assert.equal(vendaParsed.cliente.nome, 'Luan Cássio de Jesus Tavares Santos');
  assert.equal(vendaParsed.aparelho.modelo, 'iPhone 15 Pro');
  assert.equal(vendaParsed.aparelho.capacidade, '256GB');
  assert.equal(vendaParsed.valorTotal, 4800, 'Complemento de valor enviado junto à marcação deve ser incluído');
  assert.equal(vendaParsed.aparelho.imei, undefined, 'O @lid de 15 dígitos NUNCA deve ser confundido com IMEI');

  // 2. Logo após (200ms depois), o usuário marca o bot na foto da caixa (quotedMessage.imageMessage)
  const msgMarcandoFoto = {
    message: {
      extendedTextMessage: {
        text: '@105278892703905',
        contextInfo: {
          stanzaId: 'msg-foto-original-2',
          participant: '5531988776655@s.whatsapp.net',
          mentionedJid: ['105278892703905@lid'],
          quotedMessage: {
            imageMessage: {
              mimetype: 'image/jpeg',
              url: 'https://mmg.whatsapp.net/v/t62.7118-24/foto.enc',
              mediaKey: 'abc123',
            },
          },
        },
      },
    },
  };

  const extraidoFoto = extrairMensagemMarcadaParaBot({
    msgData: msgMarcandoFoto,
    botPhones: ['5531999990000'],
  });

  assert.equal(extraidoFoto.foiMarcado, true);
  assert.equal(extraidoFoto.usouMensagemCitada, true);
  assert.equal(extraidoFoto.tipoCitado, 'imagem');
  assert.equal(extraidoFoto.quotedStanzaId, 'msg-foto-original-2');
  assert.ok(extraidoFoto.quotedImageMessage);

  // Simula o webhook da foto chegando 200ms após o usuário marcar o formulário (janela esperaNovaFotoMs)
  setTimeout(async () => {
    await registrarFotoProcessando(fakeSupabase, 'loja-123', 'grupo@g.us', '5531994986029');
    setTimeout(async () => {
      await salvarFotoRecente(fakeSupabase, 'loja-123', 'grupo@g.us', '5531994986029', {
        modelo: 'iPhone',
        capacidade: '256GB',
        imei: '357627943412501',
        timestamp: Date.now(),
      });
    }, 150);
  }, 150);

  const fotoUnificada = await aguardarEBuscarFotoRecente(
    fakeSupabase,
    'loja-123',
    'grupo@g.us',
    '5531994986029',
    vendaParsed.aparelho.modelo,
    10,
    1500
  );

  assert.ok(fotoUnificada, 'Mesmo marcando o formulário antes e a foto logo depois, deve aguardar e unificar');
  assert.equal(fotoUnificada?.imei, '357627943412501');
});

test('extrairMensagemMarcadaParaBot não sobrescreve resposta à PRÉVIA DA NOTINHA nem confunde menção a colega', () => {
  // 1. Respondendo à própria prévia do bot com "@Astrogeek sim"
  const msgConfirmandoPrevia = {
    message: {
      extendedTextMessage: {
        text: '@Astrogeek sim',
        contextInfo: {
          stanzaId: 'msg-previa-99',
          quotedMessage: {
            conversation: '🧾 *PRÉVIA DA NOTINHA — LUCAS IMPORTS*\n👤 *Cliente:* Luan\n📱 *Aparelho:* iPhone 15 Pro',
          },
        },
      },
    },
  };

  const resConfirm = extrairMensagemMarcadaParaBot({ msgData: msgConfirmandoPrevia });
  assert.equal(resConfirm.foiMarcado, true);
  assert.equal(resConfirm.usouMensagemCitada, false);
  assert.equal(resConfirm.textoEfetivo, 'sim');
  assert.equal(resConfirm.quotedStanzaId, 'msg-previa-99');
  assert.equal(
    detectarFormularioOuPedidoVenda('🧾 *PRÉVIA DA NOTINHA — LUCAS IMPORTS*\n👤 *Cliente:* Luan\n📱 *Aparelho:* iPhone 15 Pro'),
    null
  );

  // 2. Menção normal a outro colega de equipe no grupo sem citar formulário/foto
  const msgConversaColega = {
    message: {
      extendedTextMessage: {
        text: '@5531988881111 separa 2 películas e 1 capinha pro cliente',
        contextInfo: {
          mentionedJid: ['5531988881111@s.whatsapp.net'],
        },
      },
    },
  };

  const resColega = extrairMensagemMarcadaParaBot({
    msgData: msgConversaColega,
    botPhones: ['5531994986029'],
  });
  assert.equal(resColega.foiMarcado, false);
  assert.equal(limparMencoesBot('@5531988881111 separa 2 películas'), 'separa 2 películas');
});

test('detectarFormularioOuPedidoVenda extrai múltiplos aparelhos do formulário da Sabrina Silva Castro', () => {
  const textoSabrina = `Para finalizar seu pedido, preencha os dados abaixo 👇

Data da compra: 07/11/2026

👤 DADOS PESSOAIS
•⁠  ⁠Nome completo:  Sabrina Silva Castro 
•⁠  ⁠CPF:  023.473.866-97
•⁠  ⁠Data de nascimento:  08/05/2003
•⁠  ⁠Telefone / WhatsApp:  31 9 7101-9306
•⁠  ⁠E-mail:  Sabrina.s.castros@gmail.com

🏠 ENDEREÇO PARA ENTREGA
•⁠  ⁠Rua / Avenida:  
•⁠  ⁠Número:  
•⁠  ⁠Complemento:  
•⁠  ⁠Bairro:  
•⁠  ⁠Cidade:  
•⁠  ⁠CEP:  

💳 FORMA DE PAGAMENTO
Valor total: R$10.200
Forma de pagamento:
( x) Pix  
( ) Cartão de crédito  
( ) Cartão de débito  
( ) Dinheiro  
( ) Upgrade - Modelo:
( ) Outro: __

Modelo:

1 - iPhone 15 128gb azul 94% garantia Apple 
1 - iPhone 14 Pro Max 128gb bateria 92%

Pagamento confirmado pix`;

  const parsed = detectarFormularioOuPedidoVenda(textoSabrina);
  assert.ok(parsed, 'Deve detectar o formulário da Sabrina');
  assert.equal(parsed.cliente.nome, 'Sabrina Silva Castro');
  assert.equal(parsed.cliente.cpf, '023.473.866-97');
  assert.equal(parsed.cliente.email, 'Sabrina.s.castros@gmail.com');
  assert.equal(parsed.valorTotal, 10200);
  assert.equal(parsed.formaPagamento, 'pix');
  assert.equal(parsed.isUpgrade, false);

  assert.ok(Array.isArray(parsed.aparelhos));
  assert.equal(parsed.aparelhos?.length, 2, 'Deve extrair exatamente os 2 aparelhos');

  const ap1 = parsed.aparelhos![0];
  assert.equal(ap1.modelo, 'iPhone 15');
  assert.equal(ap1.capacidade, '128GB');
  assert.equal(ap1.cor, 'Azul');
  assert.equal(ap1.bateria, 94);
  assert.equal(ap1.observacoes, 'Garantia Apple');
  assert.equal(ap1.condicao, 'seminovo');

  const ap2 = parsed.aparelhos![1];
  assert.equal(ap2.modelo, 'iPhone 14 Pro Max');
  assert.equal(ap2.capacidade, '128GB');
  assert.equal(ap2.bateria, 92);
  assert.equal(ap2.condicao, 'seminovo');
});

test('construirPropostaNotinha, vincularFotoEmPropostaNotinha e aguardarEBuscarFotosRecentes suportam 2+ fotos de etiqueta', async () => {
  const fakeSupabase = criarMockSupabaseAcoesPendentes();

  // 1. Duas fotos de etiquetas (ex: iPhone 17 Pro Max Deep Blue 256GB e iPhone 17 Pro Max Silver 256GB) chegam em sequência
  await salvarFotoRecente(fakeSupabase, 'loja-123', 'grupo@g.us', '5531994986029', {
    modelo: 'iPhone 17 Pro Max',
    capacidade: '256GB',
    cor: 'Deep Blue',
    imei: '353587235432902',
    timestamp: Date.now(),
  });
  await salvarFotoRecente(fakeSupabase, 'loja-123', 'grupo@g.us', '5531994986029', {
    modelo: 'iPhone 17 Pro Max',
    capacidade: '256GB',
    cor: 'Silver',
    imei: '351586496377246',
    timestamp: Date.now() + 50,
  });

  const fotosColetadas = await aguardarEBuscarFotosRecentes(
    fakeSupabase,
    'loja-123',
    'grupo@g.us',
    '5531994986029',
    ['iPhone 17 Pro Max', 'iPhone 17 Pro Max']
  );

  assert.equal(fotosColetadas.length, 2, 'Ambas as fotos devem ser preservadas e retornadas');
  assert.equal(fotosColetadas[0].imei, '353587235432902');
  assert.equal(fotosColetadas[1].imei, '351586496377246');

  // 2. Testa também o fluxo inverso: formulário de 2 aparelhos enviado primeiro, depois Foto 1 e Foto 2 vinculadas uma a uma
  const textoDoisAparelhos = `👤 DADOS PESSOAIS
Nome completo: Sabrina Silva Castro
CPF: 023.473.866-97
Valor total: R$ 15.600
( x) Pix
Modelo:
1 - iPhone 17 Pro Max 256GB Deep Blue
1 - iPhone 17 Pro Max 256GB Silver`;

  const venda = detectarFormularioOuPedidoVenda(textoDoisAparelhos)!;
  assert.equal(venda.aparelhos?.length, 2);
  assert.equal(venda.aparelhos?.[0].cor, 'Azul');
  assert.equal(venda.aparelhos?.[1].cor, 'Branco');

  const estoque = [
    {
      id: 'est-17pm-azul',
      modelo: 'iPhone 17 Pro Max',
      capacidade: '256GB',
      cor: 'Azul',
      imei: '353587235432902',
      preco: 7800,
      custo: 6800,
      status: 'disponivel',
      ativo: true,
    },
    {
      id: 'est-17pm-branco',
      modelo: 'iPhone 17 Pro Max',
      capacidade: '256GB',
      cor: 'Branco',
      imei: '351586496377246',
      preco: 7800,
      custo: 6800,
      status: 'disponivel',
      ativo: true,
    },
  ];

  // Constrói proposta inicialmente sem IMEIs no texto e sem estoque pareado por IMEI
  const propostaSemFotos = construirPropostaNotinha({
    vendaDetectada: venda,
    estoque: [],
    fotosRecentes: [],
  });
  assert.equal(propostaSemFotos.itens?.length, 2);
  assert.equal(propostaSemFotos.itens?.[0].imei, undefined);
  assert.equal(propostaSemFotos.itens?.[1].imei, undefined);

  // Vincula Foto 1 (Deep Blue - 353587235432902)
  vincularFotoEmPropostaNotinha(
    propostaSemFotos,
    {
      modelo: 'iPhone 17 Pro Max',
      capacidade: '256GB',
      cor: 'Deep Blue',
      imei: '353587235432902',
    },
    estoque
  );
  assert.equal(propostaSemFotos.itens?.[0].imei, '353587235432902');
  assert.equal(propostaSemFotos.itens?.[0].aparelhoId, 'est-17pm-azul');
  assert.equal(propostaSemFotos.itens?.[1].imei, undefined, 'Segundo item continua aguardando a segunda foto');

  // Vincula Foto 2 (Silver - 351586496377246) -> NÃO deve sobrescrever o Item 1!
  vincularFotoEmPropostaNotinha(
    propostaSemFotos,
    {
      modelo: 'iPhone 17 Pro Max',
      capacidade: '256GB',
      cor: 'Silver',
      imei: '351586496377246',
    },
    estoque
  );
  assert.equal(propostaSemFotos.itens?.[0].imei, '353587235432902', 'Primeiro IMEI deve permanecer intacto');
  assert.equal(propostaSemFotos.itens?.[1].imei, '351586496377246', 'Segundo IMEI deve preencher o segundo item');
  assert.equal(propostaSemFotos.itens?.[1].aparelhoId, 'est-17pm-branco');

  const previaMulti = formatarMensagemPreviaNotinha(propostaSemFotos);
  assert.ok(previaMulti.includes('Aparelhos (2):'));
  assert.ok(previaMulti.includes('353587235432902'));
  assert.ok(previaMulti.includes('351586496377246'));

  // 3. Gera o PDF com múltiplos aparelhos e garante que é um PDF válido
  const pdfBuffer = await gerarReciboPdfBuffer({
    vendaId: 'venda-multi-1',
    codigoVenda: 'MULTI001',
    loja: { nome: 'Lucas Imports' },
    cliente: { nome: 'Sabrina Silva Castro', cpf: '023.473.866-97' },
    aparelho: {
      modelo: 'iPhone 17 Pro Max',
      capacidade: '256GB',
      cor: 'Azul',
      imei: '353587235432902',
      valor: 7800,
    },
    itens: [
      {
        modelo: 'iPhone 17 Pro Max',
        capacidade: '256GB',
        cor: 'Azul',
        imei: '353587235432902',
        valor: 7800,
      },
      {
        modelo: 'iPhone 17 Pro Max',
        capacidade: '256GB',
        cor: 'Branco',
        imei: '351586496377246',
        valor: 7800,
      },
    ],
    pagamento: {
      forma: 'PIX',
      valorTotal: 15600,
      valorFinal: 15600,
    },
  });

  assert.ok(pdfBuffer.length > 1000);
  assert.equal(pdfBuffer.subarray(0, 4).toString(), '%PDF');
  const pdfLatin1 = pdfBuffer.toString('latin1');
  assert.ok(!pdfLatin1.includes('\xd8=\xdc\xf1'), 'Não deve conter mojibake Ø=Üñ do emoji 📱 no PDF');
  assert.ok(!pdfLatin1.includes('\xd8=\xdd'), 'Não deve conter mojibake Ø=Ý do emoji 🔁 no PDF');

  // Evita envio duplicado caso o webhook de uma das fotos verifique a proposta após o formulário já ter consumido ambos os IMEIs
  assert.equal(propostaJaContemImei(propostaSemFotos, '353587235432902'), true);
  assert.equal(propostaJaContemImei(propostaSemFotos, '351586496377246'), true);
});

test('Suporta pedidos com múltiplos Upgrades em seta (Entrada -> Saída + R$ valor) como o da nota do Bruno Henrique', async () => {
  const formBruno = `Para finalizar seu pedido, preencha os dados abaixo 👇

Data da compra: 07/11/2026

👤 DADOS PESSOAIS
•  Nome completo:  Bruno Henrique Silva Rocha 
•  CPF:  102.354.956-54
•  Data de nascimento:  05/02/90
•  Telefone / WhatsApp:  31 9 9996-4383
•  E-mail:  estofadosestacao123@gmail.com

🏠 ENDEREÇO PARA ENTREGA
•  Rua / Avenida:  
•  Número:  
•  Complemento:  
•  Bairro:  
•  Cidade:  
•  CEP:  

💳 FORMA DE PAGAMENTO
Valor total: R$5.000,00
Forma de pagamento:
(x) Pix  
( ) Cartão de crédito  
( ) Cartão de débito  
( ) Dinheiro  
( ) Upgrade - Modelo:
( ) Outro: __

Modelo:

Upgrade 15 pro max 512gb preto -> 17 pro max 256gb laranja com detalhes + R$2.000,00 


Upgrade 15 pro max 256gb -> 17 pro silver 256gb bateria 100% + R$3.000,00 


Pagamento confirmado`;

  const detectado = detectarFormularioOuPedidoVenda(formBruno);
  assert.ok(detectado, 'Deve detectar o formulário do Bruno Henrique');
  assert.equal(detectado?.cliente.nome, 'Bruno Henrique Silva Rocha');
  assert.equal(detectado?.cliente.cpf, '102.354.956-54');
  assert.equal(detectado?.valorTotal, 5000);
  assert.equal(detectado?.isUpgrade, true, 'Deve marcar isUpgrade = true');

  // Aparelhos vendidos (Saída)
  assert.equal(detectado?.aparelhos?.length, 2, 'Deve extrair 2 aparelhos vendidos (saída)');
  assert.equal(detectado?.aparelhos?.[0].modelo, 'iPhone 17 Pro Max');
  assert.equal(detectado?.aparelhos?.[0].capacidade, '256GB');
  assert.equal(detectado?.aparelhos?.[0].cor, 'Laranja');
  assert.equal(detectado?.aparelhos?.[0].observacoes, 'Com detalhes');
  assert.equal(detectado?.aparelhos?.[0].preco, 2000);

  assert.equal(detectado?.aparelhos?.[1].modelo, 'iPhone 17 Pro');
  assert.equal(detectado?.aparelhos?.[1].capacidade, '256GB');
  assert.equal(detectado?.aparelhos?.[1].cor, 'Branco');
  assert.equal(detectado?.aparelhos?.[1].bateria, 100);
  assert.equal(detectado?.aparelhos?.[1].preco, 3000);

  // Aparelhos recebidos na troca (Entrada)
  assert.equal(detectado?.tradeIns?.length, 2, 'Deve extrair os 2 aparelhos de entrada (upgrade)');
  assert.equal(detectado?.tradeIns?.[0].modelo, 'iPhone 15 Pro Max');
  assert.equal(detectado?.tradeIns?.[0].capacidade, '512GB');
  assert.equal(detectado?.tradeIns?.[0].cor, 'Preto');

  assert.equal(detectado?.tradeIns?.[1].modelo, 'iPhone 15 Pro Max');
  assert.equal(detectado?.tradeIns?.[1].capacidade, '256GB');

  // Constrói proposta e vincula as 2 fotos de IMEI enviadas para o 17 Pro Max e 17 Pro
  const proposta = construirPropostaNotinha({
    id: 'prop-bruno-2-upgrades',
    lojaId: 'loja-lucas',
    remoteJid: '5531999999999@s.whatsapp.net',
    vendaDetectada: detectado!,
    estoque: [],
    fotosRecentes: [],
  });

  vincularFotoEmPropostaNotinha(
    proposta,
    {
      modelo: 'iPhone 17 Pro Max',
      capacidade: '256GB',
      cor: 'Laranja',
      imei: '359426261378396',
    },
    []
  );

  vincularFotoEmPropostaNotinha(
    proposta,
    {
      modelo: 'iPhone 17 Pro',
      capacidade: '256GB',
      cor: 'Silver',
      imei: '354198260038124',
    },
    []
  );

  assert.equal(proposta.isUpgrade, true);
  assert.equal(proposta.trocas?.length, 2);
  assert.equal(proposta.itens?.[0].modelo, 'iPhone 17 Pro Max');
  assert.equal(proposta.itens?.[0].capacidade, '256GB');
  assert.equal(proposta.itens?.[0].cor, 'Laranja');
  assert.equal(proposta.itens?.[0].imei, '359426261378396');
  assert.equal(proposta.itens?.[0].valorUnitario, 2000);
  assert.equal(proposta.itens?.[0].modeloTroca, 'iPhone 15 Pro Max');
  assert.equal(proposta.itens?.[0].capacidadeTroca, '512GB');
  assert.equal(proposta.itens?.[0].corTroca, 'Preto');

  assert.equal(proposta.itens?.[1].modelo, 'iPhone 17 Pro');
  assert.equal(proposta.itens?.[1].capacidade, '256GB');
  assert.equal(proposta.itens?.[1].cor, 'Branco');
  assert.equal(proposta.itens?.[1].imei, '354198260038124');
  assert.equal(proposta.itens?.[1].valorUnitario, 3000);
  assert.equal(proposta.itens?.[1].modeloTroca, 'iPhone 15 Pro Max');
  assert.equal(proposta.itens?.[1].capacidadeTroca, '256GB');

  const previaBruno = formatarMensagemPreviaNotinha(proposta);
  assert.ok(previaBruno.includes('iPhone 17 Pro Max 256GB 🧡 Laranja [Com detalhes] — R$ 2.000,00'));
  assert.ok(previaBruno.includes('iPhone 17 Pro 256GB 🤍 Branco (Bat: 100%) — R$ 3.000,00'));
  assert.ok(previaBruno.includes('Upgrade (Entrada):* iPhone 15 Pro Max 512GB 🖤 Preto'));
  assert.ok(previaBruno.includes('Upgrade (Entrada):* iPhone 15 Pro Max 256GB'));
  assert.ok(previaBruno.includes('Upgrade / Troca (2 aparelhos de entrada):'));
  assert.ok(!previaBruno.includes('Upgrade 15 Pro Max ->'), 'Não deve vazar a seta bruta no nome do aparelho vendido');

  // Verifica que o gerador de PDF aceita múltiplos upgrades sem erros
  const pdfBuffer = await gerarReciboPdfBuffer({
    vendaId: 'venda-bruno-1',
    codigoVenda: 'BRUNO01',
    loja: { nome: 'Lucas Imports' },
    cliente: { nome: 'Bruno Henrique Silva Rocha', cpf: '102.354.956-54' },
    aparelho: {
      modelo: 'iPhone 17 Pro Max',
      capacidade: '256GB',
      cor: 'Laranja',
      imei: '359426261378396',
      valor: 2000,
    },
    itens: [
      {
        modelo: 'iPhone 17 Pro Max',
        capacidade: '256GB',
        cor: 'Laranja',
        imei: '359426261378396',
        observacao: 'Com detalhes',
        valor: 2000,
      },
      {
        modelo: 'iPhone 17 Pro',
        capacidade: '256GB',
        cor: 'Branco',
        imei: '354198260038124',
        bateria: 100,
        valor: 3000,
      },
    ],
    upgrade: {
      ativo: true,
      modelo: proposta.modeloTroca || null,
      valor: 0,
    },
    upgrades: proposta.trocas?.map((tr) => ({
      modelo: tr.modelo,
      capacidade: tr.capacidade || null,
      cor: tr.cor || null,
      imei: tr.imei || null,
      valor: tr.valor || null,
    })),
    pagamento: {
      forma: 'PIX',
      valorTotal: 5000,
      valorEntrada: 0,
      valorFinal: 5000,
    },
  });

  assert.ok(pdfBuffer.length > 1000);
  assert.equal(pdfBuffer.subarray(0, 4).toString(), '%PDF');
  const pdfLatin1 = pdfBuffer.toString('latin1');
  assert.ok(!pdfLatin1.includes('\xd8=\xdc\xf1'), 'Não deve conter mojibake Ø=Üñ do emoji 📱 no PDF');
  assert.ok(!pdfLatin1.includes('\xd8=\xdd'), 'Não deve conter mojibake Ø=Ý do emoji 🔁 no PDF');

  // Evita envio duplicado caso o webhook de uma das fotos verifique a proposta após o formulário já ter consumido ambos os IMEIs
  assert.equal(propostaJaContemImei(proposta, '359426261378396'), true);
  assert.equal(propostaJaContemImei(proposta, '354198260038124'), true);
  assert.equal(propostaJaContemImei(proposta, '359999999999999'), false);
});

test('!modo vendas: aceita apenas formulários, confirmações/correções de notinha e comandos de modo, ignorando conversas paralelas', () => {
  const filtrarOperacaoModoVendas = (
    texto: string,
    temNotinhaPendente: boolean,
    marcouBot: boolean = false
  ): boolean => {
    const lower = texto.toLowerCase().trim();
    const ehComandoModo = lower.startsWith('!modo') || lower.startsWith('!config');
    const ehFormularioVenda = Boolean(detectarFormularioOuPedidoVenda(texto));
    const ehPossivelConfirmacao = /^(?:sim|confirmar|confirmo|emitir|gerar\s*nota|gerar\s*notinha|aprovar|ok|pode\s*emitir|n[aã]o|cancelar|cancela|cancelado|esquece|anular)$/i.test(texto.trim());
    const ehPossivelCorrecao = Boolean(interpretarTextoCorrecaoVenda(texto));

    return (
      ehComandoModo ||
      ehFormularioVenda ||
      (ehPossivelConfirmacao && temNotinhaPendente) ||
      (ehPossivelCorrecao && temNotinhaPendente) ||
      (marcouBot && (
        ehFormularioVenda ||
        Boolean(detectarFormularioOuPedidoVenda(texto)) ||
        (ehPossivelConfirmacao && temNotinhaPendente) ||
        (ehPossivelCorrecao && temNotinhaPendente)
      ))
    );
  };

  // 1. Mensagens paralelas que DEVEM ser 100% ignoradas no modo vendas:
  assert.equal(filtrarOperacaoModoVendas('Bom dia pessoal!', false), false);
  assert.equal(filtrarOperacaoModoVendas('Quanto tá saindo o 15 Pro Max 256gb?', false), false);
  assert.equal(filtrarOperacaoModoVendas('!estoque', false), false);
  assert.equal(filtrarOperacaoModoVendas('!abater joao 500', false), false);
  assert.equal(filtrarOperacaoModoVendas('Entrada iPhone 13 128gb azul 2800', false), false);
  assert.equal(filtrarOperacaoModoVendas('Alguém tem cabo tipo c aí na loja?', false), false);
  // "SIM" ou "CANCELAR" avulso em conversa paralela sem notinha pendente: ignorado!
  assert.equal(filtrarOperacaoModoVendas('sim', false), false);
  assert.equal(filtrarOperacaoModoVendas('ok', false), false);
  assert.equal(filtrarOperacaoModoVendas('cancelar', false), false);

  // 2. Comandos de modo que DEVEM ser aceitos para gerenciar o bot:
  assert.equal(filtrarOperacaoModoVendas('!modo', false), true);
  assert.equal(filtrarOperacaoModoVendas('!modo vendas', false), true);
  assert.equal(filtrarOperacaoModoVendas('!modo padrao', false), true);
  assert.equal(filtrarOperacaoModoVendas('!config', false), true);

  // 3. Formulário de venda com dados do cliente e aparelho: DEVE ser aceito!
  const formVenda = `Para finalizar seu pedido, preencha os dados abaixo 👇
Data da compra: 09/11/2026
👤 DADOS PESSOAIS
• Nome completo: Luan Cássio
• CPF: 164.144.496-79
• Telefone: 31 99999-9999
💳 FORMA DE PAGAMENTO
Valor total: R$ 4.500
Modelo:
1 - iPhone 15 Pro 256GB`;
  assert.equal(filtrarOperacaoModoVendas(formVenda, false), true);

  // 4. Confirmação / Cancelamento com notinha pendente: DEVE ser aceito!
  assert.equal(filtrarOperacaoModoVendas('SIM', true), true);
  assert.equal(filtrarOperacaoModoVendas('confirmar', true), true);
  assert.equal(filtrarOperacaoModoVendas('cancelar', true), true);
  assert.equal(filtrarOperacaoModoVendas('ok', true), true);

  // 5. Correção de dado com notinha pendente: DEVE ser aceito!
  assert.equal(filtrarOperacaoModoVendas('o valor é 4800', true), true);
  assert.equal(filtrarOperacaoModoVendas('troca a cor para preto', true), true);

  // 6. Marcar o bot em formulário ou resposta de notinha pendente: DEVE ser aceito!
  assert.equal(filtrarOperacaoModoVendas(formVenda, false, true), true);
  assert.equal(filtrarOperacaoModoVendas('confirmar', true, true), true);
});





