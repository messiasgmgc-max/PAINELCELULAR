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

AÇÕES OPERACIONAIS REAIS (action):
- "create_venda": registrar venda/baixa de aparelho (params: modelo, comprador, valor, imei, codigo, formaPagamento).
- "create_aparelho": cadastrar novo aparelho no estoque (params: marca, modelo, capacidade, cor, preco, imei, condicao).
- "update_preco": alterar/atualizar preço de um aparelho (params: aparelho, modelo, imei, codigo, novoPreco).
- "abater_divida": abater ou registrar pagamento de fiado/saldo devedor (params: cliente, valor, observacao).

FUNIL DE CONFIANÇA (confianca):
1. "alta": Quando a intenção for clara E for uma ação operacional acima com dados suficientes:
   - "create_venda": Precisa de modelo/aparelho, comprador e valor. (IMEI é opcional).
     Ex: "vendi o 13 pro pro Lucas por 2500" -> confianca: "alta", params: {"modelo": "iPhone 13 Pro", "comprador": "Lucas", "valor": 2500}
   - "create_aparelho": Precisa de modelo e preço (capacidade e cor são opcionais, IMEI é opcional).
     Ex: "cadastra um iphone 12 128gb preto por 1800" -> confianca: "alta", params: {"marca": "Apple", "modelo": "iPhone 12", "capacidade": "128gb", "cor": "preto", "preco": 1800}
   - "update_preco": Precisa de identificador do aparelho (código, nome, modelo ou imei) e novo valor.
     Ex: "muda o preço do aparelho X pra 3000" -> confianca: "alta", params: {"aparelho": "X", "novoPreco": 3000}
   - "abater_divida": Precisa de cliente e valor.
     Ex: "abater 300 do joao" -> confianca: "alta", params: {"cliente": "joao", "valor": 300}

2. "media": Quando a intenção de executar uma das ações acima for identificada, MAS faltar um dado obrigatório:
   - "create_venda": Falta o valor da venda, ou falta o modelo/aparelho.
     Ex: "vende esse aí pro Lucas" -> confianca: "media", campoFaltante: "valor e modelo", perguntaClarificacao: "Qual é o modelo do aparelho e o valor da venda para o Lucas?"
   - "update_preco": Falta o novo preço ou não citou qual é o aparelho.
     Ex: "muda o preco pra 2000" -> confianca: "media", campoFaltante: "aparelho", perguntaClarificacao: "Qual é o aparelho, código ou IMEI cujo preço deve ser alterado?"
   - "create_aparelho": Falta o preço ou modelo do aparelho.
     Ex: "cadastra esse celular preto aqui" -> confianca: "media", campoFaltante: "modelo e preco", perguntaClarificacao: "Qual é o modelo e o preço do aparelho a ser cadastrado?"
   - "abater_divida": Falta o valor ou falta o cliente.
     Ex: "abate o fiado do joao" -> confianca: "media", campoFaltante: "valor", perguntaClarificacao: "Qual o valor a ser abatido da dívida do João?"
   Nesse caso, NUNCA invente dados fictícios. Defina "campoFaltante" e uma "perguntaClarificacao" direta e amigável.

3. "baixa": IMPORTANTE! Quando a mensagem NÃO for uma ordem de cadastro/venda/preço/abatimento acima, for uma pergunta, dúvida, consulta sobre estoque, planos, faturamento, fiado, quem está devendo, valores a receber, bate-papo, saudação ou conversa geral.
   Ex: "temos quantos iphones no estoque?", "qual nosso saldo devedor?", "quanto temos pra receber?", "como funciona o plano intermediario?", "bom dia", "olá tudo bem?" -> confianca: "baixa"

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
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-flash-lite-latest',
    'gemini-3.5-flash',
    'gemini-3.7-flash',
    'gemini-flash-latest',
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
      } else {
        const errJson = await res.json().catch(() => ({}));
        console.warn(`[Gemini Natural Language] Falha ao tentar modelo ${modelName} (${res.status}):`, errJson?.error?.message || res.statusText);
      }
    } catch (err) {
      console.warn(`[Gemini Natural Language] Falha ao tentar modelo ${modelName}:`, err);
    }
  }

  return null;
}

export interface ContextoConversaNatural {
  nomeLoja?: string;
  nomeUsuario?: string;
  papelUsuario?: 'owner' | 'staff' | 'motoboy' | 'nenhum';
  planoTipo?: string;
  planoStatus?: string;
  dataVencimento?: string;
  diasRestantesPlano?: number;
  isTrial?: boolean;
  totalEstoque?: number;
  modelosDisponiveis?: string[];
  detalhesEstoqueFormatado?: string;
  totalFiadoEmAberto?: number;
  detalhesDevedoresFormatado?: string;
  totalVendasHoje?: number;
  isGroup?: boolean;
}

export interface RespostaConversaIA {
  sucesso: boolean;
  resposta?: string;
  modeloUsado?: string;
  erroLog?: string;
}

export async function responderConversaNaturalComGemini(
  textContent: string,
  contexto?: ContextoConversaNatural
): Promise<RespostaConversaIA> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      sucesso: false,
      erroLog: 'GEMINI_API_KEY não configurada no ambiente do servidor (.env.local).',
    };
  }

  if (!textContent || !textContent.trim()) {
    return {
      sucesso: false,
      erroLog: 'Mensagem vazia recebida para a IA.',
    };
  }

  const nomeLoja = contexto?.nomeLoja || 'Phone Center';
  const nomeUsuario = contexto?.nomeUsuario || 'Lojista';
  const papelDescricao =
    contexto?.papelUsuario === 'owner'
      ? 'Proprietário / Dono da Loja'
      : contexto?.papelUsuario === 'motoboy'
      ? 'Entregador / Motoboy'
      : 'Colaborador / Vendedor';

  const planoAtual = (contexto?.planoTipo || 'entrada').toUpperCase();
  const vencimentoInfo = contexto?.dataVencimento
    ? `Vencimento: ${contexto.dataVencimento} (${contexto.diasRestantesPlano !== undefined ? (contexto.diasRestantesPlano <= 0 ? 'Vencido hoje ou atrasado' : `${contexto.diasRestantesPlano} dias restantes`) : 'Ativo'})`
    : 'Assinatura Ativa';

  const estoqueDescricao =
    contexto?.detalhesEstoqueFormatado ||
    (contexto?.modelosDisponiveis?.length
      ? contexto.modelosDisponiveis.slice(0, 15).join('\n')
      : 'Diversos aparelhos disponíveis no painel da loja');

  const totalFiado = Number(contexto?.totalFiadoEmAberto || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
  });
  const devedoresDescricao = contexto?.detalhesDevedoresFormatado
    ? `\n- Detalhamento de quem está devendo (Lojistas parceiros/Atacado):\n${contexto.detalhesDevedoresFormatado}`
    : '';

  const totalVendasHoje = Number(contexto?.totalVendasHoje || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
  });

  const systemPrompt = `Você é o COPILOTO OPERACIONAL E ASSISTENTE INTELIGENTE DA LOJA "${nomeLoja}" no sistema Phone Center.
Quem está conversando com você no WhatsApp é ${nomeUsuario} (Papel: ${papelDescricao}).
ATENÇÃO MÁXIMA: Você NUNCA é um vendedor de balcão tentando vender iPhone para quem te manda mensagem. Você é o BRAÇO DIREITO, gerente operacional e assistente interno do lojista! Você o ajuda a administrar e consultar o dia a dia da loja.

DADOS DA ASSINATURA DA LOJA NO PHONE CENTER:
- Plano Atual da Loja: ${planoAtual} (${contexto?.planoStatus || 'ativo'})
- ${vencimentoInfo}
- Tabela oficial de Planos da plataforma Phone Center:
  1. *Plano Entrada* (~R$ 99,90/mês | R$ 89,90 trimestral | R$ 79,90 anual):
     Sistema completo de controle de estoque, vendas, cadastro de aparelhos, emissão de Ordem de Serviço (OS) com garantia documentada, OCR de etiquetas com IA Gemini Vision e bot básico de WhatsApp (!estoque, !vender, !cadastrar, !os).
  2. *Plano Intermediário* (~R$ 189,00/mês | R$ 169,00 trimestral | R$ 149,00 anual) [Mais Escolhido]:
     Tudo do Entrada + Gestão milimétrica de fiado e devedores com robô de cobrança automática no WhatsApp (!abater, !saldo), consulta e checagem de IMEI roubado (!checarimei) e broadcast de listas de estoque para grupos (!broadcast).
  3. *Plano Avançado* (~R$ 299,00/mês | R$ 269,00 trimestral | R$ 239,00 anual) [Máxima Potência]:
     Tudo do Intermediário + Escuta e busca em catálogo unificado multi-loja em grupos de atacado, trilha de auditoria completa com rastreabilidade de quem executou cada ação no WhatsApp, e API REST com Token próprio para sistemas e robôs do lojista.

ESTOQUE ATUAL DA LOJA (${contexto?.totalEstoque || 0} aparelhos disponíveis):
${estoqueDescricao}

FINANCEIRO E ATACADO DA LOJA:
- Saldo total de fiado a receber de atacado/lojistas: R$ ${totalFiado}${devedoresDescricao}
- Faturamento registrado hoje: R$ ${totalVendasHoje}

DIRETRIZES DE RESPOSTA AO LOJISTA:
1. Responda em português do Brasil de forma prestativa, direta, inteligente, natural e profissional (como um colega ou gerente operacional experiente).
2. Se o lojista perguntar sobre fiado, devedores, extrato, saldo a receber ou contas a receber ("quanto temos de fiado?", "qual o saldo devedor?", "quem tá devendo?", "me manda o extrato do CL", "o que o CL comprou no fiado?"):
   - Informe com precisão o saldo total em aberto a receber (R$ ${totalFiado}).
   - Cite detalhadamente quem são os devedores, a quantidade de aparelhos em aberto e os valores pendentes listados no detalhamento acima.
   - Se pedir o extrato ou a relação dos débitos, passe a relação completa dos aparelhos em aberto com seus valores e informe que ele também pode usar o comando "!extrato" para receber o extrato formatado para envio direto!
3. Se o lojista perguntar sobre os planos do sistema ("quais planos temos?", "quanto custa?", "diferença dos planos?"):
   - Apresente os 3 planos do Phone Center acima de forma clara e resumida.
   - Destaque em qual plano a loja dele está no momento (${planoAtual}).
4. Se perguntar sobre vencimento ("quando meu plano vence?", "meu plano está ativo?", "quantos dias faltam?"):
   - Informe a data exata de vencimento e o status da loja dele.
   - Se ele for proprietário (owner) e quiser renovar, explique que pode enviar "!plano pagar" para receber o código PIX instantâneo ou pagar no Cartão em até 12x no menu "Meu Plano" do painel web.
5. Se perguntar sobre o estoque da loja ("temos iphone 13?", "quanto tá o 11?", "tem algum preto aí?"):
   - Consulte a lista de estoque acima e informe exatamente quantas unidades tem, cores, capacidades, saúde de bateria e valores.
6. Se o lojista disser que vendeu um aparelho ("vendi tal telefone", "anota que vendi..."):
   - Confirme os detalhes da venda (modelo, cliente, valor) e mostre que a movimentação foi compreendida.
7. Se perguntar "o que você pode fazer?", "como você me ajuda?", "?" ou mandar dúvida geral:
   - Apresente suas capacidades como Copiloto da Loja: consultar estoque em tempo real, checar restrições de IMEI, acompanhar fiado e devedores de atacado, consultar e renovar planos da loja e registrar movimentações.
8. JAMAIS responda em JSON ou mostre chaves {} para o usuário.
9. JAMAIS use comandos com exclamação de forma robótica (NUNCA diga "digite !estoque" ou "use !vender"). Converse como uma pessoa real!
10. Formate a mensagem com o padrão do WhatsApp (*negrito*, quebras de linha e emojis moderados).`;

  const modelosParaTestar = [
    'gemini-3.5-flash',
    'gemini-3.7-flash',
    'gemini-3.5-flash-lite',
    'gemini-flash-latest',
    'gemini-flash-lite-latest',
  ];

  const errosColetados: string[] = [];

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
                  { text: `Mensagem do lojista no WhatsApp: "${textContent}"` },
                ],
              },
            ],
          }),
        }
      );

      if (res.ok) {
        const responseData = await res.json();
        const textResponse = responseData.candidates?.[0]?.content?.parts?.[0]?.text;
        if (textResponse && typeof textResponse === 'string' && textResponse.trim()) {
          return {
            sucesso: true,
            resposta: textResponse.trim(),
            modeloUsado: modelName,
          };
        } else {
          errosColetados.push(`• ${modelName}: Resposta vazia da API`);
        }
      } else {
        const errJson = await res.json().catch(() => ({}));
        const msg = errJson?.error?.message || res.statusText || `HTTP ${res.status}`;
        errosColetados.push(`• ${modelName} (${res.status}): ${msg.slice(0, 100)}`);
        console.warn(`[Gemini Copiloto Lojista] Falha modelo ${modelName} (${res.status}):`, msg);
      }
    } catch (err: any) {
      errosColetados.push(`• ${modelName}: ${err?.message || 'Falha de conexão / timeout'}`);
      console.warn(`[Gemini Copiloto Lojista] Falha ao tentar modelo ${modelName}:`, err);
    }
  }

  return {
    sucesso: false,
    erroLog: errosColetados.join('\n') || 'Nenhum dos modelos Gemini conseguiu responder.',
  };
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
