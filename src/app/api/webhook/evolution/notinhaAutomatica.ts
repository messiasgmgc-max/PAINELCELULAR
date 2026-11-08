import { gerarReciboPdfBuffer } from '@/lib/recibo/gerarReciboPdf';
import { SupabaseClient } from '@supabase/supabase-js';
import { sanitizarECompletarVendaParsed, normalizarNomeModelo, ParsedVenda, extrairCorDeTexto } from '@/lib/vendas/parseVendaTexto';
import { estaNoEstoque } from '@/lib/estoque/ciclo';
import { registrarEntradaEstoque } from '@/lib/estoque/movimentacoes';
import { registrarVendaAtomica, ErroVenda } from '@/lib/vendas/vendaAtomica';
import { sanitizarTextoWhatsApp } from '@/lib/whatsappFormatting';
import { obterEmojiDaCor } from './entradaInteligente';

export interface AparelhoEstoqueConsulta {
  id: string;
  modelo?: string | null;
  capacidade?: string | null;
  cor?: string | null;
  imei?: string | null;
  preco?: number | null;
  custo?: number | null;
  status?: string | null;
  ativo?: boolean | null;
  data_saida?: string | null;
  cliente?: string | null;
  dataCadastro?: string | null;
}

export interface ResultadoCruzamentoEstoque {
  status: 'confirmado' | 'ja_vendido' | 'nao_encontrado' | 'ambiguo' | 'sem_estoque';
  mensagem: string;
  aparelhoEncontrado?: AparelhoEstoqueConsulta;
  candidatos?: AparelhoEstoqueConsulta[];
}

export interface ItemPropostaNotinha {
  modelo: string;
  capacidade?: string;
  cor?: string;
  imei?: string;
  bateria?: number;
  condicao?: string;
  observacaoItem?: string;
  statusEstoque: string;
  aparelhoId?: string;
  custo?: number;
  valorUnitario?: number;
  modeloTroca?: string;
  capacidadeTroca?: string;
  corTroca?: string;
  imeiTroca?: string;
  valorTroca?: number;
}

export interface TrocaPropostaNotinha {
  modelo: string;
  capacidade?: string;
  cor?: string;
  imei?: string;
  bateria?: number;
  valor?: number;
  observacoes?: string;
}

export interface PropostaNotinha {
  id: string;
  lojaId?: string;
  remoteJid?: string;
  messageId?: string;
  clienteNome: string;
  cpf?: string;
  telefone?: string;
  email?: string;
  enderecoEntrega?: string;
  modelo: string;
  capacidade?: string;
  cor?: string;
  imei?: string;
  statusEstoque: string;
  aparelhoId?: string;
  itens?: ItemPropostaNotinha[];
  valorTotal: number;
  custo?: number;
  formaPagamento: string;
  isUpgrade: boolean;
  modeloTroca?: string;
  imeiTroca?: string;
  valorTroca?: number;
  trocas?: TrocaPropostaNotinha[];
  vendedor?: string;
  observacoes?: string;
  criadoEm?: number;
}

const digitos = (val: unknown) => String(val ?? '').replace(/\D/g, '');

/**
 * Limpa palavras parasitas do nome do modelo (como "imei", "lacrado", capacidade, cor, bateria, garantia, menções a RAM e memória)
 */
export function limparNomeModelo(m: string): string {
  let limpo = (m || '').trim();

  // Remove prefixo numérico de lista/quantidade ou prefixo "Upgrade" (ex: "1 - ", "2x ", "• ", "Upgrade ")
  limpo = limpo.replace(/^\s*(?:\d+\s*(?:[-–—.)]|x|un|unid(?:ades?)?)\s*|[•*-]\s*)/i, '');
  limpo = limpo.replace(/^\s*(?:upgrade|troca|trade[- ]?in)\b\s*[:=-]?\s*/i, '');

  // Separa número colado com pro/plus/max/mini (ex: "15pro" -> "15 Pro")
  limpo = limpo
    .replace(/\b(\d+)(pro\s*max|promax)\b/gi, '$1 Pro Max')
    .replace(/\b(\d+)(pro)\b/gi, '$1 Pro')
    .replace(/\b(\d+)(plus)\b/gi, '$1 Plus')
    .replace(/\b(\d+)(mini)\b/gi, '$1 Mini');

  // Remove menção a imei, serial, lacrado, seminovo, bateria, garantia, gb, cores comuns, fragmentos de RAM/memória e capacidades como "256g"
  limpo = limpo
    .replace(/\bimei\b.*$/i, '')
    .replace(/\+?\s*R\$\s*[0-9.,]+/gi, '')
    .replace(/(?:->|-->|=>|➔|➜|➡️|➡)/g, ' ')
    .replace(/\b(?:com|sem)\s+detalhes?\b/gi, '')
    .replace(/\b(?:upgrade|troca|trade[- ]?in)\b/gi, '')
    .replace(/(?:bateria|bat|sa[úu]de(?:\s*da\s*bateria)?)\s*[:=]?\s*\d{1,3}\s*%?/gi, '')
    .replace(/\b\d{1,3}\s*%/g, '')
    .replace(/\bgarantia\s+apple\b/gi, '')
    .replace(/\b(?:com\s+)?garantia\b/gi, '')
    .replace(/\b(?:lacrado|seminovo|novo|usado|caixa\s*fechada)\b/gi, '')
    .replace(/\b\d+\s*(?:gb|tb|g)\s*(?:de\s+)?(?:ram|mem[oó]ria|armazenamento|rom)\b/gi, '')
    .replace(/\b\d+\s*(?:gb|tb|g)\b/gi, '')
    .replace(/(?:,\s*)?(?:de\s+)?ram\s*(?:e\s*)?(?:de\s+)?(?:mem[oó]ria|armazenamento|rom)?\b/gi, '')
    .replace(/\b(?:de\s+)?(?:ram|mem[oó]ria|armazenamento|rom)\b/gi, '')
    .replace(
      /\b(?:deep\s*blue|sierra\s*blue|pacific\s*blue|space\s*black|space\s*gr[ae]y|meia\s*noite|meia-noite|midnight|starlight|estelar|ultramarine|ultramarino|preto|preta|branco|branca|azul|dourado|dourada|prata|verde|roxo|cinza|grafite|tit[aâ]nio|titanio|rose|rosa|amarelo|vermelho|vermelha|laranja|orange|coral|natural|black|white|blue|gold|silver|green|purple|gray|grey|graphite|titanium|desert|deserto|alpine|teal)\b/gi,
      ''
    )
    .replace(/[,\s]+e\s*$/i, '')
    .replace(/\s*,\s*e\s+/gi, ' ')
    .replace(/\s+e\s*$/i, '')
    .replace(/(?:,\s*de|\s+de)+$/gi, '')
    .replace(/^[,\s+-]+|[,\s+-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Capitaliza modelos populares
  limpo = limpo
    .replace(/\bpro\s*max\b/gi, 'Pro Max')
    .replace(/\bpro\b/gi, 'Pro')
    .replace(/\bplus\b/gi, 'Plus')
    .replace(/\bmini\b/gi, 'Mini');

  return normalizarNomeModelo(limpo);
}

/**
 * Remove menções de WhatsApp (@5531..., @lid, @Astrogeek, @bot, etc.) preservando as quebras de linha do formulário.
 */
export function limparMencoesBot(texto: string): string {
  if (!texto || typeof texto !== 'string') return '';
  return texto
    .replace(/(^|[\s,;(])@\d{6,22}\b/g, '$1 ')
    .replace(/(^|[\s,;(])@(?:astrogeek|phone\s*center|phonecenter|lucas\s*imports|lucasimports|bot)\b/gi, '$1 ')
    .split(/\r?\n/)
    .map((linha) => linha.replace(/[ \t]{2,}/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface ResultadoMensagemMarcadaBot {
  foiMarcado: boolean;
  usouMensagemCitada: boolean;
  tipoCitado?: 'texto' | 'imagem' | 'resumo_etiqueta';
  textoEfetivo: string;
  textoOriginalUsuario: string;
  textoSemMencao: string;
  quotedImageMessage?: any;
  quotedStanzaId?: string;
  quotedParticipant?: string;
  dadosEtiquetaCitada?: {
    imei?: string | null;
    modelo?: string | null;
    capacidade?: string | null;
    cor?: string | null;
  };
}

/**
 * Detecta quando o usuário marca o bot (@Astrogeek / @número / @lid) em um grupo ou conversa,
 * ou responde (cita) uma mensagem de formulário ou foto pedindo para o bot reler e processar.
 */
export function extrairMensagemMarcadaParaBot(params: {
  msgData: any;
  payload?: any;
  botPhones?: string[];
}): ResultadoMensagemMarcadaBot {
  const { msgData, payload, botPhones = [] } = params || {};
  const messageContent = msgData?.message || {};

  const contextInfo =
    msgData?.contextInfo ||
    messageContent?.extendedTextMessage?.contextInfo ||
    messageContent?.imageMessage?.contextInfo ||
    messageContent?.conversation?.contextInfo ||
    messageContent?.ephemeralMessage?.message?.extendedTextMessage?.contextInfo ||
    messageContent?.ephemeralMessage?.message?.imageMessage?.contextInfo ||
    messageContent?.viewOnceMessage?.message?.extendedTextMessage?.contextInfo ||
    payload?.data?.contextInfo ||
    payload?.data?.message?.extendedTextMessage?.contextInfo ||
    null;

  const mentionedJids: string[] = Array.isArray(contextInfo?.mentionedJid)
    ? contextInfo.mentionedJid.map((j: unknown) => String(j || ''))
    : [];

  const quotedStanzaId: string | undefined =
    contextInfo?.stanzaId || contextInfo?.key?.id || undefined;
  const quotedParticipant: string | undefined =
    contextInfo?.participant || contextInfo?.key?.participant || undefined;

  const quotedContainer = contextInfo?.quotedMessage;
  const rawQuoted =
    quotedContainer?.ephemeralMessage?.message ||
    quotedContainer?.viewOnceMessage?.message ||
    quotedContainer?.viewOnceMessageV2?.message ||
    quotedContainer?.viewOnceMessageV2Extension?.message ||
    quotedContainer?.documentWithCaptionMessage?.message ||
    quotedContainer ||
    null;

  const textoOriginalUsuario = String(
    messageContent?.conversation ||
      messageContent?.extendedTextMessage?.text ||
      messageContent?.imageMessage?.caption ||
      msgData?.caption ||
      ''
  );
  const textoSemMencao = limparMencoesBot(textoOriginalUsuario);

  const quotedImageMessage =
    rawQuoted?.imageMessage ||
    (rawQuoted?.messageType === 'imageMessage' ? rawQuoted : null) ||
    null;

  const quotedTextRaw = String(
    rawQuoted?.conversation ||
      rawQuoted?.extendedTextMessage?.text ||
      rawQuoted?.imageMessage?.caption ||
      rawQuoted?.caption ||
      ''
  ).trim();
  const quotedTextLimpo = limparMencoesBot(quotedTextRaw);

  const temMencaoPorNome = /(?:^|[\s,;(])@(?:astrogeek|phone\s*center|phonecenter|lucas\s*imports|lucasimports|bot)\b/i.test(
    textoOriginalUsuario
  );
  const mencoesNumericasTexto = Array.from(
    textoOriginalUsuario.matchAll(/(?:^|[\s,;(])@(\d{6,22})\b/g)
  ).map((m) => m[1]);

  const todosJidsMencionados = [
    ...mentionedJids.map((j) => j.replace(/@.*$/, '').replace(/\D/g, '')),
    ...mencoesNumericasTexto,
  ].filter(Boolean);

  const botPhonesLimpos = botPhones
    .map((p) => String(p || '').replace(/@.*$/, '').replace(/\D/g, ''))
    .filter((p) => p.length >= 8);

  const bateuBotPhone =
    botPhonesLimpos.length > 0 &&
    todosJidsMencionados.some((m) =>
      botPhonesLimpos.some((bp) => m.endsWith(bp.slice(-8)) || bp.endsWith(m.slice(-8)))
    );

  const temAlgumaMencao =
    temMencaoPorNome || mencoesNumericasTexto.length > 0 || mentionedJids.length > 0;

  const ehPalavraGatilhoReleitura =
    /^(?:!?\s*(?:ler|releia|reler|notinha|nota|pedido|venda|estoque|cadastrar|cadastra|entrada|processar|processa|emitir|analisa|analisar)|bot|astrogeek|faz\s*a\s*notinha|faz\s*a\s*nota|gera\s*a\s*notinha|gera\s*a\s*nota|l[eê]\s*a[ií]|l[eê]\s*isso|olha\s*isso|veja\s*isso)$/i.test(
      textoSemMencao
    );

  const ehQuotedPreviaOuReciboBot =
    /PR[ÉE]VIA DA NOTINHA|NOTINHA EMITIDA COM SUCESSO/i.test(quotedTextRaw);

  const ehQuotedResumoEtiquetaBot =
    /Dados lidos da etiqueta com IA:/i.test(quotedTextRaw) &&
    /IMEI:/i.test(quotedTextRaw);

  const ehQuotedOperacaoValida =
    Boolean(quotedImageMessage) ||
    ehQuotedResumoEtiquetaBot ||
    Boolean(quotedTextLimpo && detectarFormularioOuPedidoVenda(quotedTextLimpo)) ||
    Boolean(quotedTextLimpo && /^(?:!|entrada\b|cadastrar\b|cadastra\b)/i.test(quotedTextLimpo));

  let foiMarcado = false;
  if (rawQuoted) {
    if (
      temMencaoPorNome ||
      bateuBotPhone ||
      ehPalavraGatilhoReleitura ||
      (temAlgumaMencao &&
        (textoSemMencao === '' ||
          ehQuotedOperacaoValida ||
          ehQuotedPreviaOuReciboBot ||
          Boolean(interpretarTextoCorrecaoVenda(textoSemMencao))))
    ) {
      foiMarcado = true;
    }
  } else if (temAlgumaMencao) {
    const mencionouOutroTelefoneExplicito =
      botPhonesLimpos.length > 0 &&
      !bateuBotPhone &&
      !temMencaoPorNome &&
      mentionedJids.length > 0 &&
      mentionedJids.every((j) => j.endsWith('@s.whatsapp.net'));

    if (
      temMencaoPorNome ||
      bateuBotPhone ||
      Boolean(detectarFormularioOuPedidoVenda(textoSemMencao)) ||
      (!mencionouOutroTelefoneExplicito &&
        (Boolean(interpretarTextoCorrecaoVenda(textoSemMencao)) ||
          /^(?:!|entrada\b|cadastrar\b|cadastra\b|estoque\b|vendido\b|vendi\b)/i.test(textoSemMencao)))
    ) {
      foiMarcado = true;
    }
  }

  // 1. Se marcou o bot respondendo a uma FOTO (quotedImageMessage)
  if (foiMarcado && quotedImageMessage) {
    const legendaCombinada =
      textoSemMencao && !ehPalavraGatilhoReleitura
        ? [quotedTextLimpo, textoSemMencao].filter(Boolean).join('\n')
        : quotedTextLimpo;

    return {
      foiMarcado: true,
      usouMensagemCitada: true,
      tipoCitado: 'imagem',
      textoEfetivo: legendaCombinada,
      textoOriginalUsuario,
      textoSemMencao,
      quotedImageMessage,
      quotedStanzaId,
      quotedParticipant,
    };
  }

  // 2. Se marcou o bot respondendo ao resumo de etiqueta já lido pelo bot ("Dados lidos da etiqueta com IA:")
  if (foiMarcado && ehQuotedResumoEtiquetaBot) {
    const imeiMatch = quotedTextRaw.match(/IMEI:\*?\s*`?(\d{4,18})`?/i);
    const modMatch = quotedTextRaw.match(/Modelo:\*?\s*([^\n\r•*]+)/i);
    const capMatch = quotedTextRaw.match(/Capacidade:\*?\s*([^\n\r•*]+)/i);
    const corMatch = quotedTextRaw.match(/Cor:\*?\s*([^\n\r•*]+)/i);

    const limparCampoEtiqueta = (v?: string) => {
      const s = (v || '').replace(/[*`_]/g, '').trim();
      return !s || /n[aã]o informad[oa]|padr[aã]o/i.test(s) ? null : s;
    };

    return {
      foiMarcado: true,
      usouMensagemCitada: true,
      tipoCitado: 'resumo_etiqueta',
      textoEfetivo: textoSemMencao,
      textoOriginalUsuario,
      textoSemMencao,
      quotedStanzaId,
      quotedParticipant,
      dadosEtiquetaCitada: {
        imei: imeiMatch ? imeiMatch[1].replace(/\D/g, '') : null,
        modelo: limparCampoEtiqueta(modMatch?.[1]),
        capacidade: limparCampoEtiqueta(capMatch?.[1]),
        cor: limparCampoEtiqueta(corMatch?.[1]),
      },
    };
  }

  // 3. Se respondeu à própria PRÉVIA DA NOTINHA do bot (ex: "@Astrogeek sim" ou "@Astrogeek 4800")
  if (rawQuoted && ehQuotedPreviaOuReciboBot) {
    return {
      foiMarcado,
      usouMensagemCitada: false,
      textoEfetivo: textoSemMencao,
      textoOriginalUsuario,
      textoSemMencao,
      quotedStanzaId,
      quotedParticipant,
    };
  }

  // 4. Se marcou o bot respondendo a uma mensagem de texto (ex: Formulário de pedido, Entrada de estoque, Comando)
  if (foiMarcado && quotedTextLimpo) {
    let textoFinalCitado = quotedTextLimpo;

    // Se o usuário enviou um complemento junto com a marcação (ex: "@Astrogeek 4800" ao marcar um formulário sem valor)
    if (textoSemMencao && !ehPalavraGatilhoReleitura) {
      const correcao = interpretarTextoCorrecaoVenda(textoSemMencao);
      if (correcao?.campo === 'valor') {
        textoFinalCitado = `${quotedTextLimpo}\nValor total: R$ ${correcao.valor}`;
      } else if (correcao?.campo === 'imei') {
        textoFinalCitado = `${quotedTextLimpo}\nIMEI: ${correcao.valor}`;
      } else if (correcao?.campo === 'cor') {
        textoFinalCitado = `${quotedTextLimpo}\nCor: ${correcao.valor}`;
      } else if (correcao?.campo === 'cliente') {
        textoFinalCitado = `${quotedTextLimpo}\nNome: ${correcao.valor}`;
      }
    }

    return {
      foiMarcado: true,
      usouMensagemCitada: true,
      tipoCitado: 'texto',
      textoEfetivo: textoFinalCitado,
      textoOriginalUsuario,
      textoSemMencao,
      quotedStanzaId,
      quotedParticipant,
    };
  }

  // 5. Caso o usuário envie uma FOTO direta citando um formulário de texto anterior
  const enviouFotoDireta = Boolean(
    messageContent?.imageMessage || msgData?.imageMessage || msgData?.messageType === 'imageMessage'
  );
  if (enviouFotoDireta && quotedTextLimpo && !ehQuotedPreviaOuReciboBot && detectarFormularioOuPedidoVenda(quotedTextLimpo)) {
    const legendaComFormularioCitado = [textoSemMencao, quotedTextLimpo].filter(Boolean).join('\n');
    return {
      foiMarcado: true,
      usouMensagemCitada: true,
      tipoCitado: 'texto',
      textoEfetivo: legendaComFormularioCitado,
      textoOriginalUsuario,
      textoSemMencao,
      quotedStanzaId,
      quotedParticipant,
    };
  }

  return {
    foiMarcado,
    usouMensagemCitada: false,
    textoEfetivo: foiMarcado ? textoSemMencao : textoOriginalUsuario,
    textoOriginalUsuario,
    textoSemMencao,
    quotedStanzaId,
    quotedParticipant,
  };
}

/**
 * Detecta se a mensagem enviada contém dados de um pedido ou venda a ser faturada.
 */
export function detectarFormularioOuPedidoVenda(texto: string): ParsedVenda | null {
  if (!texto || typeof texto !== 'string') return null;
  const t = limparMencoesBot(texto);
  if (t.length < 15) return null;

  // Ignora mensagens geradas pelo próprio bot (prévias, recibos emitidos ou resumos de OCR de etiqueta)
  if (
    /PR[ÉE]VIA DA NOTINHA|NOTINHA EMITIDA COM SUCESSO|Dados lidos da etiqueta com IA:|APARELHO N[AÃ]O ENCONTRADO NO ESTOQUE|NOVO APARELHO CADASTRADO NO ESTOQUE/i.test(
      t
    )
  ) {
    return null;
  }

  // Checa se tem indício de venda/pedido (aceita atalhos, formulários ou frases naturais)
  const indicios = [
    /para finalizar seu pedido/i,
    /dados pessoais/i,
    /endereço para entrega/i,
    /forma de pagamento/i,
    /\bvendido\b/i,
    /\bvendi\b/i,
    /\bvenda\b/i,
    /\bnova venda\b/i,
    /\bpedido\b/i,
    /\bpedidos\b/i,
    /\bnotinha\b/i,
    /\bnota\b/i,
    /\bformul[aá]rio\b/i,
    /\bcliente\b/i,
    /\bimei\b/i,
    /\bupgrade\b/i,
    /^!(?:pedido|notinha|venda)\b/i,
  ];

  const temIndicio = indicios.some((regex) => regex.test(t));
  if (!temIndicio) return null;

  let parsed = sanitizarECompletarVendaParsed(null, t);

  // Fallback para frases em linha única (ex: "Vendido iPhone 15 128gb preto por 3500 para Carlos no Pix")
  if (!parsed.aparelho?.modelo || !parsed.valorTotal) {
    const matchLinhaSimples = t.match(/(?:vendido|vendi|venda)\s+(.+?)(?:\s+por|\s+de|\s+a|\s+valor|\s*R?\$)\s*([\d.,]+)(?:\s+(?:para|pro|pra)\s+([A-Za-zÀ-ÖØ-öø-ÿ\s]+?))?(?:\s+(?:no|via|em)\s+([A-Za-z\s]+))?$/i);
    if (matchLinhaSimples) {
      const modeloRaw = matchLinhaSimples[1].trim();
      const valorRaw = matchLinhaSimples[2].replace(/\./g, '').replace(',', '.');
      const compradorRaw = matchLinhaSimples[3]?.trim();
      const formaPgtoRaw = matchLinhaSimples[4]?.trim();

      parsed = {
        cliente: { nome: compradorRaw || parsed.cliente?.nome || null },
        aparelho: { modelo: modeloRaw },
        isUpgrade: false,
        tradeIn: null,
        formaPagamento: formaPgtoRaw || 'dinheiro',
        valorTotal: parseFloat(valorRaw) || null,
        camposFaltantes: [],
      };
    }
  }

  // Se não identificou nem modelo nem valor, não é uma venda válida
  if (!parsed.aparelho?.modelo && !parsed.valorTotal) {
    return null;
  }

  // Se tem modelo, limpa e normaliza (inclusive na lista de múltiplos aparelhos e trocas)
  if (parsed.aparelho?.modelo) {
    parsed.aparelho.modelo = limparNomeModelo(parsed.aparelho.modelo);
  }
  if (Array.isArray(parsed.aparelhos) && parsed.aparelhos.length > 0) {
    parsed.aparelhos = parsed.aparelhos.map((ap) => ({
      ...ap,
      modelo: ap.modelo ? limparNomeModelo(ap.modelo) : ap.modelo,
      tradeIn: ap.tradeIn
        ? {
            ...ap.tradeIn,
            modelo: ap.tradeIn.modelo ? limparNomeModelo(ap.tradeIn.modelo) : ap.tradeIn.modelo,
          }
        : ap.tradeIn,
    }));
  }
  if (parsed.tradeIn?.modelo) {
    parsed.tradeIn.modelo = limparNomeModelo(parsed.tradeIn.modelo);
  }
  if (Array.isArray(parsed.tradeIns) && parsed.tradeIns.length > 0) {
    parsed.tradeIns = parsed.tradeIns.map((t) => ({
      ...t,
      modelo: t.modelo ? limparNomeModelo(t.modelo) : t.modelo,
    }));
  }

  return parsed;
}

/**
 * Cruza os dados do aparelho a ser vendido com a base de estoque (ativos e saídos).
 */
export function cruzarAparelhoComEstoque(
  estoque: AparelhoEstoqueConsulta[],
  dadosAparelho: {
    modelo?: string | null;
    capacidade?: string | null;
    cor?: string | null;
    imei?: string | null;
  }
): ResultadoCruzamentoEstoque {
  const imeiAlvo = digitos(dadosAparelho.imei);

  // 1. Busca prioritária por IMEI quando informado (aceita IMEI de 15 dígitos ou final de 4 a 6 dígitos)
  if (imeiAlvo.length >= 4) {
    let comMesmoImei = estoque.filter((a) => {
      const cad = digitos(a.imei);
      if (cad.length < 4) return false;
      if (imeiAlvo.length >= 15 && cad.length >= 15) return imeiAlvo === cad;
      return cad.endsWith(imeiAlvo) || imeiAlvo.endsWith(cad);
    });

    // Se houver mais de um aparelho com o mesmo final de IMEI (4 dígitos), desempata por modelo e capacidade
    if (comMesmoImei.length > 1 && dadosAparelho.modelo) {
      const modAlvo = dadosAparelho.modelo.toLowerCase();
      const porModelo = comMesmoImei.filter((a) => (a.modelo || '').toLowerCase().includes(modAlvo) || modAlvo.includes((a.modelo || '').toLowerCase()));
      if (porModelo.length > 0) {
        comMesmoImei = porModelo;
      }
    }

    if (comMesmoImei.length > 0) {
      // Prioriza aparelho que está efetivamente disponível no estoque ativo
      const primeiro = comMesmoImei.find((a) => estaNoEstoque(a as any)) || comMesmoImei[0];
      const noEstoqueAtivo = estaNoEstoque(primeiro as any);

      if (noEstoqueAtivo) {
        const cadDig = digitos(primeiro.imei);
        let msgConfirmado = 'Aparelho confirmado no estoque ✅';
        if (imeiAlvo.length >= 15 && cadDig.length > 0 && cadDig.length < 15) {
          msgConfirmado = `Aparelho confirmado no estoque pelo final ${cadDig} (IMEI: ${imeiAlvo}) ✅`;
        } else if (imeiAlvo.length < 15 && primeiro.imei) {
          msgConfirmado = `Aparelho confirmado no estoque pelo final ${imeiAlvo} (IMEI: ${primeiro.imei}) ✅`;
        }

        return {
          status: 'confirmado',
          mensagem: msgConfirmado,
          aparelhoEncontrado: primeiro,
        };
      } else {
        const dataSaidaFmt = primeiro.data_saida
          ? new Date(primeiro.data_saida).toLocaleDateString('pt-BR')
          : 'data anterior';
        const comprador = primeiro.cliente ? ` para ${primeiro.cliente}` : '';
        return {
          status: 'ja_vendido',
          mensagem: `⚠️ Este IMEI (${primeiro.imei || imeiAlvo}) já consta como vendido/baixado em ${dataSaidaFmt}${comprador}.`,
          aparelhoEncontrado: primeiro,
        };
      }
    } else {
      return {
        status: 'nao_encontrado',
        mensagem: `IMEI ${imeiAlvo} não localizado no estoque (será associado à venda)`,
      };
    }
  }

  // 2. Busca por modelo/capacidade/cor quando não tem IMEI
  const normModeloComparacao = (str?: string | null) =>
    limparNomeModelo(str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\b(apple|xiaomi|samsung|motorola|realme)\b/gi, '')
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const modeloAlvoNorm = normModeloComparacao(dadosAparelho.modelo);
  const capAlvoDig = digitos(dadosAparelho.capacidade);

  const ativos = estoque.filter((a) => estaNoEstoque(a as any));
  let candidatos = ativos.filter((a) => {
    const modItemNorm = normModeloComparacao(a.modelo);
    const capItemDig = digitos(a.capacidade);
    const bateModelo = Boolean(modeloAlvoNorm && modItemNorm && modeloAlvoNorm === modItemNorm);
    const bateCap = !capAlvoDig || (Boolean(capItemDig) && capAlvoDig === capItemDig);
    return bateModelo && bateCap;
  });

  // Se houver múltiplos aparelhos do mesmo modelo/capacidade e a cor foi informada, desempata pela cor
  if (candidatos.length > 1 && dadosAparelho.cor) {
    const corAlvo = extrairCorDeTexto(dadosAparelho.cor) || dadosAparelho.cor.trim().toLowerCase();
    const porCor = candidatos.filter((a) => {
      const corItem = extrairCorDeTexto(a.cor) || (a.cor || '').trim().toLowerCase();
      return Boolean(corItem && corAlvo && corItem.toLowerCase() === corAlvo.toLowerCase());
    });
    if (porCor.length > 0) {
      candidatos = porCor;
    }
  }

  if (candidatos.length === 1) {
    return {
      status: 'confirmado',
      mensagem: `Aparelho único localizado no estoque (IMEI: ${candidatos[0].imei || 's/n'}) ✅`,
      aparelhoEncontrado: candidatos[0],
    };
  }

  if (candidatos.length > 1) {
    return {
      status: 'ambiguo',
      mensagem: `Existem ${candidatos.length} aparelhos deste modelo no estoque.`,
      candidatos,
    };
  }

  return {
    status: 'sem_estoque',
    mensagem: 'Nenhum aparelho deste modelo disponível no estoque no momento.',
  };
}

/**
 * Sincroniza os campos de resumo de `PropostaNotinha` a partir da lista `proposta.itens`.
 */
export function sincronizarResumoPropostaMultiItens(proposta: PropostaNotinha): PropostaNotinha {
  const itens = proposta.itens || [];
  if (itens.length === 0) return proposta;

  if (itens.length === 1) {
    const primeiro = itens[0];
    proposta.modelo = primeiro.modelo;
    proposta.capacidade = primeiro.capacidade;
    proposta.cor = primeiro.cor;
    proposta.imei = primeiro.imei;
    proposta.statusEstoque = primeiro.statusEstoque;
    proposta.aparelhoId = primeiro.aparelhoId;
    proposta.custo = primeiro.custo || 0;
  } else {
    proposta.modelo = itens.map((it) => it.modelo).join(' + ');
    proposta.capacidade = itens[0].capacidade;
    proposta.cor = itens[0].cor;
    const todosImeis = itens.map((it) => it.imei).filter(Boolean);
    proposta.imei = todosImeis.length > 0 ? todosImeis.join(' / ') : undefined;
    proposta.aparelhoId = itens[0].aparelhoId;
    proposta.custo = itens.reduce((acc, it) => acc + Number(it.custo || 0), 0);

    const confirmados = itens.filter((it) => Boolean(it.aparelhoId) || /confirmado/i.test(it.statusEstoque)).length;
    if (confirmados === itens.length) {
      proposta.statusEstoque = `Todos os ${itens.length} aparelhos confirmados no estoque ✅`;
    } else {
      proposta.statusEstoque = itens.map((it, idx) => `Item ${idx + 1}: ${it.statusEstoque}`).join(' | ');
    }
  }

  return proposta;
}

/**
 * Constrói uma `PropostaNotinha` (de 1 ou múltiplos aparelhos) cruzando cada item com o estoque
 * e vinculando fotos recentes de etiquetas sem repetir o mesmo aparelho físico ou a mesma foto.
 */
export function construirPropostaNotinha(params: {
  id?: string;
  lojaId?: string;
  remoteJid?: string;
  vendaDetectada: ParsedVenda;
  estoque: AparelhoEstoqueConsulta[];
  fotosRecentes?: FotoRecenteCache[];
  pushName?: string;
}): PropostaNotinha {
  const {
    id = `prop-${Date.now()}`,
    lojaId,
    remoteJid,
    vendaDetectada,
    estoque,
    fotosRecentes = [],
    pushName,
  } = params;

  const aparelhosBrutos =
    Array.isArray(vendaDetectada.aparelhos) && vendaDetectada.aparelhos.length > 0
      ? vendaDetectada.aparelhos
      : [vendaDetectada.aparelho || {}];

  const fotosDisponiveis = [...fotosRecentes];
  const aparelhoIdsUsados = new Set<string>();
  const itensProposta: ItemPropostaNotinha[] = [];
  const tevePrecoExplicitoFormulario: boolean[] = [];

  const modelosExatamenteIguais = (modA?: string | null, modB?: string | null) => {
    if (!modA || !modB) return false;
    return limparNomeModelo(modA).toLowerCase() === limparNomeModelo(modB).toLowerCase();
  };

  for (const ap of aparelhosBrutos) {
    let modelo = limparNomeModelo(ap.modelo || '') || 'Smartphone';
    let capacidade = ap.capacidade || undefined;
    let cor = ap.cor ? extrairCorDeTexto(ap.cor) || ap.cor : undefined;
    let imei = ap.imei || undefined;
    const bateria = ap.bateria ?? undefined;
    const condicao = ap.condicao || (bateria && bateria < 100 ? 'seminovo' : 'novo');
    const observacaoItem = ap.observacoes || undefined;
    const precoExplicito = ap.preco && ap.preco > 0 ? Number(ap.preco) : undefined;
    tevePrecoExplicitoFormulario.push(Boolean(precoExplicito));

    // Se este item ainda não tem IMEI e há fotos recentes disponíveis, escolhe a foto mais compatível
    if (!imei && fotosDisponiveis.length > 0) {
      let idxFoto = -1;
      // 1ª prioridade: modelo exatamente igual + mesma cor
      if (cor) {
        idxFoto = fotosDisponiveis.findIndex((f) => {
          const corFoto = extrairCorDeTexto(f.cor) || f.cor;
          return (
            Boolean(corFoto && corFoto.toLowerCase() === cor!.toLowerCase()) &&
            modelosExatamenteIguais(f.modelo, modelo)
          );
        });
      }
      // 2ª prioridade: modelo exatamente igual
      if (idxFoto === -1) {
        idxFoto = fotosDisponiveis.findIndex((f) => modelosExatamenteIguais(f.modelo, modelo));
      }
      // 3ª prioridade: modelo compatível + mesma cor
      if (idxFoto === -1 && cor) {
        idxFoto = fotosDisponiveis.findIndex((f) => {
          const corFoto = extrairCorDeTexto(f.cor) || f.cor;
          return (
            Boolean(corFoto && corFoto.toLowerCase() === cor!.toLowerCase()) &&
            (!f.modelo || !marcasConflitantes(f.modelo, modelo))
          );
        });
      }
      // 4ª prioridade: modelo compatível
      if (idxFoto === -1) {
        idxFoto = fotosDisponiveis.findIndex(
          (f) => !f.modelo || modelosSaoCompativeis(f.modelo, modelo) || !marcasConflitantes(f.modelo, modelo)
        );
      }

      if (idxFoto !== -1) {
        const [fotoConsumida] = fotosDisponiveis.splice(idxFoto, 1);
        if (fotoConsumida.imei) imei = fotoConsumida.imei;
        if (!capacidade && fotoConsumida.capacidade) capacidade = fotoConsumida.capacidade;
        if (!cor && fotoConsumida.cor) cor = extrairCorDeTexto(fotoConsumida.cor) || fotoConsumida.cor;
        if (modelo === 'Smartphone' && fotoConsumida.modelo) {
          modelo = limparNomeModelo(fotoConsumida.modelo) || modelo;
        }
      }
    }

    // Filtra estoque para não atribuir o mesmo aparelho físico a 2 itens diferentes na mesma venda
    const estoqueDisponivel = estoque.filter(
      (e) => !e.id || !aparelhoIdsUsados.has(e.id) || (imei && digitos(e.imei) === digitos(imei))
    );

    const cruzamento = cruzarAparelhoComEstoque(estoqueDisponivel, {
      modelo,
      capacidade,
      cor,
      imei,
    });

    const apEnc = cruzamento.aparelhoEncontrado;
    if (apEnc?.id) {
      aparelhoIdsUsados.add(apEnc.id);
    }

    const imeiFinal =
      imei && imei.replace(/\D/g, '').length >= 14
        ? imei
        : apEnc?.imei || imei || undefined;
    const capFinal = capacidade || apEnc?.capacidade || undefined;
    const corBruta = cor || apEnc?.cor || undefined;
    const corFinal = corBruta ? extrairCorDeTexto(corBruta) || corBruta : undefined;

    const tradeInItem = ap.tradeIn;
    const modeloTrocaItem = tradeInItem?.modelo ? limparNomeModelo(tradeInItem.modelo) : undefined;
    const capTrocaItem = tradeInItem?.capacidade || undefined;
    const corTrocaItem = tradeInItem?.cor
      ? extrairCorDeTexto(tradeInItem.cor) || tradeInItem.cor
      : undefined;
    const imeiTrocaItem = tradeInItem?.imei || undefined;
    const valorTrocaItem = tradeInItem?.valor ? Number(tradeInItem.valor) : undefined;

    itensProposta.push({
      modelo,
      capacidade: capFinal,
      cor: corFinal,
      imei: imeiFinal,
      bateria,
      condicao,
      observacaoItem,
      statusEstoque: cruzamento.mensagem,
      aparelhoId: apEnc?.id,
      custo: Number(apEnc?.custo || ap.custo || 0),
      valorUnitario: precoExplicito ?? (apEnc?.preco ? Number(apEnc.preco) : undefined),
      modeloTroca: modeloTrocaItem,
      capacidadeTroca: capTrocaItem,
      corTroca: corTrocaItem,
      imeiTroca: imeiTrocaItem,
      valorTroca: valorTrocaItem,
    });
  }

  // Calcula valor total e distribui entre os itens caso o formulário informe apenas o Valor Total geral
  let valorTotal = Number(vendaDetectada.valorTotal || 0);
  if (valorTotal <= 0) {
    const somaUnitarios = itensProposta.reduce((acc, it) => acc + Number(it.valorUnitario || 0), 0);
    if (somaUnitarios > 0 && itensProposta.every((it) => (it.valorUnitario || 0) > 0)) {
      valorTotal = somaUnitarios;
    }
  }

  if (valorTotal > 0 && itensProposta.length > 0) {
    const todosComPrecoExplicito = tevePrecoExplicitoFormulario.every(Boolean);
    if (!todosComPrecoExplicito) {
      const valorPorItem = Number((valorTotal / itensProposta.length).toFixed(2));
      itensProposta.forEach((it, idx) => {
        if (!tevePrecoExplicitoFormulario[idx] && (!it.valorUnitario || itensProposta.length > 1)) {
          it.valorUnitario =
            idx === itensProposta.length - 1
              ? Number((valorTotal - valorPorItem * (itensProposta.length - 1)).toFixed(2))
              : valorPorItem;
        }
      });
    }
  }

  // Consolida aparelhos recebidos na troca (suporta 1 ou múltiplos upgrades)
  const trocasLista: TrocaPropostaNotinha[] = [];
  if (Array.isArray(vendaDetectada.tradeIns) && vendaDetectada.tradeIns.length > 0) {
    for (const tr of vendaDetectada.tradeIns) {
      if (tr?.modelo) {
        trocasLista.push({
          modelo: limparNomeModelo(tr.modelo) || tr.modelo,
          capacidade: tr.capacidade || undefined,
          cor: tr.cor ? extrairCorDeTexto(tr.cor) || tr.cor : undefined,
          imei: tr.imei || undefined,
          bateria: tr.bateria ?? undefined,
          valor: tr.valor ? Number(tr.valor) : undefined,
          observacoes: tr.observacoes || undefined,
        });
      }
    }
  } else if (vendaDetectada.tradeIn?.modelo) {
    const tr = vendaDetectada.tradeIn;
    trocasLista.push({
      modelo: limparNomeModelo(tr.modelo) || tr.modelo,
      capacidade: tr.capacidade || undefined,
      cor: tr.cor ? extrairCorDeTexto(tr.cor) || tr.cor : undefined,
      imei: tr.imei || undefined,
      bateria: tr.bateria ?? undefined,
      valor: tr.valor ? Number(tr.valor) : undefined,
      observacoes: tr.observacoes || undefined,
    });
  }

  // Se houver 1 item vendido e 1 troca geral, vincula também no item
  if (itensProposta.length === 1 && trocasLista.length === 1 && !itensProposta[0].modeloTroca) {
    itensProposta[0].modeloTroca = trocasLista[0].modelo;
    itensProposta[0].capacidadeTroca = trocasLista[0].capacidade;
    itensProposta[0].corTroca = trocasLista[0].cor;
    itensProposta[0].imeiTroca = trocasLista[0].imei;
    itensProposta[0].valorTroca = trocasLista[0].valor;
  }

  const formatarDescTrocaCurta = (tr: TrocaPropostaNotinha) =>
    `${tr.modelo}${tr.capacidade ? ` ${tr.capacidade}` : ''}${tr.cor ? ` ${tr.cor}` : ''}`
      .replace(/\s+/g, ' ')
      .trim();

  const modeloTrocaConsolidado =
    trocasLista.length > 0
      ? trocasLista.map(formatarDescTrocaCurta).join(' + ')
      : vendaDetectada.tradeIn?.modelo
      ? limparNomeModelo(vendaDetectada.tradeIn.modelo)
      : undefined;

  const valorTrocaTotal =
    trocasLista.reduce((acc, tr) => acc + Number(tr.valor || 0), 0) ||
    Number(vendaDetectada.tradeIn?.valor || vendaDetectada.valorEntradaTroca || 0);

  const proposta: PropostaNotinha = {
    id,
    lojaId,
    remoteJid,
    clienteNome: vendaDetectada.cliente?.nome || pushName || 'Cliente Balcão',
    cpf: vendaDetectada.cliente?.cpf || undefined,
    telefone: vendaDetectada.cliente?.telefone || undefined,
    email: vendaDetectada.cliente?.email || undefined,
    modelo: itensProposta[0]?.modelo || 'Smartphone',
    capacidade: itensProposta[0]?.capacidade,
    cor: itensProposta[0]?.cor,
    imei: itensProposta[0]?.imei,
    statusEstoque: itensProposta[0]?.statusEstoque || '',
    aparelhoId: itensProposta[0]?.aparelhoId,
    itens: itensProposta,
    valorTotal,
    custo: itensProposta.reduce((acc, it) => acc + Number(it.custo || 0), 0),
    formaPagamento: vendaDetectada.formaPagamento || 'Pix',
    isUpgrade: Boolean(vendaDetectada.isUpgrade || trocasLista.length > 0),
    modeloTroca: modeloTrocaConsolidado,
    imeiTroca:
      trocasLista.length > 0
        ? trocasLista.map((tr) => tr.imei).filter(Boolean).join(' / ') || undefined
        : vendaDetectada.tradeIn?.imei || undefined,
    valorTroca: valorTrocaTotal,
    trocas: trocasLista.length > 0 ? trocasLista : undefined,
    vendedor: vendaDetectada.vendedor || pushName || 'WhatsApp',
    observacoes: vendaDetectada.observacoes || undefined,
  };

  return sincronizarResumoPropostaMultiItens(proposta);
}

/**
 * Vincula os dados lidos de uma etiqueta (foto) a uma proposta pendente.
 * Quando a proposta possui múltiplos aparelhos (`proposta.itens`), preenche o primeiro aparelho
 * compatível que ainda esteja sem IMEI, preservando os IMEIs já vinculados anteriormente!
 */
export function vincularFotoEmPropostaNotinha(
  proposta: PropostaNotinha,
  foto: {
    imei?: string | null;
    modelo?: string | null;
    capacidade?: string | null;
    cor?: string | null;
  },
  estoque: AparelhoEstoqueConsulta[]
): PropostaNotinha {
  if (!Array.isArray(proposta.itens) || proposta.itens.length === 0) {
    proposta.itens = [
      {
        modelo: proposta.modelo,
        capacidade: proposta.capacidade,
        cor: proposta.cor,
        imei: proposta.imei,
        statusEstoque: proposta.statusEstoque,
        aparelhoId: proposta.aparelhoId,
        custo: proposta.custo,
        valorUnitario: proposta.valorTotal,
      },
    ];
  }

  const itens = proposta.itens;
  const imeiFoto = (foto.imei || '').trim();
  const corFotoNorm = foto.cor ? extrairCorDeTexto(foto.cor) || foto.cor : undefined;
  const modelosExatamenteIguais = (modA?: string | null, modB?: string | null) => {
    if (!modA || !modB) return false;
    return limparNomeModelo(modA).toLowerCase() === limparNomeModelo(modB).toLowerCase();
  };

  let idxAlvo = -1;

  // 1. Se este exato IMEI já está em algum item, atualiza esse mesmo item
  if (imeiFoto) {
    idxAlvo = itens.findIndex((it) => it.imei && digitos(it.imei) === digitos(imeiFoto));
  }

  // 2. Procura entre os itens que AINDA NÃO possuem IMEI:
  //    2a. Modelo exatamente igual + mesma cor
  if (idxAlvo === -1 && foto.modelo && corFotoNorm) {
    idxAlvo = itens.findIndex(
      (it) =>
        !it.imei &&
        modelosExatamenteIguais(foto.modelo, it.modelo) &&
        Boolean(it.cor && (extrairCorDeTexto(it.cor) || it.cor).toLowerCase() === corFotoNorm.toLowerCase())
    );
  }

  //    2b. Modelo exatamente igual sem IMEI
  if (idxAlvo === -1 && foto.modelo) {
    idxAlvo = itens.findIndex((it) => !it.imei && modelosExatamenteIguais(foto.modelo, it.modelo));
  }

  //    2c. Modelo compatível + mesma cor
  if (idxAlvo === -1 && corFotoNorm) {
    idxAlvo = itens.findIndex(
      (it) =>
        !it.imei &&
        Boolean(it.cor && (extrairCorDeTexto(it.cor) || it.cor).toLowerCase() === corFotoNorm.toLowerCase()) &&
        (!foto.modelo || modelosSaoCompativeis(foto.modelo, it.modelo) || !marcasConflitantes(foto.modelo, it.modelo))
    );
  }

  //    2d. Modelo compatível sem IMEI
  if (idxAlvo === -1 && foto.modelo) {
    idxAlvo = itens.findIndex((it) => !it.imei && modelosSaoCompativeis(foto.modelo, it.modelo));
  }

  //    2e. Qualquer item sem IMEI de marca não conflitante
  if (idxAlvo === -1) {
    idxAlvo = itens.findIndex((it) => !it.imei && (!foto.modelo || !marcasConflitantes(foto.modelo, it.modelo)));
  }

  //    2f. Qualquer item sem IMEI
  if (idxAlvo === -1) {
    idxAlvo = itens.findIndex((it) => !it.imei);
  }

  // 3. Fallback caso todos os itens já tenham IMEI: atualiza o item mais compatível (ou o primeiro)
  if (idxAlvo === -1) {
    if (foto.modelo) {
      idxAlvo = itens.findIndex((it) => modelosExatamenteIguais(foto.modelo, it.modelo));
    }
    if (idxAlvo === -1 && corFotoNorm) {
      idxAlvo = itens.findIndex(
        (it) => Boolean(it.cor && (extrairCorDeTexto(it.cor) || it.cor).toLowerCase() === corFotoNorm.toLowerCase())
      );
    }
    if (idxAlvo === -1 && foto.modelo) {
      idxAlvo = itens.findIndex((it) => modelosSaoCompativeis(foto.modelo, it.modelo));
    }
    if (idxAlvo === -1) idxAlvo = 0;
  }

  const itemAlvo = itens[idxAlvo];
  if (imeiFoto) itemAlvo.imei = imeiFoto;
  if (!itemAlvo.capacidade && foto.capacidade) itemAlvo.capacidade = foto.capacidade;
  if (!itemAlvo.cor && corFotoNorm) itemAlvo.cor = corFotoNorm;
  if ((!itemAlvo.modelo || itemAlvo.modelo === 'Smartphone') && foto.modelo) {
    itemAlvo.modelo = limparNomeModelo(foto.modelo) || itemAlvo.modelo;
  }

  // IDs de estoque já usados pelos OUTROS itens da proposta
  const idsUsadosOutros = new Set<string>(
    itens
      .filter((_, i) => i !== idxAlvo)
      .map((it) => it.aparelhoId)
      .filter((id): id is string => Boolean(id))
  );

  const estoqueDisponivel = estoque.filter(
    (e) => !e.id || !idsUsadosOutros.has(e.id) || (itemAlvo.imei && digitos(e.imei) === digitos(itemAlvo.imei))
  );

  const cruzamento = cruzarAparelhoComEstoque(estoqueDisponivel, {
    modelo: itemAlvo.modelo,
    capacidade: itemAlvo.capacidade,
    cor: itemAlvo.cor,
    imei: itemAlvo.imei,
  });

  itemAlvo.statusEstoque = cruzamento.mensagem;
  if (cruzamento.aparelhoEncontrado) {
    const apEnc = cruzamento.aparelhoEncontrado;
    itemAlvo.aparelhoId = apEnc.id;
    itemAlvo.custo = Number(apEnc.custo || itemAlvo.custo || 0);
    if (!itemAlvo.imei || itemAlvo.imei.replace(/\D/g, '').length < 14) {
      itemAlvo.imei = apEnc.imei || itemAlvo.imei;
    }
    if (!itemAlvo.capacidade && apEnc.capacidade) itemAlvo.capacidade = apEnc.capacidade;
    if (!itemAlvo.cor && apEnc.cor) itemAlvo.cor = extrairCorDeTexto(apEnc.cor) || apEnc.cor;
    if ((!proposta.valorTotal || proposta.valorTotal <= 0) && itens.length === 1 && apEnc.preco) {
      proposta.valorTotal = Number(apEnc.preco);
      itemAlvo.valorUnitario = Number(apEnc.preco);
    }
  }

  return sincronizarResumoPropostaMultiItens(proposta);
}

/**
 * Formata a mensagem de prévia da notinha para envio no WhatsApp (suporta 1 ou múltiplos aparelhos e 1 ou múltiplos upgrades).
 */
export function formatarMensagemPreviaNotinha(proposta: PropostaNotinha): string {
  const valorFmt = Number(proposta.valorTotal || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const linhas: string[] = [
    '🧾 *PRÉVIA DA NOTINHA — LUCAS IMPORTS*',
    '──────────────────────────',
    `👤 *Cliente:* ${proposta.clienteNome || 'Cliente Não Informado'}${proposta.cpf ? ` (CPF: ${proposta.cpf})` : ''}`,
  ];

  const itens = Array.isArray(proposta.itens) && proposta.itens.length > 0 ? proposta.itens : null;

  if (itens && itens.length > 1) {
    linhas.push(`📱 *Aparelhos (${itens.length}):*`);
    itens.forEach((item, idx) => {
      const emojiCorItem = obterEmojiDaCor(item.cor);
      const corItemFmt = item.cor ? ` ${emojiCorItem} ${item.cor}` : '';
      const batFmt = item.bateria ? ` (Bat: ${item.bateria}%)` : '';
      const obsFmt = item.observacaoItem ? ` [${item.observacaoItem}]` : '';
      const valUnitFmt =
        item.valorUnitario && item.valorUnitario > 0
          ? ` — R$ ${Number(item.valorUnitario).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : '';
      const descItem = `${item.modelo} ${item.capacidade || ''}${corItemFmt}${batFmt}${obsFmt}${valUnitFmt}`
        .replace(/\s+/g, ' ')
        .trim();

      linhas.push(`   *${idx + 1}.* ${descItem}`);
      if (item.imei) {
        linhas.push(`      🔢 *IMEI:* ${item.imei} [${item.statusEstoque}]`);
      } else {
        linhas.push(`      📦 *Estoque:* ${item.statusEstoque}`);
      }
      if (item.modeloTroca) {
        const emojiCorTroca = item.corTroca ? obterEmojiDaCor(item.corTroca) : '';
        const corTrocaFmt = item.corTroca ? ` ${emojiCorTroca} ${item.corTroca}` : '';
        const descTrocaItem = `${item.modeloTroca} ${item.capacidadeTroca || ''}${corTrocaFmt}`
          .replace(/\s+/g, ' ')
          .trim();
        linhas.push(`      🔄 *Upgrade (Entrada):* ${descTrocaItem}`);
      }
    });
  } else {
    const itemUnico = itens?.[0];
    const corAlvo = itemUnico?.cor || proposta.cor;
    const emojiCor = obterEmojiDaCor(corAlvo);
    const corFmt = corAlvo ? ` ${emojiCor} ${corAlvo}` : '';
    const batFmt = itemUnico?.bateria ? ` (Bat: ${itemUnico.bateria}%)` : '';
    const obsFmt = itemUnico?.observacaoItem ? ` [${itemUnico.observacaoItem}]` : '';

    linhas.push(
      `📱 *Aparelho:* ${proposta.modelo} ${proposta.capacidade || ''}${corFmt}${batFmt}${obsFmt}`
        .replace(/\s+/g, ' ')
        .trim()
    );

    if (proposta.imei) {
      linhas.push(`🔢 *IMEI:* ${proposta.imei} [${proposta.statusEstoque}]`);
    } else {
      linhas.push(`📦 *Estoque:* ${proposta.statusEstoque}`);
    }
  }

  if (proposta.valorTotal && proposta.valorTotal > 0) {
    linhas.push(`💰 *Valor Total:* R$ ${valorFmt}`);
  } else {
    linhas.push('💰 *Valor Total:* ⚠️ *Não informado no formulário!*');
  }
  linhas.push(`💳 *Forma de Pagamento:* ${proposta.formaPagamento || 'Não informada'}`);

  const trocasLista = Array.isArray(proposta.trocas) && proposta.trocas.length > 0 ? proposta.trocas : null;
  if (proposta.isUpgrade && trocasLista && trocasLista.length > 1) {
    linhas.push(`🔄 *Upgrade / Troca (${trocasLista.length} aparelhos de entrada):*`);
    trocasLista.forEach((tr) => {
      const emojiCorTr = tr.cor ? obterEmojiDaCor(tr.cor) : '';
      const corTrFmt = tr.cor ? ` ${emojiCorTr} ${tr.cor}` : '';
      const valTrFmt =
        tr.valor && tr.valor > 0
          ? ` (Avaliado em R$ ${Number(tr.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`
          : '';
      const descTr = `${tr.modelo} ${tr.capacidade || ''}${corTrFmt}${valTrFmt}`.replace(/\s+/g, ' ').trim();
      linhas.push(`   • ${descTr}`);
      if (tr.imei) {
        linhas.push(`     *IMEI Entrada:* ${tr.imei}`);
      }
    });
  } else if (proposta.isUpgrade && (proposta.modeloTroca || (trocasLista && trocasLista.length === 1))) {
    const trUnica = trocasLista?.[0];
    const emojiCorTr = trUnica?.cor ? obterEmojiDaCor(trUnica.cor) : '';
    const corTrFmt = trUnica?.cor ? ` ${emojiCorTr} ${trUnica.cor}` : '';
    const descTrUnica = trUnica
      ? `${trUnica.modelo} ${trUnica.capacidade || ''}${corTrFmt}`.replace(/\s+/g, ' ').trim()
      : proposta.modeloTroca!;
    const valTrocaFmt = proposta.valorTroca
      ? ` (Avaliado em R$ ${Number(proposta.valorTroca).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`
      : '';
    linhas.push(`🔄 *Upgrade / Troca:* ${descTrUnica}${valTrocaFmt}`);
    if (proposta.imeiTroca) {
      linhas.push(`   *IMEI Entrada:* ${proposta.imeiTroca}`);
    }
  }

  if (proposta.enderecoEntrega) {
    linhas.push(`📍 *Entrega:* ${proposta.enderecoEntrega}`);
  }

  linhas.push('──────────────────────────');
  if (proposta.valorTotal && proposta.valorTotal > 0) {
    linhas.push('👉 Reaja com ✅ nesta mensagem ou responda "SIM" / "CONFIRMAR" para emitir a notinha.');
  } else {
    linhas.push('👉 *Para emitir:* informe o valor respondendo ex: "o valor é 4800" (ou reaja com ✅ após informar o valor).');
  }
  linhas.push('❌ Reaja com ❌ ou responda "CANCELAR" para cancelar, ou informe o dado a corrigir.');

  return sanitizarTextoWhatsApp(linhas.join('\n'));
}

/**
 * Interpreta se uma reação é de confirmação ou recusa da nota.
 */
export function interpretarReacaoNotinha(emoji: string): 'confirmar' | 'cancelar' | null {
  if (!emoji || typeof emoji !== 'string') return null;
  const e = emoji.trim();

  const confirmacoes = ['✅', '💚', '👍', '🟢', '✔️', '✔'];
  if (confirmacoes.includes(e)) return 'confirmar';

  const cancelamentos = ['❌', '👎', '🔴', '✖️', '✖'];
  if (cancelamentos.includes(e)) return 'cancelar';

  return null;
}

/**
 * Interpreta texto de resposta com correção de dados de uma proposta de venda.
 */
export function interpretarTextoCorrecaoVenda(
  texto: string
): { campo: 'valor' | 'imei' | 'cliente' | 'modelo' | 'cor'; valor: any } | null {
  if (!texto || typeof texto !== 'string') return null;
  const t = texto.trim();
  const norm = t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const parseValorFlexivel = (str: string): number => {
    const s = str.trim().replace(/^[^\d]+/, '').replace(/[^\d]+$/, '');
    if (!s) return 0;
    if (s.includes(',')) {
      return parseFloat(s.replace(/\./g, '').replace(',', '.'));
    }
    if (/^\d+\.\d{1,2}$/.test(s)) {
      return parseFloat(s);
    }
    return parseFloat(s.replace(/\./g, ''));
  };

  // 1. Correção de valor por número direto (ex: "5200", "4999.99", "R$ 4.500")
  const matchNumeroPuro = t.match(/^R?\$?\s*([0-9.,]+)$/i);
  if (matchNumeroPuro) {
    const num = parseValorFlexivel(matchNumeroPuro[1]);
    const digitosNum = matchNumeroPuro[1].replace(/\D/g, '');
    if (!isNaN(num) && num > 0 && num < 100000 && digitosNum.length < 10) {
      return { campo: 'valor', valor: num };
    }
  }

  // 2. Correção de valor por frase (ex: "o valor é 5200", "valor certo 4800", "preço: 3500", "o valor e 4800")
  const matchFraseValor =
    t.match(/(?:valor|preco|pre[cç]o|total|fica|ficou)\b[^\d]*?([0-9.,]+)/iu) ||
    t.match(/(?:^|\b(?:[eé]|ser[aá]|por)\s+)R\$\s*([0-9.,]+)/iu) ||
    t.match(/^(?:[eé]|ser[aá]|fica|ficou|por)\s*R?\$?\s*([0-9.,]+)$/iu);

  if (matchFraseValor) {
    const num = parseValorFlexivel(matchFraseValor[1]);
    const digitosNum = matchFraseValor[1].replace(/\D/g, '');
    if (!isNaN(num) && num > 0 && num < 100000 && digitosNum.length < 10) {
      return { campo: 'valor', valor: num };
    }
  }

  // Correção de IMEI (aceita 14 a 16 dígitos ou final de 4 dígitos)
  const matchImei = t.match(/\b(?:final\s*(?:do\s*)?imei|imei\s*final|imei)\s*(?:é|e|correto|certo|novo|\s)*[:=-]?\s*#?(\d{4,16})\b/i);
  if (matchImei) {
    return { campo: 'imei', valor: matchImei[1] };
  }

  // Correção de cor (por nome ou emoji)
  const matchCor = t.match(/(?:cor|nova\s*cor)\s*(?:é|e|correto|certo|nova)?\s*[:=-]?\s*([^\n\r]+)/i);
  if (matchCor) {
    const corDet = extrairCorDeTexto(matchCor[1]);
    if (corDet) {
      return { campo: 'cor', valor: corDet };
    }
  }

  // Correção de cliente
  const matchCliente = t.match(/(?:cliente|comprador|nome)\s*(?:é|e|correto|certo)?\s*[:=-]?\s*([A-Za-zÀ-ÖØ-öø-ÿ\s]{3,35})/i);
  if (matchCliente) {
    const nome = matchCliente[1].trim();
    if (nome.length >= 3 && !/^(valor|imei|preco)$/i.test(nome)) {
      return { campo: 'cliente', valor: nome };
    }
  }

  return null;
}

/**
 * Salva uma proposta de notinha diretamente no banco Supabase para aguardar reação ou confirmação.
 */
export async function salvarPropostaNotinha(
  supabase: SupabaseClient,
  lojaId: string,
  remoteJid: string,
  messageId: string,
  proposta: PropostaNotinha
): Promise<void> {
  const agora = Date.now();
  if (lojaId) proposta.lojaId = lojaId;
  proposta.messageId = messageId;
  proposta.remoteJid = remoteJid;
  proposta.criadoEm = agora;

  const chaves = [
    `notinha:${remoteJid}:${messageId}`,
    `notinha:${remoteJid}:ultima`,
  ];

  try {
    const payload = {
      loja_id: lojaId,
      tipo: 'confirmacao' as const,
      action: 'emitir_notinha',
      params: { ...proposta, expiraEm: agora + 30 * 60 * 1000 } as any,
      resumo: `Notinha ${proposta.modelo} para ${proposta.clienteNome}`,
      criado_em: new Date(agora).toISOString(),
    };

    await Promise.all(
      chaves.map((chave) =>
        supabase.from('whatsapp_acoes_pendentes').upsert(
          { ...payload, chave },
          { onConflict: 'chave' }
        )
      )
    );
  } catch (err) {
    console.warn('[Notinha Automática] Erro ao salvar proposta pendente no Supabase:', err);
  }
}

/**
 * Busca proposta de notinha pendente recente diretamente no Supabase (whatsapp_acoes_pendentes).
 */
export async function buscarPropostaNotinhaRecente(
  supabase: SupabaseClient,
  chaves: string[],
  modeloDesejado?: string | null,
  maxMinutos: number = 20
): Promise<PropostaNotinha | null> {
  const agora = Date.now();
  const maxMs = maxMinutos * 60 * 1000;

  try {
    const { data: pendentes } = await supabase
      .from('whatsapp_acoes_pendentes')
      .select('*')
      .in('chave', chaves)
      .eq('tipo', 'confirmacao')
      .order('criado_em', { ascending: false })
      .limit(5);

    if (pendentes && pendentes.length > 0) {
      for (const item of pendentes) {
        const criado = item.criado_em ? new Date(item.criado_em).getTime() : 0;
        const idadeMs = agora - criado;
        if (idadeMs > maxMs) continue;

        const prop = item.params as PropostaNotinha;
        if (!prop) continue;

        if (modeloDesejado) {
          const modelosDaProposta =
            Array.isArray(prop.itens) && prop.itens.length > 0
              ? prop.itens.map((it) => it.modelo)
              : [prop.modelo];

          // Se a proposta de notinha foi criada nos últimos 3 minutos no mesmo chat,
          // aceita vincular mesmo que o OCR da etiqueta tenha alucinado outra geração da mesma marca
          if (idadeMs < 180_000) {
            const conflitaComTodos = modelosDaProposta.every((m) =>
              marcasConflitantes(modeloDesejado, m)
            );
            if (conflitaComTodos) {
              continue;
            }
          } else {
            const compativelComAlgum = modelosDaProposta.some((m) =>
              modelosSaoCompativeis(modeloDesejado, m)
            );
            if (!compativelComAlgum) {
              continue;
            }
          }
        }

        return prop;
      }
    }
  } catch (err) {
    console.warn('[Notinha Automática] Erro ao buscar proposta no Supabase:', err);
  }

  return null;
}

/**
 * Executa a emissão atômica da venda e baixa no estoque.
 */
export async function emitirNotinhaVenda(
  supabase: SupabaseClient,
  lojaId: string,
  proposta: PropostaNotinha,
  usuarioNome: string = 'Bot WhatsApp'
): Promise<{
  sucesso: boolean;
  mensagem: string;
  vendaId?: string;
  linkRecibo?: string;
  pdfBase64?: string;
  nomeArquivoPdf?: string;
}> {
  try {
    const agora = new Date().toISOString();
    const descricao = `Venda WhatsApp - ${proposta.modelo} para ${proposta.clienteNome}`;

    // 0. Carrega os dados oficiais da loja (nome, CNPJ, telefone, endereço, logo, assinatura e dias de garantia)
    const COLUNAS_LOJA_PDF =
      'id, nome, subtitulo, cnpj, telefone, dono_whatsapp, email, endereco, cidade, logo_url, assinatura_url, garantia_dias, dias_garantia';
    const lojaIdCandidata =
      (lojaId && lojaId !== 'loja-master' ? lojaId : proposta.lojaId) ||
      lojaId ||
      'e2858e7b-3046-4211-ac06-3ad45e3ea6af';

    let dadosLoja: any = null;
    try {
      if (lojaIdCandidata && lojaIdCandidata !== 'loja-master') {
        const { data: l } = await supabase
          .from('lojas')
          .select(COLUNAS_LOJA_PDF)
          .eq('id', lojaIdCandidata)
          .maybeSingle();
        dadosLoja = l;
      }
      if (!dadosLoja) {
        const { data: lLucas } = await supabase
          .from('lojas')
          .select(COLUNAS_LOJA_PDF)
          .ilike('nome', '%lucas%')
          .limit(1)
          .maybeSingle();
        dadosLoja = lLucas;
      }
    } catch (errLoja) {
      console.warn('Erro ao carregar dados da loja para o PDF:', errLoja);
    }

    const lojaIdFinal = dadosLoja?.id || lojaIdCandidata;
    const diasGarantiaLoja = Number(dadosLoja?.garantia_dias || dadosLoja?.dias_garantia || 90);

    // 1. Cadastra ou atualiza o cliente na base de dados da loja
    let clienteId: string | undefined = undefined;
    const nomeClienteLimpo = (proposta.clienteNome || '').trim();
    const cpfLimpo = (proposta.cpf || '').replace(/\D/g, '');
    const telLimpo = (proposta.telefone || '').replace(/\D/g, '');

    if (nomeClienteLimpo) {
      try {
        let queryBusca = supabase
          .from('clientes')
          .select('id, nome, cpf, telefone, email, endereco')
          .eq('loja_id', lojaIdFinal);

        if (cpfLimpo && cpfLimpo.length >= 11) {
          queryBusca = queryBusca.eq('cpf', proposta.cpf?.trim());
        } else if (telLimpo && telLimpo.length >= 8) {
          queryBusca = queryBusca.ilike('telefone', `%${telLimpo.slice(-8)}%`);
        } else {
          queryBusca = queryBusca.ilike('nome', nomeClienteLimpo);
        }

        const { data: clientesEncontrados } = await queryBusca.limit(1);
        const clienteExistente = clientesEncontrados?.[0];

        if (clienteExistente) {
          clienteId = clienteExistente.id;
          const updates: Record<string, any> = {};
          if (!clienteExistente.cpf && proposta.cpf) updates.cpf = proposta.cpf.trim();
          if (!clienteExistente.telefone && proposta.telefone) updates.telefone = proposta.telefone.trim();
          if (!clienteExistente.email && proposta.email) updates.email = proposta.email.trim();
          if (!clienteExistente.endereco && proposta.enderecoEntrega) updates.endereco = proposta.enderecoEntrega.trim();

          if (Object.keys(updates).length > 0) {
            await supabase.from('clientes').update(updates).eq('id', clienteId);
          }
        } else {
          const { data: novoCli } = await supabase
            .from('clientes')
            .insert({
              loja_id: lojaIdFinal,
              nome: nomeClienteLimpo,
              cpf: proposta.cpf ? proposta.cpf.trim() : null,
              telefone: proposta.telefone ? proposta.telefone.trim() : '',
              email: proposta.email ? proposta.email.trim() : '',
              endereco: proposta.enderecoEntrega ? proposta.enderecoEntrega.trim() : null,
              ativo: true,
              dataCadastro: agora,
            })
            .select('id')
            .single();

          if (novoCli?.id) {
            clienteId = novoCli.id;
          }
        }
      } catch (errCli) {
        console.warn('[Notinha Automática] Falha ao processar cadastro de cliente:', errCli);
      }
    }

    const itensProposta: ItemPropostaNotinha[] =
      Array.isArray(proposta.itens) && proposta.itens.length > 0
        ? proposta.itens
        : [
            {
              modelo: proposta.modelo,
              capacidade: proposta.capacidade,
              cor: proposta.cor,
              imei: proposta.imei,
              statusEstoque: proposta.statusEstoque,
              aparelhoId: proposta.aparelhoId,
              custo: proposta.custo || 0,
              valorUnitario: proposta.valorTotal,
            },
          ];

    const valorTotalNum = Number(proposta.valorTotal || 0);
    const valorDivididoPadrao = itensProposta.length > 0 ? Number((valorTotalNum / itensProposta.length).toFixed(2)) : valorTotalNum;

    const itensVendaPayload = itensProposta.map((it, idx) => {
      const valItem =
        it.valorUnitario && it.valorUnitario > 0
          ? Number(it.valorUnitario)
          : idx === itensProposta.length - 1
          ? Number((valorTotalNum - valorDivididoPadrao * (itensProposta.length - 1)).toFixed(2))
          : valorDivididoPadrao;

      const obsPartes: string[] = [];
      if (it.imei) obsPartes.push(`IMEI: ${it.imei}`);
      if (it.bateria) obsPartes.push(`Bateria: ${it.bateria}%`);
      if (it.observacaoItem) obsPartes.push(it.observacaoItem);
      if (it.modeloTroca) {
        const descTrocaObs = `${it.modeloTroca}${it.capacidadeTroca ? ` ${it.capacidadeTroca}` : ''}${it.corTroca ? ` ${it.corTroca}` : ''}`
          .replace(/\s+/g, ' ')
          .trim();
        obsPartes.push(`Upgrade (Entrada): ${descTrocaObs}`);
      }

      return {
        id: `${Date.now()}-${idx}`,
        aparelhoId: it.aparelhoId || undefined,
        descricao: `${it.modelo} ${it.capacidade || ''} ${it.cor || ''}`.replace(/\s+/g, ' ').trim(),
        quantidade: 1,
        valorInterno: Number(it.custo || 0),
        valorExibir: valItem,
        desconto: 0,
        tipoDesconto: 'R$',
        total: valItem,
        observacao: obsPartes.join(' | '),
        imei: it.imei || '',
      };
    });

    const custoTotalConsolidado = itensProposta.reduce((acc, it) => acc + Number(it.custo || 0), 0) || Number(proposta.custo || 0);

    const registroVenda = {
      loja_id: lojaIdFinal,
      clienteId: clienteId || undefined,
      clienteNome: proposta.clienteNome,
      cpf: proposta.cpf || null,
      telefone: proposta.telefone || null,
      valor: valorTotalNum,
      custo: custoTotalConsolidado,
      lucro: valorTotalNum - custoTotalConsolidado,
      metodo: proposta.formaPagamento.toLowerCase().includes('cart') ? 'cartao_credito' : (proposta.formaPagamento.toLowerCase().includes('pix') ? 'pix' : 'dinheiro'),
      status: 'pago',
      valorPago: valorTotalNum,
      saldoDevedor: 0,
      tipoEntrega: 'Varejo',
      vendedor: usuarioNome,
      dataPagamento: agora,
      garantia: `${diasGarantiaLoja} dias`,
      descricao,
      itens: itensVendaPayload,
      ativo: true,
      taxa_cartao: 0,
    };

    const aparelhoIds = Array.from(
      new Set(
        itensProposta
          .map((it) => it.aparelhoId)
          .filter((id): id is string => Boolean(id))
      )
    );
    const camposAparelho =
      aparelhoIds.length > 0
        ? Object.fromEntries(aparelhoIds.map((aid) => [aid, { cliente: proposta.clienteNome }]))
        : undefined;

    const listaTrocas: TrocaPropostaNotinha[] =
      Array.isArray(proposta.trocas) && proposta.trocas.length > 0
        ? proposta.trocas
        : proposta.isUpgrade && proposta.modeloTroca
        ? [
            {
              modelo: proposta.modeloTroca,
              imei: proposta.imeiTroca || undefined,
              valor: proposta.valorTroca || 0,
            },
          ]
        : [];

    let tradeInPayload: Record<string, unknown> | null = null;
    if (proposta.isUpgrade && listaTrocas.length > 0) {
      const primeiraTroca = listaTrocas[0];
      tradeInPayload = {
        loja_id: lojaIdFinal,
        modelo: primeiraTroca.modelo,
        capacidade: primeiraTroca.capacidade || null,
        cor: primeiraTroca.cor || null,
        imei: primeiraTroca.imei || proposta.imeiTroca || null,
        valor: primeiraTroca.valor || proposta.valorTroca || 0,
        custo: Number(primeiraTroca.valor || proposta.valorTroca || 0),
        condicao: 'seminovo',
        ativo: true,
        status: 'disponivel',
        origem: 'upgrade_venda',
        observacoes: `Entrada via Upgrade (Venda WhatsApp - Cliente: ${proposta.clienteNome})`,
      };
    }

    const resultado = await registrarVendaAtomica(supabase, {
      venda: registroVenda,
      aparelhoIds,
      camposAparelho,
      tradeIn: tradeInPayload,
      origem: 'whatsapp_notinha_automatica',
      usuarioNome,
    });

    // Caso a venda possua 2 ou mais aparelhos recebidos na troca (múltiplos upgrades), dá entrada dos aparelhos adicionais no estoque
    if (proposta.isUpgrade && listaTrocas.length > 1) {
      for (const trocaExtra of listaTrocas.slice(1)) {
        try {
          // estoque-guard: auditado
          const { data: apTrocaInserido } = await supabase
            .from('aparelhos')
            .insert({
              loja_id: lojaIdFinal,
              modelo: trocaExtra.modelo,
              capacidade: trocaExtra.capacidade || null,
              cor: trocaExtra.cor || null,
              imei: trocaExtra.imei || null,
              custo: Number(trocaExtra.valor || 0),
              condicao: 'seminovo',
              categoria: 'aparelho',
              quantidade: 1,
              ativo: true,
              status: 'disponivel',
              dataCadastro: agora,
              observacoes: `Entrada via Upgrade (2º Aparelho - Venda WhatsApp - Cliente: ${proposta.clienteNome})`,
            })
            .select('*')
            .single();

          if (apTrocaInserido?.id) {
            await registrarEntradaEstoque(supabase, {
              aparelhos: [apTrocaInserido as any],
              origem: 'whatsapp_notinha_automatica' as any,
              lojaId: lojaIdFinal,
              usuarioNome,
              observacao: `Recebido como troca adicional na venda #${resultado.venda?.id ? String(resultado.venda.id).slice(-6).toUpperCase() : 'OK'}`,
            });
          }
        } catch (errTrocaExtra) {
          console.warn('[Notinha Automática] Erro ao cadastrar troca adicional no estoque:', errTrocaExtra);
        }
      }
    }

    const vendaUuid = resultado.venda?.id ? String(resultado.venda.id) : '';
    const vendaId = vendaUuid ? vendaUuid.slice(0, 8).toUpperCase() : 'OK';
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://painelcelular.com.br';
    const linkRecibo = vendaUuid ? `${baseUrl}/recibo/${vendaUuid}` : '';

    const resumoAparelhosMsg =
      itensProposta.length > 1
        ? `📱 *Aparelhos (${itensProposta.length}):*\n` +
          itensProposta
            .map(
              (it, i) =>
                `   ${i + 1}. ${it.modelo}${it.capacidade ? ` ${it.capacidade}` : ''}${it.cor ? ` ${it.cor}` : ''}${it.imei ? ` (IMEI: ${it.imei})` : ''}`
            )
            .join('\n') +
          '\n'
        : `📱 *Aparelho:* ${proposta.modelo}\n`;

    const resumoTrocasMsg =
      proposta.isUpgrade && listaTrocas.length > 1
        ? `🔄 *Trocas recebidas (${listaTrocas.length}):*\n` +
          listaTrocas
            .map(
              (tr, i) =>
                `   ${i + 1}. ${tr.modelo}${tr.capacidade ? ` ${tr.capacidade}` : ''}${tr.cor ? ` ${tr.cor}` : ''}${tr.imei ? ` (IMEI: ${tr.imei})` : ''}`
            )
            .join('\n') +
          '\n'
        : proposta.isUpgrade && proposta.modeloTroca
        ? `🔄 *Troca recebida:* ${proposta.modeloTroca}\n`
        : '';

    const msgSucesso = `✅ *NOTINHA EMITIDA COM SUCESSO!* 🧾\n` +
      `──────────────────────────\n` +
      `📄 *Venda:* #${vendaId}\n` +
      `👤 *Cliente:* ${proposta.clienteNome}\n` +
      resumoAparelhosMsg +
      `💰 *Valor:* R$ ${Number(proposta.valorTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n` +
      `📦 *Estoque:* Baixa realizada com sucesso no sistema!\n` +
      resumoTrocasMsg +
      (linkRecibo ? `🔗 *Recibo Digital:* ${linkRecibo}\n` : '') +
      `──────────────────────────\n` +
      `_Venda registrada e auditada no Phone Center!_`;

    let pdfBase64: string | undefined = undefined;
    let nomeArquivoPdf: string | undefined = undefined;

    try {
      const pdfBuffer = await gerarReciboPdfBuffer({
        vendaId: vendaUuid,
        codigoVenda: vendaId,
        dataEmissao: new Date().toLocaleString('pt-BR'),
        loja: {
          nome: (dadosLoja?.nome || 'Lucas Imports').trim(),
          cnpj: dadosLoja?.cnpj || null,
          telefone: dadosLoja?.telefone || dadosLoja?.dono_whatsapp || null,
          endereco: dadosLoja?.endereco || null,
          cidade: dadosLoja?.cidade || null,
          logoUrl: dadosLoja?.logo_url || null,
          assinaturaUrl: dadosLoja?.assinatura_url || null,
        },
        cliente: {
          nome: proposta.clienteNome,
          cpf: proposta.cpf || null,
          telefone: proposta.telefone || null,
          email: proposta.email || null,
          endereco: proposta.enderecoEntrega || null,
        },
        aparelho: {
          modelo: itensProposta[0]?.modelo || proposta.modelo,
          capacidade: itensProposta[0]?.capacidade || proposta.capacidade || null,
          cor: itensProposta[0]?.cor || proposta.cor || null,
          imei: itensProposta[0]?.imei || proposta.imei || null,
          condicao: itensProposta[0]?.condicao === 'novo' ? 'Lacrado / Novo' : 'Seminovo',
          valor: Number(itensVendaPayload[0]?.total || proposta.valorTotal || 0),
        },
        itens: itensProposta.map((it, idx) => ({
          modelo: it.modelo,
          capacidade: it.capacidade || null,
          cor: it.cor || null,
          imei: it.imei || null,
          bateria: it.bateria || null,
          observacao: it.observacaoItem || null,
          condicao: it.condicao === 'novo' ? 'Lacrado / Novo' : 'Seminovo',
          valor: Number(itensVendaPayload[idx]?.total || it.valorUnitario || 0),
        })),
        upgrade: {
          ativo: Boolean(proposta.isUpgrade),
          modelo: proposta.modeloTroca || null,
          imei: proposta.imeiTroca || null,
          valor: proposta.valorTroca || null,
        },
        upgrades: listaTrocas.map((tr) => ({
          modelo: tr.modelo,
          capacidade: tr.capacidade || null,
          cor: tr.cor || null,
          imei: tr.imei || null,
          valor: tr.valor || null,
        })),
        pagamento: {
          forma: proposta.formaPagamento || 'PIX',
          valorTotal: Number(proposta.valorTotal || 0),
          valorEntrada: proposta.valorTroca || 0,
          valorFinal: Number(proposta.valorTotal || 0) - (proposta.valorTroca || 0),
        },
        diasGarantia: diasGarantiaLoja,
        vendedor: usuarioNome,
        linkRecibo,
      });

      pdfBase64 = pdfBuffer.toString('base64');
      nomeArquivoPdf = `Recibo-${vendaId}.pdf`;
    } catch (errPdf) {
      console.warn('Erro ao gerar PDF do recibo:', errPdf);
    }

    return {
      sucesso: true,
      mensagem: sanitizarTextoWhatsApp(msgSucesso),
      vendaId,
      linkRecibo,
      pdfBase64,
      nomeArquivoPdf,
    };
  } catch (err: any) {
    console.error('❌ Falha ao emitir notinha automática:', err);
    let msgErro = 'Não foi possível concluir a emissão da nota.';
    if (err instanceof ErroVenda) {
      msgErro = err.message;
    } else if (err?.message) {
      msgErro = err.message;
    }

    return {
      sucesso: false,
      mensagem: `⚠️ *Falha na emissão da notinha:*\n${msgErro}`,
    };
  }
}

// ── SINCRONIZAÇÃO DE FOTO + FORMULÁRIO DE VENDA 100% VIA SUPABASE ──

export interface FotoRecenteCache {
  imei?: string | null;
  modelo?: string | null;
  capacidade?: string | null;
  cor?: string | null;
  pushName?: string;
  timestamp: number;
  historicoFotos?: FotoRecenteCache[];
}

function extrairMarcaAparelho(str?: string | null): string | null {
  if (!str) return null;
  const s = str.toLowerCase();
  if (/iphone|apple|ipad|macbook/i.test(s)) return 'apple';
  if (/samsung|galaxy/i.test(s)) return 'samsung';
  if (/xiaomi|poco|redmi/i.test(s)) return 'xiaomi';
  if (/motorola|moto/i.test(s)) return 'motorola';
  if (/realme/i.test(s)) return 'realme';
  return null;
}

/**
 * Verifica se dois modelos pertencem a marcas claramente conflitantes (ex: Apple vs Xiaomi).
 */
export function marcasConflitantes(modeloA?: string | null, modeloB?: string | null): boolean {
  const marcaA = extrairMarcaAparelho(modeloA);
  const marcaB = extrairMarcaAparelho(modeloB);
  return Boolean(marcaA && marcaB && marcaA !== marcaB);
}

/**
 * Compara se dois nomes de modelo referem-se ao mesmo aparelho
 * (ex: 'POCO F8 Pro 512GB' e 'POCO F8 Pro' -> compatíveis; 'iPhone 16 Pro' e 'S24' -> incompatíveis)
 */
export function modelosSaoCompativeis(modeloA?: string | null, modeloB?: string | null): boolean {
  if (!modeloA || !modeloB) return true;

  const marcaA = extrairMarcaAparelho(modeloA);
  const marcaB = extrairMarcaAparelho(modeloB);

  // Se ambas têm marcas detectadas e são diferentes, são incompatíveis
  if (marcaA && marcaB && marcaA !== marcaB) {
    return false;
  }

  const limpa = (str: string) =>
    str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\b(xiaomi|apple|iphone|ipad|samsung|galaxy|motorola|moto|realme|smartphone)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

  const a = limpa(modeloA);
  const b = limpa(modeloB);

  // Se um dos dois é apenas o nome da marca (ex: etiqueta leu apenas "iPhone" e o pedido é "iPhone 15 Pro")
  if (!a || !b) {
    if (marcaA && marcaB) return marcaA === marcaB;
    return true;
  }

  if (a.includes(b) || b.includes(a)) return true;

  // Se ambos têm tokens numéricos de geração (ex: '13' vs '15', 'f8' vs 'f8'), os números devem coincidir
  const digA = a.split(' ').filter((t) => /\d/.test(t) && !/^\d+(?:gb|tb)$/.test(t));
  const digB = b.split(' ').filter((t) => /\d/.test(t) && !/^\d+(?:gb|tb)$/.test(t));
  if (digA.length > 0 && digB.length > 0) {
    const temDigComum = digA.some((da) => digB.includes(da));
    if (!temDigComum) return false;
  }

  const tokensA = a.split(' ').filter((t) => t.length >= 2);
  const tokensB = b.split(' ').filter((t) => t.length >= 2);

  return tokensA.some((tok) => tokensB.includes(tok));
}

/**
 * Registra no Supabase que uma foto acabou de chegar neste chat e está em processamento pelo OCR Vision.
 * Assim, se o formulário de pedido chegar 50ms depois em outra instância serverless, ele aguarda o OCR terminar!
 */
export async function registrarFotoProcessando(
  supabase: SupabaseClient,
  lojaId: string,
  remoteJid: string,
  authorPhone: string
): Promise<void> {
  if (!lojaId || !remoteJid) return;
  try {
    const agora = Date.now();
    await supabase.from('whatsapp_acoes_pendentes').upsert(
      {
        chave: `foto_processando:${remoteJid}`,
        loja_id: lojaId,
        tipo: 'faltando_dados',
        action: 'processando_foto',
        params: { authorPhone, timestamp: agora } as any,
        resumo: 'Processando foto da etiqueta via OCR Vision',
        criado_em: new Date(agora).toISOString(),
      },
      { onConflict: 'chave' }
    );
  } catch (err) {
    console.warn('[Notinha Automática] Erro ao registrar foto_processando no Supabase:', err);
  }
}

/**
 * Remove a trava foto_processando do Supabase (ex: em caso de falha na leitura da imagem).
 */
export async function limparFotoProcessando(
  supabase: SupabaseClient,
  remoteJid: string
): Promise<void> {
  if (!remoteJid) return;
  try {
    await supabase.from('whatsapp_acoes_pendentes').delete().eq('chave', `foto_processando:${remoteJid}`);
  } catch {
    // silencioso
  }
}

/**
 * Salva os dados lidos da foto no Supabase (acumulando múltiplas fotos recentes no mesmo chat para pedidos com 2+ aparelhos)
 * e remove a flag foto_processando.
 */
export async function salvarFotoRecente(
  supabase: SupabaseClient,
  lojaId: string,
  remoteJid: string,
  authorPhone: string,
  dados: FotoRecenteCache
): Promise<void> {
  const agora = Date.now();
  const itemLimpo: FotoRecenteCache = {
    imei: dados.imei,
    modelo: dados.modelo,
    capacidade: dados.capacidade,
    cor: dados.cor,
    pushName: dados.pushName,
    timestamp: agora,
  };
  dados.timestamp = agora;

  const chaves = [
    ...(authorPhone ? [`foto_recente:${remoteJid}:${authorPhone}`] : []),
    `foto_recente:${remoteJid}:ultima`,
  ];

  try {
    let historicoFotos: FotoRecenteCache[] = [];
    try {
      const { data: existente } = await supabase
        .from('whatsapp_acoes_pendentes')
        .select('*')
        .eq('chave', `foto_recente:${remoteJid}:ultima`)
        .maybeSingle();

      if (existente && existente.params) {
        const criadoAnt = existente.criado_em ? new Date(existente.criado_em).getTime() : 0;
        if (agora - criadoAnt < 10 * 60 * 1000) {
          const paramsAnt = existente.params as FotoRecenteCache;
          const listaAnt = Array.isArray(paramsAnt.historicoFotos)
            ? paramsAnt.historicoFotos
            : [
                {
                  imei: paramsAnt.imei,
                  modelo: paramsAnt.modelo,
                  capacidade: paramsAnt.capacidade,
                  cor: paramsAnt.cor,
                  pushName: paramsAnt.pushName,
                  timestamp: paramsAnt.timestamp || criadoAnt,
                },
              ];
          historicoFotos = listaAnt.filter(
            (f) => f && (!itemLimpo.imei || !f.imei || digitos(f.imei) !== digitos(itemLimpo.imei))
          );
        }
      }
    } catch {
      // silencioso
    }

    historicoFotos.push(itemLimpo);

    const payload = {
      tipo: 'faltando_dados' as const,
      action: 'vincular_foto',
      loja_id: lojaId,
      params: {
        ...itemLimpo,
        historicoFotos,
        expiraEm: agora + 10 * 60 * 1000,
      } as any,
      resumo: `Foto recente: ${dados.modelo || 'Smartphone'} (IMEI: ${dados.imei || 'N/A'})`,
      criado_em: new Date(agora).toISOString(),
    };

    await Promise.all([
      ...chaves.map((chave) =>
        supabase.from('whatsapp_acoes_pendentes').upsert(
          { ...payload, chave },
          { onConflict: 'chave' }
        )
      ),
      supabase.from('whatsapp_acoes_pendentes').delete().eq('chave', `foto_processando:${remoteJid}`),
    ]);
  } catch (err) {
    console.warn('[Notinha Automática] Erro ao salvar foto recente no Supabase:', err);
  }
}

/**
 * Busca no Supabase se há foto compatível enviada nos últimos minutos.
 */
export async function buscarFotoRecente(
  supabase: SupabaseClient,
  lojaId: string,
  remoteJid: string,
  authorPhone: string,
  modeloDesejado?: string | null,
  maxMinutos: number = 10
): Promise<FotoRecenteCache | null> {
  const chaves = [
    ...(authorPhone ? [`foto_recente:${remoteJid}:${authorPhone}`] : []),
    `foto_recente:${remoteJid}:ultima`,
  ];

  const agora = Date.now();
  const maxMs = maxMinutos * 60 * 1000;

  try {
    const { data: pendentes } = await supabase
      .from('whatsapp_acoes_pendentes')
      .select('*')
      .in('chave', chaves)
      .eq('tipo', 'faltando_dados')
      .order('criado_em', { ascending: false })
      .limit(3);

    if (pendentes && pendentes.length > 0) {
      for (const item of pendentes) {
        const criado = item.criado_em ? new Date(item.criado_em).getTime() : 0;
        const idadeMs = agora - criado;
        if (idadeMs > maxMs) continue;

        const foto = item.params as FotoRecenteCache;
        if (!foto) continue;

        if (modeloDesejado && foto.modelo) {
          // Se a foto foi enviada há menos de 3 minutos no mesmo chat, aceita desde que não seja marca conflitante
          if (idadeMs < 180_000) {
            if (marcasConflitantes(foto.modelo, modeloDesejado)) continue;
          } else if (!modelosSaoCompativeis(foto.modelo, modeloDesejado)) {
            continue;
          }
        }

        return foto;
      }
    }
  } catch (err) {
    console.warn('[Notinha Automática] Erro ao buscar foto recente no Supabase:', err);
  }

  return null;
}

/**
 * Aguarda caso exista uma ou mais fotos sendo processadas pelo OCR neste exato instante no mesmo chat,
 * consome todas as fotos recentes compatíveis e registra `foto_consumida` no Supabase.
 */
export async function aguardarEBuscarFotosRecentes(
  supabase: SupabaseClient,
  lojaId: string,
  remoteJid: string,
  authorPhone: string,
  modelosDesejados?: Array<string | null | undefined>,
  maxMinutos: number = 10,
  esperaNovaFotoMs: number = 0
): Promise<FotoRecenteCache[]> {
  const chaveProcessando = `foto_processando:${remoteJid}`;
  const chavesFoto = [
    ...(authorPhone ? [`foto_recente:${remoteJid}:${authorPhone}`] : []),
    `foto_recente:${remoteJid}:ultima`,
  ];

  const listaModelos = (modelosDesejados || []).filter((m): m is string => Boolean(m));
  const qtdAlvo = Math.max(1, listaModelos.length);

  const inicio = Date.now();
  const timeoutWaitMs = Math.max(9500, esperaNovaFotoMs + 6500);

  while (Date.now() - inicio < timeoutWaitMs) {
    try {
      const { data: registros } = await supabase
        .from('whatsapp_acoes_pendentes')
        .select('*')
        .in('chave', [chaveProcessando, ...chavesFoto])
        .eq('tipo', 'faltando_dados')
        .order('criado_em', { ascending: false });

      const agora = Date.now();
      const maxMs = maxMinutos * 60 * 1000;

      // Verifica se ainda há uma foto_processando ativa (ex: 2ª foto sendo lida pelo OCR)
      const proc = (registros || []).find((r) => r.chave === chaveProcessando);
      const temFotoProcessandoAtiva =
        Boolean(proc) &&
        agora - (proc?.criado_em ? new Date(proc.criado_em).getTime() : 0) < 25_000;

      const itensFoto = (registros || []).filter((r) => r.chave.startsWith('foto_recente:'));
      const fotosColetadas: FotoRecenteCache[] = [];

      for (const item of itensFoto) {
        const criado = item.criado_em ? new Date(item.criado_em).getTime() : 0;
        const idadeMs = agora - criado;
        if (idadeMs > maxMs) continue;

        const fotoParams = item.params as FotoRecenteCache;
        if (!fotoParams) continue;

        const candidatas = Array.isArray(fotoParams.historicoFotos) && fotoParams.historicoFotos.length > 0
          ? fotoParams.historicoFotos
          : [fotoParams];

        for (const f of candidatas) {
          if (!f) continue;
          if (listaModelos.length > 0 && f.modelo) {
            if (idadeMs < 180_000) {
              const conflitaTodos = listaModelos.every((m) => marcasConflitantes(f.modelo, m));
              if (conflitaTodos) continue;
            } else {
              const compativelAlgum = listaModelos.some((m) => modelosSaoCompativeis(f.modelo, m));
              if (!compativelAlgum) continue;
            }
          }

          const jaIncluida = fotosColetadas.some(
            (ex) => (ex.imei && f.imei && digitos(ex.imei) === digitos(f.imei)) || ex === f
          );
          if (!jaIncluida) {
            fotosColetadas.push(f);
          }
        }
      }

      // Se já coletamos fotos, mas o pedido tem múltiplos aparelhos e ainda há outra foto sendo processada pelo OCR, aguarda
      if (fotosColetadas.length > 0 && fotosColetadas.length < qtdAlvo && temFotoProcessandoAtiva) {
        await new Promise((r) => setTimeout(r, 600));
        continue;
      }

      if (fotosColetadas.length > 0) {
        const ultimaFoto = fotosColetadas[fotosColetadas.length - 1];
        await Promise.all([
          supabase.from('whatsapp_acoes_pendentes').delete().in('chave', [...chavesFoto, chaveProcessando]),
          supabase.from('whatsapp_acoes_pendentes').upsert(
            {
              chave: `foto_consumida:${remoteJid}`,
              loja_id: lojaId,
              tipo: 'faltando_dados',
              action: 'foto_consumida',
              params: {
                imei: ultimaFoto.imei,
                imeis: fotosColetadas.map((f) => f.imei).filter(Boolean),
                timestamp: agora,
              } as any,
              resumo: `Fotos (${fotosColetadas.length}) consumidas pelo formulário`,
              criado_em: new Date(agora).toISOString(),
            },
            { onConflict: 'chave' }
          ),
        ]);

        return fotosColetadas;
      }

      if (temFotoProcessandoAtiva) {
        await new Promise((r) => setTimeout(r, 600));
        continue;
      }

      if (esperaNovaFotoMs > 0 && Date.now() - inicio < esperaNovaFotoMs) {
        await new Promise((r) => setTimeout(r, 600));
        continue;
      }

      break;
    } catch (err) {
      console.warn('[Notinha Automática] Erro em aguardarEBuscarFotosRecentes:', err);
      break;
    }
  }

  return [];
}

/**
 * Aguarda caso exista uma foto sendo processada pelo OCR neste exato instante no mesmo chat,
 * consome a foto recente assim que ficar pronta e registra `foto_consumida` no Supabase
 * para que o webhook da foto não dispare mensagem avulsa.
 */
export async function aguardarEBuscarFotoRecente(
  supabase: SupabaseClient,
  lojaId: string,
  remoteJid: string,
  authorPhone: string,
  modeloDesejado?: string | null,
  maxMinutos: number = 10,
  esperaNovaFotoMs: number = 0
): Promise<FotoRecenteCache | null> {
  const fotos = await aguardarEBuscarFotosRecentes(
    supabase,
    lojaId,
    remoteJid,
    authorPhone,
    modeloDesejado ? [modeloDesejado] : undefined,
    maxMinutos,
    esperaNovaFotoMs
  );
  return fotos.length > 0 ? fotos[fotos.length - 1] : null;
}

/**
 * Verifica se uma proposta de notinha já possui determinado IMEI vinculado (em qualquer um dos seus itens),
 * evitando que o webhook paralelo de uma foto envie uma segunda prévia duplicada quando o formulário já consumiu a foto.
 */
export function propostaJaContemImei(
  proposta?: PropostaNotinha | null,
  imei?: string | null
): boolean {
  if (!proposta || !imei) return false;
  const imeiLimpo = digitos(imei);
  if (imeiLimpo.length < 4) return false;

  if (Array.isArray(proposta.itens) && proposta.itens.length > 0) {
    if (proposta.itens.some((it) => it.imei && digitos(it.imei) === imeiLimpo)) {
      return true;
    }
  }

  if (proposta.imei) {
    const partes = proposta.imei.split('/').map((p) => digitos(p));
    if (partes.includes(imeiLimpo)) return true;
  }

  return false;
}

/**
 * Usado pelo webhook da foto logo após terminar o OCR Vision:
 * Aguarda uma curta janela (ex: 2.4s) verificando se um formulário enviado junto consumiu a foto.
 */
export async function aguardarOuVerificarFotoConsumida(
  supabase: SupabaseClient,
  remoteJid: string,
  esperaMs: number = 2400,
  imeiLido?: string | null
): Promise<boolean> {
  const chaveConsumida = `foto_consumida:${remoteJid}`;
  const inicio = Date.now();
  const imeiAlvo = digitos(imeiLido);

  while (Date.now() - inicio <= esperaMs) {
    try {
      const { data: item } = await supabase
        .from('whatsapp_acoes_pendentes')
        .select('chave, criado_em, params')
        .eq('chave', chaveConsumida)
        .maybeSingle();

      if (item) {
        const criado = item.criado_em ? new Date(item.criado_em).getTime() : 0;
        if (Date.now() - criado < 25_000) {
          const params = (item as any).params || {};
          const listaImeis: string[] = Array.isArray(params.imeis)
            ? params.imeis.map((x: unknown) => digitos(x)).filter(Boolean)
            : params.imei
            ? [digitos(params.imei)]
            : [];

          if (!imeiAlvo || listaImeis.length === 0 || listaImeis.includes(imeiAlvo)) {
            if (listaImeis.length <= 1) {
              await supabase.from('whatsapp_acoes_pendentes').delete().eq('chave', chaveConsumida);
            }
            return true;
          }
        }
      }
    } catch {
      // silencioso
    }

    if (Date.now() - inicio + 600 > esperaMs) break;
    await new Promise((r) => setTimeout(r, 600));
  }

  return false;
}

/**
 * Limpa o buffer de foto recente após o formulário ou proposta consumi-lo com sucesso
 */
export async function limparFotoRecente(
  supabase: SupabaseClient,
  remoteJid: string,
  authorPhone: string
): Promise<void> {
  const chaves = [
    ...(authorPhone ? [`foto_recente:${remoteJid}:${authorPhone}`] : []),
    `foto_recente:${remoteJid}:ultima`,
    `foto_processando:${remoteJid}`,
  ];

  try {
    await supabase.from('whatsapp_acoes_pendentes').delete().in('chave', chaves);
  } catch (err) {
    console.warn('[Notinha Automática] Erro ao limpar foto recente do Supabase:', err);
  }
}

