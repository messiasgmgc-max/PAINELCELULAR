import { extrairCorDeTexto } from '@/lib/vendas/parseVendaTexto';

/**
 * Parser e processador inteligente de entradas de aparelhos no estoque via WhatsApp.
 * Suporta múltiplas sintaxes:
 *  - "Entradas: iPhone 13 128gb azul 2200, iPhone 14 128gb preto 3100"
 *  - "Entrada:\n13 pro max 256gb verde custo 3000\n14 128gb estelar 2800"
 *  - Listas coladas de fornecedores (com emojis 📱, 🔵, 💰, etc.)
 */

export interface ItemEntradaDetectado {
  marca: string;
  modelo: string;
  capacidade?: string;
  cor?: string;
  custo: number;
  preco: number;
  precoAtacado?: number;
  condicao: 'novo' | 'seminovo' | 'usado' | 'danificado';
  imei?: string;
  quantidade?: number;
}

const REGEX_CAPACIDADE = /\b(32|64|128|256|512|1024)\s*(gb|tb)\b/i;
const REGEX_IMEI = /\b(\d{15})\b/;

const CORES_CONHECIDAS: Record<string, string> = {
  preto: 'Preto',
  preta: 'Preto',
  black: 'Preto',
  dark: 'Preto',
  branco: 'Branco',
  branca: 'Branco',
  white: 'Branco',
  prata: 'Prata',
  silver: 'Prata',
  azul: 'Azul',
  blue: 'Azul',
  verde: 'Verde',
  green: 'Verde',
  amarelo: 'Amarelo',
  yellow: 'Amarelo',
  dourado: 'Dourado',
  dourada: 'Dourado',
  gold: 'Dourado',
  rosa: 'Rosa',
  pink: 'Rosa',
  rose: 'Rosa',
  roxo: 'Roxo',
  purple: 'Roxo',
  violeta: 'Roxo',
  vermelho: 'Vermelho',
  vermelha: 'Vermelho',
  red: 'Vermelho',
  cinza: 'Cinza',
  gray: 'Cinza',
  grey: 'Cinza',
  grafite: 'Grafite',
  graphite: 'Grafite',
  estelar: 'Estelar',
  starlight: 'Estelar',
  meia_noite: 'Meia-noite',
  midnight: 'Meia-noite',
  natural: 'Titânio Natural',
  desert: 'Desert',
  deserto: 'Desert',
  titanium: 'Titânio Natural',
  titânio: 'Titânio Natural',
  titanio: 'Titânio Natural',
};

/**
 * Retorna o emoji característico de uma cor de aparelho para exibição em listas.
 */
export function obterEmojiDaCor(cor?: string | null): string {
  if (!cor) return '📱';
  const c = String(cor).toLowerCase();
  if (c.includes('desert') || c.includes('deserto')) return '🏜️';
  if (c.includes('natural') || c.includes('titanium') || c.includes('titânio') || c.includes('titanio')) return '🔘';
  if (c.includes('preto') || c.includes('black') || c.includes('grafite') || c.includes('midnight') || c.includes('noite') || c.includes('dark')) return '🖤';
  if (c.includes('branco') || c.includes('white') || c.includes('prata') || c.includes('silver') || c.includes('estelar') || c.includes('starlight')) return '🤍';
  if (c.includes('azul') || c.includes('blue') || c.includes('sierra') || c.includes('pacific') || c.includes('ultramarine') || c.includes('ultramarino')) return '💙';
  if (c.includes('dourado') || c.includes('gold') || c.includes('amarelo') || c.includes('yellow') || c.includes('ouro')) return '💛';
  if (c.includes('rosa') || c.includes('pink') || c.includes('rose')) return '🩷';
  if (c.includes('verde') || c.includes('green') || c.includes('alpine') || c.includes('teal')) return '💚';
  if (c.includes('roxo') || c.includes('purple') || c.includes('violeta') || c.includes('deep purple') || c.includes('lilás') || c.includes('lilas')) return '💜';
  if (c.includes('bordô') || c.includes('bordo') || c.includes('vinho') || c.includes('burgundy') || c.includes('wine')) return '🍷';
  if (c.includes('vermelho') || c.includes('red')) return '❤️';
  if (c.includes('laranja') || c.includes('orange') || c.includes('coral')) return '🧡';
  if (c.includes('bronze')) return '🤎';
  if (c.includes('cinza') || c.includes('gray') || c.includes('grey')) return '🩶';
  return '📱';
}

/**
 * Normaliza nomes populares de modelos (ex: "13pm" -> "iPhone 13 Pro Max").
 * Remove duplicações como "iPhone Apple iPhone 16 Pro" ou "Apple iPhone 16 Pro".
 */
export function normalizarNomeModelo(termo: string): { marca: string; modelo: string } {
  let t = termo.replace(/[\uFE0F\u200D]/g, '').trim().replace(/\s+/g, ' ');

  // Verifica marca
  let marca = 'Apple';
  if (/samsung|galaxy/i.test(t)) {
    marca = 'Samsung';
  } else if (/xiaomi|redmi|poco/i.test(t)) {
    marca = 'Xiaomi';
  } else if (/motorola|moto/i.test(t)) {
    marca = 'Motorola';
  }

  if (marca === 'Apple') {
    // Remove qualquer ocorrência solta de "Apple" e "iPhone" do miolo para evitar duplicações
    t = t
      .replace(/\bapple\b/gi, '')
      .replace(/\biphone\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Abreviações Apple comuns
    t = t.replace(/\b16\s*pm\b/i, '16 Pro Max')
      .replace(/\b16\s*pro\s*max\b/i, '16 Pro Max')
      .replace(/\b16\s*p\b/i, '16 Pro')
      .replace(/\b16\s*plus\b/i, '16 Plus')
      .replace(/\b15\s*pm\b/i, '15 Pro Max')
      .replace(/\b15\s*pro\s*max\b/i, '15 Pro Max')
      .replace(/\b15\s*p\b/i, '15 Pro')
      .replace(/\b15\s*plus\b/i, '15 Plus')
      .replace(/\b14\s*pm\b/i, '14 Pro Max')
      .replace(/\b14\s*pro\s*max\b/i, '14 Pro Max')
      .replace(/\b14\s*p\b/i, '14 Pro')
      .replace(/\b14\s*plus\b/i, '14 Plus')
      .replace(/\b13\s*pm\b/i, '13 Pro Max')
      .replace(/\b13\s*pro\s*max\b/i, '13 Pro Max')
      .replace(/\b13\s*p\b/i, '13 Pro')
      .replace(/\b13\s*mini\b/i, '13 Mini')
      .replace(/\b12\s*pm\b/i, '12 Pro Max')
      .replace(/\b12\s*pro\s*max\b/i, '12 Pro Max')
      .replace(/\b12\s*p\b/i, '12 Pro')
      .replace(/\b11\s*pm\b/i, '11 Pro Max')
      .replace(/\b11\s*pro\s*max\b/i, '11 Pro Max')
      .replace(/\b11\s*p\b/i, '11 Pro');

    if (/^ipad/i.test(t)) {
      t = t.replace(/\bipad\b/gi, 'iPad');
    } else if (/^mac/i.test(t)) {
      t = t.replace(/\bmacbook\b/gi, 'MacBook');
    } else if (/^watch/i.test(t)) {
      t = t.replace(/\bwatch\b/gi, 'Apple Watch');
    } else {
      t = `iPhone ${t}`;
    }
  }

  // Capitalização limpa
  t = t.replace(/\biphone\b/gi, 'iPhone')
    .replace(/\bpro\b/gi, 'Pro')
    .replace(/\bmax\b/gi, 'Max')
    .replace(/\bmini\b/gi, 'Mini')
    .replace(/\bplus\b/gi, 'Plus')
    .replace(/\s+/g, ' ')
    .trim();

  return { marca, modelo: t };
}

/**
 * Converte string de valor monetário em número (R$ 2.500,00 -> 2500).
 */
export function extrairNumeroValor(valStr: string): number {
  if (!valStr) return 0;
  const limpo = valStr.replace(/[^\d,.]/g, '').replace(/\./g, '').replace(',', '.');
  const num = parseFloat(limpo);
  return isNaN(num) ? 0 : num;
}

/**
 * Analisa uma única linha de texto livre descrevendo um aparelho para entrada.
 */
export function parseLinhaEntrada(linha: string, condicaoPadrao: 'novo' | 'seminovo' = 'seminovo'): ItemEntradaDetectado | null {
  const l = linha.trim();
  if (!l || l.length < 3) return null;

  // Ignora cabeçalhos evidentes
  if (/^entradas?:?$/i.test(l) || /^dar entradas?:?$/i.test(l) || /novos lacrados/i.test(l) || /semi\s*novos/i.test(l)) {
    return null;
  }

  let condicao: 'novo' | 'seminovo' | 'usado' | 'danificado' = condicaoPadrao;
  if (/lacrado|novo/i.test(l)) condicao = 'novo';
  else if (/usado/i.test(l)) condicao = 'usado';
  else if (/seminovo|semi\s*novo/i.test(l)) condicao = 'seminovo';

  let linhaTrabalho = l
    .replace(/^(?:!(?:entradas?|importar)\s*|(?:entradas?|dar entradas?|cadastrar entradas?|chegou hoje|chegaram os aparelhos)[:\s]*)/i, '')
    .trim();

  // 1. Extração prioritária de IMEI (com prefixo "imei/serial" ou sequência direta de 14 a 16 dígitos)
  let imei: string | undefined;

  // 1.1. Prefixo explícito: "imei: 356829104829102", "imei 35...", "serial: 35..."
  const imeiPrefixoMatch = linhaTrabalho.match(/(?:imei|serial|sn)[:\s=]*([0-9\s-]{14,18})/i);
  if (imeiPrefixoMatch) {
    const limpo = imeiPrefixoMatch[1].replace(/\D/g, '');
    if (limpo.length >= 14 && limpo.length <= 16) {
      imei = limpo;
      linhaTrabalho = linhaTrabalho.replace(imeiPrefixoMatch[0], ' ');
    }
  }

  // 1.2. Sequência numérica direta de 14 a 16 dígitos isolados
  if (!imei) {
    const imeiDiretoMatch = linhaTrabalho.match(/\b(\d{14,16})\b/);
    if (imeiDiretoMatch) {
      imei = imeiDiretoMatch[1];
      linhaTrabalho = linhaTrabalho.replace(imeiDiretoMatch[0], ' ');
    }
  }

  // 2. Capacidade (32GB, 64GB, 128GB, 256GB, 512GB, 1TB, etc.)
  let capacidade: string | undefined;
  const capMatch = linhaTrabalho.match(REGEX_CAPACIDADE);
  if (capMatch) {
    capacidade = `${capMatch[1].toUpperCase()}${capMatch[2].toUpperCase()}`;
    linhaTrabalho = linhaTrabalho.replace(capMatch[0], ' ');
  }

  // 3. Valor de custo / preço
  // REGRA ESTRITA: O IMEI já foi removido acima, garantindo que nunca seja confundido com valor.
  // Procura valor com R$/r$, com prefixo explícito ("custo", "valor", "preço", "por", "pago")
  // ou número solto no final da linha (ex: listas de fornecedor "13 128gb 2200").
  let custo = 0;
  const matchComPrefixo = linhaTrabalho.match(/(?:r\$|custo|por|valor|pre[çc]o|pago)[:=\s]*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\b\d{3,6}\b)/i);
  const matchComCentavos = linhaTrabalho.match(/\b(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})\b/);
  const matchNumeroSolto = linhaTrabalho.match(/(?:^|\s)(\d{3,5})(?:\s|$)/);

  if (matchComPrefixo) {
    const num = extrairNumeroValor(matchComPrefixo[1]);
    if (num >= 50 && num !== 32 && num !== 64 && num !== 128 && num !== 256 && num !== 512 && num !== 1024) {
      custo = num;
      linhaTrabalho = linhaTrabalho.replace(matchComPrefixo[0], ' ');
    }
  } else if (matchComCentavos) {
    const num = extrairNumeroValor(matchComCentavos[1]);
    if (num >= 50) {
      custo = num;
      linhaTrabalho = linhaTrabalho.replace(matchComCentavos[0], ' ');
    }
  } else if (matchNumeroSolto) {
    const num = extrairNumeroValor(matchNumeroSolto[1]);
    if (num >= 50 && num !== 64 && num !== 128 && num !== 256 && num !== 512 && num !== 1024) {
      custo = num;
      linhaTrabalho = linhaTrabalho.replace(matchNumeroSolto[0], ' ');
    }
  }

  // 4. Cor (Detecta termos compostos, palavras simples e emojis de coração/fornecedor)
  let cor = extrairCorDeTexto(linhaTrabalho) || extrairCorDeTexto(l);

  // 5. Modelo
  let textoModelo = linhaTrabalho
    .replace(/(?:imei|serial|sn)[:\s=]*\d*/gi, ' ')
    .replace(/\b(?:r\$|custo|por|valor|pre[çc]o|pago|lacrado|seminovo|novo|usado)\b/gi, ' ')
    .replace(/\b(?:desert\s*titanium|tit[aâ]nio\s*deserto?|natural\s*titanium|tit[aâ]nio\s*natural|space\s*black|space\s*gr[ae]y|meia\s*noite|meia-noite|starlight|estelar)\b/gi, ' ')
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, ' ')
    .replace(/[•\-\*]/g, ' ')
    .trim();

  if (cor) {
    textoModelo = textoModelo
      .replace(new RegExp(`\\b${cor}\\b`, 'gi'), ' ')
      .replace(/\b(?:desert|deserto|natural|titanium|tit[aâ]nio|preto?|black|branco?|white|prata|silver|azul|blue|dourado?|gold|amarelo?|yellow|rosa|pink|roxo|purple|cinza|gr[ae]y|grafite|graphite)\b/gi, ' ');
  }

  // Remove valores numéricos restantes
  textoModelo = textoModelo.replace(/\b\d{3,}\b/g, '').trim();

  if (textoModelo.length < 2) return null;

  const { marca, modelo } = normalizarNomeModelo(textoModelo);

  // Calcula margem padrão para preço de venda se só tiver custo
  const margem = condicao === 'novo' ? 350 : 300;
  const preco = custo > 0 ? custo + margem : 0;
  const precoAtacado = custo > 0 ? custo + 150 : 0;

  return {
    marca,
    modelo,
    capacidade,
    cor,
    custo,
    preco,
    precoAtacado,
    condicao,
    imei,
  };
}

/**
 * Detecta se uma mensagem é um relatório de sistema, conferência de estoque, lista de faltantes ou extrato,
 * os quais NUNCA devem ser interpretados como novas entradas no estoque.
 */
export function ehRelatorioOuConferencia(texto?: string | null): boolean {
  if (!texto || typeof texto !== 'string') return false;
  const t = texto.toLowerCase();
  return (
    t.includes('conferência de estoque') ||
    t.includes('conferencia de estoque') ||
    t.includes('aparelhos faltantes') ||
    t.includes('aparelho faltante') ||
    t.includes('relatório gerado pelo painel') ||
    t.includes('relatorio gerado pelo painel') ||
    t.includes('painel phone center') ||
    (t.includes('encontrados') && t.includes('faltantes')) ||
    /extrato\s+de\s+(?:vendas|estoque|sa[ií]das|caixa)/i.test(t) ||
    /relat[oó]rio\s+de\s+(?:vendas|estoque|sa[ií]das|confer[eê]ncia|perdas|extravios)/i.test(t) ||
    /confer[eê]ncia\s+finalizada/i.test(t)
  );
}

/**
 * Detecta se uma mensagem do WhatsApp é um pedido explícito de entrada de aparelhos.
 * Aceita marcações como "*Entrada:*", "📦 Entrada", "Entradas:", "dar entrada", etc.
 */
export function ehMensagemDeEntradaEstoque(texto: string): boolean {
  if (!texto || typeof texto !== 'string') return false;
  if (ehRelatorioOuConferencia(texto)) return false;
  const t = texto.trim();
  const regexGatilho = /^(?:[\p{Extended_Pictographic}*•\-_\s]*)(?:!(?:entradas?|importar)|entradas?|dar\s*entradas?|cadastrar\s*entradas?|entrada\s*dos\s*aparelhos|chegou\s*hoje|chegaram\s*os\s*aparelhos)\b/iu;
  return regexGatilho.test(t);
}

/**
 * Processa um bloco de texto completo (múltiplas linhas ou itens separados por vírgula)
 * e retorna todos os aparelhos identificados.
 */
export function parseTextoEntradaAparelhos(texto: string): ItemEntradaDetectado[] {
  if (!texto || !texto.trim()) return [];
  if (ehRelatorioOuConferencia(texto)) return [];

  // Remove o prefixo de gatilho (incluindo emojis, asteriscos de negrito, etc.)
  let limpo = texto.trim()
    .replace(/^(?:[\p{Extended_Pictographic}*•\-_\s]*)(?:!(?:entradas?|importar)|entradas?|dar\s*entradas?|cadastrar\s*entradas?|entrada\s*dos\s*aparelhos|chegou\s*hoje|chegaram\s*os\s*aparelhos)[:\s*]*/iu, '')
    .trim();

  const resultados: ItemEntradaDetectado[] = [];

  // 1. Tenta dividir por quebras de linha
  const linhas = limpo.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  if (linhas.length > 1) {
    let condicaoSecao: 'novo' | 'seminovo' = 'seminovo';
    for (const linha of linhas) {
      if (/novos lacrados/i.test(linha)) {
        condicaoSecao = 'novo';
        continue;
      }
      if (/semi\s*novos/i.test(linha)) {
        condicaoSecao = 'seminovo';
        continue;
      }

      const item = parseLinhaEntrada(linha, condicaoSecao);
      if (item && item.modelo) {
        resultados.push(item);
      }
    }
  } else if (linhas.length === 1) {
    // 2. Se for uma linha só, verifica se há múltiplos aparelhos separados por vírgula ou ponto e vírgula
    const pedacos = linhas[0].split(/[;,]+/).map((p) => p.trim()).filter(Boolean);
    if (pedacos.length > 1) {
      for (const p of pedacos) {
        const item = parseLinhaEntrada(p);
        if (item && item.modelo) {
          resultados.push(item);
        }
      }
    } else {
      const item = parseLinhaEntrada(linhas[0]);
      if (item && item.modelo) {
        resultados.push(item);
      }
    }
  }

  return resultados;
}
