/**
 * Confirmação de operação em massa digitando a QUANTIDADE de aparelhos afetados.
 *
 * Digitar o nome da loja virava gesto automático: a pessoa digitava sem olhar o
 * número. Pedir a quantidade obriga a ler quantos aparelhos vão mudar — o que
 * teria chamado a atenção na remontagem de 10/09/2026, que baixou 112 de uma vez.
 */

/** Aceita "112", " 112 " e "1.200"; recusa texto, vazio e quantidade zero. */
export function quantidadeDigitadaConfere(digitado: string | null | undefined, quantidade: number): boolean {
  if (!Number.isInteger(quantidade) || quantidade <= 0) return false;
  const limpo = String(digitado ?? '')
    .trim()
    .replace(/[.\s]/g, '');
  if (!/^\d+$/.test(limpo)) return false;
  return Number(limpo) === quantidade;
}
