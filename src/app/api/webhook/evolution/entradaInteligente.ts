import { extrairCorDeTexto } from '@/lib/vendas/parseVendaTexto';
import { parseMercadoPhoneList } from '@/lib/estoque/listaSimples';

/**
 * Parser e processador inteligente de entradas de aparelhos no estoque via WhatsApp.
 * Usa a mesma lógica oficial do "Importar > Lista Simples" (src/lib/estoque/listaSimples.ts).
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
  bateria?: string;
  observacoes?: string;
  idEtiqueta?: string;
  idEtiquetaInformado?: boolean;
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

function converterParaItemEntrada(
  item: ReturnType<typeof parseMercadoPhoneList>[number],
  linhaOriginal: string,
  condicaoPadrao: 'novo' | 'seminovo' = 'seminovo'
): ItemEntradaDetectado | null {
  if (!item || !item.modelo || item.modelo === 'Eletrônico') return null;

  let condicao: 'novo' | 'seminovo' | 'usado' | 'danificado' = item.condicao || condicaoPadrao;
  if (condicao !== 'novo') {
    if (/\busado\b/i.test(linhaOriginal)) condicao = 'usado';
    else if (/\b(?:lacrado|novo)\b/i.test(linhaOriginal)) condicao = 'novo';
    else if (condicaoPadrao === 'novo') condicao = 'novo';
  }

  const custo = item.custo || 0;
  const margem = condicao === 'novo' ? 350 : 300;
  const preco = custo > 0 ? custo + margem : 0;
  const precoAtacado = custo > 0 ? custo + 150 : 0;

  return {
    marca: item.marca || 'Apple',
    modelo: item.modelo,
    capacidade: item.capacidade || undefined,
    cor: item.cor && item.cor !== 'Padrão' ? item.cor : extrairCorDeTexto(linhaOriginal) || 'Padrão',
    custo,
    preco,
    precoAtacado,
    condicao,
    imei: item.sufixoSerial || undefined,
    bateria: item.bateria || undefined,
    observacoes: item.observacoes || undefined,
    idEtiqueta: item.idEtiqueta,
    idEtiquetaInformado: item.idEtiquetaInformado,
  };
}

function limparPrefixoEntrada(texto: string): string {
  return texto
    .trim()
    .replace(
      /^(?:!(?:entradas?|importar)\s*|(?:entradas?|dar\s*entradas?|cadastrar\s*entradas?|entrada\s*dos\s*aparelhos|chegou\s*hoje|chegaram\s*os\s*aparelhos)[:\s]*)/i,
      ''
    )
    .trim();
}

/**
 * Analisa uma única linha de texto livre descrevendo um aparelho para entrada,
 * usando a mesma lógica oficial do Importar > Lista Simples.
 */
export function parseLinhaEntrada(linha: string, condicaoPadrao: 'novo' | 'seminovo' = 'seminovo'): ItemEntradaDetectado | null {
  const l = linha.trim();
  if (!l || l.length < 3) return null;

  if (/^entradas?:?$/i.test(l) || /^dar entradas?:?$/i.test(l) || /novos lacrados/i.test(l) || /semi\s*novos/i.test(l)) {
    return null;
  }

  const linhaTrabalho = limparPrefixoEntrada(l);
  if (!linhaTrabalho || linhaTrabalho.length < 2) return null;

  const itens = parseMercadoPhoneList(linhaTrabalho, 0, {
    aceitarPrefixoCusto: true,
    aceitarCustoSemRS: true,
  });
  if (itens.length === 0) return null;

  return converterParaItemEntrada(itens[0], l, condicaoPadrao);
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
