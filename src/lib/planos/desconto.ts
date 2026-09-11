/**
 * Desconto na mensalidade que o administrador da plataforma dá para uma loja.
 *
 * Antes só existia o "valor_mensalidade" editável no Super Admin, mas o PIX e o cartão
 * calculavam o preço pela tabela do plano e ignoravam o campo: o desconto aparecia na
 * lista e não chegava na cobrança. O percentual fica na loja (a própria loja não
 * consegue alterar) e o mesmo cálculo roda no servidor e na tela.
 */

export const DESCONTO_MAXIMO = 90;
export const VALOR_MINIMO_COBRANCA = 1;

export interface DescontoLoja {
  percentual: number;
  /** Último dia com desconto (AAAA-MM-DD, horário de Brasília). Nulo: sem prazo. */
  validoAte: string | null;
  motivo: string | null;
}

interface CamposDesconto {
  desconto_percentual?: unknown;
  desconto_valido_ate?: unknown;
  desconto_motivo?: unknown;
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;

export function dataEmBrasilia(momento: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(momento);
}

/** AAAA-MM-DD -> DD/MM/AAAA */
export function formatarDataCurta(data: string): string {
  return data.split('-').reverse().join('/');
}

/** Desconto em vigor para a loja, ou nulo se não houver ou se o prazo já passou. */
export function lerDescontoLoja(loja: CamposDesconto | null | undefined, agora: Date = new Date()): DescontoLoja | null {
  if (!loja) return null;
  const percentual = Number(loja.desconto_percentual);
  if (!Number.isFinite(percentual) || percentual <= 0) return null;

  const bruto = typeof loja.desconto_valido_ate === 'string' ? loja.desconto_valido_ate.slice(0, 10) : '';
  const validoAte = DATA.test(bruto) ? bruto : null;
  if (validoAte && dataEmBrasilia(agora) > validoAte) return null;

  const motivo = typeof loja.desconto_motivo === 'string' && loja.desconto_motivo.trim() ? loja.desconto_motivo.trim() : null;
  return { percentual: Math.min(percentual, DESCONTO_MAXIMO), validoAte, motivo };
}

export function aplicarDesconto(valor: number, desconto: DescontoLoja | null | undefined) {
  const valorOriginal = Number(valor.toFixed(2));
  if (!desconto) return { valorOriginal, valorFinal: valorOriginal, economia: 0 };

  const comDesconto = Math.round(valorOriginal * (100 - desconto.percentual)) / 100;
  // O Mercado Pago não aceita cobrança abaixo de R$ 1.
  const valorFinal = Math.min(valorOriginal, Math.max(VALOR_MINIMO_COBRANCA, Number(comDesconto.toFixed(2))));
  return { valorOriginal, valorFinal, economia: Number((valorOriginal - valorFinal).toFixed(2)) };
}
