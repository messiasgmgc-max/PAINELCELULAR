import { sanitizarTextoWhatsApp } from '@/lib/whatsappFormatting';
import { PLANOS_SISTEMA } from '@/lib/planos-config';

export type GeminiCommandAction =
  | 'create_aparelho'
  | 'create_cliente'
  | 'create_tecnico'
  | 'create_os'
  | 'create_agendamento'
  | 'create_garantia'
  | 'create_venda'
  | 'update_venda'
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
  }  const systemPrompt = `Você é o assistente inteligente de gestão da loja de celulares/eletrônicos "${contextoLoja?.nome || 'Phone Center'}".
Sua função é interpretar a mensagem em linguagem natural enviada no WhatsApp e convertê-la estritamente em um comando operacional estruturado JSON (GeminiCommandPlan).

AÇÕES OPERACIONAIS REAIS (action):
- "create_venda": registrar venda/baixa de aparelho (params: modelo, comprador, valor, imei, codigo, formaPagamento, tipoEntrega ['Atacado' | 'Varejo']).
- "update_venda": editar/alterar valores de uma venda já registrada (params: comprador, modelo, novoValor, novoCusto, valor, custo).
- "create_aparelho": cadastrar novo aparelho no estoque (params: marca, modelo, capacidade, cor, preco, imei, condicao).
- "update_preco": alterar/atualizar preço de um aparelho (params: aparelho, modelo, imei, codigo, novoPreco).
- "abater_divida": abater ou registrar pagamento de fiado/saldo devedor (params: cliente, valor, observacao).

FUNIL DE CONFIANÇA (confianca):
1. "alta": Quando a intenção for clara E for uma ação operacional acima com dados suficientes:
   - "create_venda": Precisa de modelo/aparelho, comprador e valor. (tipoEntrega, imei e formaPagamento são opcionais).
     Ex: "vendi o 13 pro pro Lucas por 2500 no atacado" -> confianca: "alta", params: {"modelo": "iPhone 13 Pro", "comprador": "Lucas", "valor": 2500, "tipoEntrega": "Atacado"}
   - "update_venda": Precisa de identificador da venda (comprador ou modelo) e novo valor ou custo.
     Ex: "altera a venda do Lucas para 2600" -> confianca: "alta", params: {"comprador": "Lucas", "novoValor": 2600}
     Ex: "muda o custo da venda do iphone 13 para 1900" -> confianca: "alta", params: {"modelo": "iPhone 13", "novoCusto": 1900}
   - "create_aparelho": Precisa de modelo e preço (capacidade e cor são opcionais, IMEI é opcional).
     Ex: "cadastra um iphone 12 128gb preto por 1800" -> confianca: "alta", params: {"marca": "Apple", "modelo": "iPhone 12", "capacidade": "128gb", "cor": "preto", "preco": 1800}
   - "update_preco": Precisa de identificador do aparelho (código, nome, modelo ou imei) e novo valor.
     Ex: "muda o preço do aparelho X pra 3000" -> confianca: "alta", params: {"aparelho": "X", "novoPreco": 3000}
   - "abater_divida": Precisa de cliente e valor.
     Ex: "abater 300 do joao" -> confianca: "alta", params: {"cliente": "joao", "valor": 300}

2. "media": Quando a intenção de alterar/registrar for identificada, MAS faltar algum dado principal:
   - "create_venda": Falta o valor da venda, o modelo do aparelho ou o comprador.
     Ex: "fiz uma venda", "anota uma venda aí", "vendi um celular" -> confianca: "media", campoFaltante: "dados da venda", perguntaClarificacao: "Qual modelo, valor e comprador dessa venda? Foi no atacado ou varejo?"
   - "update_venda": Falta o novo valor/custo ou o comprador/aparelho da venda a editar.
     Ex: "altera o valor da última venda", "muda o valor da venda do Lucas" -> confianca: "media", campoFaltante: "novo valor", perguntaClarificacao: "Para qual valor você deseja alterar essa venda?"
   - "update_preco": Falta o novo preço ou não citou qual é o aparelho.
     Ex: "muda o preco pra 2000" -> confianca: "media", campoFaltante: "aparelho", perguntaClarificacao: "Qual é o aparelho, código ou IMEI cujo preço deve ser alterado?"
   - "create_aparelho": Falta o preço ou modelo do aparelho.
     Ex: "cadastra esse celular preto aqui" -> confianca: "media", campoFaltante: "modelo e preco", perguntaClarificacao: "Qual é o modelo e o preço do aparelho a ser cadastrado?"
   - "abater_divida": Falta o valor ou falta o cliente.
     Ex: "abate o fiado do joao" -> confianca: "media", campoFaltante: "valor", perguntaClarificacao: "Qual o valor a ser abatido da dívida do João?"
   Nesse caso, NUNCA invente dados fictícios. Defina "campoFaltante" e uma "perguntaClarificacao" direta, simples e amigável.

3. "baixa": IMPORTANTE! Quando a mensagem NÃO for uma ordem de cadastro/venda/preço/abatimento acima, for uma pergunta, dúvida, consulta sobre vendas (hoje, semana, mês, atacado, varejo), histórico, relatórios, estoque, planos, faturamento, fiado, devedores, saudação ou conversa geral.
   Ex: "quais vendas feitas hoje?", "historico de atacado", "extrato de vendas", "qual faturamento da semana?", "bom dia" -> confianca: "baixa"

FORMATO DE RESPOSTA OBRIGATÓRIO (JSON estrito):
{
  "type": "command",
  "action": "create_venda",
  "params": {},
  "confianca": "alta" | "media" | "baixa",
  "campoFaltante": "nome_do_campo_se_houver",
  "perguntaClarificacao": "pergunta_se_confianca_media"
}`;

  const modelosGemini = [
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.7-flash',
    'gemini-3.8-flash',
    'gemini-flash-latest',
    'gemini-flash-lite-latest',
  ];

  // 1. Tenta executar via Google Gemini
  if (apiKey) {
    for (const modelName of modelosGemini) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(10000),
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
  }

  // 2. FALLBACK GROQ (se o Gemini estiver fora do ar ou com quota excedida 429)
  const groqApiKey = process.env.GROQ_API_KEY;
  if (groqApiKey) {
    const modelosGroq = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'];
    for (const groqModel of modelosGroq) {
      try {
        const resGroq = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${groqApiKey}`,
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(10000),
          body: JSON.stringify({
            model: groqModel,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Mensagem do lojista/cliente: "${textContent}"` },
            ],
            temperature: 0.1,
            response_format: { type: 'json_object' },
          }),
        });

        if (resGroq.ok) {
          const groqData = await resGroq.json();
          const content = groqData.choices?.[0]?.message?.content;
          if (content && typeof content === 'string' && content.trim()) {
            return content.trim();
          }
        }
      } catch (gErr) {
        console.warn(`[Groq Fallback Natural Language] Falha modelo ${groqModel}:`, gErr);
      }
    }
  }

  return null;
}


export interface MensagemHistorico {
  role: 'user' | 'model';
  text: string;
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
  resumoVendasHoje?: string;
  resumoLucroHoje?: string;
  resumoVendasSemana?: string;
  resumoLucroSemana?: string;
  resumoVendasMes?: string;
  resumoLucroMes?: string;
  historicoAtacadoMes?: string;
  historicoVendasRecentes?: string;
  historicoChat?: MensagemHistorico[];
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

  const resumoVendasHoje = contexto?.resumoVendasHoje || (contexto?.totalVendasHoje
    ? `Total: R$ ${totalVendasHoje}`
    : 'Nenhuma venda registrada hoje até o momento.');
  const resumoLucroHoje = contexto?.resumoLucroHoje ? `\n- Métricas de Lucro Hoje: ${contexto.resumoLucroHoje}` : '';
  const resumoVendasSemana = contexto?.resumoVendasSemana || 'Sem dados da semana.';
  const resumoLucroSemana = contexto?.resumoLucroSemana ? `\n- Lucro da Semana: ${contexto.resumoLucroSemana}` : '';
  const resumoVendasMes = contexto?.resumoVendasMes || 'Sem dados do mês.';
  const resumoLucroMes = contexto?.resumoLucroMes ? `\n- Lucro do Mês: ${contexto.resumoLucroMes}` : '';
  const historicoAtacado = contexto?.historicoAtacadoMes || 'Nenhuma venda de atacado registrada neste mês.';
  const historicoRecente = contexto?.historicoVendasRecentes || 'Nenhuma venda recente registrada.';

  const planosDescricaoPrecos = Object.values(PLANOS_SISTEMA)
    .map((p) => `${p.nome} (R$ ${p.precos.mensal.valorMensal.toFixed(2).replace('.', ',')}/mês)`)
    .join(', ');

  const systemPrompt = `Você é o COPILOTO OPERACIONAL E ASSISTENTE DA LOJA "${nomeLoja}" no sistema Phone Center.
Quem fala com você no WhatsApp é ${nomeUsuario} (Papel: ${papelDescricao}).
Você é o braço direito operacional do lojista: direto, prático, objetivo e sem enrolação.

⚡ REGRA SUPREMA DE CONCISÃO (MUITO IMPORTANTE):
- Responda SEMPRE em no MÁXIMO 2 A 4 LINHAS ou tópicos curtos e objetivos.
- Lojistas e clientes têm pressa e preguiça de ler textões. Vá DIRETO ao ponto, sem introduções prolixas ("Olá, tudo bem? Sou o assistente..."), sem saudações desnecessárias e sem despedidas longas.
- NUNCA envie respostas compridas ou manuais completos.

📝 FORMATAÇÃO WHATSAPP:
- Negrito no WhatsApp usa APENAS UM asterisco: *palavra*. NUNCA use markdown tradicional (**palavra**).
- NUNCA coloque asterisco em palavras que já estão em negrito.
- NUNCA deixe asteriscos soltos ou repetidos.
- NUNCA responda em JSON. Converse como uma pessoa real, enxuta e profissional.

DADOS OPERACIONAIS DA LOJA:
- Plano: ${planoAtual} (${contexto?.planoStatus || 'ativo'}) | ${vencimentoInfo}
- Planos disponíveis: ${planosDescricaoPrecos}.
- Estoque disponível (${contexto?.totalEstoque || 0} aparelhos cadastrados no sistema com IMEI, código, custo e valor):
${estoqueDescricao}
- Fiado / Devedores a receber: R$ ${totalFiado}${devedoresDescricao}
- Vendas Hoje: ${resumoVendasHoje}${resumoLucroHoje}
- Vendas da Semana (últimos 7 dias): ${resumoVendasSemana}${resumoLucroSemana}
- Vendas do Mês Atual: ${resumoVendasMes}${resumoLucroMes}
- Histórico de Vendas no Atacado (Mês Atual):
${historicoAtacado}
- Histórico Geral Recente (Últimas vendas da loja com valor, custo e lucro):
${historicoRecente}

COMO RESPONDER ÀS DÚVIDAS (SEMPRE CURTO, 2 A 4 LINHAS):
1. Vendas / Faturamento / Relatório (Hoje, Semana, Mês):
   - Se o lojista NÃO definir se foi Atacado ou Varejo (ex: "quais vendas hoje?", "vendas da semana", "faturamento"):
     -> MOSTRE AS DUAS CATEGORIAS e o Total de forma limpa e objetiva:
     Ex: "*Hoje:* Total R$ 4.300,00 (2 vendas)\n• *Varejo:* R$ 1.800,00 (1 venda)\n• *Atacado:* R$ 2.500,00 (1 venda)"
   - Se perguntar especificamente sobre Varejo ou Atacado, responda apenas a categoria pedida com total e quantidade.
2. Lucro, Custo e Margem:
   - Se perguntar sobre LUCRO, CUSTO, MARGEM ou QUANTO SOBROU (hoje, semana, mês ou de um produto/cliente específico):
     -> Você TEM acesso total a essas métricas acima! Responda o lucro obtido, custo e margem percentual em 1 a 3 linhas.
     Ex: "*Lucro Hoje:* R$ 650,00 (Margem: 21,5% | Custo total: R$ 2.350,00)."
3. Histórico de Vendas / Extrato de Vendas do Atacado:
   - Se pedir "histórico do atacado" ou "extrato de vendas do atacado":
     -> Mande o resumo do mês (total faturado, quantidade e clientes) e pergunte em 1 linha se deseja filtrar por outro período específico (ex: "Deseja ver alguma semana ou mês anterior?").
   - Se pedir "histórico" geral ou "últimas vendas":
     -> Liste as últimas vendas recentes com data, cliente, modelo, valor e lucro em 1 a 3 linhas.
4. Fiado / Devedores / Extrato de Lojista Devedor:
   - Diga o saldo total e liste os devedores em 1 a 3 linhas diretas.
   - Exemplo: "O saldo em aberto é R$ 21.400,00 (CL: 4 aparelhos). Você pode enviar !extrato cl para gerar o comprovante de débito com PIX."
5. Registrar ou Editar Venda ("Fiz uma venda", "Registra a venda", "Altera a venda"):
   - Se for registrar e faltar dados: pergunte educadamente o modelo, valor, comprador e atacado/varejo.
   - Se for alterar/editar valores de uma venda (valor, custo ou comprador): confirme a alteração ou solicite o dado faltante.
6. Estoque e IMEIs:
   - Se perguntar quais IMEIs ou detalhes de aparelhos em estoque (ex: "quais imeis?", "quais iphones 15?"):
     -> Consulte a lista de estoque disponível fornecida acima. Cada item possui seu IMEI e código. Liste os IMEIs dos aparelhos correspondentes em 1 a 3 linhas objetivas! NUNCA diga que não tem IMEI se a lista acima tiver aparelhos.
7. Planos:
   - Liste apenas os 3 planos e seus valores em 3 linhas curtas, informando o plano atual dele.
8. "O que você faz?" ou "?":
   - Em 3 linhas curtas: consulto vendas e relatórios (lucro, custo, faturamento, atacado/varejo), estoque e IMEIs em tempo real, saldo e extratos de fiado, checo IMEI e registro/edito vendas.`;

  const modelosGemini = [
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.7-flash',
    'gemini-3.8-flash',
    'gemini-flash-latest',
    'gemini-flash-lite-latest',
  ];

  const errosColetados: string[] = [];

  // Montagem do payload de conversa com suporte ao histórico multi-turn recente (últimos 3 minutos)
  const contentsPayload: any[] = [];

  // Injeta system prompt como primeira mensagem ou contexto inicial
  const historicoChat = contexto?.historicoChat || [];
  if (historicoChat.length > 0) {
    // Primeiro turn com system prompt anexado
    let firstUserInjected = false;
    for (const h of historicoChat) {
      if (h.role === 'user' && !firstUserInjected) {
        contentsPayload.push({
          role: 'user',
          parts: [{ text: `${systemPrompt}\n\n[Mensagem do lojista no WhatsApp]: "${h.text}"` }],
        });
        firstUserInjected = true;
      } else {
        contentsPayload.push({
          role: h.role === 'user' ? 'user' : 'model',
          parts: [{ text: h.text }],
        });
      }
    }
    // Adiciona a mensagem atual do usuário
    contentsPayload.push({
      role: 'user',
      parts: [{ text: textContent }],
    });
  } else {
    // Sem histórico prévio
    contentsPayload.push({
      role: 'user',
      parts: [
        { text: systemPrompt },
        { text: `Mensagem do lojista no WhatsApp: "${textContent}"` },
      ],
    });
  }

  // 1. Tenta responder via Google Gemini
  if (apiKey) {
    for (const modelName of modelosGemini) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(10000),
            body: JSON.stringify({
              contents: contentsPayload,
            }),
          }
        );

        if (res.ok) {
          const responseData = await res.json();
          const textResponse = responseData.candidates?.[0]?.content?.parts?.[0]?.text;
          if (textResponse && typeof textResponse === 'string' && textResponse.trim()) {
            return {
              sucesso: true,
              resposta: sanitizarTextoWhatsApp(textResponse.trim()),
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
  }

  // 2. FALLBACK GROQ (se o Gemini falhar por 429 quota excedida ou indisponibilidade)
  const groqApiKey = process.env.GROQ_API_KEY;
  if (groqApiKey) {
    const modelosGroq = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'];
    
    // Monta mensagens para o Groq
    const groqMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    if (historicoChat.length > 0) {
      for (const h of historicoChat) {
        groqMessages.push({
          role: h.role === 'user' ? 'user' : 'assistant',
          content: h.text,
        });
      }
    }

    groqMessages.push({ role: 'user', content: textContent });

    for (const groqModel of modelosGroq) {
      try {
        const resGroq = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${groqApiKey}`,
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(10000),
          body: JSON.stringify({
            model: groqModel,
            messages: groqMessages,
            temperature: 0.3,
          }),
        });

        if (resGroq.ok) {
          const groqData = await resGroq.json();
          const content = groqData.choices?.[0]?.message?.content;
          if (content && typeof content === 'string' && content.trim()) {
            return {
              sucesso: true,
              resposta: sanitizarTextoWhatsApp(content.trim()),
              modeloUsado: `Groq (${groqModel})`,
            };
          }
        } else {
          const errGroq = await resGroq.json().catch(() => ({}));
          console.warn(`[Groq Copiloto Lojista] Falha modelo ${groqModel}:`, errGroq);
          errosColetados.push(`• Groq ${groqModel} (${resGroq.status}): ${errGroq?.error?.message || resGroq.statusText}`);
        }
      } catch (gErr: any) {
        console.warn(`[Groq Copiloto Lojista] Falha conexao modelo ${groqModel}:`, gErr);
        errosColetados.push(`• Groq ${groqModel}: ${gErr?.message || 'Falha'}`);
      }
    }
  }

  return {
    sucesso: false,
    erroLog: errosColetados.join('\n') || 'Nenhum dos modelos Gemini ou Groq conseguiu responder.',
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
    case 'update_venda': {
      const comprador = entity.comprador || entity.cliente || entity.clienteNome || 'Cliente';
      const modelo = entity.modelo || entity.aparelho || 'Venda';
      const detalhes: string[] = [];
      if (entity.novoValor || entity.valor) {
        detalhes.push(`💵 *Novo Valor:* R$ ${Number(entity.novoValor || entity.valor).toFixed(2).replace('.', ',')}`);
      }
      if (entity.novoCusto || entity.custo) {
        detalhes.push(`🏷️ *Novo Custo:* R$ ${Number(entity.novoCusto || entity.custo).toFixed(2).replace('.', ',')}`);
      }
      const descFmt = detalhes.length > 0 ? `\n${detalhes.join('\n')}` : '';
      return `✅ *Venda Atualizada com Sucesso!*\n\n📱 *Aparelho/Ref:* ${modelo}\n👤 *Cliente:* ${comprador}${descFmt}\n\nStatus: Salvo no sistema`;
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
