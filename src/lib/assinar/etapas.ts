/**
 * "Como funciona" de /assinar: etapas que se levantam em 3D conforme o scroll.
 *
 * O progresso (0–1) é o da seção na tela. Cada etapa tem uma janela própria,
 * escalonada; antes dela a carta está deitada e afundada, depois fica reta.
 * Rolar para cima deita de novo (é só função do progresso).
 */

export interface EstadoEtapa {
  opacidade: number;
  /** rotateX em graus: 0 = de pé, positivo = deitada para trás. */
  rotX: number;
  /** translateY em px. */
  y: number;
  /** translateZ em px (negativo = mais longe). */
  z: number;
  escala: number;
}

export const ETAPA_REVELADA: Readonly<EstadoEtapa> = Object.freeze({ opacidade: 1, rotX: 0, y: 0, z: 0, escala: 1 });

/** Largura da janela de cada etapa, em fração do progresso da seção. */
const JANELA = 0.28;
/** Até onde (fração do progresso) a última etapa termina de subir. */
const FIM_ULTIMA = 0.9;

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
const arred = (v: number) => {
  const r = Math.round(v * 1000) / 1000;
  return r === 0 ? 0 : r;
};

/** Início e fim (em progresso da seção) da janela da etapa `indice` de `total`. */
export function janelaDaEtapa(indice: number, total: number): { inicio: number; fim: number } {
  if (!(total > 1)) return { inicio: 0, fim: JANELA };
  const i = Math.min(total - 1, Math.max(0, Math.floor(indice)));
  const inicio = ((FIM_ULTIMA - JANELA) * i) / (total - 1);
  return { inicio: arred(inicio), fim: arred(inicio + JANELA) };
}

export function estadoDaEtapa(progresso: number, indice: number, total: number): EstadoEtapa {
  const { inicio, fim } = janelaDaEtapa(indice, total);
  const t = clamp01((clamp01(progresso) - inicio) / (fim - inicio));
  const s = t * t * (3 - 2 * t);
  const falta = 1 - s;
  return {
    opacidade: arred(s),
    rotX: arred(falta * 58),
    y: arred(falta * 70),
    z: arred(falta * -180),
    escala: arred(0.9 + 0.1 * s),
  };
}

/** Índice da etapa em destaque (a última que já passou da metade da janela), -1 se nenhuma. */
export function etapaEmDestaque(progresso: number, total: number): number {
  let destaque = -1;
  for (let i = 0; i < total; i += 1) {
    const { inicio, fim } = janelaDaEtapa(i, total);
    if (clamp01(progresso) >= (inicio + fim) / 2) destaque = i;
  }
  return destaque;
}
