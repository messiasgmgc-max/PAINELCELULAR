import { inferirMarcaPorModelo } from '@/lib/marcaUtils';

export interface ParsedCliente {
  nome?: string | null;
  cpf?: string | null;
  dataNascimento?: string | null;
  telefone?: string | null;
  email?: string | null;
}

export interface ParsedAparelho {
  codigo?: string | null;
  marca?: string | null;
  modelo?: string | null;
  capacidade?: string | null;
  cor?: string | null;
  condicao?: 'novo' | 'seminovo' | string | null;
  imei?: string | null;
  preco?: number | null;
  custo?: number | null;
}

export interface ParsedTradeIn {
  marca?: string | null;
  modelo?: string | null;
  capacidade?: string | null;
  cor?: string | null;
  imei?: string | null;
  bateria?: number | null;
  valor?: number | null;
  condicao?: string | null;
  observacoes?: string | null;
}

export interface ParsedPagamentoItem {
  metodo: string;
  valor: number;
  parcelas?: number;
}

export interface ParsedVenda {
  cliente: ParsedCliente;
  aparelho: ParsedAparelho;
  isUpgrade: boolean;
  tradeIn: ParsedTradeIn | null;
  vendedor?: string | null;
  formaPagamento?: string | null;
  pagamentos?: ParsedPagamentoItem[] | null;
  valorTotal?: number | null;
  valorEntradaTroca?: number | null;
  valorVolta?: number | null;
  dataVenda?: string | null;
  observacoes?: string | null;
  camposFaltantes?: string[];
}

/**
 * Normaliza nomes de modelos Apple sem o prefixo "iPhone" (ex: "17 pro max" -> "iPhone 17 Pro Max")
 */
export function normalizarNomeModelo(modeloBruto: string): string {
  let m = (modeloBruto || '').trim();
  if (!m) return '';

  // Separa número colado com pro/plus/max/mini (ex: "15pro" -> "15 Pro")
  m = m
    .replace(/\b(\d+)(pro\s*max|promax)\b/gi, '$1 Pro Max')
    .replace(/\b(\d+)(pro)\b/gi, '$1 Pro')
    .replace(/\b(\d+)(plus)\b/gi, '$1 Plus')
    .replace(/\b(\d+)(mini)\b/gi, '$1 Mini');

  // Se já tem iPhone, Galaxy, Xiaomi, Poco, Redmi, etc., apenas ajusta espaços
  if (/^(?:iPhone|iPad|MacBook|Galaxy|Samsung|Xiaomi|Poco|Redmi|Motorola|Moto)/i.test(m)) {
    return m.replace(/^iphone\b/i, 'iPhone').replace(/\s+/g, ' ').trim();
  }

  // Se começa com número de iPhone (ex: 11, 12, 13, 14, 15, 16, 17, X, XR, XS)
  if (/^(?:1[1-9]|[4-9]|X|XR|XS)(?:\s*(?:pro\s*max|pro|plus|max|mini))?\b/i.test(m)) {
    return `iPhone ${m}`.replace(/\s+/g, ' ').trim();
  }

  return m;
}

/**
 * Extrai o nome padronizado da cor a partir de texto ou emoji.
 * Suporta emojis de coração, círculos, símbolos de fornecedor e termos populares (inclusive Desert e Titânio Natural).
 */
export function extrairCorDeTexto(texto?: string | null): string | undefined {
  if (!texto) return undefined;
  const t = String(texto);
  const lower = t.toLowerCase();

  // 1. Emojis de cor (com ou sem seletor de variação unicode)
  if (/🖤|⚫|⬛|◾|◼️|◼|♠️|🕶️/.test(t)) return 'Preto';
  if (/🤍|⚪|⬜|◽|◻️|◻|❄️|🕊️/.test(t)) return 'Branco';
  if (/🏜️|🏜|🐪|🐫|🤎|🟤|🟫/.test(t)) return 'Desert';
  if (/🔘|🩶|💿|🪙|🥈/.test(t)) return 'Titânio Natural';
  if (/💙|🔵|🟦|🔷|🔹|🌊/.test(t)) return 'Azul';
  if (/💛|🟡|🟨|🥇|👑|⭐|🌟|✨/.test(t)) return 'Dourado';
  if (/🩷|🌸|🌺|🌷|🎀/.test(t)) return 'Rosa';
  if (/💚|🟢|🟩|🍏|🍃|🌿/.test(t)) return 'Verde';
  if (/💜|🟣|🟪|🍇/.test(t)) return 'Roxo';
  if (/❤️|❤|🔴|🟥|🍎|🍒/.test(t)) return 'Vermelho';
  if (/🧡|🟠|🟧|📙/.test(t)) return 'Laranja';

  // 2. Termos compostos prioritários
  if (/\b(?:desert\s*titanium|tit[aâ]nio\s*deserto?|desert|deserto)\b/i.test(lower)) return 'Desert';
  if (/\b(?:natural\s*titanium|tit[aâ]nio\s*natural|natural)\b/i.test(lower)) return 'Titânio Natural';
  if (/\b(?:space\s*black|preto\s*espacial|tit[aâ]nio\s*preto|black\s*titanium|meia\s*noite|meia-noite|midnight|grafite|graphite)\b/i.test(lower)) return 'Preto';
  if (/\b(?:white\s*titanium|tit[aâ]nio\s*branco|estelar|starlight|prata|silver)\b/i.test(lower)) return 'Branco';
  if (/\b(?:blue\s*titanium|tit[aâ]nio\s*azul|sierra\s*blue|pacific\s*blue|ultramarine|ultramarino)\b/i.test(lower)) return 'Azul';
  if (/\b(?:space\s*gr[ae]y|cinza\s*espacial)\b/i.test(lower)) return 'Cinza';
  if (/\b(?:deep\s*purple|violeta|lil[aá]s)\b/i.test(lower)) return 'Roxo';
  if (/\b(?:product\s*red)\b/i.test(lower)) return 'Vermelho';

  // 3. Cores simples
  if (/\b(?:preto|preta|black|dark)\b/i.test(lower)) return 'Preto';
  if (/\b(?:branco|branca|white)\b/i.test(lower)) return 'Branco';
  if (/\b(?:azul|blue)\b/i.test(lower)) return 'Azul';
  if (/\b(?:dourado|dourada|gold|amarelo|yellow|ouro)\b/i.test(lower)) return 'Dourado';
  if (/\b(?:rosa|pink|rose)\b/i.test(lower)) return 'Rosa';
  if (/\b(?:verde|green|alpine|teal)\b/i.test(lower)) return 'Verde';
  if (/\b(?:roxo|purple)\b/i.test(lower)) return 'Roxo';
  if (/\b(?:vermelho|vermelha|red)\b/i.test(lower)) return 'Vermelho';
  if (/\b(?:cinza|gray|grey|titanium|tit[aâ]nio|titanio)\b/i.test(lower)) return 'Titânio Natural';
  if (/\b(?:laranja|orange|coral)\b/i.test(lower)) return 'Laranja';

  return undefined;
}

/**
 * Sanitiza e complementa os dados brutos ou retornados da IA utilizando
 * regras estritas de pós-processamento, regex e suporte a templates de mensagens/pedidos.
 */
export function sanitizarECompletarVendaParsed(
  parsedJsonInput: Partial<ParsedVenda> | null | undefined,
  trimmedText: string
): ParsedVenda {
  const result: ParsedVenda = {
    cliente: parsedJsonInput?.cliente ? { ...parsedJsonInput.cliente } : {},
    aparelho: parsedJsonInput?.aparelho ? { ...parsedJsonInput.aparelho } : {},
    isUpgrade: Boolean(parsedJsonInput?.isUpgrade),
    tradeIn: parsedJsonInput?.tradeIn ? { ...parsedJsonInput.tradeIn } : null,
    vendedor: parsedJsonInput?.vendedor || null,
    formaPagamento: parsedJsonInput?.formaPagamento || null,
    pagamentos: Array.isArray(parsedJsonInput?.pagamentos) ? [...parsedJsonInput.pagamentos] : null,
    valorTotal: parsedJsonInput?.valorTotal ?? null,
    valorEntradaTroca: parsedJsonInput?.valorEntradaTroca ?? null,
    valorVolta: parsedJsonInput?.valorVolta ?? null,
    dataVenda: parsedJsonInput?.dataVenda || null,
    observacoes: parsedJsonInput?.observacoes || null,
    camposFaltantes: parsedJsonInput?.camposFaltantes ? [...parsedJsonInput.camposFaltantes] : [],
  };

  // 1. CLIENTE - E-mail Regex
  if (!result.cliente.email || result.cliente.email === 'sem@email.com') {
    const emailMatch = trimmedText.match(/[\w.-]+@[\w.-]+\.[a-zA-Z]{2,}/i);
    if (emailMatch) {
      result.cliente.email = emailMatch[0].trim();
    }
  }

  // 2. CLIENTE - Nome
  if (!result.cliente.nome) {
    const nameMatch = trimmedText.match(/(?:Nome|Nome completo|Cliente):\s*([^\n\r•]+)/i);
    if (nameMatch) {
      result.cliente.nome = nameMatch[1].trim();
    }
  }

  // 3. CLIENTE - CPF
  if (!result.cliente.cpf) {
    const cpfMatch = trimmedText.match(/(?:CPF):\s*([0-9.-]+)/i);
    if (cpfMatch) {
      result.cliente.cpf = cpfMatch[1].trim();
    }
  }

  // 4. CLIENTE - Data de Nascimento
  if (!result.cliente.dataNascimento) {
    const nascMatch = trimmedText.match(/(?:Data de nascimento|Nascimento|Dt Nasc):\s*([0-9/.-]+)/i);
    if (nascMatch) {
      const raw = nascMatch[1].trim();
      // Formata se for apenas 8 dígitos (ex: 22011999 -> 22/01/1999)
      if (/^\d{8}$/.test(raw)) {
        result.cliente.dataNascimento = `${raw.slice(0, 2)}/${raw.slice(2, 4)}/${raw.slice(4)}`;
      } else {
        result.cliente.dataNascimento = raw;
      }
    }
  }

  // 5. CLIENTE - Telefone
  if (!result.cliente.telefone) {
    const telMatch = trimmedText.match(/(?:Telefone\s*\/\s*WhatsApp|Telefone|WhatsApp|Tel|Celular):\s*([0-9\s()-]+)/i);
    if (telMatch) {
      result.cliente.telefone = telMatch[1].trim();
    }
  }

  // 6. DETECÇÃO ROBUSTA DE UPGRADE / TROCA (TRADE-IN)
  // 6.1 Checkbox marcado específico: (X) Upgrade - Modelo: ... ou [X] Upgrade: ...
  const checkboxUpgradeMatch = trimmedText.match(
    /(?:\((?:[Xx]|✔|✓)\)|\[(?:[Xx]|✔|✓)\])\s*(?:Upgrade|Troca)(?:\s*-\s*Modelo|\s*\/\s*Troca)?:\s*([^\n\r]+)/i
  );

  // 6.2 Linha de texto com modelo de troca
  const textoTrocaMatch =
    checkboxUpgradeMatch ||
    trimmedText.match(
      /(?:Trade[- ]?in|Upgrade|Troca|Aparelho na troca|Aparelho de entrada|Entrada de troca|Entrada)(?:\s*-\s*Modelo|\s*\/\s*Troca)?:\s*([^\n\r]+)/i
    );

  // Validação estrita se o texto capturado NÃO é apenas checkbox vazio ou negativa (ex: "( ) Outro:", "( ) Não", "-")
  let conteudoTrocaValido = '';
  if (textoTrocaMatch) {
    const rawConteudo = textoTrocaMatch[1].trim();
    const ehVazioOuNegativa =
      /^(?:\(\s*\)|\[\s*\]|\(\s*\)\s*outro:?|\(\s*\)\s*n[aã]o:?|n[aã]o|nenhum|-|nao possui|sem troca)$/i.test(rawConteudo) ||
      rawConteudo.length < 2;

    if (!ehVazioOuNegativa) {
      conteudoTrocaValido = rawConteudo;
    }
  }

  const ehTextoUpgrade =
    Boolean(checkboxUpgradeMatch) ||
    (Boolean(conteudoTrocaValido) &&
      /trade[- ]?in|base de troca|na troca|deu na troca|pegou na troca|aparelho de entrada|entrada de um/i.test(
        trimmedText
      ));

  if (ehTextoUpgrade) {
    result.isUpgrade = true;

    let modeloTrocaExtraido = '';
    let valorTroca = 0;
    let capTroca = '';

    if (textoTrocaMatch && conteudoTrocaValido) {
      const linhaTroca = conteudoTrocaValido;
      // Valor da troca se houver explícito com R$
      const valMatch = linhaTroca.match(/R\$\s*([0-9.,]+)/i);
      if (valMatch) {
        valorTroca = parseFloat(valMatch[1].replace(/\./g, '').replace(',', '.'));
      }

      // Capacidade da troca
      const capMatch = linhaTroca.match(/\b(\d+GB|\d+TB)\b/i);
      if (capMatch) {
        capTroca = capMatch[1].toUpperCase();
      }

      // Modelo da troca: remove capacidade e valores explícitos com R$
      let modLimpo = linhaTroca
        .replace(/\b(\d+GB|\d+TB)\b/gi, '')
        .replace(/R\$\s*[0-9.,]+/gi, '')
        .replace(/(?:por|de|valor|entrada)\s*[:=]?\s*/gi, '')
        .replace(/[•_]/g, ' ')
        .replace(/^\s*-\s*/, '')
        .trim();

      if (modLimpo) {
        modeloTrocaExtraido = normalizarNomeModelo(modLimpo);
      }
    }

    if (!result.tradeIn || !result.tradeIn.modelo) {
      result.tradeIn = {
        marca: inferirMarcaPorModelo(modeloTrocaExtraido, 'Apple'),
        modelo: modeloTrocaExtraido || 'Aparelho na Troca',
        capacidade: capTroca || '128GB',
        cor: '',
        imei: null,
        bateria: null,
        valor: valorTroca || (result.tradeIn?.valor ?? 0),
        condicao: 'seminovo',
        observacoes: 'Recebido como troca (upgrade) no pedido',
      };
    } else {
      if (modeloTrocaExtraido && (!result.tradeIn.modelo || result.tradeIn.modelo === 'Aparelho na Troca')) {
        result.tradeIn.modelo = modeloTrocaExtraido;
      }
      result.tradeIn.marca = inferirMarcaPorModelo(result.tradeIn.modelo, result.tradeIn.marca || 'Apple');
    }
  }

  // 7. FORMA DE PAGAMENTO (PRIORIZANDO CHECKBOX MARCADO)
  // Importante: verificar (X) ou [X] antes de strings genéricas para não confundir opções vazias ( )
  if (/(?:\((?:[Xx]|✔|✓)\)|\[(?:[Xx]|✔|✓)\])\s*Cart[aã]o de cr[eé]dito/i.test(trimmedText)) {
    result.formaPagamento = 'cartao_credito';
  } else if (/(?:\((?:[Xx]|✔|✓)\)|\[(?:[Xx]|✔|✓)\])\s*Cart[aã]o de d[eé]bito/i.test(trimmedText)) {
    result.formaPagamento = 'cartao_debito';
  } else if (/(?:\((?:[Xx]|✔|✓)\)|\[(?:[Xx]|✔|✓)\])\s*Pix/i.test(trimmedText)) {
    result.formaPagamento = 'pix';
  } else if (/(?:\((?:[Xx]|✔|✓)\)|\[(?:[Xx]|✔|✓)\])\s*Dinheiro/i.test(trimmedText)) {
    result.formaPagamento = 'dinheiro';
  } else if (!result.formaPagamento) {
    if (/\b(?:no\s+|via\s+)?pix\b/i.test(trimmedText) && !/\(\s*\)\s*pix/i.test(trimmedText)) {
      result.formaPagamento = 'pix';
    } else if (/\bcart[aã]o de cr[eé]dito\b/i.test(trimmedText) && !/\(\s*\)\s*cart[aã]o de cr[eé]dito/i.test(trimmedText)) {
      result.formaPagamento = 'cartao_credito';
    } else if (/\bcart[aã]o de d[eé]bito\b/i.test(trimmedText) && !/\(\s*\)\s*cart[aã]o de d[eé]bito/i.test(trimmedText)) {
      result.formaPagamento = 'cartao_debito';
    } else if (/\bdinheiro\b/i.test(trimmedText) && !/\(\s*\)\s*dinheiro/i.test(trimmedText)) {
      result.formaPagamento = 'dinheiro';
    }
  }

  // 8. VALOR TOTAL / VOLTA
  // Extrai valor do texto se não veio da IA
  if (!result.valorTotal || result.valorTotal <= 0) {
    const valorMatch =
      trimmedText.match(/(?:Valor total|Total a pagar|Total|Valor):\s*R?\$?\s*([0-9.,]+)/i) ||
      trimmedText.match(/R\$\s*([0-9.,]+)/i);
    if (valorMatch) {
      const clean = valorMatch[1].replace(/\./g, '').replace(',', '.');
      const val = parseFloat(clean);
      if (!isNaN(val) && val > 0) {
        result.valorTotal = val;
      }
    }
  }

  // Se houver menção explícita a Volta / Restante
  const voltaMatch = trimmedText.match(/(?:Volta|Restante|Diferen[cç]a|Saldo a pagar):\s*R?\$?\s*([0-9.,]+)/i);
  if (voltaMatch) {
    const valVolta = parseFloat(voltaMatch[1].replace(/\./g, '').replace(',', '.'));
    if (!isNaN(valVolta) && valVolta > 0) {
      result.valorVolta = valVolta;
    }
  }

  // Em negociação com Upgrade onde o valor do pedido corresponde ao montante pago no cartão/pix
  if (result.isUpgrade) {
    if ((!result.valorVolta || result.valorVolta <= 0) && result.valorTotal && result.valorTotal > 0) {
      result.valorVolta = result.valorTotal;
    }
  } else {
    result.valorVolta = result.valorTotal;
  }

  // Se pagamentos estiver vazio, inicializa com a forma de pagamento e valor
  if (result.formaPagamento && (!result.pagamentos || result.pagamentos.length === 0)) {
    const vPgto = result.valorVolta || result.valorTotal || 0;
    if (vPgto > 0) {
      result.pagamentos = [{ metodo: result.formaPagamento, valor: vPgto, parcelas: 1 }];
    }
  }

  // 9. APARELHO VENDIDO - Linha de Modelo no final ou destacada
  // Ex: "Modelo: 17 pro Max 256gb azul  lacrado imei 350015753668064"
  // Procura por "Modelo: ...", ignorando linhas que pertençam ao Upgrade/Trade-In
  const linhasTexto = trimmedText.split(/\r?\n/);
  let linhaModelo = '';
  for (const lin of linhasTexto) {
    if (/(?:upgrade|trade[- ]?in)/i.test(lin)) continue;
    const m = lin.match(/(?:Modelo|Aparelho|Produto):\s*([^\n\r]+)/i);
    if (m) {
      linhaModelo = m[1].trim();
      break;
    }
  }

  if (linhaModelo) {
    // 1. Capacidade de armazenamento (prioriza menção explícita a memória/armazenamento/rom, ignorando RAM)
    const extrairCapFormatada = (str?: string | null): string | null => {
      if (!str) return null;
      let cap = str.toUpperCase().replace(/\s+/g, '');
      if (/^\d+$/.test(cap)) return `${cap}GB`;
      if (/^\d+G$/.test(cap)) return `${cap}B`;
      if (/^\d+T$/.test(cap)) return `${cap}B`;
      return cap;
    };

    const romExplicito =
      linhaModelo.match(/\b(\d+\s*(?:gb|tb|g|t)?)\s*(?:de\s+)?(?:mem[oó]ria|armazenamento|rom)\b/i) ||
      linhaModelo.match(/(?:mem[oó]ria|armazenamento|rom)\s*[:=]?\s*(\d+\s*(?:gb|tb|g|t)?)\b/i);

    if (romExplicito && !result.aparelho.capacidade) {
      result.aparelho.capacidade = extrairCapFormatada(romExplicito[1]);
    } else {
      // Procura por GB/TB/G que NÃO seja seguido por RAM
      const romSemRam = linhaModelo.match(/\b(\d+\s*(?:gb|tb|g))\b(?!\s*(?:de\s+)?ram\b)/i);
      if (romSemRam && !result.aparelho.capacidade) {
        result.aparelho.capacidade = extrairCapFormatada(romSemRam[1]);
      } else {
        const romMatch = linhaModelo.match(/\b(\d+\s*(?:gb|tb|g))\b/i);
        if (romMatch && !result.aparelho.capacidade) {
          result.aparelho.capacidade = extrairCapFormatada(romMatch[1]);
        }
      }
    }

    // IMEI na linha de modelo (aceita 4 a 18 dígitos: completo ou final de 4 dígitos)
    const imeiMatch =
      linhaModelo.match(/(?:final\s*(?:do\s*)?imei|imei\s*final|imei|serial|n[ºo°]\s*s[eé]rie):\s*#?([0-9A-Za-z]{4,18})/i) ||
      linhaModelo.match(/\b([0-9]{14,16})\b/);
    if (imeiMatch && !result.aparelho.imei) {
      result.aparelho.imei = imeiMatch[1].trim();
    }

    // Condição na linha de modelo
    if (!result.aparelho.condicao) {
      if (/lacrado|novo|caixa fechada/i.test(linhaModelo)) {
        result.aparelho.condicao = 'novo';
      } else if (/usado|seminovo/i.test(linhaModelo)) {
        result.aparelho.condicao = 'seminovo';
      }
    }

    // Cor na linha de modelo (suporta emojis e nomes)
    if (!result.aparelho.cor) {
      const corEncontrada = extrairCorDeTexto(linhaModelo);
      if (corEncontrada) {
        result.aparelho.cor = corEncontrada;
      }
    }

    // Nome limpo do modelo: remove dados técnicos, RAM, memória, IMEI, lacrado, cores
    const coresParaRemover = [
      result.aparelho.cor,
      'desert', 'deserto', 'natural', 'titanium', 'titânio', 'preto', 'branco', 'azul',
      'dourado', 'rosa', 'verde', 'roxo', 'cinza', 'grafite', 'silver', 'prata'
    ].filter(Boolean).join('|');

    let modNome = linhaModelo
      .replace(/\b(\d+)(pro\s*max|promax)\b/gi, '$1 Pro Max')
      .replace(/\b(\d+)(pro)\b/gi, '$1 Pro')
      .replace(/\b(\d+)(plus)\b/gi, '$1 Plus')
      .replace(/\b(\d+)(mini)\b/gi, '$1 Mini')
      .replace(/(?:final\s*(?:do\s*)?imei|imei\s*final|imei|serial|n[ºo°]\s*s[eé]rie):\s*#?[0-9A-Za-z]+/gi, '')
      .replace(/\b[0-9]{14,16}\b/g, '')
      .replace(/\b\d+\s*(?:gb|tb|g)\s*(?:de\s+)?(?:ram|mem[oó]ria|armazenamento|rom)\b/gi, '')
      .replace(/\b\d+\s*(?:gb|tb|g)\b/gi, '')
      .replace(/(?:,\s*)?(?:de\s+)?ram\s*(?:e\s*)?(?:de\s+)?(?:mem[oó]ria|armazenamento|rom)?\b/gi, '')
      .replace(/\b(?:de\s+)?(?:ram|mem[oó]ria|armazenamento|rom)\b/gi, '')
      .replace(/\b(?:lacrado|novo|seminovo|usado|caixa\s*fechada)\b/gi, '')
      .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, ' ')
      .replace(new RegExp(`\\b(?:${coresParaRemover})\\b`, 'gi'), '')
      .replace(/[,\s]+e\s*$/i, '')
      .replace(/\s*,\s*e\s+/gi, ' ')
      .replace(/\s+e\s*$/i, '')
      .replace(/(?:,\s*de|\s+de)+$/gi, '')
      .replace(/^[,\s-]+|[,\s-]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (modNome) {
      result.aparelho.modelo = normalizarNomeModelo(modNome);
    }
  }

  // Linha explícita de cor no formulário (ex: "Cor: 🖤", "Cor: Desert", "Cor: Preto")
  if (!result.aparelho.cor) {
    const linhaCorMatch = trimmedText.match(/(?:^|\n|\r)\s*(?:Cor|Cores):\s*([^\n\r]+)/i);
    if (linhaCorMatch) {
      const corExtraida = extrairCorDeTexto(linhaCorMatch[1]);
      if (corExtraida) {
        result.aparelho.cor = corExtraida;
      }
    }
  }

  // Fallback geral de cor no texto se não identificou acima
  if (!result.aparelho.cor) {
    const corFallback = extrairCorDeTexto(trimmedText);
    if (corFallback) {
      result.aparelho.cor = corFallback;
    }
  } else {
    // Normaliza caso a IA tenha retornado um emoji puro no campo de cor
    const norm = extrairCorDeTexto(result.aparelho.cor);
    if (norm) {
      result.aparelho.cor = norm;
    }
  }

  // Normalização do modelo caso a IA tenha retornado sem o prefixo
  if (result.aparelho.modelo) {
    result.aparelho.modelo = normalizarNomeModelo(result.aparelho.modelo);
  }

  // Capacidade geral fallback
  if (!result.aparelho.capacidade) {
    const romMatch = trimmedText.match(/\b(\d+GB|\d+TB)\b/i);
    if (romMatch) {
      result.aparelho.capacidade = romMatch[1].toUpperCase();
    }
  }

  // IMEI geral fallback (reconhece IMEI completo de 15 dígitos ou final de 4 dígitos)
  if (!result.aparelho.imei) {
    const imeiRotuloMatch =
      trimmedText.match(/(?:final\s*(?:do\s*)?imei|imei\s*final|imei\s*\(?\s*(?:últimos\s*)?4\s*(?:d[íi]gitos)?\s*\)?|imei|imei\s*1|n[ºo°]\s*s[eé]rie|serial):\s*#?([0-9A-Za-z]{4,18})/i) ||
      trimmedText.match(/(?:final):\s*#?([0-9]{4,6})\b/i) ||
      trimmedText.match(/\b([0-9]{14,16})\b/);
    if (imeiRotuloMatch) {
      result.aparelho.imei = imeiRotuloMatch[1].trim();
    }
  }

  // Condição geral fallback
  if (!result.aparelho.condicao) {
    result.aparelho.condicao = /lacrado|novo|caixa fechada/i.test(trimmedText) ? 'novo' : 'seminovo';
  }

  // Código / ID do aparelho fallback
  if (!result.aparelho.codigo) {
    const codMatch =
      trimmedText.match(/(?:COD|CÓD|CODIGO|CÓDIGO|ID|ID APARELHO):\s*#?([0-9A-Za-z]{6,12})/i) ||
      trimmedText.match(/(?:COD|CÓD)\s+([0-9A-Za-z]{6,12})/i) ||
      trimmedText.match(/#([0-9]{6,10})/);
    if (codMatch) {
      result.aparelho.codigo = codMatch[1].trim();
    }
  }

  // Marcas inferidas
  result.aparelho.marca = inferirMarcaPorModelo(result.aparelho.modelo, result.aparelho.marca);
  if (result.tradeIn && result.tradeIn.modelo) {
    result.tradeIn.marca = inferirMarcaPorModelo(result.tradeIn.modelo, result.tradeIn.marca);
  }

  // Sanitização de Data da Venda (evitando data de nascimento ou anos remotos)
  const nascNorm = (result.cliente?.dataNascimento || '').replace(/\D/g, '');
  if (result.dataVenda) {
    const dataVendaLimpa = String(result.dataVenda).replace(/\D/g, '');
    let anoVenda = 0;
    if (result.dataVenda.includes('-')) {
      anoVenda = parseInt(result.dataVenda.split('-')[0], 10);
    } else if (result.dataVenda.includes('/')) {
      anoVenda = parseInt(result.dataVenda.split('/')[2], 10);
    }
    if ((nascNorm && dataVendaLimpa === nascNorm) || (anoVenda > 0 && anoVenda < 2020)) {
      result.dataVenda = null;
    }
  }

  if (!result.dataVenda) {
    const rotuloVendaMatch = trimmedText.match(
      /(?:Data da Venda|Data Venda|Data do Pedido|Venda realizada em|Data:\s*)(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})/i
    );
    if (rotuloVendaMatch) {
      const rawDate = rotuloVendaMatch[1];
      if (rawDate.includes('/')) {
        const [d, m, y] = rawDate.split('/');
        result.dataVenda = `${y}-${m}-${d}`;
      } else {
        result.dataVenda = rawDate;
      }
    } else {
      result.dataVenda = new Date().toISOString().split('T')[0];
    }
  }

  return result;
}
