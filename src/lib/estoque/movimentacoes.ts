import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CAMPOS_CICLO,
  EstadoCicloAparelho,
  LinhaMovimentacao,
  OrigemMovimentacao,
  PatchCiclo,
  TipoMovimentacao,
  montarMovimentacoes,
  validarPatchCiclo,
} from './ciclo';

/**
 * Ponto único de escrita do ciclo de vida do estoque.
 *
 * Toda mudança em `ativo`/`status` de `aparelhos` passa por aqui para que:
 *  1. o estado anterior seja lido antes de alterar,
 *  2. a regra do ciclo de vida seja validada (validarPatchCiclo),
 *  3. cada aparelho afetado gere uma linha em `movimentacoes_estoque`, e
 *  4. operações em massa compartilhem um `lote_id` — o que permite desfazer a
 *     operação inteira depois.
 *
 * Recebe o cliente Supabase por parâmetro: roda igual no navegador (RLS por loja)
 * e no servidor (service role), e é testável com um cliente falso.
 */

/** PostgREST envia `in()` na URL; lotes menores evitam estourar o tamanho dela. */
const TAMANHO_LOTE_IDS = 150;
const TAMANHO_LOTE_INSERT = 500;

export function gerarLoteId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function fatiar<T>(itens: T[], tamanho: number): T[][] {
  const partes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) partes.push(itens.slice(i, i + tamanho));
  return partes;
}

export interface ContextoAuditoria {
  loteId?: string;
  /** Restringe a escrita a esta loja e serve de fallback para `loja_id` da auditoria. */
  lojaId?: string | null;
  usuarioId?: string | null;
  usuarioNome?: string | null;
  observacao?: string | null;
}

export interface OpcoesMudancaEstoque extends ContextoAuditoria {
  ids: string[];
  patch: PatchCiclo;
  tipo: TipoMovimentacao;
  origem: OrigemMovimentacao;
  /** Campos além do ciclo de vida a registrar no antes/depois (ex.: preco em uma edição). */
  camposAuditados?: string[];
  /**
   * Reavalia cada aparelho no estado lido do banco, imediatamente antes de
   * escrever. Entre a prévia mostrada na tela e o clique de confirmação alguém
   * pode ter vendido um dos aparelhos; quem não passar aqui fica intocado.
   */
  filtroElegivel?: (estadoAtual: EstadoCicloAparelho) => boolean;
}

export interface ResultadoMudancaEstoque {
  afetados: number;
  loteId: string;
  /** false quando a mudança foi aplicada mas a trilha de auditoria não foi gravada inteira. */
  auditoriaRegistrada: boolean;
  erroAuditoria?: string;
}

export async function aplicarMudancaEstoque(
  supabase: SupabaseClient,
  opcoes: OpcoesMudancaEstoque
): Promise<ResultadoMudancaEstoque> {
  validarPatchCiclo(opcoes.patch);

  const loteId = opcoes.loteId || gerarLoteId();
  const ids = [...new Set((opcoes.ids || []).filter(Boolean))];
  if (ids.length === 0) return { afetados: 0, loteId, auditoriaRegistrada: true };

  // Todo campo do patch entra no antes/depois: sem isso, desfazer o lote não saberia
  // o valor anterior de observacoes, cor etc. (ver desfazerLote.ts).
  const campos = [
    ...new Set<string>([...CAMPOS_CICLO, ...(opcoes.camposAuditados || []), ...Object.keys(opcoes.patch)]),
  ];
  const alterados: EstadoCicloAparelho[] = [];

  for (const parte of fatiar(ids, TAMANHO_LOTE_IDS)) {
    // Linha inteira: vira `antes` na auditoria, o estado anterior completo do aparelho.
    let leitura = supabase.from('aparelhos').select('*').in('id', parte);
    if (opcoes.lojaId) leitura = leitura.eq('loja_id', opcoes.lojaId);
    const { data: estadoAtual, error: erroLeitura } = await leitura;
    if (erroLeitura) {
      throw new Error(`Falha ao ler o estado atual dos aparelhos: ${erroLeitura.message}`);
    }

    const lidos = (estadoAtual || []) as unknown as EstadoCicloAparelho[];
    const encontrados = opcoes.filtroElegivel ? lidos.filter(opcoes.filtroElegivel) : lidos;
    if (encontrados.length === 0) continue;

    let escrita = supabase
      .from('aparelhos')
      .update(opcoes.patch)
      .in(
        'id',
        encontrados.map((l) => l.id as string)
      );
    if (opcoes.lojaId) escrita = escrita.eq('loja_id', opcoes.lojaId);
    const { error: erroEscrita } = await escrita;
    if (erroEscrita) {
      throw new Error(
        `Falha ao atualizar aparelhos (${alterados.length} já alterados no lote ${loteId}): ${erroEscrita.message}`
      );
    }

    alterados.push(...encontrados);
  }

  const porId = new Map(alterados.map((a) => [String(a.id), a]));
  const linhas: LinhaGravavel[] = montarMovimentacoes({
    antes: alterados,
    patch: opcoes.patch,
    tipo: opcoes.tipo,
    origem: opcoes.origem,
    loteId,
    campos,
    lojaIdPadrao: opcoes.lojaId,
    usuarioId: opcoes.usuarioId,
    usuarioNome: opcoes.usuarioNome,
    observacao: opcoes.observacao,
  }).map((linha) => ({ ...linha, antes: (linha.aparelho_id && porId.get(linha.aparelho_id)) || null }));

  const auditoria = await gravarMovimentacoes(supabase, linhas);
  const semLoja = alterados.length - linhas.length;

  return {
    afetados: alterados.length,
    loteId,
    auditoriaRegistrada: auditoria.ok && semLoja === 0,
    erroAuditoria:
      auditoria.erro || (semLoja > 0 ? `${semLoja} aparelho(s) sem loja_id ficaram sem auditoria.` : undefined),
  };
}

/** Registra a entrada de aparelhos recém-cadastrados. */
export async function registrarEntradaEstoque(
  supabase: SupabaseClient,
  params: ContextoAuditoria & {
    aparelhos: EstadoCicloAparelho[];
    origem: OrigemMovimentacao;
  }
): Promise<ResultadoMudancaEstoque> {
  const loteId = params.loteId || gerarLoteId();
  const aparelhos = (params.aparelhos || []).filter((a) => a && a.id);
  if (aparelhos.length === 0) return { afetados: 0, loteId, auditoriaRegistrada: true };

  // Uma chamada por aparelho: cada um tem seu próprio estado inicial, e montar
  // tudo de uma vez exigiria realinhar por índice depois de montarMovimentacoes
  // descartar os sem loja — fácil de trocar valores entre aparelhos.
  const linhas = aparelhos.flatMap((a) => {
    const estadoInicial: Record<string, unknown> = {};
    for (const campo of CAMPOS_CICLO) if (campo in a) estadoInicial[campo] = a[campo] ?? null;

    return montarMovimentacoes({
      antes: [{ id: a.id, loja_id: a.loja_id }],
      patch: estadoInicial,
      tipo: 'entrada',
      origem: params.origem,
      loteId,
      campos: CAMPOS_CICLO,
      lojaIdPadrao: params.lojaId,
      usuarioId: params.usuarioId,
      usuarioNome: params.usuarioNome,
      observacao: params.observacao,
    }).map((linha) => ({ ...linha, valor_anterior: null }));
  });

  const auditoria = await gravarMovimentacoes(supabase, linhas);
  const semLoja = aparelhos.length - linhas.length;
  return {
    afetados: aparelhos.length,
    loteId,
    auditoriaRegistrada: auditoria.ok && semLoja === 0,
    erroAuditoria:
      auditoria.erro || (semLoja > 0 ? `${semLoja} aparelho(s) sem loja_id ficaram sem auditoria.` : undefined),
  };
}

/** Linha de auditoria; `antes` é a linha inteira do aparelho antes da mudança (só em aplicarMudancaEstoque). */
type LinhaGravavel = LinhaMovimentacao & { antes?: Record<string, unknown> | null };

function semColunaAntes(linha: LinhaGravavel): LinhaMovimentacao {
  const copia = { ...linha };
  delete copia.antes;
  return copia;
}

/** PostgREST recusa coluna desconhecida (PGRST204) antes da migration 20260913_estoque_movimentacoes_antes. */
function faltaColunaAntes(erro: { message?: string; code?: string }): boolean {
  return erro.code === 'PGRST204' && /'antes'/.test(String(erro.message || ''));
}

async function gravarMovimentacoes(
  supabase: SupabaseClient,
  linhas: LinhaGravavel[]
): Promise<{ ok: boolean; erro?: string }> {
  let semAntes = false;
  for (const parte of fatiar(linhas, TAMANHO_LOTE_INSERT)) {
    const tentar = (payload: LinhaGravavel[]) => supabase.from('movimentacoes_estoque').insert(payload);
    let { error } = await tentar(semAntes ? parte.map(semColunaAntes) : parte);
    if (error && !semAntes && faltaColunaAntes(error)) {
      // Só a coluna nova e só até a migration ser aplicada: a mudança já foi feita e
      // perder a auditoria inteira seria pior do que perder o estado completo.
      console.warn('[Estoque] movimentacoes_estoque.antes ainda não existe; auditoria gravada sem o estado completo.');
      semAntes = true;
      ({ error } = await tentar(parte.map(semColunaAntes)));
    }
    if (error) {
      console.error('[Estoque] Mudança aplicada, mas a auditoria falhou:', error.message);
      return { ok: false, erro: error.message };
    }
  }
  return { ok: true };
}
