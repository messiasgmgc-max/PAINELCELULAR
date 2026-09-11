import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Venda atômica: venda, baixa do estoque e aparelho de troca numa transação só
 * (função registrar_venda_atomica, migration 20260911_venda_atomica.sql).
 *
 * Com a venda e a baixa em chamadas separadas, dois terminais vendiam o mesmo
 * aparelho, e uma falha no meio deixava venda sem baixa ou baixa sem venda.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CamposAparelhoNaVenda {
  cliente?: string | null;
  observacoes?: string | null;
}

export interface ParametrosVendaAtomica {
  /** Linha da tabela vendas. Precisa de loja_id; chaves que não são colunas são ignoradas. */
  venda: Record<string, unknown>;
  aparelhoIds?: Array<string | null | undefined>;
  /** Preenchido quando a venda já existe e está sendo editada. */
  vendaId?: string | null;
  /** Aparelhos já fora do estoque escolhidos de propósito (ex.: vincular venda antiga). */
  permitirForaDoEstoque?: Array<string | null | undefined>;
  /** Campos gravados em cada aparelho baixado, por id. */
  camposAparelho?: Record<string, CamposAparelhoNaVenda>;
  /** Aparelho recebido na troca: vira cadastro novo na mesma transação. */
  tradeIn?: Record<string, unknown> | null;
  avaliacaoId?: string | null;
  origem?: string;
  usuarioId?: string | null;
  usuarioNome?: string | null;
  observacao?: string | null;
}

export interface ResultadoVendaAtomica {
  venda: Record<string, unknown> & { id: string };
  baixados: number;
  tradeInId: string | null;
  loteId: string;
}

export type CodigoErroVenda =
  | 'fora_do_estoque'
  | 'aparelho_nao_encontrado'
  | 'imei_duplicado'
  | 'venda_nao_encontrada'
  | 'sem_loja'
  | 'funcao_ausente'
  | 'falha';

export class ErroVenda extends Error {
  readonly codigo: CodigoErroVenda;
  /** Modelos ou ids envolvidos, quando o banco informa. */
  readonly detalhe?: string;

  constructor(codigo: CodigoErroVenda, mensagem: string, detalhe?: string) {
    super(mensagem);
    this.name = 'ErroVenda';
    this.codigo = codigo;
    this.detalhe = detalhe;
  }
}

const soUuids = (lista: Array<string | null | undefined> | undefined) =>
  [...new Set((lista || []).filter((id): id is string => typeof id === 'string' && UUID.test(id)))];

/** Argumentos da RPC, com ids inválidos descartados (o banco recusaria o array inteiro). */
export function montarArgumentosVenda(p: ParametrosVendaAtomica): Record<string, unknown> {
  const campos: Record<string, CamposAparelhoNaVenda> = {};
  for (const [id, valor] of Object.entries(p.camposAparelho || {})) {
    if (UUID.test(id) && valor) campos[id] = valor;
  }

  return {
    p_venda: p.venda,
    p_aparelho_ids: soUuids(p.aparelhoIds),
    p_venda_id: p.vendaId && UUID.test(p.vendaId) ? p.vendaId : null,
    p_permitir_fora_do_estoque: soUuids(p.permitirForaDoEstoque),
    p_campos_aparelho: campos,
    p_trade_in: p.tradeIn || null,
    p_avaliacao_id: p.avaliacaoId && UUID.test(p.avaliacaoId) ? p.avaliacaoId : null,
    p_origem: p.origem || 'venda',
    p_usuario_id: p.usuarioId && UUID.test(p.usuarioId) ? p.usuarioId : null,
    p_usuario_nome: p.usuarioNome || null,
    p_observacao: p.observacao || null,
  };
}

interface ErroBanco {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}

/** Traduz o erro do banco para uma mensagem que diz o que aconteceu e o que fazer. */
export function interpretarErroVenda(erro: ErroBanco | null | undefined): ErroVenda {
  const mensagem = String(erro?.message || '');
  const nada = 'Nada foi gravado.';

  const fora = mensagem.match(/FORA_DO_ESTOQUE:\s*(.+)$/);
  if (fora) {
    return new ErroVenda(
      'fora_do_estoque',
      `${fora[1]} já saiu do estoque (vendido ou baixado em outro lugar). ${nada} Remova do carrinho e atualize a lista.`,
      fora[1]
    );
  }
  if (mensagem.includes('APARELHO_NAO_ENCONTRADO')) {
    return new ErroVenda('aparelho_nao_encontrado', `Um aparelho da venda não existe mais nesta loja. ${nada}`);
  }
  if (erro?.code === '23505' && mensagem.includes('uq_aparelhos_imei_completo_no_estoque')) {
    return new ErroVenda('imei_duplicado', `O IMEI do aparelho recebido na troca já está no estoque. ${nada}`);
  }
  if (mensagem.includes('VENDA_NAO_ENCONTRADA')) {
    return new ErroVenda('venda_nao_encontrada', `A venda que você está editando não existe mais. ${nada}`);
  }
  if (mensagem.includes('VENDA_SEM_LOJA')) {
    return new ErroVenda('sem_loja', `Não identifiquei a loja desta venda. Entre de novo e tente outra vez. ${nada}`);
  }
  if (erro?.code === 'PGRST202' || /registrar_venda_atomica/.test(mensagem)) {
    return new ErroVenda(
      'funcao_ausente',
      `O banco ainda não tem a função de venda atômica (migration 20260911_venda_atomica.sql). ${nada}`
    );
  }
  return new ErroVenda('falha', mensagem ? `Não foi possível registrar a venda: ${mensagem}` : 'Não foi possível registrar a venda.');
}

export async function registrarVendaAtomica(
  supabase: Pick<SupabaseClient, 'rpc'>,
  parametros: ParametrosVendaAtomica
): Promise<ResultadoVendaAtomica> {
  const { data, error } = await supabase.rpc('registrar_venda_atomica', montarArgumentosVenda(parametros));
  if (error) throw interpretarErroVenda(error);

  const bruto = (data || {}) as { venda?: Record<string, unknown>; baixados?: number; trade_in_id?: string | null; lote_id?: string };
  if (!bruto.venda || typeof bruto.venda.id !== 'string') {
    throw new ErroVenda('falha', 'O banco não devolveu a venda gravada.');
  }
  return {
    venda: bruto.venda as ResultadoVendaAtomica['venda'],
    baixados: Number(bruto.baixados || 0),
    tradeInId: bruto.trade_in_id || null,
    loteId: String(bruto.lote_id || ''),
  };
}
