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
  gold: 'Dourado',
  rosa: 'Rosa',
  pink: 'Rosa',
  roxo: 'Roxo',
  purple: 'Roxo',
  vermelho: 'Vermelho',
  red: 'Vermelho',
  cinza: 'Cinza',
  gray: 'Cinza',
  grafite: 'Grafite',
  graphite: 'Grafite',
  estelar: 'Estelar',
  starlight: 'Estelar',
  meia_noite: 'Meia-noite',
  midnight: 'Meia-noite',
  natural: 'Titânio Natural',
  desert: 'Titânio Deserto',
  deserto: 'Titânio Deserto',
};

/**
 * Normaliza nomes populares de modelos (ex: "13pm" -> "iPhone 13 Pro Max").
 */
export function normalizarNomeModelo(termo: string): { marca: string; modelo: string } {
  let t = termo.trim().replace(/\s+/g, ' ');

  // Verifica marca
  let marca = 'Apple';
  if (/samsung|galaxy/i.test(t)) {
    marca = 'Samsung';
  } else if (/xiaomi|redmi|poco/i.test(t)) {
    marca = 'Xiaomi';
  } else if (/motorola|moto/i.test(t)) {
    marca = 'Motorola';
  }

  // Remove "iPhone" repetido se houver no início
  t = t.replace(/^iphone\s+/i, '');

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

  if (marca === 'Apple' && !/^ipad/i.test(t) && !/^mac/i.test(t) && !/^watch/i.test(t)) {
    t = `iPhone ${t}`;
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

  // 1. IMEI se houver
  let imei: string | undefined;
  const imeiMatch = l.match(REGEX_IMEI);
  if (imeiMatch) {
    imei = imeiMatch[1];
  }

  // 2. Capacidade se houver
  let capacidade: string | undefined;
  const capMatch = l.match(REGEX_CAPACIDADE);
  if (capMatch) {
    capacidade = `${capMatch[1].toUpperCase()}${capMatch[2].toUpperCase()}`;
  }

  // 3. Valor de custo / preço
  let custo = 0;
  const precoMatches = Array.from(l.matchAll(/(?:r\$|custo|por|valor|[:=])?\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\b\d{3,6}\b)/gi));
  if (precoMatches.length > 0) {
    for (const m of precoMatches) {
      const num = extrairNumeroValor(m[1]);
      if (num >= 50 && num !== 32 && num !== 64 && num !== 128 && num !== 256 && num !== 512 && num !== 1024) {
        if (!imei || !m[1].includes(imei)) {
          custo = num;
          break;
        }
      }
    }
  }

  // 4. Cor
  let cor: string | undefined;
  const tokens = l.toLowerCase().split(/[\s,;-]+/);
  for (const t of tokens) {
    if (CORES_CONHECIDAS[t]) {
      cor = CORES_CONHECIDAS[t];
      break;
    }
  }

  // Detecta cor por emojis de fornecedor
  if (!cor) {
    if (l.includes('⚫') || l.includes('⬛')) cor = 'Preto';
    else if (l.includes('⚪') || l.includes('⬜')) cor = 'Branco/Prata';
    else if (l.includes('🔵') || l.includes('🟦')) cor = 'Azul';
    else if (l.includes('🟡') || l.includes('🟨')) cor = 'Dourado';
    else if (l.includes('🔴') || l.includes('🟥')) cor = 'Vermelho';
    else if (l.includes('🟣') || l.includes('🟪')) cor = 'Roxo';
    else if (l.includes('🟢') || l.includes('🟩')) cor = 'Verde';
    else if (l.includes('🩷')) cor = 'Rosa';
    else if (l.includes('🩶')) cor = 'Cinza';
    else if (l.includes('🔘')) cor = 'Titânio Natural';
    else if (l.includes('🏜️') || l.includes('🐪')) cor = 'Titânio Deserto';
  }

  // 5. Modelo
  let textoModelo = l
    .replace(REGEX_IMEI, '')
    .replace(REGEX_CAPACIDADE, '')
    .replace(/\b(?:r\$|custo|por|valor|pre[çc]o|lacrado|seminovo|novo|usado|imei)\b/gi, '')
    .replace(/\p{Extended_Pictographic}/gu, ' ')
    .replace(/[•\-\*]/g, ' ')
    .trim();

  if (cor) {
    textoModelo = textoModelo.replace(new RegExp(`\\b${cor}\\b`, 'gi'), '');
  }

  // Remove valores numéricos restantes maiores que 100
  textoModelo = textoModelo.replace(/\b\d{3,6}\b/g, '').trim();

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
 * Detecta se uma mensagem do WhatsApp é um pedido explícito de entrada de aparelhos.
 */
export function ehMensagemDeEntradaEstoque(texto: string): boolean {
  const t = texto.trim().toLowerCase();
  if (t.startsWith('!entradas') || t.startsWith('!entrada') || t.startsWith('!importar')) return true;
  if (/^entradas?:/i.test(t)) return true;
  if (/^dar entradas?:/i.test(t)) return true;
  if (/^cadastrar entradas?:/i.test(t)) return true;
  if (/^entrada dos aparelhos:?/i.test(t)) return true;
  if (/^chegou hoje:?/i.test(t)) return true;
  if (/^chegaram os aparelhos:?/i.test(t)) return true;
  return false;
}

/**
 * Processa um bloco de texto completo (múltiplas linhas ou itens separados por vírgula)
 * e retorna todos os aparelhos identificados.
 */
export function parseTextoEntradaAparelhos(texto: string): ItemEntradaDetectado[] {
  if (!texto || !texto.trim()) return [];

  // Remove o prefixo de gatilho
  let limpo = texto.trim()
    .replace(/^!(?:entradas?|importar)\s*/i, '')
    .replace(/^(?:entradas?|dar entradas?|cadastrar entradas?|entrada dos aparelhos|chegou hoje|chegaram os aparelhos):?\s*/i, '');

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
