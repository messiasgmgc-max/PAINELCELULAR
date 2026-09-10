import type { SupabaseClient } from '@supabase/supabase-js';
import { canonizar, normalizar, pontuar } from '../../app/api/webhook/evolution/matching';
import { TABELA_BASE_UPGRADE_PADRAO } from '../upgradeEngine';
import { getModeloOrdemCronologica } from '../utils';
import { estaNoEstoque, patchSaida, type EstadoCicloAparelho } from '../estoque/ciclo';
import {
  aplicarMudancaEstoque,
  registrarEntradaEstoque,
  type ResultadoMudancaEstoque,
} from '../estoque/movimentacoes';

/**
 * Cadastro relâmpago de aparelho no PDV.
 *
 * O popup antigo pedia marca e modelo em texto livre, gravava capacidade e cor
 * como 'N/A', não validava IMEI, sobrescrevia o preço digitado com custo+300 e
 * nem colocava o aparelho no carrinho. Aqui fica a regra — pura e testável —
 * do popup novo: leitura do IMEI, sugestões tiradas do próprio estoque da loja,
 * duplicidade, validação e o payload final.
 */

/** Campos de aparelho que o cadastro rápido lê. `Aparelho` e linhas cruas do banco servem. */
export interface AparelhoBase {
  id: string;
  marca?: string | null;
  modelo?: string | null;
  imei?: string | null;
  numeroSerie?: string | null;
  capacidade?: string | null;
  cor?: string | null;
  condicao?: string | null;
  status?: string | null;
  ativo?: boolean | null;
  preco?: number | null;
  custo?: number | null;
  codigo?: string | null;
  observacoes?: string | null;
  dataCadastro?: string | null;
  created_at?: string | null;
}

export const MARCADORES = {
  imeiPendente: 'IMEI_PENDENTE',
  custoPendente: 'CUSTO_PENDENTE',
  /** Cadastro desfeito logo depois de lançado: não conta como duplicidade nem como histórico de preço. */
  cadastroDesfeito: 'CADASTRO_DESFEITO',
} as const;

const foiDesfeito = (a: { observacoes?: string | null }) =>
  String(a.observacoes || '').includes(MARCADORES.cadastroDesfeito);

// ── IMEI ────────────────────────────────────────────────────────────────────

/** Dígito verificador (Luhn) a partir dos 14 primeiros dígitos do IMEI. */
export function digitoVerificadorImei(primeiros14: string): number {
  let soma = 0;
  for (let i = 0; i < 14; i += 1) {
    let digito = Number(primeiros14.charAt(i));
    if (i % 2 === 1) {
      digito *= 2;
      if (digito > 9) digito -= 9;
    }
    soma += digito;
  }
  return (10 - (soma % 10)) % 10;
}

export function imeiValido(imei: string): boolean {
  return /^\d{15}$/.test(imei) && digitoVerificadorImei(imei.slice(0, 14)) === Number(imei.charAt(14));
}

export type LeituraIdentificador =
  | { tipo: 'vazio' }
  | { tipo: 'incompleto'; digitos: string }
  | { tipo: 'imei'; imei: string; completado: boolean }
  | { tipo: 'imei_invalido'; imei: string }
  | { tipo: 'serial'; numeroSerie: string };

const PREFIXO_ROTULO =
  /^(?:imei\s*[12]?\s*[:#.-]?|meid\s*[:#.-]?|s\/n\s*[:#.-]?|sn\s*[:#.-]|serial(?:\s*(?:number|n[oº°.]*))?\s*[:#.-]?|n[uú]mero\s+de\s+s[eé]rie\s*[:#.-]?)\s*/i;

/**
 * Interpreta o que foi bipado ou digitado no campo IMEI/Série.
 *
 * Leitor de etiqueta manda coisas como "IMEI1 3569... IMEI2 3569..." ou o
 * serial com o prefixo "S" do código de barras da caixa da Apple.
 */
export function interpretarIdentificador(texto: string): LeituraIdentificador {
  const bruto = String(texto || '').trim();
  if (!bruto) return { tipo: 'vazio' };

  const quinze = bruto.match(/(?:^|\D)(\d{15})(?:\D|$)/);
  if (quinze) {
    const imei = quinze[1];
    return imeiValido(imei) ? { tipo: 'imei', imei, completado: false } : { tipo: 'imei_invalido', imei };
  }

  const semRotulo = bruto.replace(PREFIXO_ROTULO, '').replace(/\s+/g, '');
  if (/^\d+$/.test(semRotulo)) {
    if (semRotulo.length === 14) {
      return { tipo: 'imei', imei: semRotulo + digitoVerificadorImei(semRotulo), completado: true };
    }
    if (semRotulo.length < 14) return { tipo: 'incompleto', digitos: semRotulo };
    return { tipo: 'serial', numeroSerie: semRotulo };
  }

  let serial = semRotulo.toUpperCase().replace(/[^A-Z0-9]/g, '');
  // Código de barras do serial na caixa da Apple: "S" + serial de 10 ou 12 caracteres.
  if (/^S[A-Z0-9]{10}$|^S[A-Z0-9]{12}$/.test(serial)) serial = serial.slice(1);
  return serial ? { tipo: 'serial', numeroSerie: serial } : { tipo: 'vazio' };
}

// ── Modelo ──────────────────────────────────────────────────────────────────

/** Lançamentos posteriores à tabela de recompra (upgradeEngine), com as capacidades vendidas. */
const CAPACIDADES_LANCAMENTOS_RECENTES: Record<string, string[]> = {
  'iPhone 16e': ['128GB', '256GB', '512GB'],
  'iPhone 17': ['256GB', '512GB'],
  'iPhone Air': ['256GB', '512GB', '1TB'],
  'iPhone 17 Pro': ['256GB', '512GB', '1TB'],
  'iPhone 17 Pro Max': ['256GB', '512GB', '1TB', '2TB'],
};

export const CAPACIDADES_PADRAO = ['64GB', '128GB', '256GB', '512GB', '1TB', '2TB'];

function ordemCapacidade(capacidade: string): number {
  const n = parseFloat(capacidade);
  return /TB$/i.test(capacidade) ? n * 1024 : n;
}

export const CAPACIDADES_POR_MODELO: Record<string, string[]> = (() => {
  const saida: Record<string, string[]> = {};
  for (const [modelo, precos] of Object.entries(TABELA_BASE_UPGRADE_PADRAO)) {
    saida[modelo] = Object.keys(precos).sort((a, b) => ordemCapacidade(a) - ordemCapacidade(b));
  }
  return { ...saida, ...CAPACIDADES_LANCAMENTOS_RECENTES };
})();

/**
 * Chave de comparação de modelo: "Apple iPhone 13 Pro Max", "iphone 13 promax"
 * e "13pm" viram "13 promax".
 */
export function chaveModelo(modelo: string | null | undefined): string {
  return canonizar(String(modelo || ''))
    .replace(/^(?:apple\s+)?(?:iphone\s+)?/, '')
    .trim();
}

const CATALOGO_POR_CHAVE = new Map(Object.keys(CAPACIDADES_POR_MODELO).map((m) => [chaveModelo(m), m]));

export function modeloDoCatalogo(modelo: string | null | undefined): string | null {
  const chave = chaveModelo(modelo);
  return chave ? CATALOGO_POR_CHAVE.get(chave) ?? null : null;
}

const GRAFIAS: Array<[RegExp, string]> = [
  [/\biphone\b/gi, 'iPhone'],
  [/\bipad\b/gi, 'iPad'],
  [/\bairpods\b/gi, 'AirPods'],
  [/\bmacbook\b/gi, 'MacBook'],
  [/\bimac\b/gi, 'iMac'],
  [/\bpromax\b/gi, 'Pro Max'],
  [/\bpro\s*max\b/gi, 'Pro Max'],
  [/\bpro\b/gi, 'Pro'],
  [/\bplus\b/gi, 'Plus'],
  [/\bmini\b/gi, 'Mini'],
  [/\bmax\b/gi, 'Max'],
  [/\bultra\b/gi, 'Ultra'],
  [/\bair\b/gi, 'Air'],
  [/\bse\b/gi, 'SE'],
  [/\bxs\b/gi, 'XS'],
  [/\bxr\b/gi, 'XR'],
  [/\bfe\b/gi, 'FE'],
  [/\b5g\b/gi, '5G'],
  [/\bgalaxy\b/gi, 'Galaxy'],
  [/\bredmi\b/gi, 'Redmi'],
  [/\bnote\b/gi, 'Note'],
  [/\bpoco\b/gi, 'Poco'],
  [/\bmoto\b/gi, 'Moto'],
  [/\bpixel\b/gi, 'Pixel'],
];

/** Grafia padronizada: "iphone 13 pro max" -> "iPhone 13 Pro Max", "galaxy s23" -> "Galaxy S23". */
export function normalizarModelo(texto: string | null | undefined): string {
  const limpo = String(texto || '').trim().replace(/\s+/g, ' ');
  if (!limpo || /^n\/?a$/i.test(limpo)) return '';

  const doCatalogo = modeloDoCatalogo(limpo);
  if (doCatalogo) return doCatalogo;

  let t = limpo
    .replace(/(\d+)\s*pm\b/gi, '$1 Pro Max')
    .replace(/(\d+)\s*promax\b/gi, '$1 Pro Max')
    .replace(/(\d+)(pro|plus|mini)\b/gi, '$1 $2');
  for (const [de, para] of GRAFIAS) t = t.replace(de, para);
  // Letra + número em maiúscula: s23 -> S23, g84 -> G84.
  t = t.replace(/\b([a-z])(\d{1,3}[a-z]?)\b/g, (_m, letra: string, resto: string) => letra.toUpperCase() + resto);
  // Palavra toda em minúscula ganha inicial maiúscula: zenfone -> Zenfone.
  t = t.replace(/\b([a-z])([a-z]{2,})\b/g, (_m, inicial: string, resto: string) => inicial.toUpperCase() + resto);
  return t;
}

const modeloInvalido = (modelo: string | null | undefined) => !normalizarModelo(modelo);

export interface OpcaoModelo {
  modelo: string;
  chave: string;
  /** Peso de uso na loja: cadastros dos últimos 90 dias valem 3, os mais antigos 1. */
  usoNaLoja: number;
}

const NOVENTA_DIAS_MS = 90 * 24 * 60 * 60 * 1000;

function instanteCadastro(a: AparelhoBase): number {
  const bruto = a.created_at ?? a.dataCadastro ?? null;
  const t = bruto ? Date.parse(String(bruto)) : NaN;
  return Number.isFinite(t) ? t : 0;
}

/** Mais recentes primeiro; sem data, vale a ordem de chegada (o último é o mais novo). */
function ordenarPorRecencia<T extends AparelhoBase>(lista: T[]): T[] {
  return lista
    .map((item, indice) => ({ item, indice, t: instanteCadastro(item) }))
    .sort((a, b) => b.t - a.t || b.indice - a.indice)
    .map((x) => x.item);
}

/** Catálogo de iPhones + modelos que a loja já cadastrou, os mais usados primeiro. */
export function listarOpcoesModelo(aparelhos: AparelhoBase[], agora: Date = new Date()): OpcaoModelo[] {
  const porChave = new Map<string, OpcaoModelo>();
  for (const modelo of Object.keys(CAPACIDADES_POR_MODELO)) {
    const chave = chaveModelo(modelo);
    porChave.set(chave, { modelo, chave, usoNaLoja: 0 });
  }

  for (const a of aparelhos) {
    const exibicao = normalizarModelo(a.modelo);
    const chave = chaveModelo(exibicao);
    if (!exibicao || !chave || foiDesfeito(a)) continue;
    const peso = agora.getTime() - instanteCadastro(a) <= NOVENTA_DIAS_MS ? 3 : 1;
    const atual = porChave.get(chave);
    if (atual) atual.usoNaLoja += peso;
    else porChave.set(chave, { modelo: exibicao, chave, usoNaLoja: peso });
  }

  return [...porChave.values()].sort(
    (x, y) =>
      y.usoNaLoja - x.usoNaLoja ||
      getModeloOrdemCronologica(y.modelo) - getModeloOrdemCronologica(x.modelo) ||
      x.modelo.localeCompare(y.modelo, 'pt-BR')
  );
}

/** Busca tolerante: "15pm" acha "iPhone 15 Pro Max"; "iphone 1" já lista os iPhone 1x. */
export function buscarModelos(termo: string, opcoes: OpcaoModelo[], limite = 8): OpcaoModelo[] {
  const busca = normalizar(termo);
  if (!busca) return opcoes.slice(0, limite);

  const chaveBusca = chaveModelo(termo);
  return opcoes
    .map((opcao) => {
      // O modelo exato digitado ("iPhone 13") vem antes do parecido mais vendido ("13 Pro Max").
      if (chaveBusca && opcao.chave === chaveBusca) return { opcao, score: 1.1 };
      let score = pontuar(termo, opcao.modelo);
      const nome = normalizar(opcao.modelo);
      if (nome.startsWith(busca) || nome.replace(/^iphone /, '').startsWith(busca)) score = Math.max(score, 0.95);
      else if (nome.includes(busca)) score = Math.max(score, 0.8);
      return { opcao, score };
    })
    .filter((x) => x.score >= 0.5)
    .sort(
      (a, b) =>
        b.score - a.score || b.opcao.usoNaLoja - a.opcao.usoNaLoja || a.opcao.modelo.length - b.opcao.modelo.length
    )
    .slice(0, limite)
    .map((x) => x.opcao);
}

// ── Marca ───────────────────────────────────────────────────────────────────

const MARCA_POR_MODELO: Array<[RegExp, string]> = [
  [/\b(iphone|ipad|airpods|apple\s*watch|macbook|imac|homepod)\b/i, 'Apple'],
  [/\b(galaxy|samsung)\b/i, 'Samsung'],
  [/\b(redmi|poco|xiaomi|xioami)\b/i, 'Xiaomi'],
  [/\b(moto|motorola|razr)\b/i, 'Motorola'],
  [/\bpixel\b/i, 'Google'],
  [/\brealme\b/i, 'Realme'],
  [/\binfinix\b/i, 'Infinix'],
  [/\b(zenfone|asus)\b/i, 'Asus'],
];

/** Unifica as grafias que já sujaram o banco: 'apple', 'iPhone', 'xioami'... */
export function normalizarMarca(marca: string | null | undefined): string {
  const bruto = String(marca || '').trim().replace(/\s+/g, ' ');
  const n = normalizar(bruto);
  if (!n) return '';
  if (n === 'apple' || n === 'iphone') return 'Apple';
  if (['xiaomi', 'xioami', 'xiaome', 'shaomi', 'redmi'].includes(n)) return 'Xiaomi';
  if (['samsung', 'sansung', 'samsug'].includes(n)) return 'Samsung';
  if (n === 'motorola' || n === 'moto') return 'Motorola';
  if (n === 'lg') return 'LG';
  return bruto.charAt(0).toUpperCase() + bruto.slice(1);
}

export function derivarMarca(
  modelo: string,
  aparelhos: AparelhoBase[]
): { marca: string; origem: 'modelo' | 'loja' | 'nenhuma' } {
  if (modeloDoCatalogo(modelo)) return { marca: 'Apple', origem: 'modelo' };
  for (const [regra, marca] of MARCA_POR_MODELO) {
    if (regra.test(modelo)) return { marca, origem: 'modelo' };
  }

  const contagem = new Map<string, number>();
  for (const a of aparelhos) {
    const marca = normalizarMarca(a.marca);
    if (marca) contagem.set(marca, (contagem.get(marca) || 0) + 1);
  }
  const maisUsada = [...contagem.entries()].sort((a, b) => b[1] - a[1])[0];
  return maisUsada ? { marca: maisUsada[0], origem: 'loja' } : { marca: '', origem: 'nenhuma' };
}

// ── Capacidade e cor ────────────────────────────────────────────────────────

/** '128gb' -> '128GB', '1000GB' -> '1TB'. 'N/A' e vazio viram null (nunca gravar 'N/A'). */
export function normalizarCapacidade(valor: string | null | undefined): string | null {
  const original = String(valor ?? '').trim();
  const t = original.toUpperCase().replace(/\s+/g, '');
  if (!t || t === 'N/A' || t === 'NA' || t === '-') return null;

  const m = t.match(/^(\d+(?:[.,]\d+)?)(GB|G|TB|T)?$/);
  if (!m) return original;

  let numero = Number(m[1].replace(',', '.'));
  let unidade = m[2] ? (m[2].startsWith('T') ? 'TB' : 'GB') : numero <= 2 ? 'TB' : 'GB';
  if (unidade === 'GB' && (numero === 1000 || numero === 1024)) [numero, unidade] = [1, 'TB'];
  if (unidade === 'GB' && (numero === 2000 || numero === 2048)) [numero, unidade] = [2, 'TB'];
  return `${numero}${unidade}`;
}

export function capacidadesDoModelo(modelo: string): string[] {
  const doCatalogo = modeloDoCatalogo(modelo);
  return doCatalogo ? CAPACIDADES_POR_MODELO[doCatalogo] : CAPACIDADES_PADRAO;
}

/** Capacidade mais cadastrada para o modelo na loja, entre as que o modelo tem. */
export function capacidadeMaisComum(modelo: string, aparelhos: AparelhoBase[]): string | null {
  const chave = chaveModelo(modelo);
  if (!chave) return null;
  const validas = new Set(capacidadesDoModelo(modelo));
  const contagem = new Map<string, number>();
  for (const a of aparelhos) {
    if (chaveModelo(a.modelo) !== chave) continue;
    const cap = normalizarCapacidade(a.capacidade);
    if (cap && validas.has(cap)) contagem.set(cap, (contagem.get(cap) || 0) + 1);
  }
  return [...contagem.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

const CORES_EM_INGLES: Record<string, string> = {
  black: 'Preto',
  white: 'Branco',
  blue: 'Azul',
  red: 'Vermelho',
  green: 'Verde',
  purple: 'Roxo',
  pink: 'Rosa',
  gold: 'Dourado',
  silver: 'Prata',
  yellow: 'Amarelo',
  midnight: 'Meia-noite',
  starlight: 'Estelar',
  graphite: 'Grafite',
  'space gray': 'Cinza-espacial',
  'space grey': 'Cinza-espacial',
  'natural titanium': 'Titânio Natural',
  'black titanium': 'Titânio Preto',
  'white titanium': 'Titânio Branco',
  'blue titanium': 'Titânio Azul',
  'desert titanium': 'Titânio Deserto',
};

/** Reaproveita a grafia que a loja já usa ("grafite" -> "Grafite") e traduz as cores em inglês. */
export function normalizarCor(texto: string | null | undefined, coresConhecidas: string[] = []): string | null {
  const limpo = String(texto || '').trim().replace(/\s+/g, ' ');
  if (!limpo || /^n\/?a$/i.test(limpo)) return null;
  const chave = normalizar(limpo);
  const conhecida = coresConhecidas.find((c) => normalizar(c) === chave);
  if (conhecida) return conhecida;
  if (CORES_EM_INGLES[chave]) return CORES_EM_INGLES[chave];
  return limpo.charAt(0).toUpperCase() + limpo.slice(1);
}

/** Cores já cadastradas para o modelo (ou, sem histórico dele, as mais usadas na loja). */
export function coresSugeridas(modelo: string, aparelhos: AparelhoBase[], limite = 6): string[] {
  const chave = chaveModelo(modelo);
  const contar = (lista: AparelhoBase[]) => {
    const contagem = new Map<string, { cor: string; n: number }>();
    for (const a of lista) {
      const cor = normalizarCor(a.cor);
      if (!cor) continue;
      const k = normalizar(cor);
      const atual = contagem.get(k);
      if (atual) atual.n += 1;
      else contagem.set(k, { cor, n: 1 });
    }
    return [...contagem.values()].sort((a, b) => b.n - a.n).map((x) => x.cor);
  };

  const doModelo = chave ? contar(aparelhos.filter((a) => chaveModelo(a.modelo) === chave)) : [];
  return (doModelo.length ? doModelo : contar(aparelhos)).slice(0, limite);
}

// ── Sugestões a partir do histórico da loja ─────────────────────────────────

export interface SugestaoTac {
  modelo: string;
  capacidade: string | null;
  /** Quantos aparelhos da loja com o mesmo TAC embasam a sugestão. */
  base: number;
}

/**
 * Os 8 primeiros dígitos do IMEI (TAC) identificam o modelo. Sem base externa,
 * usamos os aparelhos que a própria loja já cadastrou, inclusive os vendidos.
 * Só sugere quando todos concordam.
 */
export function sugerirPorTac(imei: string, aparelhos: AparelhoBase[]): SugestaoTac | null {
  if (!/^\d{15}$/.test(imei)) return null;
  const tac = imei.slice(0, 8);

  const mesmoTac = aparelhos.filter((a) => {
    const digitos = String(a.imei || '').replace(/\D/g, '');
    return digitos.length === 15 && digitos.startsWith(tac) && !modeloInvalido(a.modelo) && !foiDesfeito(a);
  });
  if (mesmoTac.length === 0) return null;
  if (new Set(mesmoTac.map((a) => chaveModelo(a.modelo))).size !== 1) return null;

  const modelo = normalizarModelo(ordenarPorRecencia(mesmoTac)[0].modelo);
  const capacidades = new Set(mesmoTac.map((a) => normalizarCapacidade(a.capacidade)));
  const unanime = mesmoTac.length >= 2 && capacidades.size === 1 ? [...capacidades][0] : null;
  return { modelo, capacidade: unanime ?? null, base: mesmoTac.length };
}

export interface SugestaoPreco {
  valor: number;
  base: number;
  minimo: number;
  maximo: number;
  /** 'sem_condicao' quando não havia aparelho da mesma condição e a base usou as outras. */
  criterio: 'exato' | 'sem_condicao';
}

function mediana(valores: number[]): number {
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 ? ordenados[meio] : (ordenados[meio - 1] + ordenados[meio]) / 2;
}

/** Mediana dos últimos aparelhos iguais (modelo + capacidade + condição), ativos e vendidos. */
export function sugerirPreco(
  alvo: { modelo: string; capacidade: string | null; condicao: string },
  aparelhos: AparelhoBase[],
  limite = 5
): SugestaoPreco | null {
  const chave = chaveModelo(alvo.modelo);
  if (!chave) return null;
  const capacidade = normalizarCapacidade(alvo.capacidade);

  const iguais = aparelhos.filter(
    (a) =>
      Number(a.preco) > 0 &&
      !foiDesfeito(a) &&
      chaveModelo(a.modelo) === chave &&
      normalizarCapacidade(a.capacidade) === capacidade
  );
  const mesmaCondicao = iguais.filter((a) => a.condicao === alvo.condicao);
  const [lista, criterio]: [AparelhoBase[], SugestaoPreco['criterio']] = mesmaCondicao.length
    ? [mesmaCondicao, 'exato']
    : [iguais, 'sem_condicao'];
  if (lista.length === 0) return null;

  const precos = ordenarPorRecencia(lista)
    .slice(0, limite)
    .map((a) => Number(a.preco));
  return {
    valor: Math.round(mediana(precos) * 100) / 100,
    base: precos.length,
    minimo: Math.min(...precos),
    maximo: Math.max(...precos),
    criterio,
  };
}

// ── Duplicidade ─────────────────────────────────────────────────────────────

export type Duplicidade<T extends AparelhoBase = AparelhoBase> =
  | { tipo: 'nenhuma' }
  | { tipo: 'no_carrinho' | 'manutencao' | 'em_estoque' | 'fora_do_estoque'; aparelho: T };

const compactar = (valor: unknown) =>
  String(valor ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/**
 * Procura o IMEI/serial nos aparelhos já carregados. A ordem de gravidade é:
 * já no carrinho > em manutenção > no estoque > já saiu do estoque.
 */
export function procurarDuplicado<T extends AparelhoBase>(
  identificadores: { imei?: string | null; numeroSerie?: string | null },
  aparelhos: T[],
  opcoes: { carrinhoIds?: string[]; emManutencao?: (aparelho: T) => boolean } = {}
): Duplicidade<T> {
  const alvos = [identificadores.imei, identificadores.numeroSerie].map(compactar).filter(Boolean);
  if (alvos.length === 0) return { tipo: 'nenhuma' };

  const iguais = aparelhos.filter(
    (a) =>
      // Desfeito só deixa de contar enquanto está fora do estoque (pode ter sido restaurado).
      !(foiDesfeito(a) && !estaNoEstoque(a as unknown as EstadoCicloAparelho)) &&
      [a.imei, a.numeroSerie].some((v) => alvos.includes(compactar(v)))
  );
  if (iguais.length === 0) return { tipo: 'nenhuma' };

  const carrinho = new Set(opcoes.carrinhoIds || []);
  const noCarrinho = iguais.find((a) => carrinho.has(a.id));
  if (noCarrinho) return { tipo: 'no_carrinho', aparelho: noCarrinho };

  const emManutencao = opcoes.emManutencao ?? ((a: T) => a.status === 'manutencao');
  const noEstoque = ordenarPorRecencia(iguais.filter((a) => estaNoEstoque(a as unknown as EstadoCicloAparelho)));
  const manutencao = noEstoque.find(emManutencao);
  if (manutencao) return { tipo: 'manutencao', aparelho: manutencao };
  if (noEstoque.length) return { tipo: 'em_estoque', aparelho: noEstoque[0] };

  return { tipo: 'fora_do_estoque', aparelho: ordenarPorRecencia(iguais)[0] };
}

// ── Margem ──────────────────────────────────────────────────────────────────

export interface Margem {
  lucro: number;
  /** Margem sobre o preço de venda, com 1 casa. */
  percentual: number;
  prejuizo: boolean;
  abaixoDoMinimo: boolean;
}

export function calcularMargem(custo: number | null, preco: number, minimoPercentual = 8): Margem | null {
  if (custo === null || !(preco > 0)) return null;
  const lucro = Math.round((preco - custo) * 100) / 100;
  const percentual = Math.round((lucro / preco) * 1000) / 10;
  return { lucro, percentual, prejuizo: lucro < 0, abaixoDoMinimo: lucro >= 0 && percentual < minimoPercentual };
}

// ── Formulário, validação e payload ─────────────────────────────────────────

export type CondicaoRapida = 'novo' | 'seminovo' | 'usado' | 'danificado';

export const CONDICOES_RAPIDAS: Array<{ valor: CondicaoRapida; rotulo: string; atalho: string }> = [
  { valor: 'novo', rotulo: 'Novo (lacrado)', atalho: 'n' },
  { valor: 'seminovo', rotulo: 'Seminovo', atalho: 's' },
  { valor: 'usado', rotulo: 'Usado', atalho: 'u' },
  { valor: 'danificado', rotulo: 'Danificado', atalho: 'd' },
];

export const ACESSORIOS_RAPIDOS = ['Caixa', 'Cabo', 'Fonte', 'Capinha', 'Película'];

export interface FormCadastroRapido {
  /** Texto do campo IMEI/Série, como foi bipado ou digitado. */
  identificador: string;
  semImei: boolean;
  /** A pessoa confirmou que o número do campo é serial/código, não IMEI. */
  identificadorEhSerial: boolean;
  /** Nº de série informado em "Mais detalhes", além do IMEI. */
  numeroSerie: string;
  modelo: string;
  marca: string;
  capacidade: string | null;
  condicao: CondicaoRapida;
  bateria: string;
  cor: string;
  custo: number | null;
  preco: number;
  precoAtacado: number | null;
  fornecedor: string;
  acessorios: string[];
  observacoes: string;
}

export function formularioVazio(parcial: Partial<FormCadastroRapido> = {}): FormCadastroRapido {
  return {
    identificador: '',
    semImei: false,
    identificadorEhSerial: false,
    numeroSerie: '',
    modelo: '',
    marca: '',
    capacidade: null,
    condicao: 'seminovo',
    bateria: '',
    cor: '',
    custo: null,
    preco: 0,
    precoAtacado: null,
    fornecedor: '',
    acessorios: [],
    observacoes: '',
    ...parcial,
  };
}

export function resolverIdentificadores(form: FormCadastroRapido): {
  imei: string | null;
  numeroSerie: string | null;
  leitura: LeituraIdentificador;
} {
  const serialExtra = form.numeroSerie.trim().toUpperCase() || null;
  if (form.semImei) return { imei: null, numeroSerie: serialExtra, leitura: { tipo: 'vazio' } };

  if (form.identificadorEhSerial) {
    const serial = form.identificador.trim().toUpperCase().replace(/\s+/g, '');
    return {
      imei: null,
      numeroSerie: serial || serialExtra,
      leitura: serial ? { tipo: 'serial', numeroSerie: serial } : { tipo: 'vazio' },
    };
  }

  const leitura = interpretarIdentificador(form.identificador);
  if (leitura.tipo === 'imei') return { imei: leitura.imei, numeroSerie: serialExtra, leitura };
  if (leitura.tipo === 'serial') return { imei: null, numeroSerie: leitura.numeroSerie, leitura };
  return { imei: null, numeroSerie: serialExtra, leitura };
}

export function lerBateria(texto: string): number | null {
  const digitos = String(texto || '').replace(/\D/g, '');
  if (!digitos) return null;
  const n = Number(digitos);
  return Number.isFinite(n) ? n : null;
}

export type CampoCadastro =
  | 'identificador'
  | 'modelo'
  | 'marca'
  | 'capacidade'
  | 'condicao'
  | 'preco'
  | 'custo'
  | 'bateria'
  | 'precoAtacado';

/** Erros por campo, na ordem em que o formulário deve levar o foco. Vazio = pode salvar. */
export function validarCadastroRapido(
  form: FormCadastroRapido,
  opcoes: { exigeCapacidade?: boolean } = {}
): Partial<Record<CampoCadastro, string>> {
  const erros: Partial<Record<CampoCadastro, string>> = {};

  const { leitura } = resolverIdentificadores(form);
  if (!form.semImei) {
    if (leitura.tipo === 'vazio') erros.identificador = 'Bipe ou digite o IMEI, ou marque "Sem IMEI agora".';
    else if (leitura.tipo === 'incompleto')
      erros.identificador = `IMEI incompleto: ${leitura.digitos.length} de 15 dígitos.`;
    else if (leitura.tipo === 'imei_invalido')
      erros.identificador = 'IMEI inválido: o dígito verificador não confere. Confira o número ou marque que é serial.';
  }

  if (normalizarModelo(form.modelo).length < 2) erros.modelo = 'Informe o modelo.';
  if (!normalizarMarca(form.marca)) erros.marca = 'Informe a marca.';
  if ((opcoes.exigeCapacidade ?? true) && !normalizarCapacidade(form.capacidade)) {
    erros.capacidade = 'Escolha a capacidade.';
  }
  if (!CONDICOES_RAPIDAS.some((c) => c.valor === form.condicao)) erros.condicao = 'Escolha a condição.';
  if (!(form.preco > 0)) erros.preco = 'Informe o preço de venda.';
  if (form.custo !== null && form.custo < 0) erros.custo = 'O custo não pode ser negativo.';
  if (form.precoAtacado !== null && form.precoAtacado < 0) erros.precoAtacado = 'O preço de atacado não pode ser negativo.';

  if (form.condicao !== 'novo' && form.bateria.trim()) {
    const bateria = lerBateria(form.bateria);
    if (bateria === null || bateria < 1 || bateria > 100) erros.bateria = 'A bateria vai de 1 a 100%.';
  }

  return erros;
}

export interface PayloadCadastroRapido {
  categoria: 'aparelho';
  marca: string;
  modelo: string;
  capacidade: string | null;
  cor: string | null;
  condicao: CondicaoRapida;
  saude_bateria: string | null;
  imei: string | null;
  numeroSerie: string | null;
  custo: number;
  preco: number;
  precoAtacado: number;
  preco_atacado: number;
  codigo: string;
  status: 'disponivel';
  ativo: true;
  quantidade: 1;
  acessorios: string | null;
  observacoes: string;
}

export interface ContextoPayload {
  usuarioNome?: string | null;
  podeVerFinanceiro: boolean;
  agora?: Date;
  /** Código de 8 dígitos da etiqueta. Gere com gerarCodigoEtiqueta. */
  codigo: string;
  /** Margem somada ao custo quando o preço de atacado não foi informado. */
  margemAtacado?: number;
  coresConhecidas?: string[];
  /** Registro anterior do mesmo IMEI que já saiu do estoque (recompra). */
  recompraDe?: { id: string } | null;
}

const arredondar = (valor: number) => Math.round(valor * 100) / 100;

function formatarDataHora(data: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(data)
    .replace(', ', ' às ');
}

export function gerarCodigoEtiqueta(
  aparelhos: Array<{ codigo?: string | null }>,
  aleatorio: () => number = Math.random
): string {
  const usados = new Set(aparelhos.map((a) => String(a.codigo || '').replace(/\D/g, '')).filter(Boolean));
  let codigo = '';
  for (let tentativa = 0; tentativa < 20; tentativa += 1) {
    codigo = String(10000000 + Math.floor(aleatorio() * 90000000));
    if (!usados.has(codigo)) break;
  }
  return codigo;
}

export function montarPayloadCadastroRapido(form: FormCadastroRapido, ctx: ContextoPayload): PayloadCadastroRapido {
  const { imei, numeroSerie } = resolverIdentificadores(form);
  const modelo = normalizarModelo(form.modelo);
  const custoInformado = ctx.podeVerFinanceiro && form.custo !== null;
  const custo = custoInformado ? arredondar(form.custo as number) : 0;

  const precoAtacado =
    form.precoAtacado !== null && form.precoAtacado > 0
      ? arredondar(form.precoAtacado)
      : custoInformado && custo > 0
        ? arredondar(custo + (ctx.margemAtacado ?? 150))
        : 0;

  const bateria = lerBateria(form.bateria);
  const saudeBateria =
    form.condicao === 'novo' ? '100%' : bateria !== null && bateria >= 1 && bateria <= 100 ? `${bateria}%` : null;

  const observacoes = [
    `Cadastrado no PDV por ${ctx.usuarioNome?.trim() || 'usuário'} em ${formatarDataHora(ctx.agora ?? new Date())}`,
    form.semImei ? MARCADORES.imeiPendente : '',
    custoInformado ? '' : MARCADORES.custoPendente,
    form.fornecedor.trim() ? `Fornecedor: ${form.fornecedor.trim()}` : '',
    ctx.recompraDe ? `Recompra de aparelho que já passou pela loja (registro ${ctx.recompraDe.id})` : '',
    form.observacoes.trim(),
  ]
    .filter(Boolean)
    .join(' | ');

  return {
    categoria: 'aparelho',
    marca: normalizarMarca(form.marca),
    modelo,
    capacidade: normalizarCapacidade(form.capacidade),
    cor: normalizarCor(form.cor, ctx.coresConhecidas),
    condicao: form.condicao,
    saude_bateria: saudeBateria,
    imei,
    numeroSerie,
    custo,
    preco: arredondar(form.preco),
    precoAtacado,
    preco_atacado: precoAtacado,
    codigo: ctx.codigo,
    status: 'disponivel',
    ativo: true,
    quantidade: 1,
    acessorios: form.acessorios.length ? form.acessorios.join(', ') : null,
    observacoes,
  };
}

// ── Gravação ────────────────────────────────────────────────────────────────

export interface RegistroExistente {
  id: string;
  modelo?: string | null;
  ativo?: boolean | null;
  status?: string | null;
  condicao?: string | null;
  observacoes?: string | null;
}

export type CodigoErroCadastro = 'duplicado_em_estoque' | 'duplicado_fora_do_estoque' | 'falha_consulta' | 'falha_cadastro';

export class ErroCadastroRapido extends Error {
  readonly codigo: CodigoErroCadastro;
  readonly existente?: RegistroExistente;

  constructor(codigo: CodigoErroCadastro, mensagem: string, existente?: RegistroExistente) {
    super(mensagem);
    this.name = 'ErroCadastroRapido';
    this.codigo = codigo;
    this.existente = existente;
  }
}

function mensagemDeErro(erro: unknown): string {
  if (erro instanceof Error) return erro.message;
  if (erro && typeof erro === 'object' && 'message' in erro) return String((erro as { message: unknown }).message);
  return String(erro || 'Erro desconhecido');
}

/**
 * Confere no banco, logo antes do insert, se o IMEI/serial já existe na loja.
 * A checagem local usa a lista carregada na tela, que pode estar velha.
 */
export async function buscarDuplicadosNoServidor(
  supabase: SupabaseClient,
  lojaId: string,
  identificadores: { imei: string | null; numeroSerie: string | null }
): Promise<RegistroExistente[]> {
  const filtros: Array<['imei' | 'numeroSerie', string]> = [];
  if (identificadores.imei) filtros.push(['imei', identificadores.imei]);
  if (identificadores.numeroSerie) filtros.push(['numeroSerie', identificadores.numeroSerie]);

  const encontrados = new Map<string, RegistroExistente>();
  for (const [coluna, valor] of filtros) {
    const { data, error } = await supabase
      .from('aparelhos')
      .select('id, modelo, ativo, status, condicao, observacoes')
      .eq('loja_id', lojaId)
      .eq(coluna, valor)
      .limit(10);
    if (error) {
      throw new ErroCadastroRapido('falha_consulta', `Não foi possível conferir se o aparelho já existe: ${error.message}`);
    }
    for (const registro of (data || []) as RegistroExistente[]) {
      if (!foiDesfeito(registro) || estaNoEstoque(registro as unknown as EstadoCicloAparelho)) {
        encontrados.set(registro.id, registro);
      }
    }
  }
  return [...encontrados.values()];
}

export interface LogCadastroRapido {
  loja_id: string | null;
  usuario_id?: string | null;
  usuario_email?: string | null;
  usuario_nome?: string | null;
  tipo_evento: 'estoque';
  acao: string;
  detalhes?: string | null;
  valor_novo?: unknown;
}

export interface DependenciasCadastroRapido<T extends AparelhoBase> {
  lojaId: string;
  usuarioId?: string | null;
  usuarioNome?: string | null;
  usuarioEmail?: string | null;
  /** Insere o aparelho. Deve lançar erro com a mensagem real do banco em caso de falha. */
  criarAparelho: (payload: PayloadCadastroRapido) => Promise<T>;
  registrarLog?: (params: LogCadastroRapido) => Promise<void>;
}

export interface ResultadoCadastroRapido<T> {
  aparelho: T;
  auditoriaRegistrada: boolean;
  erroAuditoria?: string;
}

export async function cadastrarAparelhoRapido<T extends AparelhoBase>(
  supabase: SupabaseClient,
  payload: PayloadCadastroRapido,
  deps: DependenciasCadastroRapido<T>,
  opcoes: { aceitarRecompra?: boolean } = {}
): Promise<ResultadoCadastroRapido<T>> {
  const existentes = await buscarDuplicadosNoServidor(supabase, deps.lojaId, payload);
  const identificador = payload.imei ? 'IMEI' : 'número de série';

  const noEstoque = existentes.find((e) => estaNoEstoque(e as unknown as EstadoCicloAparelho));
  if (noEstoque) {
    throw new ErroCadastroRapido(
      'duplicado_em_estoque',
      `Este ${identificador} já está no estoque${noEstoque.modelo ? ` (${noEstoque.modelo})` : ''}.`,
      noEstoque
    );
  }
  if (existentes.length && !opcoes.aceitarRecompra) {
    throw new ErroCadastroRapido(
      'duplicado_fora_do_estoque',
      `Este ${identificador} já passou pela loja e saiu do estoque. Confirme que é uma recompra para cadastrar de novo.`,
      existentes[0]
    );
  }

  let aparelho: T;
  try {
    aparelho = await deps.criarAparelho(payload);
  } catch (erro) {
    throw new ErroCadastroRapido('falha_cadastro', mensagemDeErro(erro));
  }

  // O aparelho já existe a partir daqui: falha de auditoria não pode virar
  // "erro no cadastro", senão a pessoa tenta de novo e duplica o aparelho.
  let entrada: Pick<ResultadoMudancaEstoque, 'auditoriaRegistrada' | 'erroAuditoria'>;
  try {
    entrada = await registrarEntradaEstoque(supabase, {
      aparelhos: [aparelho as unknown as EstadoCicloAparelho],
      origem: 'manual',
      lojaId: deps.lojaId,
      usuarioId: deps.usuarioId,
      usuarioNome: deps.usuarioNome,
      observacao: 'Cadastro rápido no PDV',
    });
  } catch (erro) {
    entrada = { auditoriaRegistrada: false, erroAuditoria: mensagemDeErro(erro) };
  }

  await deps.registrarLog?.({
    loja_id: deps.lojaId,
    usuario_id: deps.usuarioId ?? null,
    usuario_email: deps.usuarioEmail ?? null,
    usuario_nome: deps.usuarioNome ?? null,
    tipo_evento: 'estoque',
    acao: 'Aparelho cadastrado pelo PDV',
    detalhes: [
      [payload.marca, payload.modelo, payload.capacidade, payload.cor].filter(Boolean).join(' '),
      payload.imei ? `IMEI ${payload.imei}` : payload.numeroSerie ? `Série ${payload.numeroSerie}` : 'IMEI pendente',
      `Preço R$ ${payload.preco.toFixed(2)}`,
      opcoes.aceitarRecompra ? 'Recompra' : '',
    ]
      .filter(Boolean)
      .join(' · '),
    valor_novo: {
      id: aparelho.id,
      imei: payload.imei,
      numeroSerie: payload.numeroSerie,
      custo: payload.custo,
      preco: payload.preco,
      condicao: payload.condicao,
    },
  });

  return { aparelho, ...entrada };
}

/**
 * Desfaz um cadastro lançado por engano: tira do estoque como baixa auditada
 * (DELETE apagaria a trilha). Se o aparelho já foi vendido, não mexe.
 */
export async function desfazerCadastroRapido(
  supabase: SupabaseClient,
  aparelho: { id: string; observacoes?: string | null },
  ctx: { lojaId: string; usuarioId?: string | null; usuarioNome?: string | null }
): Promise<ResultadoMudancaEstoque> {
  const observacoes = [aparelho.observacoes, `${MARCADORES.cadastroDesfeito} (lançado por engano no PDV)`]
    .filter(Boolean)
    .join(' | ');

  return aplicarMudancaEstoque(supabase, {
    ids: [aparelho.id],
    patch: { ...patchSaida('baixado', 'baixa_manual'), observacoes },
    tipo: 'baixa',
    origem: 'manual',
    lojaId: ctx.lojaId,
    usuarioId: ctx.usuarioId,
    usuarioNome: ctx.usuarioNome,
    observacao: 'Cadastro rápido desfeito no PDV antes da venda.',
    camposAuditados: ['observacoes'],
    filtroElegivel: (estado) => estaNoEstoque(estado),
  });
}
