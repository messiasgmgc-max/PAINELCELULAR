import { formatarSaudeBateria } from '@/lib/utils';

/**
 * Pedaços da lista de estoque copiada para o WhatsApp.
 *
 * A lista do MercadoPhone grava as observações assim:
 *   "Obs: (CAM USADA) | ID: 43364592 | Bateria: 89% | IMEI: 2275"
 * A versão anterior embrulhava o trecho inteiro em mais parênteses, gerando
 * "(Obs: (CAM USADA))", e procurava a bateria com um padrão que não casava com
 * "89% |" nem lia a coluna `saude_bateria`: a porcentagem sumia da lista.
 */

const LIMITE_OBSERVACAO = 40;
const SEGMENTO_TECNICO = /^(ID|IMEI|Bateria|Saúde|Saude|BAIXA_ESTOQUE)\s*:/i;
const EMOJI = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;

function tirarParentesesDeFora(texto: string): string {
  let atual = texto.trim();
  while (/^\(.*\)$/.test(atual)) {
    atual = atual.slice(1, -1).trim();
  }
  return atual;
}

/** Observação curta para a linha da lista: "CAM USADA", sem "Obs:" nem parênteses. */
export function observacaoParaLista(observacoes: unknown): string {
  if (typeof observacoes !== 'string' || !observacoes.trim()) return '';

  for (const bruto of observacoes.split('|')) {
    const segmento = bruto.replace(EMOJI, '').trim();
    if (!segmento || SEGMENTO_TECNICO.test(segmento)) continue;
    if (/^\d{1,3}\s*%(\s*bat[a-z]*)?$/i.test(segmento)) continue;

    const semRotulo = segmento.replace(/^(obs|observa[cç][aã]o|observa[cç][oõ]es)\s*:\s*/i, '');
    const limpo = tirarParentesesDeFora(semRotulo);
    if (limpo && limpo.length <= LIMITE_OBSERVACAO) return limpo;
  }
  return '';
}

/** Saúde da bateria para a lista ("89%"): coluna do aparelho ou, se faltar, a observação. */
export function bateriaParaLista(aparelho: object | null | undefined): string {
  if (!aparelho) return '';
  const daColuna = formatarSaudeBateria(aparelho);
  if (daColuna) return daColuna;

  const observacoes = String((aparelho as Record<string, unknown>).observacoes || '');
  const achado =
    observacoes.match(/bateria\s*:\s*(\d{1,3})\s*%?/i) || observacoes.match(/(\d{1,3})\s*%\s*bat/i);
  if (!achado) return '';
  const valor = Number(achado[1]);
  return valor > 0 && valor <= 100 ? `${valor}%` : '';
}
