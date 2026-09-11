/**
 * Garantia padrão da loja, definida em Configurações (lojas.garantia_dias).
 * O PDV abria toda venda com "90 dias" fixo, mesmo com a loja configurada em 180.
 */
export const GARANTIA_DIAS_PADRAO = 90;

export function textoGarantiaPadrao(dias: unknown): string {
  const numero = Math.round(Number(dias));
  return `${Number.isFinite(numero) && numero > 0 ? numero : GARANTIA_DIAS_PADRAO} dias`;
}
