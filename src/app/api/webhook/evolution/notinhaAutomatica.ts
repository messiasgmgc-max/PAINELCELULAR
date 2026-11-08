import { gerarReciboPdfBuffer } from '@/lib/recibo/gerarReciboPdf';
import { SupabaseClient } from '@supabase/supabase-js';
import { sanitizarECompletarVendaParsed, normalizarNomeModelo, ParsedVenda, extrairCorDeTexto } from '@/lib/vendas/parseVendaTexto';
import { estaNoEstoque } from '@/lib/estoque/ciclo';
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
  valorTotal: number;
  custo?: number;
  formaPagamento: string;
  isUpgrade: boolean;
  modeloTroca?: string;
  imeiTroca?: string;
  valorTroca?: number;
  vendedor?: string;
  observacoes?: string;
  criadoEm?: number;
}

const digitos = (val: unknown) => String(val ?? '').replace(/\D/g, '');

/**
 * Limpa palavras parasitas do nome do modelo (como "imei", "lacrado", capacidade, cor, menções a RAM e memória)
 */
export function limparNomeModelo(m: string): string {
  let limpo = (m || '').trim();

  // Separa número colado com pro/plus/max/mini (ex: "15pro" -> "15 Pro")
  limpo = limpo
    .replace(/\b(\d+)(pro\s*max|promax)\b/gi, '$1 Pro Max')
    .replace(/\b(\d+)(pro)\b/gi, '$1 Pro')
    .replace(/\b(\d+)(plus)\b/gi, '$1 Plus')
    .replace(/\b(\d+)(mini)\b/gi, '$1 Mini');

  // Remove menção a imei, serial, lacrado, seminovo, gb, cores comuns, fragmentos de RAM/memória e capacidades como "256g"
  limpo = limpo
    .replace(/\bimei\b.*$/i, '')
    .replace(/\b(?:lacrado|seminovo|novo|usado|caixa\s*fechada)\b/gi, '')
    .replace(/\b\d+\s*(?:gb|tb|g)\s*(?:de\s+)?(?:ram|mem[oó]ria|armazenamento|rom)\b/gi, '')
    .replace(/\b\d+\s*(?:gb|tb|g)\b/gi, '')
    .replace(/(?:,\s*)?(?:de\s+)?ram\s*(?:e\s*)?(?:de\s+)?(?:mem[oó]ria|armazenamento|rom)?\b/gi, '')
    .replace(/\b(?:de\s+)?(?:ram|mem[oó]ria|armazenamento|rom)\b/gi, '')
    .replace(/\b(?:preto|branco|azul|dourado|prata|verde|roxo|cinza|grafite|tit[aâ]nio|rose|amarelo|vermelho|natural|black|white|blue|gold|silver|green|purple|gray|graphite|titanium|desert|deserto)\b/gi, '')
    .replace(/[,\s]+e\s*$/i, '')
    .replace(/\s*,\s*e\s+/gi, ' ')
    .replace(/\s+e\s*$/i, '')
    .replace(/(?:,\s*de|\s+de)+$/gi, '')
    .replace(/^[,\s-]+|[,\s-]+$/g, '')
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

  // Se tem modelo, limpa e normaliza
  if (parsed.aparelho?.modelo) {
    parsed.aparelho.modelo = limparNomeModelo(parsed.aparelho.modelo);
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
  const candidatos = ativos.filter((a) => {
    const modItemNorm = normModeloComparacao(a.modelo);
    const capItemDig = digitos(a.capacidade);
    const bateModelo = Boolean(modeloAlvoNorm && modItemNorm && modeloAlvoNorm === modItemNorm);
    const bateCap = !capAlvoDig || (Boolean(capItemDig) && capAlvoDig === capItemDig);
    return bateModelo && bateCap;
  });

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
 * Formata a mensagem de prévia da notinha para envio no WhatsApp.
 */
export function formatarMensagemPreviaNotinha(proposta: PropostaNotinha): string {
  const valorFmt = Number(proposta.valorTotal || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const emojiCor = obterEmojiDaCor(proposta.cor);
  const corFmt = proposta.cor ? ` ${emojiCor} ${proposta.cor}` : '';

  const linhas: string[] = [
    '🧾 *PRÉVIA DA NOTINHA — LUCAS IMPORTS*',
    '──────────────────────────',
    `👤 *Cliente:* ${proposta.clienteNome || 'Cliente Não Informado'}${proposta.cpf ? ` (CPF: ${proposta.cpf})` : ''}`,
    `📱 *Aparelho:* ${proposta.modelo} ${proposta.capacidade || ''}${corFmt}`.replace(/\s+/g, ' ').trim(),
  ];

  if (proposta.imei) {
    linhas.push(`🔢 *IMEI:* ${proposta.imei} [${proposta.statusEstoque}]`);
  } else {
    linhas.push(`📦 *Estoque:* ${proposta.statusEstoque}`);
  }

  if (proposta.valorTotal && proposta.valorTotal > 0) {
    linhas.push(`💰 *Valor Total:* R$ ${valorFmt}`);
  } else {
    linhas.push('💰 *Valor Total:* ⚠️ *Não informado no formulário!*');
  }
  linhas.push(`💳 *Forma de Pagamento:* ${proposta.formaPagamento || 'Não informada'}`);

  if (proposta.isUpgrade && proposta.modeloTroca) {
    const valTrocaFmt = proposta.valorTroca
      ? ` (Avaliado em R$ ${Number(proposta.valorTroca).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`
      : '';
    linhas.push(`🔄 *Upgrade / Troca:* ${proposta.modeloTroca}${valTrocaFmt}`);
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
          // Se a proposta de notinha foi criada nos últimos 3 minutos no mesmo chat,
          // aceita vincular mesmo que o OCR da etiqueta tenha alucinado outra geração da mesma marca
          // (ex: etiqueta da Apple sem número explícito lida como "iPhone 14 Pro" ou "iPhone" para um pedido de "iPhone 15 Pro")
          if (idadeMs < 180_000) {
            if (marcasConflitantes(modeloDesejado, prop.modelo)) {
              continue;
            }
          } else if (!modelosSaoCompativeis(modeloDesejado, prop.modelo)) {
            continue;
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

    const registroVenda = {
      loja_id: lojaIdFinal,
      clienteId: clienteId || undefined,
      clienteNome: proposta.clienteNome,
      cpf: proposta.cpf || null,
      telefone: proposta.telefone || null,
      valor: proposta.valorTotal,
      custo: proposta.custo || 0,
      lucro: (proposta.valorTotal || 0) - (proposta.custo || 0),
      metodo: proposta.formaPagamento.toLowerCase().includes('cart') ? 'cartao_credito' : (proposta.formaPagamento.toLowerCase().includes('pix') ? 'pix' : 'dinheiro'),
      status: 'pago',
      valorPago: proposta.valorTotal,
      saldoDevedor: 0,
      tipoEntrega: 'Varejo',
      vendedor: usuarioNome,
      dataPagamento: agora,
      garantia: `${diasGarantiaLoja} dias`,
      descricao,
      itens: [
        {
          id: Date.now().toString(),
          aparelhoId: proposta.aparelhoId || undefined,
          descricao: `${proposta.modelo} ${proposta.capacidade || ''} ${proposta.cor || ''}`.trim(),
          quantidade: 1,
          valorInterno: proposta.custo || 0,
          valorExibir: proposta.valorTotal,
          desconto: 0,
          tipoDesconto: 'R$',
          total: proposta.valorTotal,
          observacao: proposta.imei ? `IMEI: ${proposta.imei}` : '',
          imei: proposta.imei || '',
        },
      ],
      ativo: true,
      taxa_cartao: 0,
    };

    const aparelhoIds = proposta.aparelhoId ? [proposta.aparelhoId] : [];
    const camposAparelho = proposta.aparelhoId
      ? { [proposta.aparelhoId]: { cliente: proposta.clienteNome } }
      : undefined;

    let tradeInPayload: Record<string, unknown> | null = null;
    if (proposta.isUpgrade && proposta.modeloTroca) {
      tradeInPayload = {
        loja_id: lojaIdFinal,
        modelo: proposta.modeloTroca,
        imei: proposta.imeiTroca || null,
        valor: proposta.valorTroca || 0,
        condicao: 'seminovo',
        ativo: true,
        status: 'disponivel',
        origem: 'upgrade_venda',
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

    const vendaUuid = resultado.venda?.id ? String(resultado.venda.id) : '';
    const vendaId = vendaUuid ? vendaUuid.slice(0, 8).toUpperCase() : 'OK';
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://painelcelular.com.br';
    const linkRecibo = vendaUuid ? `${baseUrl}/recibo/${vendaUuid}` : '';

    const msgSucesso = `✅ *NOTINHA EMITIDA COM SUCESSO!* 🧾\n` +
      `──────────────────────────\n` +
      `📄 *Venda:* #${vendaId}\n` +
      `👤 *Cliente:* ${proposta.clienteNome}\n` +
      `📱 *Aparelho:* ${proposta.modelo}\n` +
      `💰 *Valor:* R$ ${Number(proposta.valorTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n` +
      `📦 *Estoque:* Baixa realizada com sucesso no sistema!\n` +
      (proposta.isUpgrade && proposta.modeloTroca ? `🔄 *Troca recebida:* ${proposta.modeloTroca}\n` : '') +
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
          modelo: proposta.modelo,
          capacidade: proposta.capacidade || null,
          cor: proposta.cor || null,
          imei: proposta.imei || null,
          condicao: 'Seminovo',
          valor: Number(proposta.valorTotal || 0),
        },
        upgrade: {
          ativo: Boolean(proposta.isUpgrade),
          modelo: proposta.modeloTroca || null,
          imei: proposta.imeiTroca || null,
          valor: proposta.valorTroca || null,
        },
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
 * Salva os dados lidos da foto no Supabase e remove a flag foto_processando.
 */
export async function salvarFotoRecente(
  supabase: SupabaseClient,
  lojaId: string,
  remoteJid: string,
  authorPhone: string,
  dados: FotoRecenteCache
): Promise<void> {
  const agora = Date.now();
  dados.timestamp = agora;

  const chaves = [
    ...(authorPhone ? [`foto_recente:${remoteJid}:${authorPhone}`] : []),
    `foto_recente:${remoteJid}:ultima`,
  ];

  try {
    const payload = {
      tipo: 'faltando_dados' as const,
      action: 'vincular_foto',
      loja_id: lojaId,
      params: { ...dados, expiraEm: agora + 10 * 60 * 1000 } as any,
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
  const chaveProcessando = `foto_processando:${remoteJid}`;
  const chavesFoto = [
    ...(authorPhone ? [`foto_recente:${remoteJid}:${authorPhone}`] : []),
    `foto_recente:${remoteJid}:ultima`,
  ];

  const inicio = Date.now();
  const timeoutWaitMs = Math.max(9500, esperaNovaFotoMs + 6500); // Aguarda até 9.5s+ se houver foto sendo lida no OCR

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

      // 1. Verifica se a foto_recente já está pronta
      const itensFoto = (registros || []).filter((r) => r.chave.startsWith('foto_recente:'));
      for (const item of itensFoto) {
        const criado = item.criado_em ? new Date(item.criado_em).getTime() : 0;
        const idadeMs = agora - criado;
        if (idadeMs > maxMs) continue;

        const foto = item.params as FotoRecenteCache;
        if (!foto) continue;

        if (modeloDesejado && foto.modelo) {
          if (idadeMs < 180_000) {
            if (marcasConflitantes(foto.modelo, modeloDesejado)) continue;
          } else if (!modelosSaoCompativeis(foto.modelo, modeloDesejado)) {
            continue;
          }
        }

        // Consome a foto e avisa o webhook da imagem (via foto_consumida) que o formulário já unificou!
        await Promise.all([
          supabase.from('whatsapp_acoes_pendentes').delete().in('chave', [...chavesFoto, chaveProcessando]),
          supabase.from('whatsapp_acoes_pendentes').upsert(
            {
              chave: `foto_consumida:${remoteJid}`,
              loja_id: lojaId,
              tipo: 'faltando_dados',
              action: 'foto_consumida',
              params: { imei: foto.imei, timestamp: agora } as any,
              resumo: `Foto IMEI ${foto.imei || ''} consumida pelo formulário`,
              criado_em: new Date(agora).toISOString(),
            },
            { onConflict: 'chave' }
          ),
        ]);

        return foto;
      }

      // 2. Se ainda não há foto_recente, verifica se há uma foto_processando ativa (criada há menos de 25s)
      const proc = (registros || []).find((r) => r.chave === chaveProcessando);
      if (proc) {
        const criadoProc = proc.criado_em ? new Date(proc.criado_em).getTime() : 0;
        if (agora - criadoProc < 25_000) {
          await new Promise((r) => setTimeout(r, 600));
          continue;
        }
      }

      // 3. Janela de espera inicial (ex: usuário marcou o formulário e 2 segundos depois marca a foto)
      if (esperaNovaFotoMs > 0 && Date.now() - inicio < esperaNovaFotoMs) {
        await new Promise((r) => setTimeout(r, 600));
        continue;
      }

      break;
    } catch (err) {
      console.warn('[Notinha Automática] Erro em aguardarEBuscarFotoRecente:', err);
      break;
    }
  }

  return null;
}

/**
 * Usado pelo webhook da foto logo após terminar o OCR Vision:
 * Aguarda uma curta janela (ex: 2.4s) verificando se um formulário enviado junto consumiu a foto.
 */
export async function aguardarOuVerificarFotoConsumida(
  supabase: SupabaseClient,
  remoteJid: string,
  esperaMs: number = 2400
): Promise<boolean> {
  const chaveConsumida = `foto_consumida:${remoteJid}`;
  const inicio = Date.now();

  while (Date.now() - inicio <= esperaMs) {
    try {
      const { data: item } = await supabase
        .from('whatsapp_acoes_pendentes')
        .select('chave, criado_em')
        .eq('chave', chaveConsumida)
        .maybeSingle();

      if (item) {
        const criado = item.criado_em ? new Date(item.criado_em).getTime() : 0;
        if (Date.now() - criado < 60_000) {
          await supabase.from('whatsapp_acoes_pendentes').delete().eq('chave', chaveConsumida);
          return true;
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

