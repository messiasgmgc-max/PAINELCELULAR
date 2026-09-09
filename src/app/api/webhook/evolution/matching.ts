/**
 * Casamento tolerante de texto para o bot.
 *
 * O lojista digita "15pm", "13pro", "xiomi", "iph 12" — e o `ilike %termo%` que
 * usávamos só acerta quando o texto é quase idêntico ao cadastro. Aqui o termo
 * e o candidato são normalizados para uma forma canônica antes de comparar.
 */

/** Remove acento, pontuação e caixa. */
export function normalizar(texto: string): string {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Abreviações e erros de digitação comuns no varejo de celular. */
const SINONIMOS: Array<[RegExp, string]> = [
  [/\bip\b|\biph\b|\bifone\b|\bipone\b/g, 'iphone'],
  [/\bxiomi\b|\bxiaome\b|\bshaomi\b/g, 'xiaomi'],
  [/\bsamsug\b|\bsansung\b|\bsamsun\b/g, 'samsung'],
  [/\bmoto\b/g, 'motorola'],
  [/\bpro\s*max\b/g, 'promax'],
  [/\bp\s*max\b/g, 'promax'],
  [/\bultra\b/g, 'ultra'],
  [/\bplus\b|\+/g, 'plus'],
];

/**
 * Expande sufixos colados a número: "15pm" -> "15 promax", "13pro" -> "13 pro",
 * "128gb" -> "128 gb". É o padrão de digitação mais comum no WhatsApp.
 */
function expandirSufixos(texto: string): string {
  return texto
    .replace(/(\d+)\s*pm\b/g, '$1 promax')
    .replace(/(\d+)\s*pro\s*max\b/g, '$1 promax')
    .replace(/(\d+)\s*promax\b/g, '$1 promax')
    .replace(/(\d+)\s*pro\b/g, '$1 pro')
    .replace(/(\d+)\s*p\b/g, '$1 pro')
    .replace(/(\d+)\s*plus\b/g, '$1 plus')
    .replace(/(\d+)\s*u\b/g, '$1 ultra')
    .replace(/(\d+)\s*(gb|g)\b/g, '$1gb')
    .replace(/(\d+)\s*(tb)\b/g, '$1tb');
}

/** Forma canônica usada dos dois lados da comparação. */
export function canonizar(texto: string): string {
  let t = normalizar(texto);
  for (const [de, para] of SINONIMOS) t = t.replace(de, para);
  t = expandirSufixos(t);
  return t.replace(/\s+/g, ' ').trim();
}

export function tokens(texto: string): string[] {
  return canonizar(texto).split(' ').filter(Boolean);
}

/** Distância de Levenshtein, limitada para não custar caro em texto longo. */
export function distancia(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i += 1) {
    const atual = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      atual[j] = Math.min(atual[j - 1] + 1, anterior[j] + 1, anterior[j - 1] + custo);
    }
    anterior = atual;
  }

  return anterior[b.length];
}

/** Dois tokens são "o mesmo" tolerando 1 erro de digitação em palavras longas. */
function tokensCasam(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4) {
    if (b.startsWith(a) || a.startsWith(b)) return true;
    const limite = Math.min(a.length, b.length) >= 6 ? 2 : 1;
    return distancia(a, b) <= limite;
  }
  return false;
}

/**
 * Score de 0 a 1 de quão bem o candidato atende ao termo buscado.
 *
 * A conta é sobre os tokens do TERMO (não do candidato): buscar "13 pro" deve
 * dar score alto contra "Apple iPhone 13 Pro 256GB Azul", mesmo o candidato
 * tendo muitas palavras a mais.
 */
export function pontuar(termo: string, candidato: string): number {
  const tsTermo = tokens(termo);
  const tsCand = tokens(candidato);
  if (tsTermo.length === 0 || tsCand.length === 0) return 0;

  let acertos = 0;
  for (const t of tsTermo) {
    if (tsCand.some((c) => tokensCasam(t, c))) acertos += 1;
  }

  const cobertura = acertos / tsTermo.length;

  // Números (modelo, capacidade) são o sinal mais forte: "13" vs "15" muda tudo.
  const numsTermo = tsTermo.filter((t) => /\d/.test(t));
  if (numsTermo.length > 0) {
    const numsOk = numsTermo.filter((t) => tsCand.includes(t)).length;
    if (numsOk === 0) return cobertura * 0.3;
    return cobertura * (0.7 + 0.3 * (numsOk / numsTermo.length));
  }

  return cobertura;
}

export interface Candidato<T> {
  item: T;
  score: number;
}

/**
 * Ordena candidatos pelo score contra o termo, descartando os fracos.
 *
 * `descrever` recebe o item e devolve o texto comparável (ex.: marca + modelo +
 * capacidade + cor + imei).
 */
export function ranquear<T>(
  termo: string,
  itens: T[],
  descrever: (item: T) => string,
  minimo = 0.5
): Candidato<T>[] {
  return itens
    .map((item) => ({ item, score: pontuar(termo, descrever(item)) }))
    .filter((c) => c.score >= minimo)
    .sort((a, b) => b.score - a.score);
}

/**
 * Escolhe o melhor candidato quando ele é claramente melhor que o segundo.
 * Devolve `ambiguos` quando há empate — o bot então pergunta em vez de chutar.
 */
export function melhorOuAmbiguo<T>(
  candidatos: Candidato<T>[],
  margem = 0.15
): { escolhido: T | null; ambiguos: T[] } {
  if (candidatos.length === 0) return { escolhido: null, ambiguos: [] };
  if (candidatos.length === 1) return { escolhido: candidatos[0].item, ambiguos: [] };

  const [primeiro, segundo] = candidatos;
  if (primeiro.score - segundo.score >= margem) {
    return { escolhido: primeiro.item, ambiguos: [] };
  }

  const empatados = candidatos.filter((c) => primeiro.score - c.score < margem);
  return { escolhido: null, ambiguos: empatados.map((c) => c.item) };
}
