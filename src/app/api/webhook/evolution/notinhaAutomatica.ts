import { gerarReciboPdfBuffer } from '@/lib/recibo/gerarReciboPdf';
import { sanitizarVendedorPublico } from '@/lib/recibo/publico';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  sanitizarECompletarVendaParsed,
  normalizarNomeModelo,
  ParsedVenda,
  extrairCorDeTexto,
  obterDataAtualBrasiliaIso,
  parseDataFlexivelBr,
} from '@/lib/vendas/parseVendaTexto';
import { estaNoEstoque } from '@/lib/estoque/ciclo';
import { registrarEntradaEstoque } from '@/lib/estoque/movimentacoes';
import { registrarVendaAtomica, ErroVenda } from '@/lib/vendas/vendaAtomica';
import { sanitizarTextoWhatsApp } from '@/lib/whatsappFormatting';
import { ehMensagemDeEntradaEstoque, ehRelatorioOuConferencia, obterEmojiDaCor } from './entradaInteligente';

export interface AparelhoEstoqueConsulta {
  id: string;
  modelo?: string | null;
  capacidade?: string | null;
  cor?: string | null;
  imei?: string | null;
  saude_bateria?: number | string | null;
  saudeBateria?: number | string | null;
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

export interface OrigemReacaoNotinha {
  remoteJid: string;
  messageId: string;
  fromMe?: boolean;
  participant?: string;
}

export interface PropostaNotinha {
  id: string;
  lojaId?: string;
  remoteJid?: string;
  messageId?: string;
  origemReacao?: OrigemReacaoNotinha;
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
  dataVenda?: string;
  dataVendaInformada?: boolean;
  observacoes?: string;
  criadoEm?: number;
  /** Quando true, a prévia não expira por tempo — só sai da fila ao confirmar ou cancelar. */
  semExpiracao?: boolean;
  /** Todos os messageIds das prévias (inicial e edições) vinculadas a esta mesma proposta. */
  mensagensVinculadas?: string[];
}

function formatarIsoParaBrCurto(dataIso: string): string {
  return `${dataIso.slice(8, 10)}/${dataIso.slice(5, 7)}/${dataIso.slice(0, 4)}`;
}

/**
 * Resolve o timestamp ISO de `dataPagamento` e o rótulo de emissão do PDF a partir da data
 * informada no formulário (YYYY-MM-DD ou DD/MM[/AA[AA]]).
 * Se for a data de hoje (Brasília), preserva o horário exato atual; se for outra data,
 * grava ao meio-dia de Brasília (15:00Z) para cair no dia exato em qualquer fuso.
 */
export function resolverDataPagamentoProposta(
  dataVendaRaw?: string | null,
  referencia: Date = new Date()
): { dataPagamentoIso: string; dataEmissaoPdf: string; dataBr: string; ehDataCustomizada: boolean } {
  const hojeBr = obterDataAtualBrasiliaIso(referencia);
  const dataIso = parseDataFlexivelBr(dataVendaRaw, hojeBr);

  if (dataIso && dataIso !== hojeBr) {
    const dataBr = formatarIsoParaBrCurto(dataIso);
    return {
      dataPagamentoIso: new Date(`${dataIso}T12:00:00.000-03:00`).toISOString(),
      dataEmissaoPdf: dataBr,
      dataBr,
      ehDataCustomizada: true,
    };
  }

  const dataBr = formatarIsoParaBrCurto(hojeBr);
  const dataEmissaoPdf = referencia.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return {
    dataPagamentoIso: referencia.toISOString(),
    dataEmissaoPdf,
    dataBr,
    ehDataCustomizada: false,
  };
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

  // Separa e expande abreviações de etiqueta de iPhone (ex: "15PM" -> "15 Pro Max", "16P" -> "16 Pro", "13M" -> "13 Mini")
  const ehOutraMarca = /\b(samsung|galaxy|xiaomi|redmi|poco|motorola|moto|edge|realme|ipad|watch|macbook|airpods?|ps5|ps4|xbox)\b/i.test(limpo);
  if (!ehOutraMarca) {
    limpo = limpo
      .replace(/\b(2\d|1\d|[7-8])\s*(?:pm|p\s*max|promax|pro\s*max)\b/gi, '$1 Pro Max')
      .replace(/\b(2\d|1\d|[7-8])\s*(?:pro|p)\b/gi, '$1 Pro')
      .replace(/\b(2\d|1\d|[7-8])\s*(?:plus|\+)\b/gi, '$1 Plus')
      .replace(/\b(2\d|1\d|[7-8])\s*(?:air)\b/gi, '$1 Air')
      .replace(/\b(2\d|1\d|[7-8])\s*(?:mini|m)\b/gi, '$1 Mini')
      .replace(/\b(2\d|1\d)\s*e\b/gi, '$1e');
  } else {
    limpo = limpo
      .replace(/\b(\d+)(pro\s*max|promax)\b/gi, '$1 Pro Max')
      .replace(/\b(\d+)(pro)\b/gi, '$1 Pro')
      .replace(/\b(\d+)(plus)\b/gi, '$1 Plus')
      .replace(/\b(\d+)(mini)\b/gi, '$1 Mini');
  }

  // Remove menção a imei, serial, lacrado, seminovo, bateria, garantia, gb, cores comuns, fragmentos de RAM/memória e capacidades como "256g" ou "256" solto
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
    .replace(/\b(?:32|64|128|256|512)\b$/g, '')
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
    .replace(/\bair\b/gi, 'Air')
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
  const rawMessageRoot = msgData?.message || {};
  const messageContent =
    rawMessageRoot.ephemeralMessage?.message ||
    rawMessageRoot.viewOnceMessage?.message ||
    rawMessageRoot.viewOnceMessageV2?.message ||
    rawMessageRoot.viewOnceMessageV2Extension?.message ||
    rawMessageRoot.documentWithCaptionMessage?.message ||
    rawMessageRoot;

  const contextInfo =
    msgData?.contextInfo ||
    messageContent?.extendedTextMessage?.contextInfo ||
    messageContent?.imageMessage?.contextInfo ||
    messageContent?.audioMessage?.contextInfo ||
    messageContent?.conversation?.contextInfo ||
    messageContent?.ephemeralMessage?.message?.extendedTextMessage?.contextInfo ||
    messageContent?.ephemeralMessage?.message?.imageMessage?.contextInfo ||
    messageContent?.ephemeralMessage?.message?.audioMessage?.contextInfo ||
    messageContent?.viewOnceMessage?.message?.extendedTextMessage?.contextInfo ||
    messageContent?.viewOnceMessage?.message?.audioMessage?.contextInfo ||
    payload?.data?.contextInfo ||
    payload?.data?.message?.extendedTextMessage?.contextInfo ||
    payload?.data?.message?.audioMessage?.contextInfo ||
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

  const ehQuotedVendaAtacadoFoto =
    Boolean(quotedImageMessage || ehQuotedResumoEtiquetaBot) &&
    Boolean(textoSemMencao) &&
    Boolean(detectarVendaAtacadoMultiploComFoto(textoSemMencao));

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
      ehQuotedVendaAtacadoFoto ||
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

  // Se não identificou nem modelo nem valor, verifica se é um formulário preenchido de pedido
  // (ex: vendedor enviou os dados pessoais e de entrega, e a foto/modelo vem em anexo ou na sequência)
  if (!parsed.aparelho?.modelo && !parsed.valorTotal) {
    const ehFormularioPreenchido =
      Boolean(parsed.cliente?.nome) &&
      (Boolean(parsed.cliente?.cpf) ||
        Boolean(parsed.cliente?.telefone) ||
        Boolean(parsed.cliente?.email) ||
        /formul[aá]rio|para\s+finalizar\s+seu\s+pedido|dados\s+pessoais|endere[cç]o\s+para\s+entrega/i.test(t));

    if (ehFormularioPreenchido) {
      parsed.aparelho = {
        modelo: 'Smartphone',
        condicao: 'seminovo',
      };
      parsed.aparelhos = [{ ...parsed.aparelho }];
      if (!parsed.camposFaltantes) parsed.camposFaltantes = [];
      if (!parsed.camposFaltantes.includes('modelo')) parsed.camposFaltantes.push('modelo');
      if (!parsed.valorTotal && !parsed.camposFaltantes.includes('valorTotal')) {
        parsed.camposFaltantes.push('valorTotal');
      }
    } else {
      return null;
    }
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
    bateria?: number | string | null;
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

  // Se ainda houver múltiplos candidatos e a saúde da bateria foi informada, desempata pela bateria
  if (candidatos.length > 1 && dadosAparelho.bateria) {
    const batAlvo = digitos(dadosAparelho.bateria);
    if (batAlvo) {
      const porBat = candidatos.filter(
        (a) => digitos(a.saude_bateria ?? a.saudeBateria) === batAlvo
      );
      if (porBat.length > 0) {
        candidatos = porBat;
      }
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
    if (proposta.valorTotal && proposta.valorTotal > 0) {
      primeiro.valorUnitario = Number(proposta.valorTotal);
    }
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
  origemReacao?: OrigemReacaoNotinha;
  vendaDetectada: ParsedVenda;
  estoque: AparelhoEstoqueConsulta[];
  fotosRecentes?: FotoRecenteCache[];
  pushName?: string;
}): PropostaNotinha {
  const {
    id = `prop-${Date.now()}`,
    lojaId,
    remoteJid,
    origemReacao,
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
      // O preço unitário exibido ao cliente vem exclusivamente do pedido/formulário ou da confirmação do vendedor,
      // nunca de um preço antigo/desatualizado cadastrado no banco `aparelhos`.
      valorUnitario: precoExplicito,
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
    const indicesSemPreco = itensProposta
      .map((_, idx) => (!tevePrecoExplicitoFormulario[idx] ? idx : -1))
      .filter((idx) => idx >= 0);

    if (indicesSemPreco.length > 0) {
      const somaExplicitos = itensProposta.reduce(
        (acc, it, idx) => (tevePrecoExplicitoFormulario[idx] ? acc + Number(it.valorUnitario || 0) : acc),
        0
      );
      const restante = Math.max(0, Number((valorTotal - somaExplicitos).toFixed(2)));
      const baseParaDistribuir = restante > 0 ? restante : valorTotal;
      const valorPorItem = Number((baseParaDistribuir / indicesSemPreco.length).toFixed(2));

      indicesSemPreco.forEach((idxItem, pos) => {
        itensProposta[idxItem].valorUnitario =
          pos === indicesSemPreco.length - 1
            ? Number((baseParaDistribuir - valorPorItem * (indicesSemPreco.length - 1)).toFixed(2))
            : valorPorItem;
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
    const modeloTr = tr.modelo || '';
    trocasLista.push({
      modelo: limparNomeModelo(modeloTr) || modeloTr,
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
    ...(origemReacao ? { origemReacao } : {}),
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
    vendedor: sanitizarVendedorPublico(vendaDetectada.vendedor || pushName) || 'Atendimento',
    dataVenda: vendaDetectada.dataVenda || undefined,
    dataVendaInformada: Boolean(vendaDetectada.dataVendaInformada),
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
    if (proposta.valorTotal && proposta.valorTotal > 0 && itens.length === 1) {
      itemAlvo.valorUnitario = Number(proposta.valorTotal);
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

  if (proposta.dataVenda) {
    const dataIsoNorm = parseDataFlexivelBr(proposta.dataVenda);
    const hojeBr = obterDataAtualBrasiliaIso();
    if (dataIsoNorm && (proposta.dataVendaInformada || dataIsoNorm !== hojeBr)) {
      linhas.push(`📅 *Data da Compra:* ${formatarIsoParaBrCurto(dataIsoNorm)}`);
    }
  }

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
  if (proposta.isUpgrade) {
    linhas.push('🧾 Reaja com 🧾 (ou responda "EMITIR SEM TROCA") para emitir mantendo o Upgrade na notinha/termo, mas *sem adicionar a troca no estoque*.');
  }
  linhas.push('❌ Reaja com ❌ ou responda "CANCELAR" para cancelar, ou informe o dado a corrigir.');

  return sanitizarTextoWhatsApp(linhas.join('\n'));
}

export type AcaoConfirmacaoNotinha = 'confirmar' | 'confirmar_sem_troca' | 'cancelar';

/**
 * Interpreta se uma reação é de confirmação, confirmação sem cadastrar troca no estoque (`🧾`), ou recusa da nota.
 */
export function interpretarReacaoNotinha(emoji: string): AcaoConfirmacaoNotinha | null {
  if (!emoji || typeof emoji !== 'string') return null;
  const e = emoji.trim();

  const confirmacoes = ['✅', '💚', '👍', '🟢', '✔️', '✔'];
  if (confirmacoes.includes(e)) return 'confirmar';

  const confirmacoesSemTroca = ['🧾', '📄', '📝', '🔄'];
  if (confirmacoesSemTroca.includes(e)) return 'confirmar_sem_troca';

  const cancelamentos = ['❌', '👎', '🔴', '✖️', '✖'];
  if (cancelamentos.includes(e)) return 'cancelar';

  return null;
}

/**
 * Interpreta se uma resposta em texto confirma (com ou sem cadastro da troca no estoque) ou cancela a emissão da notinha pendente.
 * Aceita variações naturais como "sim", "pode vender", "emitir sem troca", "confirmar sem troca", "ok", "confirmo".
 */
export function interpretarConfirmacaoTextoNotinha(texto: string): AcaoConfirmacaoNotinha | null {
  if (!texto || typeof texto !== 'string') return null;
  const limpo = texto
    .trim()
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, ' ')
    .replace(/[!.,;?]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!limpo) return null;

  // Se contém números (ex: "pode vender por 7750", "imei 1234"), não trata como confirmação cega:
  // deixa passar para correção/atualização primeiro.
  if (/\d/.test(limpo)) return null;

  const ehConfirmacaoSemTroca =
    /^(?:(?:sim|ok|blz|certo|pode)\s+)*(?:emitir|emite|confirmar|confirmo|gerar|vender|faturar|sim)\s+sem\s+(?:adicionar\s+|cadastrar\s+|colocar\s+)?(?:a\s+|o\s+)?(?:troca|upgrade)(?:\s+no\s+estoque)?$/i.test(
      limpo
    ) ||
    /^sem\s+(?:adicionar\s+|cadastrar\s+|colocar\s+)?(?:a\s+|o\s+)?(?:troca|upgrade)(?:\s+no\s+estoque)?$/i.test(
      limpo
    );

  if (ehConfirmacaoSemTroca) return 'confirmar_sem_troca';

  const ehConfirmacao =
    /^(?:sim|s|ok|oka|blz|beleza|confirmo|confirmar|confirmado|emitir|emite|aprovar|aprovado|fechou|manda|pode|autorizo|ta\s*certo|t[aá]\s*certo|esta\s*certo|est[aá]\s*certo)$/i.test(limpo) ||
    /^(?:(?:sim|ok|blz|certo|pode)\s+)?(?:pode\s+)?(?:vender|emitir|gerar|mandar|faturar|lancar|lan[cç]ar|confirmar)(?:\s+(?:ele|ela|isso|a\s*nota|a\s*notinha|nota|notinha|sim|mesmo\s*assim|ai|a[ií]))*$/i.test(limpo) ||
    /^(?:(?:sim|ok|confirmo|certo)\s+)+(?:pode\s+)?(?:vender|emitir|gerar|faturar)(?:\s+(?:ele|ela|isso|mesmo\s*assim))?$/i.test(limpo) ||
    /^(?:vender|emitir)\s+mesmo\s+assim$/i.test(limpo);

  if (ehConfirmacao) return 'confirmar';

  const ehCancelamento =
    /^(?:n[aã]o|nao|n|cancelar|cancela|cancelado|esquece|anular|n[aã]o\s+emitir|nao\s+emitir|n[aã]o\s+vender|nao\s+vender|nao\s+precisa|n[aã]o\s+precisa|cancela\s+isso)$/i.test(limpo);

  if (ehCancelamento) return 'cancelar';

  return null;
}

/**
 * Interpreta texto de resposta com correção de dados de uma proposta de venda.
 */
export function interpretarTextoCorrecaoVenda(
  texto: string
): { campo: 'valor' | 'custo' | 'imei' | 'cliente' | 'modelo' | 'cor' | 'data'; valor: any } | null {
  if (!texto || typeof texto !== 'string') return null;
  const t = texto.trim();

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

  // 0. Correção explícita de data da compra / venda / entrada (DD/MM, DD/MM/AA, DD/MM/AAAA)
  const matchData = t.match(
    /^\s*(?:data(?:\s+(?:d[aeo]\s+)?(?:compra|venda|entrada|pedido))?|dia)\s*(?:[eé]|correta|certa|nova)?\s*[:=-]?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}\s*[/.-]\s*\d{1,2}(?:\s*[/.-]\s*(?:\d{4}|\d{2}))?)\s*$/i
  );
  if (matchData?.[1]) {
    const dataIso = parseDataFlexivelBr(matchData[1]);
    if (dataIso) {
      return { campo: 'data', valor: dataIso };
    }
  }

  // 0.1. Correção de IMEI primeiro para que dígitos de IMEI nunca sejam confundidos com valor
  const matchImei = t.match(/\b(?:final\s*(?:do\s*)?imei|imei\s*final|imei)\s*(?:é|e|correto|certo|novo|\s)*[:=-]?\s*#?(\d{4,16})\b/i);
  if (matchImei) {
    return { campo: 'imei', valor: matchImei[1] };
  }

  // 0.1. Correção explícita de custo interno (ex: "custo é 6800")
  const matchCusto = t.match(/\bcusto\b[^\d]*?([0-9.,]+)/iu);
  if (matchCusto) {
    const num = parseValorFlexivel(matchCusto[1]);
    const digitosNum = matchCusto[1].replace(/\D/g, '');
    if (!isNaN(num) && num >= 0 && num < 100000 && digitosNum.length < 10) {
      return { campo: 'custo', valor: num };
    }
  }

  // 1. Correção de valor por número direto (ex: "5200", "4999.99", "R$ 4.500", "7750 reais")
  const matchNumeroPuro = t.match(/^R?\$?\s*([0-9.,]+)(?:\s*reais)?$/i);
  if (matchNumeroPuro) {
    const num = parseValorFlexivel(matchNumeroPuro[1]);
    const digitosNum = matchNumeroPuro[1].replace(/\D/g, '');
    if (!isNaN(num) && num > 0 && num < 100000 && digitosNum.length < 10) {
      return { campo: 'valor', valor: num };
    }
  }

  // 2. Correção de valor por frase (ex: "o valor é 5200", "era 7750", "falei que era 7750", "coloca 7750", "muda pra 7750")
  const matchFraseValor =
    t.match(/(?:valor|preco|pre[cç]o|total|fica|ficou)\b[^\d]*?([0-9.,]+)/iu) ||
    t.match(/(?:^|\b(?:[eé]|era|ser[aá]|por|para|pra|muda(?:r)?\s*(?:para|pra)?|altera(?:r)?\s*(?:para|pra)?|coloca(?:r)?)\s+)R?\$?\s*([0-9.,]+)(?:\s*reais)?/iu);

  if (matchFraseValor) {
    const num = parseValorFlexivel(matchFraseValor[1]);
    const digitosNum = matchFraseValor[1].replace(/\D/g, '');
    if (!isNaN(num) && num > 0 && num < 100000 && digitosNum.length < 10) {
      return { campo: 'valor', valor: num };
    }
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

export interface OpcoesSalvarPropostaNotinha {
  /** Se true, a prévia não expira por tempo (só sai ao confirmar ou cancelar). */
  semExpiracao?: boolean;
  /** Se false, não sobrescreve a chave `:ultima`. Padrão: true. */
  atualizarUltima?: boolean;
  /** JIDs extras do mesmo chat/usuário (ex: número, @s.whatsapp.net, @lid) para espelhar as chaves. */
  jidsAdicionais?: string[];
}

/**
 * Salva uma proposta de notinha diretamente no banco Supabase para aguardar reação ou confirmação.
 * Quando editada, atualiza também as chaves das mensagens anteriores vinculadas à mesma proposta.
 */
export async function salvarPropostaNotinha(
  supabase: SupabaseClient,
  lojaId: string,
  remoteJid: string,
  messageId: string,
  proposta: PropostaNotinha,
  opcoes: OpcoesSalvarPropostaNotinha = {}
): Promise<void> {
  const agora = Date.now();
  if (lojaId) proposta.lojaId = lojaId;
  proposta.messageId = messageId;
  proposta.remoteJid = remoteJid;
  if (!proposta.criadoEm) proposta.criadoEm = agora;

  const semExpiracao = Boolean(opcoes.semExpiracao ?? proposta.semExpiracao);
  if (semExpiracao) {
    proposta.semExpiracao = true;
  }

  const mensagensSet = new Set<string>(
    [...(proposta.mensagensVinculadas || []), messageId].filter((id): id is string => Boolean(id && id.trim()))
  );
  proposta.mensagensVinculadas = Array.from(mensagensSet);

  const jids = Array.from(
    new Set(
      [remoteJid, ...(opcoes.jidsAdicionais || [])].filter((j): j is string => Boolean(j && j.trim()))
    )
  );

  const chavesSet = new Set<string>();
  for (const jid of jids) {
    for (const msgId of proposta.mensagensVinculadas) {
      chavesSet.add(`notinha:${jid}:${msgId}`);
    }
    if (opcoes.atualizarUltima !== false) {
      chavesSet.add(`notinha:${jid}:ultima`);
    }
  }
  const chaves = Array.from(chavesSet);

  try {
    const payload = {
      loja_id: lojaId,
      tipo: 'confirmacao' as const,
      action: 'emitir_notinha',
      params: {
        ...proposta,
        expiraEm: semExpiracao ? null : agora + 30 * 60 * 1000,
      } as any,
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

function propostaCompativelComModelo(
  prop: PropostaNotinha,
  modeloDesejado: string,
  idadeMs: number
): boolean {
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
    return !conflitaComTodos;
  }

  return modelosDaProposta.some((m) => modelosSaoCompativeis(modeloDesejado, m));
}

function propostaEstaExpirada(
  prop: PropostaNotinha,
  criadoEmIso: string | null | undefined,
  maxMinutos: number | null,
  agora: number
): boolean {
  if (prop.semExpiracao) return false;
  if (maxMinutos === null || maxMinutos <= 0) return false;
  const criado = criadoEmIso ? new Date(criadoEmIso).getTime() : (prop.criadoEm || 0);
  if (!criado) return false;
  return agora - criado > maxMinutos * 60 * 1000;
}

/**
 * Busca proposta de notinha pendente diretamente no Supabase (whatsapp_acoes_pendentes).
 * Propostas marcadas com `semExpiracao: true` nunca expiram por tempo.
 */
export async function buscarPropostaNotinhaRecente(
  supabase: SupabaseClient,
  chaves: string[],
  modeloDesejado?: string | null,
  maxMinutos: number | null = 20
): Promise<PropostaNotinha | null> {
  if (!chaves || chaves.length === 0) return null;
  const agora = Date.now();

  try {
    const { data: pendentes } = await supabase
      .from('whatsapp_acoes_pendentes')
      .select('*')
      .in('chave', chaves)
      .eq('tipo', 'confirmacao')
      .order('criado_em', { ascending: false })
      .limit(10);

    if (pendentes && pendentes.length > 0) {
      for (const item of pendentes) {
        const prop = item.params as PropostaNotinha;
        if (!prop) continue;

        if (propostaEstaExpirada(prop, item.criado_em, maxMinutos, agora)) continue;

        const criado = item.criado_em ? new Date(item.criado_em).getTime() : (prop.criadoEm || agora);
        const idadeMs = Math.max(0, agora - criado);

        if (modeloDesejado && !propostaCompativelComModelo(prop, modeloDesejado, idadeMs)) {
          continue;
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
 * Lista todas as propostas de notinha pendentes (únicas por `proposta.id`) de um conjunto de JIDs
 * (ex: privado de um usuário em número, @s.whatsapp.net e @lid).
 */
export async function listarPropostasNotinhaPendentes(
  supabase: SupabaseClient,
  jids: string[],
  lojaId?: string | null,
  maxMinutosLegado: number = 30
): Promise<PropostaNotinha[]> {
  const jidsLimpos = Array.from(new Set(jids.filter((j): j is string => Boolean(j && j.trim()))));
  if (jidsLimpos.length === 0) return [];

  const prefixos = jidsLimpos.map((j) => `notinha:${j}:`);
  const agora = Date.now();

  try {
    let query = supabase
      .from('whatsapp_acoes_pendentes')
      .select('chave, params, criado_em')
      .eq('tipo', 'confirmacao')
      .eq('action', 'emitir_notinha');

    if (lojaId) {
      query = query.eq('loja_id', lojaId);
    }

    const { data: rows } = await query;
    if (!rows || rows.length === 0) return [];

    const porId = new Map<string, { prop: PropostaNotinha; atualizadoEm: number }>();

    for (const row of rows as Array<{ chave?: string; params?: PropostaNotinha; criado_em?: string }>) {
      const chave = String(row.chave || '');
      if (!chave || chave.endsWith(':ultima')) continue;
      if (!prefixos.some((pref) => chave.startsWith(pref))) continue;

      const prop = row.params;
      if (!prop || !prop.id) continue;
      if (propostaEstaExpirada(prop, row.criado_em, maxMinutosLegado, agora)) continue;

      const atualizadoEm = row.criado_em ? new Date(row.criado_em).getTime() : (prop.criadoEm || 0);
      const existente = porId.get(prop.id);
      if (!existente || atualizadoEm >= existente.atualizadoEm) {
        porId.set(prop.id, { prop, atualizadoEm });
      }
    }

    return Array.from(porId.values())
      .map((entry) => entry.prop)
      .sort((a, b) => (a.criadoEm || 0) - (b.criadoEm || 0));
  } catch (err) {
    console.warn('[Notinha Automática] Erro ao listar propostas pendentes:', err);
    return [];
  }
}

export type ResultadoResolucaoPropostaAlvo =
  | { status: 'encontrada'; proposta: PropostaNotinha }
  | { status: 'multiplas'; propostas: PropostaNotinha[] }
  | { status: 'nao_encontrada' };

/**
 * Resolve de forma segura qual proposta de notinha deve ser confirmada, editada ou cancelada:
 * - Quando há `quotedStanzaId` (reply ou reação em uma prévia específica), busca EXCLUSIVAMENTE
 *   pelo ID daquela mensagem — nunca cai em `:ultima` nem atropela outra notinha do lote.
 * - Sem `quotedStanzaId`, se houver 1 pendente na fila, retorna ela; se houver 2+, retorna
 *   `multiplas` para pedir que o usuário dê reply ou reaja na prévia desejada.
 */
export async function resolverPropostaAlvoNotinha(params: {
  supabase: SupabaseClient;
  jids: string[];
  lojaId?: string | null;
  quotedStanzaId?: string | null;
  modeloDesejado?: string | null;
  maxMinutosLegado?: number;
}): Promise<ResultadoResolucaoPropostaAlvo> {
  const {
    supabase,
    jids,
    lojaId,
    quotedStanzaId,
    modeloDesejado = null,
    maxMinutosLegado = 30,
  } = params;

  const jidsLimpos = Array.from(new Set(jids.filter((j): j is string => Boolean(j && j.trim()))));
  if (jidsLimpos.length === 0) return { status: 'nao_encontrada' };

  // 1. Reply ou reação numa prévia específica -> busca estrita pelo ID exato (sem fallback :ultima)
  if (quotedStanzaId) {
    const chavesExatas = jidsLimpos.map((j) => `notinha:${j}:${quotedStanzaId}`);
    const exata = await buscarPropostaNotinhaRecente(supabase, chavesExatas, null, maxMinutosLegado);
    if (exata) {
      return { status: 'encontrada', proposta: exata };
    }
    return { status: 'nao_encontrada' };
  }

  // 2. Mensagem solta (sem reply) -> consulta todas as pendentes da fila deste chat/usuário
  let pendentes = await listarPropostasNotinhaPendentes(supabase, jidsLimpos, lojaId, maxMinutosLegado);

  if (modeloDesejado && pendentes.length > 0) {
    const agora = Date.now();
    const compativeis = pendentes.filter((prop) =>
      propostaCompativelComModelo(prop, modeloDesejado, Math.max(0, agora - (prop.criadoEm || agora)))
    );
    if (compativeis.length > 0) {
      pendentes = compativeis;
    } else {
      return { status: 'nao_encontrada' };
    }
  }

  if (pendentes.length === 1) {
    return { status: 'encontrada', proposta: pendentes[0] };
  }

  if (pendentes.length > 1) {
    return { status: 'multiplas', propostas: pendentes };
  }

  // Fallback legado (caso só exista `:ultima` gravada antes desta versão)
  const chavesUltima = jidsLimpos.map((j) => `notinha:${j}:ultima`);
  const ultima = await buscarPropostaNotinhaRecente(supabase, chavesUltima, modeloDesejado, maxMinutosLegado);
  if (ultima) {
    return { status: 'encontrada', proposta: ultima };
  }

  return { status: 'nao_encontrada' };
}

/**
 * Remove do banco APENAS as chaves pertencentes à proposta especificada (incluindo edições
 * anteriores dela e `:ultima` somente se apontar para esta mesma proposta), preservando
 * todas as demais notinhas pendentes do lote. Retorna quantas ainda restam pendentes.
 */
export async function removerPropostaNotinhaPendente(
  supabase: SupabaseClient,
  proposta: PropostaNotinha,
  jids: string[],
  lojaId?: string | null,
  chavesExtras: string[] = []
): Promise<number> {
  const jidsLimpos = Array.from(
    new Set(
      [...jids, proposta.remoteJid].filter((j): j is string => Boolean(j && j.trim()))
    )
  );
  const prefixos = jidsLimpos.map((j) => `notinha:${j}:`);

  const chavesRemover = new Set<string>(
    chavesExtras.filter((c) => Boolean(c) && !c.endsWith(':ultima'))
  );

  const msgIds = Array.from(
    new Set(
      [proposta.messageId, ...(proposta.mensagensVinculadas || [])].filter(
        (id): id is string => Boolean(id && id.trim())
      )
    )
  );
  for (const jid of jidsLimpos) {
    for (const msgId of msgIds) {
      chavesRemover.add(`notinha:${jid}:${msgId}`);
    }
  }

  const restantesIds = new Set<string>();

  try {
    let query = supabase
      .from('whatsapp_acoes_pendentes')
      .select('chave, params, criado_em')
      .eq('tipo', 'confirmacao')
      .eq('action', 'emitir_notinha');

    if (lojaId || proposta.lojaId) {
      query = query.eq('loja_id', lojaId || proposta.lojaId);
    }

    const { data: rows } = await query;
    const agora = Date.now();

    for (const row of (rows || []) as Array<{ chave?: string; params?: PropostaNotinha; criado_em?: string }>) {
      const chave = String(row.chave || '');
      const propRow = row.params;
      if (!chave || !propRow) continue;

      if (propRow.id && proposta.id && propRow.id === proposta.id) {
        chavesRemover.add(chave);
      } else if (
        !chave.endsWith(':ultima') &&
        prefixos.some((pref) => chave.startsWith(pref)) &&
        propRow.id &&
        !propostaEstaExpirada(propRow, row.criado_em, 30, agora)
      ) {
        restantesIds.add(propRow.id);
      }
    }

    const listaChaves = Array.from(chavesRemover);
    if (listaChaves.length > 0) {
      await supabase.from('whatsapp_acoes_pendentes').delete().in('chave', listaChaves);
    }
  } catch (err) {
    console.warn('[Notinha Automática] Erro ao remover proposta pendente:', err);
  }

  return restantesIds.size;
}

/**
 * Cancela e remove todas as propostas de notinha pendentes do usuário/chat.
 */
export async function limparTodasPropostasNotinhaPendentes(
  supabase: SupabaseClient,
  jids: string[],
  lojaId?: string | null
): Promise<number> {
  const jidsLimpos = Array.from(new Set(jids.filter((j): j is string => Boolean(j && j.trim()))));
  if (jidsLimpos.length === 0) return 0;

  const prefixos = jidsLimpos.map((j) => `notinha:${j}:`);
  const chavesRemover = new Set<string>(jidsLimpos.map((j) => `notinha:${j}:ultima`));
  const idsCancelados = new Set<string>();

  try {
    let query = supabase
      .from('whatsapp_acoes_pendentes')
      .select('chave, params')
      .eq('tipo', 'confirmacao')
      .eq('action', 'emitir_notinha');

    if (lojaId) {
      query = query.eq('loja_id', lojaId);
    }

    const { data: rows } = await query;
    for (const row of (rows || []) as Array<{ chave?: string; params?: PropostaNotinha }>) {
      const chave = String(row.chave || '');
      if (!chave || !prefixos.some((pref) => chave.startsWith(pref))) continue;
      chavesRemover.add(chave);
      if (!chave.endsWith(':ultima') && row.params?.id) {
        idsCancelados.add(row.params.id);
      }
    }

    const listaChaves = Array.from(chavesRemover);
    if (listaChaves.length > 0) {
      await supabase.from('whatsapp_acoes_pendentes').delete().in('chave', listaChaves);
    }
  } catch (err) {
    console.warn('[Notinha Automática] Erro ao limpar todas as propostas pendentes:', err);
  }

  return idsCancelados.size;
}

/**
 * Formata a lista de notinhas pendentes no privado para o comando `!pendentes`.
 */
export function formatarListaPropostasPendentes(propostas: PropostaNotinha[]): string {
  if (!propostas || propostas.length === 0) {
    return '✅ Você não tem nenhuma notinha pendente no momento!';
  }

  const linhas = propostas.map((p, idx) => {
    const valorFmt =
      p.valorTotal && p.valorTotal > 0
        ? `R$ ${Number(p.valorTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : '⚠️ sem valor';
    const dataFmt = p.dataVenda ? ` | 📅 ${p.dataVenda}` : '';
    const modeloResumo = [p.modelo, p.capacidade, p.cor].filter(Boolean).join(' ').trim();
    return `${idx + 1}. *${p.clienteNome || 'Cliente'}* — ${modeloResumo || 'Aparelho'} — *${valorFmt}*${dataFmt}`;
  });

  const plural = propostas.length === 1 ? 'notinha pendente' : 'notinhas pendentes';
  return (
    `📋 *NOTINHAS PENDENTES (${propostas.length} ${plural}):*\n\n` +
    linhas.join('\n') +
    `\n\n💡 _Para confirmar, editar ou cancelar uma específica, *responda (reply)* ou *reaja com ✅ / ❌* direto na prévia dela._\n` +
    `🗑️ _Para limpar todas de uma vez, envie:_ *!cancelar todas*`
  );
}

/**
 * Executa a emissão atômica da venda e baixa no estoque.
 */
export async function emitirNotinhaVenda(
  supabase: SupabaseClient,
  lojaId: string,
  proposta: PropostaNotinha,
  usuarioNome: string = 'Bot WhatsApp',
  opcoes?: { pularCadastroTrocaEstoque?: boolean }
): Promise<{
  sucesso: boolean;
  mensagem: string;
  vendaId?: string;
  linkRecibo?: string;
  pdfBase64?: string;
  nomeArquivoPdf?: string;
  nomeLoja?: string;
  erroPdf?: string;
}> {
  try {
    const pularTrocaEstoque = Boolean(opcoes?.pularCadastroTrocaEstoque);
    const agora = new Date().toISOString();
    const dataVendaResolvida = resolverDataPagamentoProposta(proposta.dataVenda);
    const dataPagamentoIso = dataVendaResolvida.dataPagamentoIso;
    const vendedorLimpo =
      sanitizarVendedorPublico(usuarioNome) ||
      sanitizarVendedorPublico(proposta.vendedor) ||
      'Atendimento';
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
    const nomeLojaResolvido = (dadosLoja?.nome || 'Lucas Imports').trim();

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
    const somaUnitariosExistentes = itensProposta.reduce((acc, it) => acc + Number(it.valorUnitario || 0), 0);
    const unitariosBatemComTotal =
      itensProposta.length > 1 &&
      itensProposta.every((it) => Number(it.valorUnitario || 0) > 0) &&
      Math.abs(somaUnitariosExistentes - valorTotalNum) <= 0.05;

    const itensVendaPayload = itensProposta.map((it, idx) => {
      const valItem =
        itensProposta.length === 1 && valorTotalNum > 0
          ? valorTotalNum
          : unitariosBatemComTotal && it.valorUnitario && it.valorUnitario > 0
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
      vendedor: vendedorLimpo,
      dataPagamento: dataPagamentoIso,
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
    if (proposta.isUpgrade && listaTrocas.length > 0 && !pularTrocaEstoque) {
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
        dataCadastro: dataPagamentoIso,
        observacoes: `Entrada via Upgrade (Venda WhatsApp - Cliente: ${proposta.clienteNome})`,
      };
    }

    const resultado = await registrarVendaAtomica(supabase, {
      venda: registroVenda,
      aparelhoIds,
      // A emissão pelo bot só ocorre após confirmação explícita do usuário na prévia (que já avisa se o IMEI consta como vendido),
      // portanto autorizamos a emissão mesmo para aparelhos já baixados/vendidos anteriormente.
      permitirForaDoEstoque: aparelhoIds,
      camposAparelho,
      tradeIn: tradeInPayload,
      origem: 'whatsapp_notinha_automatica',
      usuarioNome: vendedorLimpo,
    });

    // Caso a venda possua 2 ou mais aparelhos recebidos na troca (múltiplos upgrades), dá entrada dos aparelhos adicionais no estoque
    if (proposta.isUpgrade && listaTrocas.length > 1 && !pularTrocaEstoque) {
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
              dataCadastro: dataPagamentoIso,
              observacoes: `Entrada via Upgrade (2º Aparelho - Venda WhatsApp - Cliente: ${proposta.clienteNome})`,
            })
            .select('*')
            .single();

          if (apTrocaInserido?.id) {
            await registrarEntradaEstoque(supabase, {
              aparelhos: [apTrocaInserido as any],
              origem: 'whatsapp_notinha_automatica' as any,
              lojaId: lojaIdFinal,
              usuarioNome: vendedorLimpo,
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

    const sufixoSemTrocaEstoque = pularTrocaEstoque ? ' _(mantida no termo · sem entrada no estoque)_' : '';
    const resumoTrocasMsg =
      proposta.isUpgrade && listaTrocas.length > 1
        ? `🔄 *Trocas recebidas (${listaTrocas.length}):*${sufixoSemTrocaEstoque}\n` +
          listaTrocas
            .map(
              (tr, i) =>
                `   ${i + 1}. ${tr.modelo}${tr.capacidade ? ` ${tr.capacidade}` : ''}${tr.cor ? ` ${tr.cor}` : ''}${tr.imei ? ` (IMEI: ${tr.imei})` : ''}`
            )
            .join('\n') +
          '\n'
        : proposta.isUpgrade && proposta.modeloTroca
        ? `🔄 *Troca recebida:* ${proposta.modeloTroca}${sufixoSemTrocaEstoque}\n`
        : '';

    const linhaDataMsg =
      dataVendaResolvida.ehDataCustomizada || proposta.dataVendaInformada
        ? `📅 *Data da Compra:* ${dataVendaResolvida.dataBr}\n`
        : '';

    const msgSucesso = `✅ *NOTINHA EMITIDA COM SUCESSO!* 🧾\n` +
      `──────────────────────────\n` +
      `📄 *Venda:* #${vendaId}\n` +
      linhaDataMsg +
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
    let erroPdf: string | undefined = undefined;

    try {
      const pdfBuffer = await gerarReciboPdfBuffer({
        vendaId: vendaUuid,
        codigoVenda: vendaId,
        dataEmissao: dataVendaResolvida.dataEmissaoPdf,
        loja: {
          nome: nomeLojaResolvido,
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
        vendedor: vendedorLimpo,
        linkRecibo,
      });

      pdfBase64 = pdfBuffer.toString('base64');
      nomeArquivoPdf = `Recibo-${vendaId}.pdf`;
    } catch (errPdf: any) {
      erroPdf = errPdf?.message || String(errPdf);
      console.error('❌ [Notinha Automática] Erro ao gerar PDF do recibo:', errPdf);
    }

    return {
      sucesso: true,
      mensagem: sanitizarTextoWhatsApp(msgSucesso),
      vendaId,
      linkRecibo,
      pdfBase64,
      nomeArquivoPdf,
      nomeLoja: nomeLojaResolvido,
      erroPdf,
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
  bateria?: number | string | null;
  observacoes?: string | null;
  dataEntrada?: string | null;
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
        await new Promise((r) => setTimeout(r, 300));
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
        await new Promise((r) => setTimeout(r, 300));
        continue;
      }

      if (esperaNovaFotoMs > 0 && Date.now() - inicio < esperaNovaFotoMs) {
        await new Promise((r) => setTimeout(r, 300));
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

  const matchesImei = (val?: string | null) => {
    if (!val) return false;
    const limpo = digitos(val);
    if (!limpo) return false;
    if (limpo === imeiLimpo) return true;
    if (imeiLimpo.length >= 14 && limpo.includes(imeiLimpo)) return true;
    if (limpo.length >= 14 && imeiLimpo.includes(limpo)) return true;
    const partes = String(val).split(/[\s,/]+/).map((p) => digitos(p)).filter((p) => p.length >= 4);
    return partes.some((p) => p === imeiLimpo || (imeiLimpo.length >= 14 && p.includes(imeiLimpo)));
  };

  if (Array.isArray(proposta.itens) && proposta.itens.length > 0) {
    if (proposta.itens.some((it) => matchesImei(it.imei))) {
      return true;
    }
  }

  if (matchesImei(proposta.imei)) {
    return true;
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

    if (Date.now() - inicio + 300 > esperaMs) break;
    await new Promise((r) => setTimeout(r, 300));
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

export interface VendaAtacadoDetectada {
  clienteNome: string;
  valor: number;
  formaPagamento?: string;
  valoresIndividuais?: number[];
}

const STOPWORDS_ATACADO_NOME = new Set([
  'sim', 's', 'ok', 'oka', 'blz', 'beleza', 'confirmo', 'confirmar', 'confirmado',
  'emitir', 'emite', 'aprovar', 'aprovado', 'fechou', 'manda', 'pode', 'autorizo',
  'nao', 'não', 'n', 'cancelar', 'cancela', 'cancelado', 'esquece', 'anular',
  'ler', 'releia', 'reler', 'notinha', 'nota', 'pedido', 'venda', 'atacado',
  'estoque', 'cadastrar', 'cadastra', 'entrada', 'processar', 'processa',
  'analisa', 'analisar', 'bot', 'astrogeek', 'ajuda', 'menu', 'plano', 'assinatura',
  'fiado', 'saldo', 'devedores', 'extrato', 'broadcast', 'pix', 'dinheiro',
  'cartao', 'cartão', 'credito', 'crédito', 'debito', 'débito', 'valor', 'preco',
  'preço', 'imei', 'foto', 'caixa', 'etiqueta', 'cliente', 'comprador', 'lojista',
  'pendente', 'oi', 'ola', 'olá', 'valeu', 'vlw', 'tmj', 'show', 'top', 'massa',
  'legal', 'perfeito', 'certo', 'verdade', 'amem', 'amém', 'boa', 'obrigado',
  'obrigada', 'parabens', 'parabéns', 'mano', 'irmao', 'irmão', 'chefe', 'patrao',
  'patrão', 'amigo', 'galera', 'pessoal', 'envia', 'passa', 'olha', 'veja',
]);

function parseValorMonetarioToken(bruto: string, exigirMinimo: boolean): number | null {
  const limpo = String(bruto || '').trim();
  if (!limpo) return null;

  const tinhaPrefixoMonetario = /R\$|reais/i.test(limpo);
  const numStr = limpo.replace(/R\$/gi, '').replace(/reais/gi, '').trim();
  const match = numStr.match(/^(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)$/);
  if (!match) return null;

  const raw = match[1];
  const parsed = raw.includes(',')
    ? parseFloat(raw.replace(/\./g, '').replace(',', '.'))
    : /^\d+\.\d{1,2}$/.test(raw)
      ? parseFloat(raw)
      : parseFloat(raw.replace(/\./g, ''));

  const digitosValor = raw.replace(/\D/g, '');
  if (Number.isNaN(parsed) || parsed < 0 || parsed >= 100000 || digitosValor.length > 7) {
    return null;
  }
  if (exigirMinimo && parsed !== 0 && parsed < 50 && !tinhaPrefixoMonetario) {
    return null;
  }
  return parsed;
}

function prepararTextoVendaAtacado(
  texto: string
): { trabalho: string; formaPagamento?: string } | null {
  if (!texto || typeof texto !== 'string') return null;

  const limpo = limparMencoesBot(texto)
    .replace(/[\u200B-\u200D\uFEFF\u2060]/g, '')
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, ' ')
    .split(/\r?\n/)
    .map((lin) => lin.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .trim();

  if (!limpo || limpo.length < 2 || limpo.length > 180) return null;
  if (limpo.split('\n').length > 6) return null;
  if (limpo.startsWith('!')) return null;
  if (/https?:\/\//i.test(limpo)) return null;

  if (ehMensagemDeEntradaEstoque(limpo) || ehRelatorioOuConferencia(limpo)) {
    return null;
  }

  // Ignora respostas/mensagens do próprio bot
  if (
    /PR[ÉE]VIA DA NOTINHA|NOTINHA EMITIDA|Dados lidos da etiqueta|APARELHO N[AÃ]O ENCONTRADO|NOVO APARELHO CADASTRADO|VENDA ATACADO REGISTRADA/i.test(
      limpo
    )
  ) {
    return null;
  }

  // Rejeita formulários de varejo, especificações de aparelho, upgrades e perguntas
  if (
    /para\s+finalizar|dados\s+pessoais|endere[cç]o\s+para\s+entrega|forma\s+de\s+pagamento|\bcpf\b|\bcep\b|data\s+de\s+nascimento|e-?mail\s*:|\bupgrade\b|\btrade[- ]?in\b|\bnotinha\b|\bformul[aá]rio\b|\bnota\b/i.test(
      limpo
    ) ||
    /[\w.-]+@[\w.-]+\.[a-zA-Z]{2,}/.test(limpo) ||
    /\b(?:iphone|ipad|macbook|apple\s*watch|airpods|samsung|galaxy|xiaomi|poco|redmi|motorola|realme|pro\s*max|promax|lacrado|seminovo|imei|serial|bateria|custo)\b/i.test(
      limpo
    ) ||
    /\b(?:32|64|128|256|512)\s*(?:gb|g)\b|\b1\s*tb\b/i.test(limpo) ||
    /\bcor\s*:/i.test(limpo) ||
    /\?/.test(limpo) ||
    /^(?:quem|algu[eé]m|algm|tem|temos|qual|quais|quanto|quantos|quantas|onde|como|procuro|preciso|tabela|lista|estoque|pre[cç]o)\b/i.test(
      limpo
    )
  ) {
    return null;
  }

  if (interpretarConfirmacaoTextoNotinha(limpo) !== null) return null;

  // Rejeita correções de notinha, saudações e números longos (IMEI / telefone)
  if (
    /^(?:o\s+)?(?:valor|pre[cç]o)\s*(?:[eé]|certo|correto|novo|:|=)(?=\s|$|\d)/i.test(limpo) ||
    /^(?:custo|cor|imei|era|fica|ficou|muda(?:r)?|altera(?:r)?|coloca(?:r)?|corrige|troca(?:r)?)(?=\s|$|:)/i.test(
      limpo
    ) ||
    /^(?:bom\s+dia|boa\s+tarde|boa\s+noite|tudo\s+bem|deus\s+aben[cç]oe|bom\s+trabalho|kkk+|haha+|rsrs+)(?=\s|$)/i.test(
      limpo
    ) ||
    /\b\d{7,}\b/.test(limpo)
  ) {
    return null;
  }

  let trabalho = limpo;

  // Extrai forma de pagamento opcional sem poluir o nome
  let formaPagamento: string | undefined;
  if (/\bfiado\b|\ba\s+prazo\b/i.test(trabalho)) {
    formaPagamento = 'fiado';
    trabalho = trabalho.replace(/(?:^|\s)(?:(?:no|via|em|por)\s+)?(?:fiado|a\s+prazo)\b/gi, ' ');
  } else if (/\bpix\b/i.test(trabalho)) {
    formaPagamento = 'pix';
    trabalho = trabalho.replace(/(?:^|\s)(?:(?:no|via|em|por)\s+)?pix\b/gi, ' ');
  } else if (/\bdinheiro\b/i.test(trabalho)) {
    formaPagamento = 'dinheiro';
    trabalho = trabalho.replace(/(?:^|\s)(?:(?:no|via|em|por)\s+)?dinheiro\b/gi, ' ');
  } else if (/\bcart[aã]o(?:\s+de\s+(?:cr[eé]dito|d[eé]bito))?\b/i.test(trabalho)) {
    formaPagamento = /d[eé]bito/i.test(trabalho) ? 'cartao_debito' : 'cartao_credito';
    trabalho = trabalho.replace(
      /(?:^|\s)(?:(?:no|via|em|por)\s+)?cart[aã]o(?:\s+de\s+(?:cr[eé]dito|d[eé]bito))?\b/gi,
      ' '
    );
  }

  trabalho = trabalho
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .trim();

  return trabalho ? { trabalho, formaPagamento } : null;
}

function finalizarVendaAtacado(
  trabalhoBruto: string,
  valor: number,
  formaPagamento?: string,
  valoresIndividuais?: number[]
): VendaAtacadoDetectada | null {
  let nome = trabalhoBruto
    .replace(
      /^(?:atacado|venda\s+atacado|vendido(?:\s+(?:para|pro|pra))?|vendi(?:\s+(?:para|pro|pra))?|cliente|comprador|lojista|para|pro|pra)\s*[:=-]?\s*/i,
      ''
    )
    .replace(/^[-–—:.,/*_\s]+|[-–—:.,/*_\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Remove verbos/conectores soltos no final do nome (ex: "Edgard vendido por R$4150" -> "Edgard", "Carlos saiu por 2500" -> "Carlos")
  let anterior = '';
  while (nome && nome !== anterior) {
    anterior = nome;
    nome = nome
      .replace(
        /(?:\s+[-–—:]?\s*|\s+)(?:vendid[oa]s?|vendi|venda|saiu|foi|pag[oa]s?|pagou|paguei|no\s+valor(?:\s+de)?|valor(?:\s+de)?|por|para|pro|pra|de)\s*$/i,
        ''
      )
      .replace(/^[-–—:.,/*_\s]+|[-–—:.,/*_\s]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  if (!nome || nome.length < 2 || nome.length > 60) return null;
  if (!/[A-Za-zÀ-ÖØ-öø-ÿ]{2,}/.test(nome)) return null;
  if (nome.split(/\s+/).length > 5) return null;
  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ0-9\s.'&-]*$/.test(nome)) return null;

  if (STOPWORDS_ATACADO_NOME.has(nome.toLowerCase())) return null;

  return {
    clienteNome: nome,
    valor,
    ...(formaPagamento ? { formaPagamento } : {}),
    ...(valoresIndividuais && valoresIndividuais.length > 1 ? { valoresIndividuais } : {}),
  };
}

/**
 * Detecta o padrão de venda de atacado com foto da etiqueta/IMEI:
 * nome da pessoa/lojista (na legenda da foto ou na mensagem logo abaixo) e valor opcional.
 * Se não informar valor, retorna `valor: 0`.
 */
export function detectarVendaAtacadoComFoto(texto: string): VendaAtacadoDetectada | null {
  const prep = prepararTextoVendaAtacado(texto);
  if (!prep) return null;

  let { trabalho, formaPagamento } = prep;
  // Evita confundir listas de múltiplos valores ("João 2500 / 3100") fora do !modo multiplo
  if (/(?:R\$\s*)?\d{2,5}(?:[.,]\d{1,2})?(?:\s*(?:reais|r\$))?\s*(?:\/|\+|;|\n)\s*(?:R\$\s*)?\d{2,5}/i.test(trabalho)) {
    return null;
  }

  let valor = 0;

  const matchValor = trabalho.match(
    /(?:^|[\s\n:–—-])(valor\s*[:=-]?\s*)?(?:por\s+|de\s+|a\s+)?(R\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?:\s*(reais|r\$))?\s*$/i
  );

  if (matchValor) {
    const tokenCompleto = `${matchValor[2] || ''}${matchValor[3]}${matchValor[4] ? ` ${matchValor[4]}` : ''}`;
    const parsed = parseValorMonetarioToken(tokenCompleto, !matchValor[1]);
    if (parsed !== null) {
      valor = parsed;
      const idxMatch = matchValor.index ?? trabalho.length;
      trabalho = trabalho.slice(0, idxMatch).trim();
    }
  } else {
    // Suporta nome colado ao valor sem espaço (ex: "GM700", "Lucas2500")
    const matchColado = trabalho.match(/^([A-Za-zÀ-ÖØ-öø-ÿ]{2,25})(\d{3,5}(?:[.,]\d{1,2})?)$/);
    if (matchColado) {
      const parsed = parseValorMonetarioToken(matchColado[2], true);
      if (parsed !== null) {
        trabalho = matchColado[1].trim();
        valor = parsed;
      }
    }
  }

  return finalizarVendaAtacado(trabalho, valor, formaPagamento);
}

/**
 * Variante para `!modo multiplo`: além do padrão simples, aceita múltiplos valores
 * individuais separados por `/`, `+`, `;` ou quebras de linha após o nome do comprador
 * (ex.: `"João 2500 / 3100"`, `"Pedro\n2500\n3100"`, `"Lucas 2400 + 2800"`).
 */
export function detectarVendaAtacadoMultiploComFoto(texto: string): VendaAtacadoDetectada | null {
  const prep = prepararTextoVendaAtacado(texto);
  if (!prep) return null;

  const { trabalho, formaPagamento } = prep;

  const matchMultiplo = trabalho.match(
    /(?:^|[\s\n:–—-])(?:valores?\s*[:=-]?\s*)?((?:(?:R\$\s*)?(?:\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?:\s*(?:reais|r\$))?(?:\s*(?:\/|\+|;|\n)\s*)){1,}(?:R\$\s*)?(?:\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?:\s*(?:reais|r\$))?)\s*$/i
  );

  if (matchMultiplo) {
    const tokens = matchMultiplo[1]
      .split(/\s*(?:\/|\+|;|\n)\s*/)
      .map((t) => t.trim())
      .filter(Boolean);

    if (tokens.length >= 2) {
      const valores = tokens.map((tok) => parseValorMonetarioToken(tok, true));
      if (valores.every((v): v is number => v !== null)) {
        const idxMatch = matchMultiplo.index ?? trabalho.length;
        const nomeRestante = trabalho.slice(0, idxMatch).trim();
        const soma = Number(valores.reduce((acc, v) => acc + v, 0).toFixed(2));
        const resMultiplo = finalizarVendaAtacado(nomeRestante, soma, formaPagamento, valores);
        if (resMultiplo) return resMultiplo;
      }
    }
  }

  return detectarVendaAtacadoComFoto(texto);
}

export interface VendaAtacadoDiretaDetectada {
  vendaAtacado: VendaAtacadoDetectada;
  fotoVirtual: FotoRecenteCache;
}

/**
 * Detecta comando ou áudio de venda de atacado que já informa o aparelho e/ou IMEI na mesma frase
 * (sem depender de foto enviada antes), ex.:
 * - "venda atacado para GM iPhone 11 64 GB preto 62% IMEI 7896"
 * - "venda de atacado para GM iPhone 11 64GB preto 62% imei 7896 por 1500"
 * - "vendi no atacado pro João iPhone 13 128GB azul imei 350015753668064 2500"
 */
export function detectarVendaAtacadoPorTextoOuAudio(
  texto: string
): VendaAtacadoDiretaDetectada | null {
  if (!texto || typeof texto !== 'string') return null;

  const limpo = limparMencoesBot(texto)
    .replace(/[\u200B-\u200D\uFEFF\u2060]/g, '')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[.!?;,]+$/g, '')
    .trim();

  if (limpo.length < 10 || limpo.length > 260 || limpo.startsWith('!')) return null;
  if (/\?/.test(limpo)) return null;

  const temGatilhoAtacado =
    /\b(?:venda\s+(?:de\s+|no\s+|do\s+)?atacado|vendido\s+(?:no\s+|em\s+)?atacado|vendi\s+(?:no\s+|em\s+)?atacado)\b/i.test(
      limpo
    ) || /^(?:registrar?\s+)?atacado\b/i.test(limpo);

  if (!temGatilhoAtacado) return null;

  let trabalho = limpo;

  // 1. Extrai IMEI (ex: "IMEI 7896", "IMEI: 350015753668064" ou 15 dígitos isolados)
  let imei: string | null = null;
  const matchImeiExplicito = trabalho.match(
    /\b(?:final\s+(?:do\s+)?imei|imei\s+final|imei)\s*[:=#-]?\s*(\d{4,16})\b/i
  );
  if (matchImeiExplicito) {
    imei = matchImeiExplicito[1];
    trabalho = trabalho.replace(matchImeiExplicito[0], ' ');
  } else {
    const matchImei15 = trabalho.match(/\b(\d{15})\b/);
    if (matchImei15) {
      imei = matchImei15[1];
      trabalho = trabalho.replace(matchImei15[0], ' ');
    }
  }

  // 2. Extrai saúde da bateria (ex: "62%", "bateria 62%")
  let bateria: number | null = null;
  const matchBateria = trabalho.match(
    /(?:\b(?:sa[uú]de\s+(?:da\s+)?)?(?:bateria|bat)\s*[:=-]?\s*(\d{2,3})\s*%?|\b(\d{2,3})\s*%)/i
  );
  if (matchBateria) {
    const batNum = Number(matchBateria[1] || matchBateria[2]);
    if (batNum >= 10 && batNum <= 100) {
      bateria = batNum;
      trabalho = trabalho.replace(matchBateria[0], ' ');
    }
  }

  // 3. Extrai capacidade (ex: "64 GB", "128GB", "256 gigas", "1TB")
  let capacidade: string | null = null;
  const matchCap = trabalho.match(
    /\b(32|64|128|256|512)\s*(?:GB|G|GIGAS?)\b|\b(1|2)\s*(?:TB|TERAS?)\b/i
  );
  if (matchCap) {
    capacidade = matchCap[1] ? `${matchCap[1]}GB` : `${matchCap[2]}TB`;
    trabalho = trabalho.replace(matchCap[0], ' ');
  }

  // 4. Extrai forma de pagamento opcional
  let formaPagamento: string | undefined;
  if (/\bfiado\b|\ba\s+prazo\b/i.test(trabalho)) {
    formaPagamento = 'fiado';
    trabalho = trabalho.replace(/(?:^|\s)(?:(?:no|via|em|por)\s+)?(?:fiado|a\s+prazo)\b/gi, ' ');
  } else if (/\bpix\b/i.test(trabalho)) {
    formaPagamento = 'pix';
    trabalho = trabalho.replace(/(?:^|\s)(?:(?:no|via|em|por)\s+)?pix\b/gi, ' ');
  } else if (/\bdinheiro\b/i.test(trabalho)) {
    formaPagamento = 'dinheiro';
    trabalho = trabalho.replace(/(?:^|\s)(?:(?:no|via|em|por)\s+)?dinheiro\b/gi, ' ');
  } else if (/\bcart[aã]o(?:\s+de\s+(?:cr[eé]dito|d[eé]bito))?\b/i.test(trabalho)) {
    formaPagamento = /d[eé]bito/i.test(trabalho) ? 'cartao_debito' : 'cartao_credito';
    trabalho = trabalho.replace(
      /(?:^|\s)(?:(?:no|via|em|por)\s+)?cart[aã]o(?:\s+de\s+(?:cr[eé]dito|d[eé]bito))?\b/gi,
      ' '
    );
  }

  // 5. Extrai valor opcional (ex: "por 1500", "valor 1500", "R$ 1.500" ou número final >= 100)
  let valor = 0;
  const matchValorExp = trabalho.match(
    /(?:\b(?:por|valor\s*[:=-]?|pre[cç]o\s*[:=-]?)\s*(?:R\$\s*)?|R\$\s*)(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d{3,5}(?:[.,]\d{1,2})?)(?:\s*reais)?\b/i
  );
  if (matchValorExp) {
    const parsed = parseValorMonetarioToken(matchValorExp[1], true);
    if (parsed !== null) {
      valor = parsed;
      trabalho = trabalho.replace(matchValorExp[0], ' ');
    }
  } else {
    const matchValorFim = trabalho.match(
      /(?:^|\s)(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d{3,5}(?:[.,]\d{1,2})?)(?:\s*reais)?\s*$/i
    );
    if (matchValorFim) {
      const parsed = parseValorMonetarioToken(matchValorFim[1], true);
      if (parsed !== null) {
        valor = parsed;
        trabalho = trabalho.slice(0, matchValorFim.index ?? trabalho.length).trim();
      }
    }
  }

  // 6. Remove gatilho inicial de venda atacado
  trabalho = trabalho
    .replace(
      /^(?:registrar?\s+|fazer?\s+|lan[cç]ar?\s+)?(?:uma\s+)?(?:venda\s+(?:de\s+|no\s+|do\s+)?atacado|vendido\s+(?:no\s+|em\s+)?atacado|vendi\s+(?:no\s+|em\s+)?atacado|atacado)\b[\s,:=-]*/i,
      ''
    )
    .replace(/\s+/g, ' ')
    .trim();

  const regexInicioAparelho =
    /\b(?:iphone|ipad|galaxy|samsung|xiaomi|redmi|poco|motorola|moto|realme|(?:1[1-7]|xr|xs)\s*(?:pro\s*max|promax|pro|plus|mini))\b/i;

  let trechoCliente = '';
  let trechoAparelho = '';

  const matchAparelho = trabalho.match(regexInicioAparelho);
  if (matchAparelho && matchAparelho.index !== undefined) {
    const idx = matchAparelho.index;
    if (idx > 0) {
      trechoCliente = trabalho.slice(0, idx).trim();
      trechoAparelho = trabalho.slice(idx).trim();
    } else {
      const matchClienteFinal = trabalho.match(
        /\b(?:para|pro|pra|cliente|comprador|lojista)\s*[:=-]?\s*([A-Za-zÀ-ÖØ-öø-ÿ0-9.'&-]+(?:\s+[A-Za-zÀ-ÖØ-öø-ÿ0-9.'&-]+){0,4})\s*$/i
      );
      if (matchClienteFinal && matchClienteFinal.index !== undefined) {
        trechoCliente = matchClienteFinal[1].trim();
        trechoAparelho = trabalho.slice(0, matchClienteFinal.index).trim();
      }
    }
  } else if (imei) {
    // Caso só tenha informado cliente + IMEI ("venda atacado para GM imei 7896")
    trechoCliente = trabalho;
  }

  const vendaAtacado = finalizarVendaAtacado(trechoCliente, valor, formaPagamento);
  if (!vendaAtacado) return null;

  const cor = trechoAparelho ? extrairCorDeTexto(trechoAparelho) || null : null;
  const modeloLimpo = trechoAparelho ? limparNomeModelo(trechoAparelho) || null : null;

  if (!imei && !modeloLimpo) return null;

  return {
    vendaAtacado,
    fotoVirtual: {
      imei,
      modelo: modeloLimpo,
      capacidade,
      cor,
      bateria,
      timestamp: Date.now(),
    },
  };
}

/**
 * Verifica rapidamente no Supabase se há foto recente (últimos minutos) ou em
 * processamento OCR neste chat para aceitar o envio do nome do comprador abaixo da foto.
 */
export async function temFotoRecenteOuProcessando(
  supabase: SupabaseClient,
  remoteJid: string,
  authorPhone?: string | null,
  maxMinutos: number = 5
): Promise<boolean> {
  if (!remoteJid || typeof (supabase as any).from !== 'function') return false;

  const chaves = Array.from(
    new Set(
      [
        `foto_processando:${remoteJid}`,
        ...(authorPhone ? [`foto_recente:${remoteJid}:${authorPhone}`] : []),
        `foto_recente:${remoteJid}:ultima`,
      ].filter(Boolean)
    )
  );

  try {
    const { data: registros } = await supabase
      .from('whatsapp_acoes_pendentes')
      .select('chave, criado_em')
      .in('chave', chaves)
      .eq('tipo', 'faltando_dados')
      .order('criado_em', { ascending: false })
      .limit(5);

    if (!Array.isArray(registros) || registros.length === 0) return false;

    const agora = Date.now();
    const maxMs = maxMinutos * 60 * 1000;

    return registros.some((r: any) => {
      const criado = r?.criado_em ? new Date(r.criado_em).getTime() : 0;
      if (!criado) return false;
      if (String(r.chave || '').startsWith('foto_processando:')) {
        return agora - criado < 25_000;
      }
      return agora - criado <= maxMs;
    });
  } catch (err) {
    console.warn('[Notinha Automática] Erro ao verificar foto recente/processando:', err);
    return false;
  }
}

export interface AvaliacaoEstoqueAtacado {
  todosConfirmadosNoEstoque: boolean;
  itens: Array<{
    foto: FotoRecenteCache;
    modeloLimpo: string;
    imeiValido: string | null;
    cruzamento: ResultadoCruzamentoEstoque;
  }>;
}

/**
 * Avalia se todas as fotos de uma venda de atacado casam de forma inequívoca com aparelhos
 * disponíveis no estoque antes de registrar a venda automaticamente (Opção A).
 */
export function avaliarEstoqueVendaAtacadoComFoto(
  fotos: FotoRecenteCache[],
  estoque: AparelhoEstoqueConsulta[]
): AvaliacaoEstoqueAtacado {
  const aparelhoIdsUsados = new Set<string>();
  const itens = (fotos || []).map((foto) => {
    const imeiDigits = digitos(foto.imei);
    const imeiValido =
      (imeiDigits.length >= 4 && imeiDigits.length <= 6) || (imeiDigits.length >= 14 && imeiDigits.length <= 16)
        ? imeiDigits
        : null;
    const modeloLimpo = limparNomeModelo(foto.modelo || '') || String(foto.modelo || '').trim();
    const estoqueDisponivel = estoque.filter(
      (e) => !e.id || !aparelhoIdsUsados.has(e.id) || (imeiValido && digitos(e.imei) === imeiValido)
    );

    const cruzamento = cruzarAparelhoComEstoque(estoqueDisponivel, {
      modelo: modeloLimpo,
      capacidade: foto.capacidade,
      cor: foto.cor,
      imei: imeiValido,
      bateria: foto.bateria,
    });

    if (cruzamento.status === 'confirmado' && cruzamento.aparelhoEncontrado?.id) {
      aparelhoIdsUsados.add(cruzamento.aparelhoEncontrado.id);
    }

    return { foto, modeloLimpo, imeiValido, cruzamento };
  });

  const todosConfirmadosNoEstoque =
    itens.length > 0 &&
    itens.every((it) => it.cruzamento.status === 'confirmado' && Boolean(it.cruzamento.aparelhoEncontrado?.id));

  return { todosConfirmadosNoEstoque, itens };
}

/**
 * Registra uma venda de atacado a partir de foto(s) com IMEI + nome do comprador abaixo
 * (com valor = 0 quando não informado) usando `registrarVendaAtomica`.
 */
export async function emitirVendaAtacadoComFoto(params: {
  supabase: SupabaseClient;
  lojaId: string;
  vendaAtacado: VendaAtacadoDetectada;
  fotos: FotoRecenteCache[];
  estoque: AparelhoEstoqueConsulta[];
  usuarioNome?: string;
}): Promise<{
  sucesso: boolean;
  mensagem: string;
  vendaId?: string;
  vendaUuid?: string;
  custoTotal?: number;
  jaEstavaEmSaida?: boolean;
}> {
  const { supabase, lojaId, vendaAtacado, fotos, estoque, usuarioNome = 'Bot WhatsApp' } = params;

  if (!fotos || fotos.length === 0) {
    return {
      sucesso: false,
      mensagem: '⚠️ Nenhuma foto com IMEI encontrada para registrar a venda de atacado.',
    };
  }

  try {
    const lojaIdCandidata =
      (lojaId && lojaId !== 'loja-master' ? lojaId : null) ||
      'e2858e7b-3046-4211-ac06-3ad45e3ea6af';

    let lojaIdFinal = lojaIdCandidata;
    if (!lojaId || lojaId === 'loja-master') {
      try {
        const { data: lLucas } = await supabase
          .from('lojas')
          .select('id')
          .ilike('nome', '%lucas%')
          .limit(1)
          .maybeSingle();
        if (lLucas?.id) lojaIdFinal = lLucas.id;
      } catch {
        // usa fallback padrão
      }
    }

    const agora = new Date().toISOString();
    const temValoresIndividuais =
      Array.isArray(vendaAtacado.valoresIndividuais) &&
      vendaAtacado.valoresIndividuais.length > 0;
    const valoresIndividuais = vendaAtacado.valoresIndividuais || [];
    const valorTotalNum = temValoresIndividuais
      ? Number(
          fotos
            .reduce((acc, _, idx) => acc + Number(valoresIndividuais[idx] || 0), 0)
            .toFixed(2)
        )
      : Number(vendaAtacado.valor || 0);
    const valorUnitPadrao =
      fotos.length > 0 && valorTotalNum > 0
        ? Number((valorTotalNum / fotos.length).toFixed(2))
        : 0;

    const aparelhoIdsUsados = new Set<string>();
    const aparelhoIds: string[] = [];
    const permitirForaDoEstoque: string[] = [];
    const camposAparelho: Record<string, { cliente: string }> = {};
    const statusPorItem: string[] = [];
    let jaEstavaEmSaida = false;
    let custoTotal = 0;

    const itensVendaPayload = fotos.map((foto, idx) => {
      const imeiDigitsFoto = digitos(foto.imei);
      const imeiFotoValido =
        (imeiDigitsFoto.length >= 4 && imeiDigitsFoto.length <= 6) ||
        (imeiDigitsFoto.length >= 14 && imeiDigitsFoto.length <= 16)
          ? imeiDigitsFoto
          : null;
      const modeloFotoLimpo = limparNomeModelo(foto.modelo || '') || foto.modelo;

      const estoqueDisponivel = estoque.filter(
        (e) => !e.id || !aparelhoIdsUsados.has(e.id) || (imeiFotoValido && digitos(e.imei) === imeiFotoValido)
      );

      const cruzamento = cruzarAparelhoComEstoque(estoqueDisponivel, {
        modelo: modeloFotoLimpo,
        capacidade: foto.capacidade,
        cor: foto.cor,
        imei: imeiFotoValido,
        bateria: foto.bateria,
      });

      const apEnc =
        cruzamento.aparelhoEncontrado ||
        (cruzamento.status === 'ambiguo' ? cruzamento.candidatos?.[0] : undefined);
      if (apEnc?.id) {
        aparelhoIdsUsados.add(apEnc.id);
        aparelhoIds.push(apEnc.id);
        camposAparelho[apEnc.id] = { cliente: vendaAtacado.clienteNome };
        if (!estaNoEstoque(apEnc as any)) {
          permitirForaDoEstoque.push(apEnc.id);
          jaEstavaEmSaida = true;
          statusPorItem.push(cruzamento.mensagem);
        } else {
          statusPorItem.push('Baixado do estoque ✅');
        }
      } else {
        statusPorItem.push(cruzamento.mensagem);
      }

      const modeloFinal = limparNomeModelo(apEnc?.modelo || modeloFotoLimpo || '') || 'Smartphone';
      const capFinal = apEnc?.capacidade || foto.capacidade || undefined;
      const corBruta = apEnc?.cor || foto.cor || undefined;
      const corFinal = corBruta ? extrairCorDeTexto(corBruta) || corBruta : undefined;
      const imeiFinal =
        imeiFotoValido && imeiFotoValido.length >= 14
          ? imeiFotoValido
          : apEnc?.imei || imeiFotoValido || '';
      const custoItem = Number(apEnc?.custo || 0);
      custoTotal += custoItem;

      const valItem = temValoresIndividuais
        ? Number(valoresIndividuais[idx] || 0)
        : valorTotalNum <= 0
          ? 0
          : idx === fotos.length - 1
            ? Number((valorTotalNum - valorUnitPadrao * (fotos.length - 1)).toFixed(2))
            : valorUnitPadrao;

      const descItem = [modeloFinal, capFinal, corFinal].filter(Boolean).join(' ').trim();

      return {
        id: `${Date.now()}-${idx}`,
        aparelhoId: apEnc?.id || undefined,
        descricao: descItem,
        quantidade: 1,
        valorInterno: custoItem,
        valorExibir: valItem,
        desconto: 0,
        tipoDesconto: 'R$',
        total: valItem,
        observacao: imeiFinal ? `IMEI: ${imeiFinal} | Atacado WhatsApp` : 'Atacado WhatsApp',
        imei: imeiFinal,
      };
    });

    const metodo = vendaAtacado.formaPagamento || 'pix';
    const isFiado = metodo === 'fiado';
    const lucro = valorTotalNum > 0 ? Number((valorTotalNum - custoTotal).toFixed(2)) : 0;
    const percentualLucro =
      valorTotalNum > 0 && custoTotal > 0 ? Number(((lucro / custoTotal) * 100).toFixed(2)) : 0;

    const resumoModelos = itensVendaPayload.map((it) => it.descricao).join(' + ');
    const vendedorLimpo = sanitizarVendedorPublico(usuarioNome) || 'Atendimento';
    const registroVenda = {
      loja_id: lojaIdFinal,
      clienteNome: vendaAtacado.clienteNome,
      valor: valorTotalNum,
      custo: custoTotal,
      lucro,
      percentualLucro,
      metodo,
      status: isFiado || valorTotalNum <= 0 ? 'pendente' : 'pago',
      valorPago: isFiado ? 0 : valorTotalNum,
      saldoDevedor: isFiado ? valorTotalNum : 0,
      tipoEntrega: 'Atacado',
      vendedor: vendedorLimpo,
      dataPagamento: agora,
      descricao: `Venda ATACADO WhatsApp - ${resumoModelos} para ${vendaAtacado.clienteNome}`,
      itens: itensVendaPayload,
      ativo: true,
      taxa_cartao: 0,
    };

    const uniqueIds = Array.from(new Set(aparelhoIds));
    const uniquePermitidos = Array.from(new Set(permitirForaDoEstoque));

    const resultado = await registrarVendaAtomica(supabase, {
      venda: registroVenda,
      aparelhoIds: uniqueIds,
      permitirForaDoEstoque: uniquePermitidos,
      camposAparelho: Object.keys(camposAparelho).length > 0 ? camposAparelho : undefined,
      origem: 'atacado',
      usuarioNome: vendedorLimpo,
      observacao: `Venda atacado via foto WhatsApp para ${vendaAtacado.clienteNome}`,
    });

    const vendaUuid = resultado.venda?.id ? String(resultado.venda.id) : '';
    const vendaCodigo = vendaUuid ? vendaUuid.slice(0, 8).toUpperCase() : 'OK';
    const valorFmt = valorTotalNum.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    const linhasItens = itensVendaPayload
      .map((it, idx) => {
        const imeiTag = it.imei ? ` (IMEI: ${it.imei})` : '';
        const valorItemTag =
          temValoresIndividuais && it.total > 0
            ? ` [R$ ${Number(it.total).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}]`
            : '';
        return `${itensVendaPayload.length > 1 ? `   ${idx + 1}. ` : '📱 *Aparelho:* '}${it.descricao}${imeiTag}${valorItemTag} — ${statusPorItem[idx]}`;
      })
      .join('\n');

    const msgSucesso =
      `📦 *VENDA ATACADO REGISTRADA!* (#${vendaCodigo})\n` +
      `👤 *Cliente:* ${vendaAtacado.clienteNome}\n` +
      `${linhasItens}\n` +
      `💰 *Valor:* R$ ${valorFmt}${valorTotalNum === 0 ? ' _(não informado — responda com o valor se quiser atualizar)_' : ''}`;

    return {
      sucesso: true,
      mensagem: sanitizarTextoWhatsApp(msgSucesso),
      vendaId: vendaCodigo,
      vendaUuid,
      custoTotal,
      jaEstavaEmSaida,
    };
  } catch (err: any) {
    console.error('❌ Falha ao registrar venda atacado por foto:', err);
    const msgErro = err instanceof ErroVenda ? err.message : err?.message || 'Erro ao registrar venda atacado.';
    return {
      sucesso: false,
      mensagem: `⚠️ *Falha ao registrar venda atacado:*\n${msgErro}`,
    };
  }
}

const REGEX_APARELHO_REACAO =
  /\b(?:iphone|ipad|macbook|apple\s*watch|galaxy|samsung|xiaomi|redmi|poco|motorola|moto|realme)\b|\b(?:1[1-7]|xr|xs|se|16e)\s*(?:pro\s*max|promax|pro|plus|mini)\b/i;

const STOPWORDS_NOME_PESSOA_REACAO = new Set([
  ...STOPWORDS_ATACADO_NOME,
  'upgrade', 'troca', 'tradein', 'seminovo', 'lacrado', 'novo', 'usado',
  'garantia', 'bateria', 'bat', 'preto', 'preta', 'branco', 'branca',
  'azul', 'roxo', 'dourado', 'verde', 'rosa', 'vermelho', 'laranja',
  'desert', 'natural', 'titanio', 'titânio', 'grafite', 'prata', 'cinza',
  'estelar', 'iphone', 'ipad', 'macbook', 'samsung', 'galaxy', 'xiaomi',
  'redmi', 'poco', 'motorola', 'moto', 'realme', 'gb', 'tb', 'sem', 'com',
  'para', 'pro', 'pra', 'entrega', 'retirada', 'rua', 'av', 'avenida',
  'bairro', 'cidade', 'cep', 'cpf', 'nome', 'telefone', 'email', 'obs',
]);

function limparNomeCandidatoReacao(bruto: string): string | null {
  let s = String(bruto || '')
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, ' ')
    .replace(
      /^(?:cliente|comprador|lojista|nome(?:\s+completo)?|para|pro|pra)\s*[:=-]?\s*/i,
      ''
    )
    .replace(
      /(?:^|\s)(?:(?:no|via|em|por)\s+)?(?:pix|dinheiro|fiado|a\s+prazo|cart[aã]o(?:\s+de\s+(?:cr[eé]dito|d[eé]bito))?)\b/gi,
      ' '
    )
    .replace(/^[-–—:.,/*_\s]+|[-–—:.,/*_\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!s || s.length < 2 || s.length > 60) return null;
  if (/https?:\/\/|@/i.test(s)) return null;
  if (/\d/.test(s)) return null;
  if (REGEX_APARELHO_REACAO.test(s)) return null;
  if (/\b(?:imei|serial|bateria|bat|garantia|lacrado|seminovo|upgrade|troca|cep|rua|avenida|bairro|cidade)\b/i.test(s)) {
    return null;
  }

  const palavras = s.split(/\s+/);
  if (palavras.length > 5) return null;
  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ\s.'&-]*$/.test(s)) return null;
  if (STOPWORDS_NOME_PESSOA_REACAO.has(s.toLowerCase())) return null;
  if (palavras.every((p) => STOPWORDS_NOME_PESSOA_REACAO.has(p.toLowerCase()))) return null;

  return s;
}

/**
 * Extrai os dados de venda a partir de uma mensagem antiga/crua ou foto com legenda
 * marcada com reação de recibo (`🧾`), sem exigir gatilhos formais de formulário.
 */
export function extrairVendaDeMensagemReagidaComRecibo(
  texto: string,
  fotos?: FotoRecenteCache[],
  pushNameRemetente?: string
): ParsedVenda | null {
  const textoLimpo = limparMencoesBot(texto || '').trim();
  const temFoto = Boolean(fotos && fotos.length > 0);
  if (!textoLimpo && !temFoto) return null;

  const formal = textoLimpo ? detectarFormularioOuPedidoVenda(textoLimpo) : null;
  const parsed: ParsedVenda = formal
    ? {
        ...formal,
        cliente: { ...(formal.cliente || {}) },
        aparelho: { ...(formal.aparelho || {}) },
        aparelhos: Array.isArray(formal.aparelhos) ? formal.aparelhos.map((a) => ({ ...a })) : undefined,
      }
    : sanitizarECompletarVendaParsed(null, textoLimpo);

  // 1. Extrai CPF sem rótulo explícito (11 dígitos com pontuação ou isolado, sem confundir com IMEI ou celular)
  if (!parsed.cliente.cpf && textoLimpo) {
    const matchesCpf = Array.from(textoLimpo.matchAll(/(?<!\d)(\d{3}\.?\d{3}\.?\d{3}-?\d{2})(?!\d)/g));
    for (const m of matchesCpf) {
      const bruto = m[1];
      const digits = digitos(bruto);
      const teveSeparador = /[.-]/.test(bruto);
      if (digits.length === 11 && (teveSeparador || !/^[1-9]\d9\d{8}$/.test(digits))) {
        parsed.cliente.cpf = bruto;
        break;
      }
    }
  }

  // 2. Extrai telefone brasileiro sem rótulo (ex: "31 99909-6222", "(31) 999096222", "+55 31 99909-6222")
  if (!parsed.cliente.telefone && textoLimpo) {
    let textoParaTel = textoLimpo;
    if (parsed.cliente.cpf) {
      textoParaTel = textoParaTel.replace(parsed.cliente.cpf, ' ');
    }
    textoParaTel = textoParaTel.replace(/\b\d{14,18}\b/g, ' ');
    const matchesTel = Array.from(
      textoParaTel.matchAll(/(?<!\d)(?:\+?55\s*)?\(?\d{2}\)?[\s.-]*9?\d{4}[-\s.]?\d{4}(?!\d)/g)
    );
    for (const m of matchesTel) {
      const bruto = m[0].trim();
      if (/^\d{5}-\d{3}$/.test(bruto)) continue; // CEP
      const d = digitos(bruto);
      if (d.length >= 10 && d.length <= 13) {
        parsed.cliente.telefone = bruto;
        break;
      }
    }
  }

  const atacadoTexto = textoLimpo ? detectarVendaAtacadoPorTextoOuAudio(textoLimpo) : null;
  const atacadoFotoTexto = textoLimpo ? detectarVendaAtacadoComFoto(textoLimpo) : null;

  // 3. Extrai modelo/aparelho de texto cru quando não veio na seção formal "Modelo:"
  if (!parsed.aparelho.modelo && textoLimpo) {
    if (atacadoTexto?.fotoVirtual.modelo) {
      parsed.aparelho.modelo = limparNomeModelo(atacadoTexto.fotoVirtual.modelo) || atacadoTexto.fotoVirtual.modelo;
      if (!parsed.aparelho.capacidade && atacadoTexto.fotoVirtual.capacidade) {
        parsed.aparelho.capacidade = atacadoTexto.fotoVirtual.capacidade;
      }
      if (!parsed.aparelho.cor && atacadoTexto.fotoVirtual.cor) {
        parsed.aparelho.cor = atacadoTexto.fotoVirtual.cor;
      }
      if (!parsed.aparelho.imei && atacadoTexto.fotoVirtual.imei) {
        parsed.aparelho.imei = atacadoTexto.fotoVirtual.imei;
      }
      if (!parsed.aparelho.bateria && atacadoTexto.fotoVirtual.bateria) {
        const batNum = parseInt(String(atacadoTexto.fotoVirtual.bateria).replace(/\D/g, ''), 10);
        if (!Number.isNaN(batNum) && batNum > 0 && batNum <= 100) {
          parsed.aparelho.bateria = batNum;
        }
      }
    } else {
      const segmentos = textoLimpo
        .split(/\r?\n|\s+[-–—|]+\s+/)
        .map((seg) => seg.trim())
        .filter(Boolean);

      for (const seg of segmentos) {
        if (/(?:upgrade|trade[- ]?in|troca)\b/i.test(seg)) continue;
        const matchMod = seg.match(REGEX_APARELHO_REACAO);
        if (!matchMod) continue;

        const trecho = seg.slice(matchMod.index ?? 0).trim();
        if (!parsed.aparelho.capacidade) {
          const capM = trecho.match(/\b(32|64|128|256|512)\s*(?:gb|g|gigas?)\b|\b(1|2)\s*(?:tb|t|teras?)\b/i);
          if (capM) {
            parsed.aparelho.capacidade = capM[1] ? `${capM[1]}GB` : `${capM[2]}TB`;
          }
        }
        if (!parsed.aparelho.cor) {
          const corM = extrairCorDeTexto(trecho);
          if (corM) parsed.aparelho.cor = corM;
        }
        if (!parsed.aparelho.imei) {
          const imeiM =
            trecho.match(/(?:imei|final|serial)\s*[:=-]?\s*#?(\d{4,16})\b/i) ||
            trecho.match(/\b(\d{14,16})\b/);
          if (imeiM) parsed.aparelho.imei = imeiM[1];
        }
        if (!parsed.aparelho.bateria) {
          const batM = trecho.match(/\b(\d{2,3})\s*%/);
          if (batM) {
            const b = parseInt(batM[1], 10);
            if (b >= 50 && b <= 100) parsed.aparelho.bateria = b;
          }
        }

        const semValorEPgto = trecho
          .replace(/(?:\b(?:por|valor|pre[cç]o)\s*[:=-]?\s*)?(?:R\$\s*)?\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?/gi, ' ')
          .replace(/\b(?:por\s+)?(?:R\$\s*)?\d{3,5}(?:[.,]\d{1,2})?(?:\s*reais)?\b/gi, ' ')
          .replace(/\b(?:no|via|em)?\s*(?:pix|dinheiro|fiado|a\s+prazo|cart[aã]o(?:\s+de\s+(?:cr[eé]dito|d[eé]bito))?)\b/gi, ' ')
          .replace(/\b(?:para|pro|pra)\s+[A-Za-zÀ-ÖØ-öø-ÿ\s]+$/i, '')
          .trim();

        const modeloLimpo = limparNomeModelo(semValorEPgto);
        if (modeloLimpo && modeloLimpo.length >= 2) {
          parsed.aparelho.modelo = modeloLimpo;
          break;
        }
      }
    }
  }

  // 4. Se não veio modelo no texto (ou texto é só nome/valor/vazio), aproveita dados da foto OCR
  if (fotos && fotos.length > 0) {
    const f0 = fotos[0];
    if (!parsed.aparelho.modelo && f0.modelo) {
      parsed.aparelho.modelo = limparNomeModelo(f0.modelo) || f0.modelo;
    }
    if (!parsed.aparelho.capacidade && f0.capacidade) parsed.aparelho.capacidade = f0.capacidade;
    if (!parsed.aparelho.cor && f0.cor) parsed.aparelho.cor = extrairCorDeTexto(f0.cor) || f0.cor;
    if (!parsed.aparelho.imei && f0.imei) parsed.aparelho.imei = f0.imei;
    if (!parsed.aparelho.bateria && f0.bateria) {
      const batFoto = parseInt(String(f0.bateria).replace(/\D/g, ''), 10);
      if (!Number.isNaN(batFoto) && batFoto > 0 && batFoto <= 100) {
        parsed.aparelho.bateria = batFoto;
      }
    }
  }

  // 5. Extrai valor total sem rótulo (ex: "5200 pix", "por 3800", "4.800,00")
  if ((!parsed.valorTotal || parsed.valorTotal <= 0) && textoLimpo) {
    const valExplicito = textoLimpo.match(
      /(?:\b(?:por|valor|pre[cç]o|total)\s*[:=-]?\s*(?:R\$\s*)?|R\$\s*)(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d{3,5}(?:[.,]\d{1,2})?)(?:\s*reais)?\b/i
    );
    if (valExplicito) {
      const v = parseValorMonetarioToken(valExplicito[1], true);
      if (v !== null && v > 0) parsed.valorTotal = v;
    }

    if ((!parsed.valorTotal || parsed.valorTotal <= 0) && atacadoFotoTexto?.valor) {
      parsed.valorTotal = atacadoFotoTexto.valor;
    }
    if ((!parsed.valorTotal || parsed.valorTotal <= 0) && atacadoTexto?.vendaAtacado.valor) {
      parsed.valorTotal = atacadoTexto.vendaAtacado.valor;
    }

    if (!parsed.valorTotal || parsed.valorTotal <= 0) {
      let textoMascara = textoLimpo;
      if (parsed.cliente.cpf) textoMascara = textoMascara.replace(parsed.cliente.cpf, ' ');
      if (parsed.cliente.telefone) textoMascara = textoMascara.replace(parsed.cliente.telefone, ' ');
      textoMascara = textoMascara
        .replace(/\b\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?\b/g, ' ')
        .replace(/\b\d{5}-\d{3}\b/g, ' ')
        .replace(/\b\d{7,}\b/g, ' ')
        .replace(/\b(?:32|64|128|256|512|1024)\s*(?:gb|g|gigas?)\b/gi, ' ')
        .replace(/\b(?:1|2)\s*(?:tb|t|teras?)\b/gi, ' ')
        .replace(/\b\d{1,3}\s*%/g, ' ');

      const tokensValor = Array.from(
        textoMascara.matchAll(/(?<![\d\/-])(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d{3,5}(?:[.,]\d{1,2})?)(?![\d\/-])/g)
      );
      for (const tv of tokensValor) {
        const rawTok = tv[1];
        if (/^(?:64|128|256|512)$/.test(rawTok)) continue;
        if (/^20[2-3]\d$/.test(rawTok)) {
          // Só aceita 2020..2039 se vier fora de contexto de data/ano; evita ano solto exceto valores >= 100 em contexto de preço
          if (/\b(?:ano|data|de)\s*$/i.test(textoMascara.slice(Math.max(0, (tv.index || 0) - 10), tv.index || 0))) {
            continue;
          }
        }
        const v = parseValorMonetarioToken(rawTok, true);
        if (v !== null && v >= 100 && v < 100000) {
          parsed.valorTotal = v;
          break;
        }
      }
    }
  }

  if (parsed.valorTotal && (!parsed.valorVolta || parsed.valorVolta <= 0)) {
    parsed.valorVolta = parsed.valorTotal;
  }

  // 6. Extrai nome do cliente em texto cru (ex: primeira linha "João Silva", "Carlos Eduardo - ...", ou "João 4500")
  if (!parsed.cliente.nome) {
    let nomeResolvido: string | null =
      atacadoFotoTexto?.clienteNome || atacadoTexto?.vendaAtacado.clienteNome || null;

    if (!nomeResolvido && textoLimpo) {
      let textoLimpoParaNome = textoLimpo;
      if (parsed.cliente.cpf) textoLimpoParaNome = textoLimpoParaNome.replace(parsed.cliente.cpf, '\n');
      if (parsed.cliente.telefone) textoLimpoParaNome = textoLimpoParaNome.replace(parsed.cliente.telefone, '\n');
      if (parsed.cliente.email) textoLimpoParaNome = textoLimpoParaNome.replace(parsed.cliente.email, '\n');

      const segmentosNome = textoLimpoParaNome
        .split(/\r?\n|\s+[-–—|]+\s+|\s*,\s*/)
        .map((s) => s.trim())
        .filter(Boolean);

      for (const seg of segmentosNome) {
        const cand = limparNomeCandidatoReacao(seg);
        if (cand) {
          nomeResolvido = cand;
          break;
        }
      }
    }

    parsed.cliente.nome = nomeResolvido || (pushNameRemetente && pushNameRemetente.trim()) || 'Cliente';
  }

  if (!parsed.formaPagamento) {
    parsed.formaPagamento = atacadoFotoTexto?.formaPagamento || atacadoTexto?.vendaAtacado.formaPagamento || 'pix';
  }

  if (parsed.aparelho.modelo && (!parsed.aparelhos || parsed.aparelhos.length === 0)) {
    parsed.aparelhos = [{ ...parsed.aparelho }];
  } else if (!parsed.aparelho.modelo && (!parsed.aparelhos || parsed.aparelhos.length === 0)) {
    parsed.aparelho.modelo = 'Smartphone';
    parsed.aparelhos = [{ ...parsed.aparelho }];
  }

  return parsed;
}

export interface SnapshotMensagemWebhook {
  texto: string;
  hasImage: boolean;
  foto?: FotoRecenteCache;
  pushName?: string;
  authorPhone?: string;
  participant?: string;
  fromMe?: boolean;
  timestamp: number;
}

/**
 * Salva um snapshot leve de cada mensagem recebida no Supabase para permitir
 * reconstruir o contexto mesmo quando o usuário reage horas/dias depois com `🧾`.
 */
export async function salvarSnapshotMensagemWebhook(
  supabase: SupabaseClient,
  remoteJid: string,
  messageId: string,
  dados: SnapshotMensagemWebhook,
  lojaId?: string | null
): Promise<void> {
  if (!remoteJid || !messageId || typeof (supabase as any)?.from !== 'function') return;
  const agora = dados.timestamp || Date.now();
  const chave = `msg_hist:${remoteJid}:${messageId}`;

  try {
    await supabase.from('whatsapp_acoes_pendentes').upsert(
      {
        chave,
        loja_id: lojaId || null,
        tipo: 'faltando_dados',
        action: 'snapshot_mensagem',
        params: {
          ...dados,
          timestamp: agora,
        } as any,
        resumo: (dados.texto || (dados.hasImage ? '[Foto de aparelho/etiqueta]' : 'Mensagem')).slice(0, 120),
        criado_em: new Date(agora).toISOString(),
      },
      { onConflict: 'chave' }
    );
  } catch (err) {
    console.warn('[Snapshot Webhook] Erro ao salvar snapshot de mensagem:', err);
  }
}

/**
 * Recupera o snapshot salvo para uma mensagem específica (`msg_hist:${remoteJid}:${messageId}`).
 */
export async function buscarSnapshotMensagemWebhook(
  supabase: SupabaseClient,
  remoteJid: string,
  messageId: string,
  maxDias: number = 7
): Promise<SnapshotMensagemWebhook | null> {
  if (!remoteJid || !messageId || typeof (supabase as any)?.from !== 'function') return null;

  try {
    const { data } = await supabase
      .from('whatsapp_acoes_pendentes')
      .select('params, criado_em')
      .eq('chave', `msg_hist:${remoteJid}:${messageId}`)
      .eq('tipo', 'faltando_dados')
      .maybeSingle();

    if (!data?.params) return null;

    if (data.criado_em) {
      const idadeMs = Date.now() - new Date(data.criado_em).getTime();
      if (idadeMs > maxDias * 24 * 60 * 60 * 1000) {
        return null;
      }
    }

    return data.params as SnapshotMensagemWebhook;
  } catch (err) {
    console.warn('[Snapshot Webhook] Erro ao buscar snapshot de mensagem:', err);
    return null;
  }
}

