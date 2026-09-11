/**
 * Linha do tempo da experiência 3D de /assinar.
 *
 * O scroll vira um progresso de 0 a 1 e cada propriedade da cena é lida daqui:
 * rolar para baixo avança, rolar para cima volta, parar em qualquer ponto é um
 * estado válido. Em 1 tudo é identidade (tela = viewport, sem rotação, sem
 * chassi), para a troca pela página real ser invisível.
 *
 * Trechos (desktop):
 *   0 → 0.20  notebook fechado ao longe, texto de abertura, tampa começa a abrir
 *   0.20→0.45 tampa abre de vez, câmera aproxima, interface acende na tela
 *   0.45→0.70 câmera entra na tela, notebook sai pelas bordas
 *   0.70→0.90 chassi some, tela vira a própria viewport
 *   0.90→1    identidade; a página real assume
 */

export interface EstadoCena {
  /** Ângulo da tampa (rotateX, graus). Negativo = deitada sobre a base. 0 = de frente. */
  tampa: number;
  /** Inclinação do conjunto (rotateX, graus): câmera vendo de cima. */
  inclinacao: number;
  /** Giro lateral do conjunto (rotateY, graus), usado no celular. */
  giro: number;
  escala: number;
  /** Deslocamento vertical do conjunto, em % da altura da viewport. */
  deslocY: number;
  /** Opacidade da interface dentro da tela. */
  ui: number;
  /** Reflexo/brilho sobre o vidro. */
  brilho: number;
  /** Opacidade da moldura, base e sombra. */
  chassi: number;
  /** Raio dos cantos da tela, em px. */
  raio: number;
  /** Opacidade do texto de abertura. */
  intro: number;
  /** Opacidade dos botões (rolar / pular). */
  botoes: number;
}

/** Altura total rolada durante a animação, em vh. */
export const ALTURA_ROLAGEM_VH = { desktop: 400, mobile: 260 } as const;

/** A partir daqui a cena é escondida e a página real recebe os cliques. */
export const PROGRESSO_ENTRADA = 0.985;

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** Interpolação linear por trechos; fora do intervalo segura o valor da ponta. */
export function interpolar(p: number, xs: readonly number[], ys: readonly number[]): number {
  if (xs.length !== ys.length || xs.length === 0) throw new Error('interpolar: listas com tamanhos diferentes');
  if (p <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i += 1) {
    if (p <= xs[i]) {
      const t = (p - xs[i - 1]) / (xs[i] - xs[i - 1]);
      // ease-in-out por trecho: sem "degraus" na troca de trecho e movimento mais cinematográfico.
      const s = t * t * (3 - 2 * t);
      return ys[i - 1] + (ys[i] - ys[i - 1]) * s;
    }
  }
  return ys[ys.length - 1];
}

const T = [0, 0.2, 0.45, 0.7, 0.9, 1] as const;

export function estadoDaCena(progresso: number, mobile = false): EstadoCena {
  const p = clamp01(progresso);

  if (mobile) {
    // Celular: tela em pé (a viewport é vertical), sem base; o aparelho gira de leve e aproxima.
    return {
      tampa: 0,
      inclinacao: interpolar(p, T, [-12, -10, -6, -2, 0, 0]),
      giro: interpolar(p, T, [-26, -18, -8, -2, 0, 0]),
      escala: interpolar(p, T, [0.6, 0.64, 0.76, 0.94, 1, 1]),
      deslocY: interpolar(p, T, [10, 8, 2, 0, 0, 0]),
      ui: interpolar(p, [0, 0.22, 0.45], [0, 0, 1]),
      brilho: interpolar(p, T, [0.8, 0.8, 0.5, 0.2, 0, 0]),
      chassi: interpolar(p, T, [1, 1, 1, 1, 0, 0]),
      raio: interpolar(p, T, [34, 34, 30, 22, 0, 0]),
      intro: interpolar(p, [0, 0.1, 0.2], [1, 1, 0]),
      botoes: interpolar(p, [0, 0.72, 0.85], [1, 1, 0]),
    };
  }

  return {
    tampa: interpolar(p, T, [-86, -42, 12, 4, 0, 0]),
    inclinacao: interpolar(p, T, [-24, -22, -14, -5, 0, 0]),
    giro: 0,
    escala: interpolar(p, T, [0.5, 0.56, 0.68, 0.9, 1, 1]),
    // Fechado, o notebook fica todo abaixo da dobradiça: sobe para centralizar a composição.
    deslocY: interpolar(p, T, [-25, -22, 0, 0, 0, 0]),
    ui: interpolar(p, [0, 0.28, 0.45], [0, 0, 1]),
    brilho: interpolar(p, T, [0.9, 0.9, 0.55, 0.25, 0, 0]),
    chassi: interpolar(p, T, [1, 1, 1, 1, 0, 0]),
    raio: interpolar(p, T, [26, 26, 26, 20, 0, 0]),
    intro: interpolar(p, [0, 0.12, 0.22], [1, 1, 0]),
    botoes: interpolar(p, [0, 0.72, 0.85], [1, 1, 0]),
  };
}
