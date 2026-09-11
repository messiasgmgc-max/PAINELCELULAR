/**
 * Venda cancelada continua no banco (histórico, auditoria, recibo), mas não entra em
 * faturamento, lucro, fiado nem cobrança.
 *
 * Antes, desfazer uma venda, estornar uma venda de atacado ou devolver o único
 * aparelho de uma venda APAGAVA o registro, sem rastro. E vendas importadas como
 * canceladas (16 numa loja, R$ 41 mil) entravam no faturamento do Dashboard, do
 * Atacado, do Super Admin e do bot.
 */

export const STATUS_CANCELADO = 'cancelado';

/** Filtro PostgREST para `.or(...)`: sozinho, `neq` descartaria vendas com status nulo. */
export const FILTRO_VENDA_VALIDA = `status.is.null,status.neq.${STATUS_CANCELADO}`;

export function vendaCancelada(venda: { status?: unknown } | null | undefined): boolean {
  const status = typeof venda?.status === 'string' ? venda.status.trim().toLowerCase() : '';
  return status.startsWith('cancel') || status.startsWith('estorn');
}

/** Venda que conta para faturamento, lucro, fiado e cobrança. */
export function vendaConta(venda: { status?: unknown } | null | undefined): boolean {
  return !!venda && !vendaCancelada(venda);
}

export interface Cancelamento {
  status: typeof STATUS_CANCELADO;
  cancelada_em: string;
  cancelada_por: string | null;
  motivo_cancelamento: string;
}

/** Campos gravados na venda no lugar de apagá-la. */
export function montarCancelamento(motivo: string, usuarioNome?: string | null, agora: Date = new Date()): Cancelamento {
  return {
    status: STATUS_CANCELADO,
    cancelada_em: agora.toISOString(),
    cancelada_por: usuarioNome?.trim() || null,
    motivo_cancelamento: motivo.trim().slice(0, 300) || 'Venda cancelada',
  };
}
