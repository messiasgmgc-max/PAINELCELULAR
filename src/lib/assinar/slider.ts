/**
 * Slider "antes x depois" (caderno e planilha x sistema) de /assinar.
 *
 * A posição vai de 0 a 100 (% da largura mostrando o "depois" à esquerda do
 * puxador). A cortina é feita só com transform: o recorte externo anda para a
 * esquerda e o conteúdo interno anda o mesmo tanto para a direita, então o
 * conteúdo fica parado e só a borda do recorte se move.
 */

const limitar = (v: number) => (Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 50);
const arred = (v: number) => Math.round(v * 100) / 100;

/** Posição (0–100) a partir do X do ponteiro e da caixa do slider. */
export function posicaoPorPonteiro(clienteX: number, esquerda: number, largura: number): number {
  if (!(largura > 0) || !Number.isFinite(clienteX) || !Number.isFinite(esquerda)) return 50;
  return arred(limitar(((clienteX - esquerda) / largura) * 100));
}

/** Nova posição para uma tecla (acessibilidade). Tecla sem ação devolve null. */
export function posicaoPorTecla(atual: number, tecla: string, passo = 5): number | null {
  const base = limitar(atual);
  switch (tecla) {
    case 'ArrowLeft':
    case 'ArrowDown':
      return limitar(base - passo);
    case 'ArrowRight':
    case 'ArrowUp':
      return limitar(base + passo);
    case 'PageDown':
      return limitar(base - 25);
    case 'PageUp':
      return limitar(base + 25);
    case 'Home':
      return 0;
    case 'End':
      return 100;
    default:
      return null;
  }
}

/** Deslocamentos (translateX em %) do recorte e do conteúdo para a posição dada. */
export function deslocamentosDaCortina(posicao: number): { recorte: number; conteudo: number } {
  const p = limitar(posicao);
  const recorte = arred(p - 100);
  const conteudo = arred(100 - p);
  return { recorte: recorte === 0 ? 0 : recorte, conteudo: conteudo === 0 ? 0 : conteudo };
}

/** Rótulo lido por leitores de tela. */
export function rotuloDoSlider(posicao: number): string {
  const p = Math.round(limitar(posicao));
  return `${p}% mostrando o sistema, ${100 - p}% mostrando caderno e planilha`;
}
