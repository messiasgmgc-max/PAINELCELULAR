import type { Aparelho } from '@/lib/db/types';
import { isAparelhoEmManutencao } from '@/lib/manutencao';
import { formatarSaudeBateria } from '@/lib/utils';

export type FiltroRapidoEstoque =
  | 'todos'
  | 'novos'
  | 'seminovos'
  | 'sem_preco'
  | 'bateria_alta'
  | 'parados_30d';

export type OrdenacaoEstoque =
  | 'recentes'
  | 'modelo_az'
  | 'menor_preco'
  | 'maior_preco'
  | 'maior_bateria'
  | 'mais_antigos';

export type NivelBateria = 'otima' | 'boa' | 'atencao';

export interface ResumoEstoque {
  totalRegistros: number;
  totalUnidades: number;
  modelosUnicos: number;
  novos: number;
  seminovos: number;
  usados: number;
  emManutencao: number;
  naLoja: number;
  semPreco: number;
  bateriaAlta: number;
  parados30d: number;
  valorTotalVenda: number;
  valorTotalCusto: number;
  valorTotalAtacado: number;
}

export interface GrupoModeloEstoque {
  chave: string;
  titulo: string;
  itens: Aparelho[];
  totalUnidades: number;
  menorPreco: number | null;
  maiorPreco: number | null;
  semPrecoCount: number;
  emManutencaoCount: number;
  capacidades: string[];
}

export function obterNumeroSeguro(valor: unknown): number {
  if (typeof valor === 'number') {
    return Number.isFinite(valor) ? valor : 0;
  }
  if (valor === null || valor === undefined || valor === '') return 0;
  const texto = String(valor).trim();
  if (!texto) return 0;
  // Trata strings brasileiras (ex: "1.250,50") e decimais simples ("1250.50")
  const limpo = texto.replace(/[^\d,.-]/g, '');
  if (!limpo) return 0;
  const normalizado =
    limpo.includes(',') && limpo.includes('.')
      ? limpo.replace(/\./g, '').replace(',', '.')
      : limpo.replace(',', '.');
  const num = Number(normalizado);
  return Number.isFinite(num) ? num : 0;
}

export function obterPrecoVenda(aparelho: Aparelho): number {
  return Math.max(0, obterNumeroSeguro(aparelho.preco));
}

export function obterCustoAparelho(aparelho: Aparelho): number {
  return Math.max(0, obterNumeroSeguro(aparelho.custo));
}

export function obterPrecoAtacado(aparelho: Aparelho): number {
  const bruto =
    aparelho.precoAtacado ?? (aparelho as unknown as Record<string, unknown>).preco_atacado;
  return Math.max(0, obterNumeroSeguro(bruto));
}

export function obterQuantidadeAparelho(aparelho: Aparelho): number {
  const qtd = Math.floor(obterNumeroSeguro(aparelho.quantidade));
  return qtd > 0 ? qtd : 1;
}

export function aparelhoSemPreco(aparelho: Aparelho): boolean {
  return obterPrecoVenda(aparelho) <= 0;
}

export function obterPercentualBateria(aparelho: Aparelho): number | null {
  const formatada = formatarSaudeBateria(aparelho);
  if (!formatada) return null;
  const num = parseInt(formatada.replace(/\D/g, ''), 10);
  if (!Number.isFinite(num) || num <= 0 || num > 100) return null;
  return num;
}

export function classificarBateria(pct: number | null): NivelBateria | null {
  if (pct === null) return null;
  if (pct >= 90) return 'otima';
  if (pct >= 80) return 'boa';
  return 'atencao';
}

export function calcularDiasEmEstoque(
  aparelho: Aparelho,
  agora: Date = new Date()
): number | null {
  const extra = aparelho as unknown as Record<string, unknown>;
  const raw = aparelho.dataCadastro || (extra.created_at as string | undefined) || '';
  if (!raw) return null;
  const ts = Date.parse(raw);
  if (!Number.isFinite(ts)) return null;
  const diffMs = agora.getTime() - ts;
  if (diffMs < 0) return 0;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function chaveModeloNormalizada(aparelho: Aparelho): { chave: string; titulo: string } {
  const marca = String(aparelho.marca || '').trim();
  const modelo = String(aparelho.modelo || '').trim();

  let titulo = modelo || marca || 'Sem modelo';
  if (marca && modelo) {
    const modeloLower = modelo.toLowerCase();
    const marcaLower = marca.toLowerCase();
    // Evita "Apple iPhone 16 Pro" duplicar marca quando o modelo já é conhecido ou contém a marca
    if (!modeloLower.includes(marcaLower) && marcaLower !== 'apple') {
      titulo = `${marca} ${modelo}`.trim();
    }
  }

  const chave = titulo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

  return { chave: chave || 'sem-modelo', titulo };
}

export function calcularResumoEstoque(
  aparelhosAtivos: Aparelho[],
  agora: Date = new Date()
): ResumoEstoque {
  const modelos = new Set<string>();
  let totalUnidades = 0;
  let novos = 0;
  let seminovos = 0;
  let usados = 0;
  let emManutencao = 0;
  let semPreco = 0;
  let bateriaAlta = 0;
  let parados30d = 0;
  let valorTotalVenda = 0;
  let valorTotalCusto = 0;
  let valorTotalAtacado = 0;

  for (const ap of aparelhosAtivos) {
    if (!ap) continue;
    const qtd = obterQuantidadeAparelho(ap);
    totalUnidades += qtd;
    modelos.add(chaveModeloNormalizada(ap).chave);

    if (ap.condicao === 'novo') novos += 1;
    else if (ap.condicao === 'seminovo') seminovos += 1;
    else usados += 1;

    if (isAparelhoEmManutencao(ap)) emManutencao += 1;

    const preco = obterPrecoVenda(ap);
    const custo = obterCustoAparelho(ap);
    const atacado = obterPrecoAtacado(ap);

    if (preco <= 0) semPreco += 1;
    valorTotalVenda += preco * qtd;
    valorTotalCusto += custo * qtd;
    valorTotalAtacado += atacado * qtd;

    const bat = obterPercentualBateria(ap);
    if (bat !== null && bat >= 90) bateriaAlta += 1;

    const dias = calcularDiasEmEstoque(ap, agora);
    if (dias !== null && dias >= 30) parados30d += 1;
  }

  return {
    totalRegistros: aparelhosAtivos.length,
    totalUnidades,
    modelosUnicos: modelos.size,
    novos,
    seminovos,
    usados,
    emManutencao,
    naLoja: aparelhosAtivos.length - emManutencao,
    semPreco,
    bateriaAlta,
    parados30d,
    valorTotalVenda,
    valorTotalCusto,
    valorTotalAtacado,
  };
}

export function aplicarFiltroRapidoEstoque(
  lista: Aparelho[],
  filtroRapido: FiltroRapidoEstoque,
  agora: Date = new Date()
): Aparelho[] {
  if (filtroRapido === 'todos') return lista;

  return lista.filter((ap) => {
    if (filtroRapido === 'novos') return ap.condicao === 'novo';
    if (filtroRapido === 'seminovos') return ap.condicao === 'seminovo';
    if (filtroRapido === 'sem_preco') return aparelhoSemPreco(ap);
    if (filtroRapido === 'bateria_alta') {
      const bat = obterPercentualBateria(ap);
      return bat !== null && bat >= 90;
    }
    if (filtroRapido === 'parados_30d') {
      const dias = calcularDiasEmEstoque(ap, agora);
      return dias !== null && dias >= 30;
    }
    return true;
  });
}

function timestampCadastro(ap: Aparelho): number {
  const extra = ap as unknown as Record<string, unknown>;
  const raw = ap.dataCadastro || (extra.created_at as string | undefined) || '';
  const ts = Date.parse(raw);
  return Number.isFinite(ts) ? ts : 0;
}

export function ordenarAparelhosEstoque(
  lista: Aparelho[],
  ordenacao: OrdenacaoEstoque
): Aparelho[] {
  if (ordenacao === 'recentes') {
    return lista.slice().sort((a, b) => timestampCadastro(b) - timestampCadastro(a));
  }

  return lista.slice().sort((a, b) => {
    if (ordenacao === 'modelo_az') {
      const modA = chaveModeloNormalizada(a).titulo;
      const modB = chaveModeloNormalizada(b).titulo;
      const cmp = modA.localeCompare(modB, 'pt-BR');
      if (cmp !== 0) return cmp;
      return String(a.capacidade || '').localeCompare(String(b.capacidade || ''), 'pt-BR', {
        numeric: true,
      });
    }

    if (ordenacao === 'menor_preco') {
      const pA = obterPrecoVenda(a);
      const pB = obterPrecoVenda(b);
      // Itens sem preço (0) vão para o final ao ordenar por menor preço
      if (pA <= 0 && pB <= 0) return 0;
      if (pA <= 0) return 1;
      if (pB <= 0) return -1;
      return pA - pB;
    }

    if (ordenacao === 'maior_preco') {
      return obterPrecoVenda(b) - obterPrecoVenda(a);
    }

    if (ordenacao === 'maior_bateria') {
      const bA = obterPercentualBateria(a) ?? -1;
      const bB = obterPercentualBateria(b) ?? -1;
      if (bB !== bA) return bB - bA;
      return chaveModeloNormalizada(a).titulo.localeCompare(
        chaveModeloNormalizada(b).titulo,
        'pt-BR'
      );
    }

    if (ordenacao === 'mais_antigos') {
      const tA = timestampCadastro(a) || Number.MAX_SAFE_INTEGER;
      const tB = timestampCadastro(b) || Number.MAX_SAFE_INTEGER;
      return tA - tB;
    }

    return 0;
  });
}

export function agruparAparelhosPorModelo(lista: Aparelho[]): GrupoModeloEstoque[] {
  const mapa = new Map<string, GrupoModeloEstoque>();

  for (const ap of lista) {
    if (!ap) continue;
    const { chave, titulo } = chaveModeloNormalizada(ap);
    const qtd = obterQuantidadeAparelho(ap);
    const preco = obterPrecoVenda(ap);
    const emManut = isAparelhoEmManutencao(ap);
    const cap = String(ap.capacidade || '').trim();

    const existente = mapa.get(chave);
    if (!existente) {
      mapa.set(chave, {
        chave,
        titulo,
        itens: [ap],
        totalUnidades: qtd,
        menorPreco: preco > 0 ? preco : null,
        maiorPreco: preco > 0 ? preco : null,
        semPrecoCount: preco <= 0 ? 1 : 0,
        emManutencaoCount: emManut ? 1 : 0,
        capacidades: cap ? [cap] : [],
      });
    } else {
      existente.itens.push(ap);
      existente.totalUnidades += qtd;
      if (preco > 0) {
        existente.menorPreco =
          existente.menorPreco === null ? preco : Math.min(existente.menorPreco, preco);
        existente.maiorPreco =
          existente.maiorPreco === null ? preco : Math.max(existente.maiorPreco, preco);
      } else {
        existente.semPrecoCount += 1;
      }
      if (emManut) existente.emManutencaoCount += 1;
      if (cap && !existente.capacidades.includes(cap)) {
        existente.capacidades.push(cap);
      }
    }
  }

  return Array.from(mapa.values()).map((grupo) => ({
    ...grupo,
    capacidades: grupo.capacidades.slice().sort((a, b) =>
      a.localeCompare(b, 'pt-BR', { numeric: true })
    ),
  }));
}

export function montarTextoCompartilharAparelho(aparelho: Aparelho): string {
  const { titulo } = chaveModeloNormalizada(aparelho);
  const detalhes = [aparelho.capacidade, aparelho.cor].filter(Boolean).join(' • ');
  const condicaoTexto =
    aparelho.condicao === 'novo'
      ? 'Lacrado / Novo'
      : aparelho.condicao === 'seminovo'
        ? 'Seminovo'
        : aparelho.condicao === 'usado'
          ? 'Usado'
          : aparelho.condicao || '';
  const bat = formatarSaudeBateria(aparelho);
  const preco = obterPrecoVenda(aparelho);

  const linhas: string[] = [];
  linhas.push(`*${titulo}*${detalhes ? ` — ${detalhes}` : ''}`);
  const linhaSpecs = [condicaoTexto, bat ? `Bateria ${bat}` : ''].filter(Boolean).join(' | ');
  if (linhaSpecs) linhas.push(linhaSpecs);
  if (preco > 0) {
    linhas.push(
      `Valor: *${preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}*`
    );
  }
  return linhas.join('\n');
}
