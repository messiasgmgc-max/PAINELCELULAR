import type { SupabaseClient } from '@supabase/supabase-js';
import { buscarTodasPaginas } from '../supabase/paginar';
import {
  estaNoEstoque,
  patchSaida,
  validarPatchCiclo,
  type EstadoCicloAparelho,
  type OrigemMovimentacao,
  type TipoMovimentacao,
} from './ciclo';
import { aplicarMudancaEstoque, gerarLoteId } from './movimentacoes';

/**
 * Desfazer uma operação em massa do estoque, até 24 horas depois.
 *
 * Cada linha de `movimentacoes_estoque` guarda os campos alterados antes e depois
 * (valor_anterior/valor_novo) e, desde a migration 20260913_estoque_movimentacoes_antes,
 * a linha inteira do aparelho como estava (`antes`). Desfazer devolve cada aparelho
 * ao estado anterior — mas só o que continua exatamente como o lote deixou. Aparelho
 * vendido, editado ou movimentado depois vira conflito e não é tocado: desfazer por
 * cima de uma venda seria repetir o incidente de 10/09/2026 no sentido contrário.
 *
 * A reversão é outra operação auditada: novo lote_id e origem 'desfazer_lote'.
 */

export const JANELA_DESFAZER_MS = 24 * 60 * 60 * 1000;

/** Origens que são operações em massa. Venda, atacado e bot não se desfazem por aqui. */
export const ORIGENS_EM_MASSA: readonly OrigemMovimentacao[] = [
  'remontar_mercadophone',
  'importar_mercadophone',
  'deletar_estoque',
  'restaurar_estoque',
  'conferencia',
  'backup_restauracao',
];

export const ROTULOS_ORIGEM: Partial<Record<string, string>> = {
  remontar_mercadophone: 'Remontar pela lista MercadoPhone',
  importar_mercadophone: 'Importar lista MercadoPhone',
  deletar_estoque: 'Baixar todo o estoque',
  restaurar_estoque: 'Reativar desativados',
  conferencia: 'Conferência de estoque',
  backup_restauracao: 'Restaurar ponto de backup',
  manual: 'Cadastro em massa',
  desfazer_lote: 'Desfazer operação',
};

export const ROTULOS_TIPO: Partial<Record<string, string>> = {
  entrada: 'entrada',
  saida: 'manutenção',
  venda: 'venda',
  baixa: 'baixa',
  restauracao: 'volta ao estoque',
  edicao: 'edição',
};

export interface MovimentacaoLote {
  id?: string;
  loja_id?: string;
  aparelho_id: string | null;
  tipo: string;
  origem: string;
  lote_id: string;
  usuario_nome?: string | null;
  valor_anterior?: Record<string, unknown> | null;
  valor_novo?: Record<string, unknown> | null;
  antes?: Record<string, unknown> | null;
  observacao?: string | null;
  created_at: string;
}

const tempo = (iso: string | null | undefined) => {
  const t = Date.parse(String(iso || ''));
  return Number.isFinite(t) ? t : 0;
};

const porTempo = (a: MovimentacaoLote, b: MovimentacaoLote) => tempo(a.created_at) - tempo(b.created_at);

const REGEX_LOTE_DESFEITO = /lote ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

export function rotuloOrigem(origem: string): string {
  return ROTULOS_ORIGEM[origem] || origem;
}

export function observacaoDesfazer(loteId: string, origem: string): string {
  return `Desfaz o lote ${loteId} (${rotuloOrigem(origem)}).`;
}

/** Lote original que uma movimentação de reversão desfez, ou null. */
export function loteDesfeitoPor(mov: Pick<MovimentacaoLote, 'origem' | 'observacao'>): string | null {
  if (mov.origem !== 'desfazer_lote') return null;
  return String(mov.observacao || '').match(REGEX_LOTE_DESFEITO)?.[1]?.toLowerCase() ?? null;
}

export function ehLoteEmMassa(origem: string, quantidade: number): boolean {
  // Cadastro em massa (lista de fornecedor) grava com origem 'manual' num lote só.
  return (ORIGENS_EM_MASSA as readonly string[]).includes(origem) || (origem === 'manual' && quantidade >= 2);
}

// ── Comparação ──────────────────────────────────────────────────────────────

const REGEX_DATA_HORA = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

/**
 * Igualdade tolerante ao que o banco devolve: numeric como número, timestamp com
 * "+00:00" em vez de "Z", jsonb como objeto.
 */
export function valoresIguais(a: unknown, b: unknown): boolean {
  const vazioA = a === null || a === undefined;
  const vazioB = b === null || b === undefined;
  if (vazioA || vazioB) return vazioA && vazioB;

  if (typeof a === 'number' || typeof b === 'number') {
    const na = Number(a);
    const nb = Number(b);
    return Number.isFinite(na) && Number.isFinite(nb) ? na === nb : String(a) === String(b);
  }
  if (typeof a === 'string' && typeof b === 'string') {
    if (a === b) return true;
    if (REGEX_DATA_HORA.test(a) && REGEX_DATA_HORA.test(b)) {
      const ta = Date.parse(a);
      return Number.isFinite(ta) && ta === Date.parse(b);
    }
    return false;
  }
  if (typeof a === 'object' || typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b);
  return String(a) === String(b);
}

/** Campos que mudam sozinhos ou não são do aparelho: nunca contam como alteração nem são revertidos. */
const CAMPOS_IGNORADOS = new Set(['id', 'loja_id', 'updated_at', 'etiquetas_impressas']);

/** Campos de `esperado` em que o aparelho está diferente. */
export function camposDiferentes(atual: Record<string, unknown>, esperado: Record<string, unknown>): string[] {
  return Object.keys(esperado).filter((c) => !CAMPOS_IGNORADOS.has(c) && !valoresIguais(atual[c], esperado[c]));
}

// ── Resumo dos lotes ────────────────────────────────────────────────────────

export interface ResumoLote {
  loteId: string;
  origem: string;
  rotulo: string;
  /** Aparelhos distintos no lote. */
  quantidade: number;
  /** Movimentações por tipo (baixa, restauracao, entrada...). */
  porTipo: Record<string, number>;
  usuarioNome: string | null;
  inicio: string;
  expiraEm: string;
  desfeito: boolean;
}

/** Operações em massa das últimas 24 h, mais recentes primeiro. */
export function agruparLotesEmMassa(movimentacoes: MovimentacaoLote[], agora: Date = new Date()): ResumoLote[] {
  const desfeitos = new Set(movimentacoes.map(loteDesfeitoPor).filter((id): id is string => Boolean(id)));
  const grupos = new Map<string, MovimentacaoLote[]>();
  for (const mov of movimentacoes) {
    if (!mov.lote_id || !mov.aparelho_id) continue;
    const lista = grupos.get(mov.lote_id);
    if (lista) lista.push(mov);
    else grupos.set(mov.lote_id, [mov]);
  }

  const limite = agora.getTime() - JANELA_DESFAZER_MS;
  const resumos: ResumoLote[] = [];
  for (const [loteId, lista] of grupos) {
    const ordenada = [...lista].sort(porTempo);
    const origem = ordenada[0].origem;
    const quantidade = new Set(ordenada.map((m) => m.aparelho_id)).size;
    const inicio = tempo(ordenada[0].created_at);
    if (!ehLoteEmMassa(origem, quantidade) || inicio < limite) continue;

    const porTipo: Record<string, number> = {};
    for (const mov of ordenada) porTipo[mov.tipo] = (porTipo[mov.tipo] || 0) + 1;

    resumos.push({
      loteId,
      origem,
      rotulo: rotuloOrigem(origem),
      quantidade,
      porTipo,
      usuarioNome: ordenada.find((m) => m.usuario_nome)?.usuario_nome ?? null,
      inicio: new Date(inicio).toISOString(),
      expiraEm: new Date(inicio + JANELA_DESFAZER_MS).toISOString(),
      desfeito: desfeitos.has(loteId.toLowerCase()),
    });
  }
  return resumos.sort((a, b) => tempo(b.inicio) - tempo(a.inicio));
}

// ── Plano ───────────────────────────────────────────────────────────────────

export type MotivoConflito = 'movimentado_depois' | 'mudou_depois' | 'nao_encontrado' | 'estado_invalido';

export interface ConflitoDesfazer {
  aparelhoId: string;
  motivo: MotivoConflito;
  detalhe: string;
}

export interface ItemDesfazer {
  aparelhoId: string;
  /** Valores anteriores dos campos que o lote mudou. */
  patch: Record<string, unknown>;
  tipo: TipoMovimentacao;
  /** Como o lote deixou o aparelho: revalidado na hora de gravar. */
  esperado: Record<string, unknown>;
  /** Cadastrado pelo próprio lote: desfazer é dar baixa. */
  criadoNoLote: boolean;
}

export interface PlanoDesfazer {
  loteId: string;
  origem: string;
  rotulo: string;
  inicio: string | null;
  expirado: boolean;
  reverter: ItemDesfazer[];
  conflitos: ConflitoDesfazer[];
  /** Aparelhos do lote que não tiveram nenhum campo alterado (ou já estão como antes). */
  semAlteracao: string[];
}

const CAMPOS_SAIDA = ['ativo', 'status', 'data_saida', 'motivo_saida'] as const;

function tipoDaReversao(patch: Record<string, unknown>): TipoMovimentacao {
  if (patch.ativo === false) return patch.status === 'vendido' ? 'venda' : 'baixa';
  if (patch.ativo === true) return 'restauracao';
  if (patch.status === 'manutencao') return 'saida';
  return 'edicao';
}

function formatarDataHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
}

const temCampo = (obj: Record<string, unknown> | null | undefined, campo: string): obj is Record<string, unknown> =>
  !!obj && Object.prototype.hasOwnProperty.call(obj, campo);

export function planejarDesfazerLote(params: {
  loteId: string;
  /** Movimentações do lote. */
  movimentacoes: MovimentacaoLote[];
  /** Movimentações dos mesmos aparelhos a partir do início do lote (de qualquer lote). */
  posteriores: MovimentacaoLote[];
  /** Linhas atuais dos aparelhos. */
  atuais: Array<Record<string, unknown>>;
  agora?: Date;
}): PlanoDesfazer {
  const agora = params.agora ?? new Date();
  const doLote = params.movimentacoes.filter((m) => m.lote_id === params.loteId && m.aparelho_id).sort(porTempo);
  const origem = doLote[0]?.origem || '';
  const inicioMs = doLote.length ? tempo(doLote[0].created_at) : 0;

  const plano: PlanoDesfazer = {
    loteId: params.loteId,
    origem,
    rotulo: rotuloOrigem(origem),
    inicio: doLote.length ? new Date(inicioMs).toISOString() : null,
    expirado: doLote.length === 0 || agora.getTime() - inicioMs > JANELA_DESFAZER_MS,
    reverter: [],
    conflitos: [],
    semAlteracao: [],
  };

  const atuais = new Map(params.atuais.map((a) => [String(a.id), a]));
  const porAparelho = new Map<string, MovimentacaoLote[]>();
  for (const mov of doLote) {
    const id = String(mov.aparelho_id);
    const lista = porAparelho.get(id);
    if (lista) lista.push(mov);
    else porAparelho.set(id, [mov]);
  }

  for (const [aparelhoId, movs] of porAparelho) {
    const primeiroMs = tempo(movs[0].created_at);
    // No mesmo instante também conta: na dúvida, o aparelho não é tocado.
    const posterior = params.posteriores
      .filter((m) => m.aparelho_id === aparelhoId && m.lote_id !== params.loteId && tempo(m.created_at) >= primeiroMs)
      .sort(porTempo)[0];
    if (posterior) {
      plano.conflitos.push({
        aparelhoId,
        motivo: 'movimentado_depois',
        detalhe: `Teve ${ROTULOS_TIPO[posterior.tipo] || posterior.tipo} (${rotuloOrigem(posterior.origem)}) em ${formatarDataHora(posterior.created_at)}.`,
      });
      continue;
    }

    const atual = atuais.get(aparelhoId);
    if (!atual) {
      plano.conflitos.push({ aparelhoId, motivo: 'nao_encontrado', detalhe: 'O aparelho não foi encontrado nesta loja.' });
      continue;
    }

    const esperado: Record<string, unknown> = {};
    const anterior: Record<string, unknown> = {};
    for (const mov of movs) {
      for (const [campo, valor] of Object.entries(mov.valor_novo || {})) {
        if (!(campo in anterior)) {
          // O primeiro registro do campo no lote diz como ele estava antes da operação.
          if (temCampo(mov.antes, campo)) anterior[campo] = mov.antes[campo] ?? null;
          else if (temCampo(mov.valor_anterior, campo)) anterior[campo] = mov.valor_anterior[campo] ?? null;
        }
        esperado[campo] = valor ?? null;
      }
    }

    const mudou = camposDiferentes(atual, esperado);
    if (mudou.length > 0) {
      plano.conflitos.push({ aparelhoId, motivo: 'mudou_depois', detalhe: `Mudou depois da operação: ${mudou.join(', ')}.` });
      continue;
    }

    const criadoNoLote = movs[0].tipo === 'entrada' && movs[0].valor_anterior == null;
    if (criadoNoLote) {
      if (!estaNoEstoque(atual as EstadoCicloAparelho)) {
        plano.semAlteracao.push(aparelhoId);
        continue;
      }
      plano.reverter.push({
        aparelhoId,
        patch: patchSaida('baixado', 'baixa_manual', agora),
        tipo: 'baixa',
        esperado,
        criadoNoLote: true,
      });
      continue;
    }

    const alterados = Object.keys(esperado).filter(
      (c) => !CAMPOS_IGNORADOS.has(c) && c in anterior && !valoresIguais(anterior[c], esperado[c])
    );
    if (alterados.length === 0) {
      plano.semAlteracao.push(aparelhoId);
      continue;
    }

    const campos = new Set(alterados);
    // Saída e volta ao estoque são gravadas juntas: ativo sem status não passa na validação do ciclo.
    if (alterados.some((c) => (CAMPOS_SAIDA as readonly string[]).includes(c))) {
      for (const c of CAMPOS_SAIDA) if (c in anterior) campos.add(c);
    }
    const patch = Object.fromEntries([...campos].map((c) => [c, anterior[c]]));

    try {
      validarPatchCiclo(patch);
    } catch (erro) {
      plano.conflitos.push({
        aparelhoId,
        motivo: 'estado_invalido',
        detalhe: `O estado anterior não pode ser gravado de novo: ${erro instanceof Error ? erro.message : String(erro)}`,
      });
      continue;
    }

    plano.reverter.push({ aparelhoId, patch, tipo: tipoDaReversao(patch), esperado, criadoNoLote: false });
  }

  return plano;
}

function jsonOrdenado(valor: Record<string, unknown>): string {
  return JSON.stringify(Object.keys(valor).sort().map((k) => [k, valor[k]]));
}

/** Junta os aparelhos com a mesma reversão numa única escrita. */
export function agruparReversoes(itens: ItemDesfazer[]): Array<Omit<ItemDesfazer, 'aparelhoId'> & { ids: string[] }> {
  const grupos = new Map<string, Omit<ItemDesfazer, 'aparelhoId'> & { ids: string[] }>();
  for (const item of itens) {
    const chave = JSON.stringify([item.tipo, item.criadoNoLote, jsonOrdenado(item.patch), jsonOrdenado(item.esperado)]);
    const grupo = grupos.get(chave);
    if (grupo) grupo.ids.push(item.aparelhoId);
    else grupos.set(chave, { patch: item.patch, tipo: item.tipo, esperado: item.esperado, criadoNoLote: item.criadoNoLote, ids: [item.aparelhoId] });
  }
  return [...grupos.values()];
}

// ── Execução ────────────────────────────────────────────────────────────────

export interface ResultadoDesfazer {
  /** Lote novo da reversão. */
  loteId: string;
  revertidos: number;
  /** Aparelhos que mudaram entre a prévia e a confirmação e ficaram de fora. */
  ignoradosNaHora: string[];
  auditoriaRegistrada: boolean;
  erroAuditoria?: string;
}

export async function executarDesfazerLote(
  supabase: SupabaseClient,
  plano: PlanoDesfazer,
  ctx: { lojaId: string; usuarioId?: string | null; usuarioNome?: string | null }
): Promise<ResultadoDesfazer> {
  if (plano.expirado) throw new Error('O prazo de 24 horas para desfazer esta operação acabou.');

  const loteId = gerarLoteId();
  const aceitos = new Set<string>();
  const errosAuditoria: string[] = [];
  let revertidos = 0;

  for (const grupo of agruparReversoes(plano.reverter)) {
    const r = await aplicarMudancaEstoque(supabase, {
      ids: grupo.ids,
      patch: grupo.patch,
      tipo: grupo.tipo,
      origem: 'desfazer_lote',
      loteId,
      lojaId: ctx.lojaId,
      usuarioId: ctx.usuarioId,
      usuarioNome: ctx.usuarioNome,
      observacao: observacaoDesfazer(plano.loteId, plano.origem),
      // Revalida no banco: quem foi vendido ou editado depois da prévia fica intocado.
      filtroElegivel: (estado) => {
        const elegivel =
          camposDiferentes(estado, grupo.esperado).length === 0 && (!grupo.criadoNoLote || estaNoEstoque(estado));
        if (elegivel && estado.id) aceitos.add(String(estado.id));
        return elegivel;
      },
    });
    revertidos += r.afetados;
    if (!r.auditoriaRegistrada && r.erroAuditoria) errosAuditoria.push(r.erroAuditoria);
  }

  return {
    loteId,
    revertidos,
    ignoradosNaHora: plano.reverter.map((i) => i.aparelhoId).filter((id) => !aceitos.has(id)),
    auditoriaRegistrada: errosAuditoria.length === 0,
    erroAuditoria: errosAuditoria[0],
  };
}

// ── Leitura ─────────────────────────────────────────────────────────────────

const COLUNAS_RESUMO = 'id, aparelho_id, tipo, origem, lote_id, usuario_nome, observacao, created_at';
const COLUNAS_COMPLETAS = `${COLUNAS_RESUMO}, valor_anterior, valor_novo, antes`;
const TAMANHO_FATIA = 150;

type RespostaMovs = PromiseLike<{ data: MovimentacaoLote[] | null; error: unknown }>;
type FiltroMovs = (consulta: ReturnType<ReturnType<SupabaseClient['from']>['select']>) => {
  order: (coluna: string, opcoes?: { ascending?: boolean }) => {
    order: (coluna: string) => { range: (de: number, ate: number) => unknown };
  };
};

function mensagemDeErro(erro: unknown): string {
  if (erro instanceof Error) return erro.message;
  if (erro && typeof erro === 'object' && 'message' in erro) return String((erro as { message: unknown }).message);
  return String(erro);
}

async function lerMovimentacoes(supabase: SupabaseClient, filtrar: FiltroMovs, colunas: string): Promise<MovimentacaoLote[]> {
  const buscar = (cols: string) =>
    buscarTodasPaginas<MovimentacaoLote>(
      (de, ate) =>
        filtrar(supabase.from('movimentacoes_estoque').select(cols))
          .order('created_at', { ascending: true })
          .order('id')
          .range(de, ate) as RespostaMovs
    );
  try {
    return await buscar(colunas);
  } catch (erro) {
    // Antes da migration que cria `antes`, a reversão usa só valor_anterior.
    if (colunas.includes('antes') && /antes/.test(mensagemDeErro(erro))) {
      return buscar(colunas.replace(', antes', ''));
    }
    throw new Error(`Falha ao ler as movimentações do estoque: ${mensagemDeErro(erro)}`);
  }
}

/** Operações em massa da loja nas últimas 24 horas. */
export async function listarLotesRecentes(
  supabase: SupabaseClient,
  lojaId: string,
  agora: Date = new Date()
): Promise<ResumoLote[]> {
  const desde = new Date(agora.getTime() - JANELA_DESFAZER_MS).toISOString();
  const movs = await lerMovimentacoes(
    supabase,
    (q) => q.eq('loja_id', lojaId).gte('created_at', desde),
    COLUNAS_RESUMO
  );
  return agruparLotesEmMassa(movs, agora);
}

/** Lê o lote inteiro, os aparelhos como estão agora e o que aconteceu com eles depois. */
export async function carregarPlanoDesfazer(
  supabase: SupabaseClient,
  lojaId: string,
  loteId: string,
  agora: Date = new Date()
): Promise<{ plano: PlanoDesfazer; aparelhos: Map<string, Record<string, unknown>> }> {
  const movimentacoes = (
    await lerMovimentacoes(supabase, (q) => q.eq('loja_id', lojaId).eq('lote_id', loteId), COLUNAS_COMPLETAS)
  ).sort(porTempo);
  const ids = [...new Set(movimentacoes.map((m) => m.aparelho_id).filter((id): id is string => Boolean(id)))];
  const inicio = movimentacoes[0]?.created_at;

  const atuais: Array<Record<string, unknown>> = [];
  const posteriores: MovimentacaoLote[] = [];
  for (let i = 0; i < ids.length; i += TAMANHO_FATIA) {
    const parte = ids.slice(i, i + TAMANHO_FATIA);
    const { data, error } = await supabase.from('aparelhos').select('*').eq('loja_id', lojaId).in('id', parte);
    if (error) throw new Error(`Falha ao ler os aparelhos do lote: ${error.message}`);
    atuais.push(...((data || []) as Array<Record<string, unknown>>));
    if (inicio) {
      posteriores.push(
        ...(await lerMovimentacoes(
          supabase,
          (q) => q.eq('loja_id', lojaId).in('aparelho_id', parte).gte('created_at', inicio),
          COLUNAS_RESUMO
        ))
      );
    }
  }

  const plano = planejarDesfazerLote({ loteId, movimentacoes, posteriores, atuais, agora });
  return { plano, aparelhos: new Map(atuais.map((a) => [String(a.id), a])) };
}
