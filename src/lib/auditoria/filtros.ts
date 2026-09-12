/**
 * Filtros e paginação da tela de Logs & Auditoria (src/components/LogsTab.tsx).
 *
 * Antes a API devolvia 50 (ou 200) linhas fixas e o período era filtrado no
 * navegador: com o histórico crescendo, "últimos 30 dias" mostrava só o que
 * coube nas primeiras linhas. Agora tudo é filtrado e paginado no servidor.
 */

export const TAMANHO_PAGINA_LOGS = 50;
export const LIMITE_OFFSET = 100_000;

export type Periodo = 'hoje' | '7dias' | '30dias' | 'todos' | 'personalizado';
export const PERIODOS: Periodo[] = ['hoje', '7dias', '30dias', 'todos'];
export const ROTULO_PERIODO: Record<Periodo, string> = {
  hoje: 'Últimas 24h',
  '7dias': 'Últimos 7 dias',
  '30dias': 'Últimos 30 dias',
  todos: 'Todo o histórico',
  personalizado: 'Período escolhido',
};

const DIA = /^\d{4}-\d{2}-\d{2}$/;

export interface Intervalo {
  inicio: string | null;
  fim: string | null;
}

/** Instantes ISO do período. Datas AAAA-MM-DD são lidas como dia inteiro no fuso do navegador. */
export function intervaloDoPeriodo(
  periodo: Periodo,
  personalizado: { inicio?: string | null; fim?: string | null } = {},
  agora: Date = new Date()
): Intervalo {
  if (periodo === 'todos') return { inicio: null, fim: null };
  if (periodo === 'personalizado') {
    const inicio = DIA.test(personalizado.inicio || '') ? new Date(`${personalizado.inicio}T00:00:00`) : null;
    const fim = DIA.test(personalizado.fim || '') ? new Date(`${personalizado.fim}T23:59:59.999`) : null;
    return { inicio: inicio?.toISOString() ?? null, fim: fim?.toISOString() ?? null };
  }
  const horas = periodo === 'hoje' ? 24 : periodo === '7dias' ? 24 * 7 : 24 * 30;
  return { inicio: new Date(agora.getTime() - horas * 3_600_000).toISOString(), fim: null };
}

function isoValido(texto: string | null | undefined): string | null {
  if (!texto) return null;
  const d = new Date(texto);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Valor seguro para dentro de um `.or()` do PostgREST: vírgula, parênteses e
 * aspas mudam a sintaxe do filtro; `%` e `_` são curingas do ilike.
 */
export function termoParaIlike(termo: string): string | null {
  const limpo = termo
    .trim()
    .replace(/[,()"'\\%_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return limpo ? `%${limpo}%` : null;
}

export function offsetSeguro(valor: string | number | null | undefined): number {
  const n = typeof valor === 'number' ? valor : parseInt(String(valor ?? ''), 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.floor(n), LIMITE_OFFSET);
}

export interface FiltrosLogs {
  lojaId: string | null;
  tipo: string | null;
  usuario: string | null;
  termo: string | null;
  inicio: string | null;
  fim: string | null;
  offset: number;
  limite: number;
}

export interface UsuarioParaFiltro {
  lojaId: string | null;
  superAdmin: boolean;
}

/**
 * Lê os filtros da URL. A loja nunca vem do cliente para quem não é
 * administrador da plataforma; para ele, "todas" ou vazio significa visão global.
 */
export function lerFiltrosLogs(params: URLSearchParams, usuario: UsuarioParaFiltro): FiltrosLogs {
  const lojaPedida = (params.get('lojaId') || '').trim();
  const lojaId = usuario.superAdmin ? (lojaPedida && lojaPedida !== 'todas' ? lojaPedida : null) : usuario.lojaId;
  const tipo = (params.get('tipo') || '').trim().toLowerCase();
  const usuarioFiltro = (params.get('usuario') || '').trim().toLowerCase();
  return {
    lojaId,
    tipo: tipo && tipo !== 'todos' ? tipo.slice(0, 40) : null,
    usuario: usuarioFiltro ? usuarioFiltro.slice(0, 120) : null,
    termo: (params.get('termo') || '').trim().slice(0, 80) || null,
    inicio: isoValido(params.get('inicio')),
    fim: isoValido(params.get('fim')),
    offset: offsetSeguro(params.get('offset')),
    limite: TAMANHO_PAGINA_LOGS,
  };
}

/** Filtro `.or()` de texto livre dos logs (ação, detalhes, e-mail e nome). */
export function filtroTextoLogs(termo: string | null): string | null {
  const padrao = termo ? termoParaIlike(termo) : null;
  if (!padrao) return null;
  return ['acao', 'detalhes', 'usuario_email', 'usuario_nome'].map((c) => `${c}.ilike.${padrao}`).join(',');
}

/** Corta a página extra usada para saber se há mais. */
export function separarPagina<T>(linhas: T[], limite: number, offset: number): { itens: T[]; temMais: boolean; proximoOffset: number } {
  const temMais = linhas.length > limite;
  const itens = temMais ? linhas.slice(0, limite) : linhas;
  return { itens, temMais, proximoOffset: offset + itens.length };
}

/** Querystring da tela para a API de logs. */
export function montarConsultaLogs(entrada: {
  lojaId?: string | null;
  tipo?: string | null;
  usuario?: string | null;
  termo?: string | null;
  intervalo: Intervalo;
  offset: number;
}): URLSearchParams {
  const params = new URLSearchParams();
  if (entrada.lojaId && entrada.lojaId !== 'todas') params.set('lojaId', entrada.lojaId);
  if (entrada.tipo && entrada.tipo !== 'todos') params.set('tipo', entrada.tipo);
  if (entrada.usuario?.trim()) params.set('usuario', entrada.usuario.trim());
  if (entrada.termo?.trim()) params.set('termo', entrada.termo.trim());
  if (entrada.intervalo.inicio) params.set('inicio', entrada.intervalo.inicio);
  if (entrada.intervalo.fim) params.set('fim', entrada.intervalo.fim);
  if (entrada.offset > 0) params.set('offset', String(entrada.offset));
  return params;
}
