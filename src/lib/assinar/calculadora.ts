/**
 * Calculadora de prejuízo de /assinar (aversão à perda com os números da própria loja).
 *
 * Não há número "mágico" escondido: a perda é vendas do mês × % que o lojista
 * acha que perde por demora × lucro médio por aparelho. Os três vêm de sliders
 * que ele ajusta; os valores iniciais são só ponto de partida e aparecem na tela.
 */

export interface EntradaPrejuizo {
  /** Aparelhos vendidos por mês. */
  vendasMes: number;
  /** Lucro médio por aparelho, em R$. */
  lucroMedio: number;
  /** % das vendas que se perde por demorar a responder (0–100). */
  percentualPerdido: number;
}

export interface ResultadoPrejuizo {
  vendasPerdidasMes: number;
  prejuizoMes: number;
  prejuizoAno: number;
}

/** Ponto de partida dos sliders (o lojista ajusta para a realidade dele). */
export const PADRAO_CALCULADORA: Readonly<EntradaPrejuizo> = Object.freeze({
  vendasMes: 45,
  lucroMedio: 350,
  percentualPerdido: 10,
});

export const LIMITES_CALCULADORA = Object.freeze({
  vendasMes: { min: 5, max: 300, passo: 5 },
  lucroMedio: { min: 50, max: 1500, passo: 50 },
  percentualPerdido: { min: 1, max: 30, passo: 1 },
});

const naoNegativo = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0);

export function calcularPrejuizo(entrada: EntradaPrejuizo): ResultadoPrejuizo {
  const vendas = naoNegativo(entrada.vendasMes);
  const lucro = naoNegativo(entrada.lucroMedio);
  const pct = Math.min(100, naoNegativo(entrada.percentualPerdido));
  const vendasPerdidasMes = Math.round(vendas * pct) / 100;
  const prejuizoMes = Math.round(vendasPerdidasMes * lucro);
  return { vendasPerdidasMes, prejuizoMes, prejuizoAno: prejuizoMes * 12 };
}

/** Quantas mensalidades inteiras o prejuízo do mês pagaria. */
export function mensalidadesCobertas(prejuizoMes: number, mensalidade: number): number {
  if (!(mensalidade > 0)) return 0;
  return Math.floor(naoNegativo(prejuizoMes) / mensalidade);
}

/**
 * Escala das duas barras (prejuízo x mensalidade), de 0 a 1, relativa à maior.
 * Vira scaleX no componente. Mínimo visível de 2% para a barra não sumir.
 */
export function escalaDasBarras(prejuizoMes: number, mensalidade: number): { prejuizo: number; mensalidade: number } {
  const a = naoNegativo(prejuizoMes);
  const b = naoNegativo(mensalidade);
  const maior = Math.max(a, b);
  if (maior === 0) return { prejuizo: 0.02, mensalidade: 0.02 };
  const escala = (v: number) => Math.max(0.02, Math.round((v / maior) * 1000) / 1000);
  return { prejuizo: escala(a), mensalidade: escala(b) };
}

/**
 * Ângulo do ponteiro do medidor (-90° = zero, +90° = fundo de escala).
 * O fundo de escala é só visual e aparece escrito no medidor.
 */
export function anguloDoMedidor(prejuizoMes: number, fundoDeEscala: number): number {
  if (!(fundoDeEscala > 0)) return -90;
  const t = Math.min(1, naoNegativo(prejuizoMes) / fundoDeEscala);
  return Math.round((-90 + 180 * t) * 10) / 10;
}

export function formatarReais(valor: number): string {
  const v = Number.isFinite(valor) ? valor : 0;
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
