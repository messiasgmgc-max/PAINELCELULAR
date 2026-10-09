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
  const m = (modeloBruto || '').trim();
  if (!m) return '';

  // Se já tem iPhone, Galaxy, Xiaomi, Poco, Redmi, etc., apenas ajusta espaços
  if (/^(?:iPhone|iPad|MacBook|Galaxy|Samsung|Xiaomi|Poco|Redmi|Motorola|Moto)/i.test(m)) {
    // Se começa com "iphone" em minúsculo, capitaliza
    return m.replace(/^iphone\b/i, 'iPhone');
  }

  // Se começa com número de iPhone (ex: 11, 12, 13, 14, 15, 16, 17, X, XR, XS)
  if (/^(?:1[1-9]|[4-9]|X|XR|XS)(?:\s*(?:pro\s*max|pro|plus|max|mini))?\b/i.test(m)) {
    return `iPhone ${m}`;
  }

  return m;
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
    /(?:\((?:[Xx]|✔|✓)\)|\[(?:[Xx]|✔|✓)\])\s*Upgrade(?:\s*-\s*Modelo)?:\s*([^\n\r]+)/i
  );

  // 6.2 Linha de texto com modelo de troca
  const textoTrocaMatch =
    checkboxUpgradeMatch ||
    trimmedText.match(
      /(?:Trade[- ]?in|Upgrade|Troca|Aparelho na troca|Aparelho de entrada|Entrada de troca|Entrada)(?:\s*-\s*Modelo)?:\s*([^\n\r]+)/i
    );

  const ehTextoUpgrade =
    Boolean(checkboxUpgradeMatch) ||
    /trade[- ]?in|upgrade|base de troca|na troca|deu na troca|pegou na troca|aparelho de entrada|entrada de um/i.test(
      trimmedText
    );

  if (ehTextoUpgrade) {
    result.isUpgrade = true;

    let modeloTrocaExtraido = '';
    let valorTroca = 0;
    let capTroca = '';

    if (textoTrocaMatch) {
      const linhaTroca = textoTrocaMatch[1].trim();
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
    // Capacidade
    const romMatch = linhaModelo.match(/\b(\d+GB|\d+TB)\b/i);
    if (romMatch && !result.aparelho.capacidade) {
      result.aparelho.capacidade = romMatch[1].toUpperCase();
    }

    // IMEI na linha de modelo
    const imeiMatch =
      linhaModelo.match(/(?:imei|serial|nº série):\s*([0-9A-Za-z]{8,18})/i) ||
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

    // Cor na linha de modelo
    if (!result.aparelho.cor) {
      const cores = [
        'azul escuro', 'azul', 'preto', 'branco', 'grafite', 'dourado', 'prata',
        'silver', 'gold', 'space gray', 'cinza espacial', 'rosa', 'verde', 'amarelo',
        'roxo', 'laranja', 'titanium', 'titânio', 'natural'
      ];
      for (const c of cores) {
        const regexCor = new RegExp(`\\b${c}\\b`, 'i');
        if (regexCor.test(linhaModelo)) {
          result.aparelho.cor = c.charAt(0).toUpperCase() + c.slice(1);
          break;
        }
      }
    }

    // Nome limpo do modelo
    let modNome = linhaModelo
      .replace(/(?:imei|serial|nº série):\s*[0-9A-Za-z]+/gi, '')
      .replace(/\b[0-9]{14,16}\b/g, '')
      .replace(/\b(\d+GB|\d+TB)\b/gi, '')
      .replace(/\b(?:lacrado|novo|seminovo|usado)\b/gi, '')
      .replace(new RegExp(`\\b(?:${result.aparelho.cor || ''})\\b`, 'gi'), '')
      .trim();

    if (modNome) {
      result.aparelho.modelo = normalizarNomeModelo(modNome);
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

  // IMEI geral fallback
  if (!result.aparelho.imei) {
    const imeiRotuloMatch =
      trimmedText.match(/(?:IMEI|IMEI\s*1|N[ºo°]\s*S[eé]rie|Serial):\s*([0-9A-Za-z]{8,18})/i) ||
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
