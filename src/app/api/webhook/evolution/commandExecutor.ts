export type GeminiCommandAction =
  | 'create_aparelho'
  | 'create_cliente'
  | 'create_tecnico'
  | 'create_os'
  | 'create_agendamento'
  | 'create_garantia'
  | 'create_venda'
  | 'generate_etiquetas'
  | 'list_estoque'
  | 'update_preco'
  | 'abater_divida'
  | 'create_loja'
  | 'update_loja'
  | 'list_lojas'
  | 'search_entities'
  | 'query_entities';

export type GeminiConfidenceLevel = 'alta' | 'media' | 'baixa';

export interface GeminiCommandPlan {
  type: 'command';
  action: GeminiCommandAction;
  params: Record<string, unknown>;
  confianca: GeminiConfidenceLevel;
  campoFaltante?: string;
  perguntaClarificacao?: string;
}

export function parseGeminiPlan(raw: string): GeminiCommandPlan | null {
  try {
    if (!raw || typeof raw !== 'string') return null;

    const text = raw
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');

    if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
      return null;
    }

    const jsonText = text.slice(firstBrace, lastBrace + 1);
    const parsed = JSON.parse(jsonText);

    if (!parsed || parsed.type !== 'command' || typeof parsed.action !== 'string') {
      return null;
    }

    // Mantém compatibilidade com testes legados ou planos que não tenham o campo de confiança explícito
    const confianca: GeminiConfidenceLevel =
      parsed.confianca === 'alta' || parsed.confianca === 'media' || parsed.confianca === 'baixa'
        ? parsed.confianca
        : 'alta';

    return {
      type: 'command',
      action: parsed.action as GeminiCommandAction,
      params: parsed.params && typeof parsed.params === 'object' ? parsed.params : {},
      confianca,
      ...(parsed.campoFaltante ? { campoFaltante: String(parsed.campoFaltante) } : {}),
      ...(parsed.perguntaClarificacao ? { perguntaClarificacao: String(parsed.perguntaClarificacao) } : {}),
    };
  } catch {
    return null;
  }
}

export async function gerarPlanoComGemini(
  textContent: string,
  contextoLoja?: { nome?: string; lojaId?: string }
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !textContent || !textContent.trim()) {
    return null;
  }

  const systemPrompt = `Você é o assistente inteligente de gestão da loja de celulares/eletrônicos "${contextoLoja?.nome || 'Phone Center'}".
Sua função é interpretar a mensagem em linguagem natural enviada no WhatsApp e convertê-la estritamente em um comando operacional estruturado JSON (GeminiCommandPlan).

AÇÕES POSSÍVEIS (action):
- "create_venda": registrar venda/baixa de aparelho (params: modelo, comprador, valor, imei, codigo, formaPagamento).
- "create_aparelho": cadastrar novo aparelho no estoque (params: marca, modelo, capacidade, cor, preco, imei, condicao).
- "update_preco": alterar/atualizar preço de um aparelho (params: aparelho, modelo, imei, codigo, novoPreco).
- "abater_divida": abater ou registrar pagamento de fiado/saldo devedor (params: cliente, valor, observacao).
- "list_estoque": consultar disponibilidade de estoque ou quantidade de um modelo (params: modelo, marca).
- "create_cliente": cadastrar novo cliente (params: nome, telefone, email).
- "create_os": criar ordem de serviço (params: cliente, modelo, defeito).
- "search_entities": consulta geral de dados da loja (params: query, entity).

FUNIL DE CONFIANÇA (confianca):
1. "alta": Quando a intenção for clara E os dados informados forem suficientes para a ação:
   - "create_venda": Precisa de modelo/aparelho, comprador e valor. (IMEI é opcional).
     Ex: "vendi o 13 pro pro Lucas por 2500" -> confianca: "alta", params: {"modelo": "iPhone 13 Pro", "comprador": "Lucas", "valor": 2500}
   - "create_aparelho": Precisa de modelo e preço (capacidade e cor são opcionais, IMEI é opcional).
     Ex: "cadastra um iphone 12 128gb preto por 1800" -> confianca: "alta", params: {"marca": "Apple", "modelo": "iPhone 12", "capacidade": "128gb", "cor": "preto", "preco": 1800}
   - "update_preco": Precisa de identificador do aparelho (código, nome, modelo ou imei) e novo valor.
     Ex: "muda o preço do aparelho X pra 3000" -> confianca: "alta", params: {"aparelho": "X", "novoPreco": 3000}
   - "list_estoque": Pergunta sobre estoque ou disponibilidade de modelo.
     Ex: "qual nosso estoque de 15 pro max" -> confianca: "alta", params: {"modelo": "iPhone 15 Pro Max"}
   - "abater_divida": Precisa de cliente e valor.
     Ex: "abater 300 do joao" -> confianca: "alta", params: {"cliente": "joao", "valor": 300}

2. "media": Quando a intenção operacional for identificada, MAS faltar um dado obrigatório que impeça a execução:
   - "create_venda": Falta o valor da venda, ou falta o modelo/aparelho.
     Ex: "vende esse aí pro Lucas" -> confianca: "media", campoFaltante: "valor e modelo", perguntaClarificacao: "Qual é o modelo do aparelho e o valor da venda para o Lucas?"
   - "update_preco": Falta o novo preço ou não citou qual é o aparelho.
     Ex: "muda o preco pra 2000" -> confianca: "media", campoFaltante: "aparelho", perguntaClarificacao: "Qual é o aparelho, código ou IMEI cujo preço deve ser alterado?"
   - "create_aparelho": Falta o preço ou modelo do aparelho.
     Ex: "cadastra esse celular preto aqui" -> confianca: "media", campoFaltante: "modelo e preco", perguntaClarificacao: "Qual é o modelo e o preço do aparelho a ser cadastrado?"
   - "abater_divida": Falta o valor ou falta o cliente.
     Ex: "abate o fiado do joao" -> confianca: "media", campoFaltante: "valor", perguntaClarificacao: "Qual o valor a ser abatido da dívida do João?"
   Nesse caso, NUNCA invente dados fictícios. Defina "campoFaltante" e uma "perguntaClarificacao" direta e amigável.

3. "baixa": Quando a mensagem NÃO for um comando operacional, for uma conversa informal, bate-papo, saudação comum ou fora de contexto da loja.
   Ex: "o dia hoje está muito quente", "bom dia tudo bem", "kkkkkk" -> confianca: "baixa"

FORMATO DE RESPOSTA OBRIGATÓRIO (JSON estrito):
{
  "type": "command",
  "action": "create_venda",
  "params": {},
  "confianca": "alta" | "media" | "baixa",
  "campoFaltante": "nome_do_campo_se_houver",
  "perguntaClarificacao": "pergunta_se_confianca_media"
}`;

  const modelosParaTestar = [
    'gemini-flash-latest',
    'gemini-3.5-flash-lite',
    'gemini-3.6-flash',
  ];

  for (const modelName of modelosParaTestar) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(12000),
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: systemPrompt },
                  { text: `Mensagem do lojista/cliente: "${textContent}"` },
                ],
              },
            ],
            generationConfig: {
              responseMimeType: 'application/json',
              thinkingConfig: {
                thinkingBudget: 0,
              },
            },
          }),
        }
      );

      if (res.ok) {
        const responseData = await res.json();
        const textResponse = responseData.candidates?.[0]?.content?.parts?.[0]?.text;
        if (textResponse) {
          return textResponse.trim();
        }
      }
    } catch (err) {
      console.warn(`[Gemini Natural Language] Falha ao tentar modelo ${modelName}:`, err);
    }
  }

  return null;
}

export interface ContextoConversaNatural {
  nomeLoja?: string;
  enderecoLoja?: string;
  telefoneLoja?: string;
  totalEstoque?: number;
  modelosDisponiveis?: string[];
  isGroup?: boolean;
}

export async function responderConversaNaturalComGemini(
  textContent: string,
  contexto?: ContextoConversaNatural
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !textContent || !textContent.trim()) {
    return null;
  }

  const nomeLoja = contexto?.nomeLoja || 'Phone Center';
  const modelosEstoque = contexto?.modelosDisponiveis?.length
    ? contexto.modelosDisponiveis.slice(0, 15).join(', ')
    : 'Diversos modelos de iPhone lacrados e seminovos em estoque';

  const systemPrompt = `Você é o atendente e assistente virtual humano da loja "${nomeLoja}".
Você atende clientes no WhatsApp de forma calorosa, humana, prestativa, simpática e profissional (como um atendente real da loja de celulares).

TODAS AS FUNCIONALIDADES, SERVIÇOS E DIFERENCIAIS DA NOSSA LOJA / SISTEMA PHONE CENTER:
1. Venda de iPhones e Eletrônicos:
   - Aparelhos novos lacrados com garantia de 1 ano Apple.
   - Seminovos premium impecáveis, 100% testados em todos os componentes, com garantia da loja e saúde da bateria informada.
2. Upgrade / Trade-In (Troca com Avaliação Justa):
   - O cliente traz o iPhone usado dele para avaliação na hora de forma justa e transparente.
   - O valor do usado entra como desconto ou entrada para ele levar um modelo mais novo.
3. Assistência Técnica e Manutenção Especializada:
   - Troca de telas originais e premium com garantia.
   - Troca de baterias de alta performance com saúde 100%.
   - Reparos de placa, Face ID, conectores de carga, botões e desoxidação.
   - Todo serviço gera Ordem de Serviço (OS) formal com garantia documentada.
4. Emissão Fiscal:
   - Emissão de NFC-e (cupom fiscal para consumidor) e NF-e (para pessoas jurídicas e revendedores).
5. Atacado e Revenda:
   - Atendemos outros lojistas parceiros com tabela e preços especiais para atacado.
6. Entregas Rápidas e Retiradas:
   - Entrega expressa por motoboy no mesmo dia na região, ou retirada com segurança na nossa loja física.
7. Pagamento Facilitado:
   - PIX com desconto à vista.
   - Cartões de crédito parcelado em até 12x ou 18x.
   - Celular usado aceito na troca como parte do pagamento.

MODELOS DISPONÍVEIS NO NOSSO ESTOQUE HOJE:
${modelosEstoque}

REGRAS RÍGIDAS DE ATENDIMENTO:
- Responda SEMPRE em português do Brasil de forma 100% natural, simpática e humana.
- JAMAIS responda em JSON ou mostre qualquer código, chave {} ou sintaxe técnica.
- JAMAIS use comandos de robô com exclamação (NUNCA diga "digite !estoque", "!vender", "!cadastrar", "!ajuda" etc.). Converse como uma pessoa real!
- Responda com clareza à dúvida do cliente, destacando como podemos ajudá-lo com nossos produtos e serviços.
- Se o cliente perguntar "o que você pode fazer?", "como funciona?", "o que vocês vendem?", "como funciona a loja?", apresente de forma amigável e resumida nossas soluções (venda de iPhones, troca com avaliação do usado, assistência técnica, formas de pagamento) e pergunte o que ele gostaria de ver hoje.
- Formate o texto usando o padrão do WhatsApp (*negrito*, quebras de linha harmoniosas e emojis moderados).
- Mantenha respostas com tamanho agradável para o WhatsApp (2 a 3 parágrafos curtos).`;

  const modelosParaTestar = [
    'gemini-flash-latest',
    'gemini-3.5-flash-lite',
    'gemini-3.6-flash',
  ];

  for (const modelName of modelosParaTestar) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(12000),
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: systemPrompt },
                  { text: `Mensagem do cliente no WhatsApp: "${textContent}"` },
                ],
              },
            ],
            generationConfig: {
              thinkingConfig: {
                thinkingBudget: 0,
              },
            },
          }),
        }
      );

      if (res.ok) {
        const responseData = await res.json();
        const textResponse = responseData.candidates?.[0]?.content?.parts?.[0]?.text;
        if (textResponse && typeof textResponse === 'string' && textResponse.trim()) {
          return textResponse.trim();
        }
      }
    } catch (err) {
      console.warn(`[Gemini Conversa Natural] Falha ao tentar modelo ${modelName}:`, err);
    }
  }

  return null;
}

export function buildDispatchPayload(phone: string, text: string) {
  const cleanPhone = phone.replace(/\D/g, '');

  return JSON.stringify({
    type: 'send_text',
    payload: {
      number: cleanPhone,
      text,
    },
  });
}

export function buildWhatsAppText(action: string, data: unknown, phone: string) {
  const entity = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const nombre = String(entity.nome || entity.clienteNome || entity.marca || entity.modelo || 'registro');
  const id = String(entity.id || entity.numeroOS || entity.osId || '');
  const extra = String(entity.telefone || entity.descricao || entity.status || '');

  switch (action) {
    case 'create_aparelho':
      return `✅ Aparelho cadastrado com sucesso!\n\nMarca: ${entity.marca || '-'}\nModelo: ${entity.modelo || '-'}\nPreço: ${entity.preco ? `R$ ${entity.preco}` : '-'}\n\nID: ${id || 'Confirmado'}`;
    case 'create_cliente':
      return `✅ Cliente cadastrado com sucesso!\n\nNome: ${nombre}\nTelefone: ${extra || '-'}\n\nID: ${id || 'Confirmado'}`;
    case 'create_tecnico':
      return `✅ Técnico cadastrado com sucesso!\n\nNome: ${nombre}\nTelefone: ${extra || '-'}\n\nID: ${id || 'Confirmado'}`;
    case 'create_os':
      return `✅ Ordem de Serviço criada com sucesso!\n\nCliente: ${nombre}\nDefeito: ${entity.defeito || '-'}\nStatus: ${entity.status || '-'}\n\nOS: ${id || 'Confirmada'}`;
    case 'create_agendamento':
      return `✅ Agendamento criado com sucesso!\n\nCliente: ${nombre}\nData: ${entity.data || '-'}\nDescrição: ${entity.descricao || '-'}\n\nID: ${id || 'Confirmado'}`;
    case 'create_garantia':
      return `✅ Garantia criada com sucesso!\n\nCliente: ${nombre}\nOS: ${entity.osNumero || '-'}\nPeríodo: ${entity.diasGarantia || '-'} dias\n\nID: ${id || 'Confirmada'}`;
    case 'create_venda': {
      const valorFormatado = entity.valor
        ? `R$ ${Number(entity.valor).toFixed(2).replace('.', ',')}`
        : entity.preco
        ? `R$ ${Number(entity.preco).toFixed(2).replace('.', ',')}`
        : '-';
      const comprador = entity.comprador || entity.cliente || entity.clienteNome || 'Consumidor';
      const modelo = entity.modelo || entity.aparelho || entity.imei || entity.codigo || '-';
      return `✅ *Venda Registrada com Sucesso!*\n\n📱 *Aparelho:* ${modelo}\n👤 *Cliente:* ${comprador}\n💰 *Valor:* ${valorFormatado}\n\nStatus: ${id || 'Confirmada no sistema'}`;
    }
    case 'generate_etiquetas': {
      const qtd = entity.quantidade || entity.total || '1';
      return `🏷️ *Etiquetas Geradas com Sucesso!*\n\n📦 *Quantidade:* ${qtd} etiqueta(s)\n${entity.modelo ? `📱 *Modelo:* ${entity.modelo}\n` : ''}Pronto para impressão!`;
    }
    case 'list_estoque': {
      if (typeof data === 'string') return data;
      const total = entity.total !== undefined ? entity.total : (Array.isArray(entity.itens) ? entity.itens.length : 0);
      let detalhe = '';
      if (entity.resumo) {
        detalhe = String(entity.resumo);
      } else if (Array.isArray(entity.itens) && entity.itens.length > 0) {
        detalhe = entity.itens
          .map((item: any) => `• ${item.modelo || item.marca || 'Aparelho'} ${item.capacidade || ''} ${item.cor ? `(${item.cor})` : ''} ${item.preco ? `- R$ ${item.preco}` : ''}`)
          .join('\n');
      } else if (entity.modelo) {
        detalhe = `• Modelo pesquisado: ${entity.modelo}`;
      }
      return `📋 *Consulta de Estoque Realizada*\n\nTotal de itens encontrados: ${total}${detalhe ? `\n\n${detalhe}` : ''}`;
    }
    case 'update_preco': {
      const valorFormatado = entity.novoPreco || entity.preco
        ? `R$ ${Number(entity.novoPreco || entity.preco).toFixed(2).replace('.', ',')}`
        : '-';
      const aparelho = entity.aparelho || entity.modelo || entity.imei || entity.codigo || '-';
      return `✅ *Preço Atualizado com Sucesso!*\n\n📱 *Aparelho:* ${aparelho}\n💵 *Novo Preço:* ${valorFormatado}`;
    }
    case 'abater_divida': {
      const valorFormatado = entity.valor
        ? `R$ ${Number(entity.valor).toFixed(2).replace('.', ',')}`
        : '-';
      const cliente = entity.cliente || entity.lojista || entity.nome || '-';
      return `🤝 *Abatimento Registrado!*\n\n👤 *Cliente/Lojista:* ${cliente}\n💵 *Valor Abatido:* ${valorFormatado}`;
    }
    case 'create_loja':
      return `✅ Loja cadastrada com sucesso!\n\nNome: ${nombre}\nTelefone: ${extra || '-'}\n\nID: ${id || 'Confirmado'}`;
    case 'update_loja':
      return `✅ Loja atualizada com sucesso!\n\nNome: ${nombre}\nTelefone: ${extra || '-'}\n\nID: ${id || 'Confirmado'}`;
    case 'list_lojas': {
      if (typeof data === 'string') return data;
      if (Array.isArray(data) && data.length > 0) {
        const lojasFmt = data.map((l: any) => `🏪 *${l.nome || 'Loja'}* ${l.telefone ? `(${l.telefone})` : ''}`).join('\n');
        return `📋 *Lojas Disponíveis:*\n\n${lojasFmt}`;
      }
      return `📋 Consulta de lojas concluída.`;
    }
    case 'search_entities':
    case 'query_entities':
      return typeof data === 'string' ? data : (entity.resumo ? String(entity.resumo) : `🔎 Consulta concluída com sucesso.`);
    default:
      return typeof data === 'string' ? data : (entity.mensagem ? String(entity.mensagem) : `✅ Informação processada com sucesso.`);
  }
}
