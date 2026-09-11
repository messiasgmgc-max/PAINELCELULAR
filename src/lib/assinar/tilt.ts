/**
 * Inclinação 3D dos cartões e giro do iPhone de /assinar.
 *
 * Tudo aqui é conta pura: os componentes leem o ponteiro/giroscópio, chamam
 * estas funções e jogam o resultado em motion values (sem setState por frame).
 */

export interface EstadoTilt {
  /** rotateX em graus (positivo = topo vem para a frente). */
  rotX: number;
  /** rotateY em graus (positivo = lado direito vai para trás). */
  rotY: number;
  /** Posição do brilho em % da largura (0 = esquerda, 100 = direita). */
  brilhoX: number;
  /** Posição do brilho em % da altura (0 = topo, 100 = base). */
  brilhoY: number;
}

export const TILT_NEUTRO: Readonly<EstadoTilt> = Object.freeze({ rotX: 0, rotY: 0, brilhoX: 50, brilhoY: 50 });

const limitar = (v: number, min: number, max: number) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : 0);

/** Arredonda em 2 casas e troca -0 por 0 (evita "-0deg" no estilo). */
const arred = (v: number) => {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
};

function tiltNormalizado(nx: number, ny: number, maxGraus: number): EstadoTilt {
  return {
    rotX: arred(-ny * maxGraus),
    rotY: arred(nx * maxGraus),
    brilhoX: arred((nx + 1) * 50),
    brilhoY: arred((ny + 1) * 50),
  };
}

/**
 * Tilt a partir da posição do ponteiro dentro do cartão.
 * x/y relativos ao canto superior esquerdo; fora do cartão segura na borda.
 */
export function tiltPorPonteiro(x: number, y: number, largura: number, altura: number, maxGraus = 10): EstadoTilt {
  if (!(largura > 0) || !(altura > 0)) return { ...TILT_NEUTRO };
  const nx = limitar((x / largura) * 2 - 1, -1, 1);
  const ny = limitar((y / altura) * 2 - 1, -1, 1);
  return tiltNormalizado(nx, ny, maxGraus);
}

export interface PosturaAparelho {
  /** DeviceOrientationEvent.beta: frente/trás, -180..180. */
  beta: number;
  /** DeviceOrientationEvent.gamma: lateral, -90..90. */
  gamma: number;
}

/**
 * Tilt pelo giroscópio, relativo à postura em que a pessoa já segura o celular
 * (a primeira leitura). `amplitude` é quantos graus de giro do aparelho levam o
 * cartão ao máximo. Sem referência ou leitura inválida, fica neutro.
 */
export function tiltPorOrientacao(
  beta: number | null | undefined,
  gamma: number | null | undefined,
  referencia: PosturaAparelho | null,
  maxGraus = 6,
  amplitude = 25
): EstadoTilt {
  if (!referencia || typeof beta !== 'number' || typeof gamma !== 'number') return { ...TILT_NEUTRO };
  if (!Number.isFinite(beta) || !Number.isFinite(gamma) || !(amplitude > 0)) return { ...TILT_NEUTRO };
  const nx = limitar((gamma - referencia.gamma) / amplitude, -1, 1);
  const ny = limitar((beta - referencia.beta) / amplitude, -1, 1);
  return tiltNormalizado(nx, ny, maxGraus);
}

/** Ângulo do iPhone durante o arraste: ângulo de quando começou + deslocamento. */
export function anguloPorArraste(anguloInicial: number, deslocamentoPx: number, grausPorPx = 0.6): number {
  if (!Number.isFinite(anguloInicial)) anguloInicial = 0;
  if (!Number.isFinite(deslocamentoPx)) return arred(anguloInicial);
  return arred(anguloInicial + deslocamentoPx * grausPorPx);
}

/** Ao soltar, o iPhone volta para a frente mais próxima (múltiplo de 360°). */
export function anguloDeRepouso(angulo: number): number {
  if (!Number.isFinite(angulo)) return 0;
  const r = Math.round(angulo / 360) * 360;
  return r === 0 ? 0 : r;
}

/** Inclinação vertical do iPhone ao arrastar: segura em ±max para não virar de ponta-cabeça. */
export function inclinacaoPorArraste(inicial: number, deslocamentoPx: number, max = 18, grausPorPx = 0.25): number {
  return arred(limitar((Number.isFinite(inicial) ? inicial : 0) - deslocamentoPx * grausPorPx, -max, max));
}
