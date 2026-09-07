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
- "create_aparelho": cadastrar novo aparelho no estoque (params: marca, modelo, capacidade, cor, preco, imei, condicao).
- "update_preco": alterar/atualizar preço de um aparelho (params: aparelho, modelo, imei, codigo, novoPreco).
- "abater_divida": abater ou registrar pagamento de fiado/saldo devedor (params: cliente, valor, observacao).

FUNIL DE CONFIANÇA (confianca):
1. "alta": Quando a intenção for clara E for uma ação operacional acima com dados suficientes:
   - "create_venda": Precisa de modelo/aparelho, comprador e valor. (tipoEntrega, imei e formaPagamento são opcionais).
     Ex: "vendi o 13 pro pro Lucas por 2500 no atacado" -> confianca: "alta", params: {"modelo": "iPhone 13 Pro", "comprador": "Lucas", "valor": 2500, "tipoEntrega": "Atacado"}
   - "create_aparelho": Precisa de modelo e preço (capacidade e cor são opcionais, IMEI é opcional).
     Ex: "cadastra um iphone 12 128gb preto por 1800" -> confianca: "alta", params: {"marca": "Apple", "modelo": "iPhone 12", "capacidade": "128gb", "cor": "preto", "preco": 1800}
   - "update_preco": Precisa de identificador do aparelho (código, nome, modelo ou imei) e novo valor.
     Ex: "muda o preço do aparelho X pra 3000" -> confianca: "alta", params: {"aparelho": "X", "novoPreco": 3000}
   - "abater_divida": Precisa de cliente e valor.
     Ex: "abater 300 do joao" -> confianca: "alta", params: {"cliente": "joao", "valor": 300}

2. "media": Quando a intenção de registrar venda for identificada, MAS faltar algum dado principal (modelo, valor ou comprador):
   - "create_venda": Falta o valor da venda, o modelo do aparelho ou o comprador.
     Ex: "fiz uma venda", "anota uma venda aí", "vendi um celular" -> confianca: "media", campoFaltante: "dados da venda", perguntaClarificacao: "Qual modelo, valor e comprador dessa venda? Foi no atacado ou varejo?"
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

  const modelosParaTestar = [
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-2.5-flash-lite',
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
  resumoVendasHoje?: string;
  resumoVendasSemana?: string;
  resumoVendasMes?: string;
  historicoAtacadoMes?: string;
  historicoVendasRecentes?: string;
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
  const resumoVendasSemana = contexto?.resumoVendasSemana || 'Sem dados da semana.';
  const resumoVendasMes = contexto?.resumoVendasMes || 'Sem dados do mês.';
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
- Estoque disponível (${contexto?.totalEstoque || 0} aparelhos):
${estoqueDescricao}
- Fiado / Devedores a receber: R$ ${totalFiado}${devedoresDescricao}
- Vendas Hoje: ${resumoVendasHoje}
- Vendas da Semana (últimos 7 dias): ${resumoVendasSemana}
- Vendas do Mês Atual: ${resumoVendasMes}
- Histórico de Vendas no Atacado (Mês Atual):
${historicoAtacado}
- Histórico Geral Recente (Últimas vendas da loja):
${historicoRecente}

COMO RESPONDER ÀS DÚVIDAS (SEMPRE CURTO, 2 A 4 LINHAS):
1. Vendas / Faturamento / Relatório (Hoje, Semana, Mês):
   - Se o lojista NÃO definir se foi Atacado ou Varejo (ex: "quais vendas hoje?", "vendas da semana", "faturamento"):
     -> MOSTRE AS DUAS CATEGORIAS e o Total de forma limpa e objetiva:
     Ex: "*Hoje:* Total R$ 4.300,00 (2 vendas)\n• *Varejo:* R$ 1.800,00 (1 venda)\n• *Atacado:* R$ 2.500,00 (1 venda)"
   - Se perguntar especificamente sobre Varejo ou Atacado, responda apenas a categoria pedida com total e quantidade.
2. Histórico de Vendas / Extrato de Vendas do Atacado:
   - Se pedir "histórico do atacado" ou "extrato de vendas do atacado":
     -> Mande o resumo do mês (total faturado, quantidade e clientes) e pergunte em 1 linha se deseja filtrar por outro período específico (ex: "Deseja ver alguma semana ou mês anterior?").
   - Se pedir "histórico" geral ou "últimas vendas":
     -> Liste as últimas vendas recentes com data, cliente, modelo e valor de forma enxuta (1 a 3 linhas).
3. Fiado / Devedores / Extrato de Lojista Devedor:
   - Diga o saldo total e liste os devedores em 1 a 3 linhas diretas.
   - Exemplo: "O saldo em aberto é R$ 21.400,00 (CL: 4 aparelhos). Você pode enviar !extrato cl para gerar o comprovante de débito com PIX."
4. Registrar Venda ("Fiz uma venda", "Registra a venda"):
   - Se o lojista disser que vendeu algo mas faltar dados:
     -> Pergunte educadamente e direto o modelo do aparelho, valor, comprador e se foi no Atacado ou Varejo, e peça confirmação.
5. Estoque:
   - Responda apenas o que foi perguntado com quantidade e valor (1 a 2 linhas).
6. Planos:
   - Liste apenas os 3 planos e seus valores em 3 linhas curtas, informando o plano atual dele.
7. "O que você faz?" ou "?":
   - Em 3 linhas curtas: consulto vendas e relatórios (hoje, semana, mês, atacado/varejo), estoque em tempo real, saldo e extratos de fiado, checo IMEI e registro vendas.`;

  const modelosParaTestar = [
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-3.7-flash',
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
