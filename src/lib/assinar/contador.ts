/**
 * Números que contam ao entrar na tela (/assinar).
 * O componente escreve direto no textContent a cada frame; aqui só a conta.
 */

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1);

/** ease-out cúbico: começa rápido e assenta devagar no valor final. */
export function suavizarSaida(t: number): number {
  const c = clamp01(t);
  return 1 - Math.pow(1 - c, 3);
}

/** Valor mostrado depois de `decorridoMs`. Duração inválida mostra direto o final. */
export function valorDoContador(inicio: number, fim: number, decorridoMs: number, duracaoMs: number): number {
  if (!(duracaoMs > 0)) return fim;
  if (!(decorridoMs > 0)) return inicio;
  if (decorridoMs >= duracaoMs) return fim;
  return inicio + (fim - inicio) * suavizarSaida(decorridoMs / duracaoMs);
}

/** Formata no padrão brasileiro com casas fixas (99,90 · 1.234). */
export function formatarContador(valor: number, casas = 0): string {
  const v = Number.isFinite(valor) ? valor : 0;
  const fator = 10 ** casas;
  // Arredonda antes de formatar para 99,899999 não virar "99,9" com casas=1.
  const arredondado = Math.round(v * fator) / fator;
  return arredondado.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

/** true quando o contador já terminou (para parar o requestAnimationFrame). */
export function contadorTerminou(decorridoMs: number, duracaoMs: number): boolean {
  return !(duracaoMs > 0) || decorridoMs >= duracaoMs;
}
