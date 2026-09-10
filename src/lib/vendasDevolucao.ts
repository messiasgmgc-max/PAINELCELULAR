/**
 * Regras para devolver ao estoque um aparelho cuja venda foi desfeita.
 */

export const CONDICOES_APARELHO = ['novo', 'seminovo', 'usado', 'danificado'] as const;
export type CondicaoAparelho = (typeof CONDICOES_APARELHO)[number];

/** Item de venda, na forma solta em que fica gravado no JSONB. */
export interface ItemVendaDevolucao {
  aparelhoId?: string;
  descricao?: string;
  /** Condição capturada no momento da venda, antes da baixa. */
  condicaoOriginal?: string;
  /** Condição que veio junto do item (importação do MercadoPhone, por exemplo). */
  condicao?: string;
}

function normalizar(valor: unknown): string {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Decide em que condição o aparelho volta ao estoque.
 *
 * A baixa da venda gravava 'vendido' na coluna `condicao`, por cima do valor original
 * (regra antiga, anterior ao ciclo de vida em src/lib/estoque/ciclo.ts), então
 * nesses registros a condição verdadeira só existe no que foi guardado na venda.
 * A versão antiga do "cancelar venda" devolvia tudo como 'seminovo' fixo — um
 * iPhone lacrado voltava ao estoque como seminovo, mudando a faixa de preço.
 *
 * Ordem de confiança: o que a venda registrou, o que veio no item, e só então o
 * palpite padrão.
 */
export function condicaoParaDevolucao(item: ItemVendaDevolucao | null | undefined): CondicaoAparelho {
  const candidatos = [item?.condicaoOriginal, item?.condicao];

  for (const bruto of candidatos) {
    const valor = normalizar(bruto);
    if (!valor) continue;

    // "Lacrado" é como a loja chama um aparelho novo nas descrições.
    if (valor === 'lacrado') return 'novo';

    // 'vendido' é o estado da baixa, não a condição real: ignora.
    if (valor === 'vendido') continue;

    if ((CONDICOES_APARELHO as readonly string[]).includes(valor)) {
      return valor as CondicaoAparelho;
    }
  }

  return 'seminovo';
}

/**
 * Decide se a devolução precisa gravar `condicao` e com qual valor.
 *
 * Pelo ciclo de vida, vender não mexe mais em `condicao`: o valor atual do
 * aparelho É o estado físico, e reescrevê-lo na devolução só perderia
 * informação (um 'lacrado' viraria 'novo'). Só registros antigos, baixados
 * quando a venda ainda gravava `condicao='vendido'`, precisam de reparo — sem
 * ele voltariam ao estoque ainda contados como fora dele (estaNoEstoque).
 *
 * Retorna `undefined` quando a condição atual deve ser mantida.
 */
export function condicaoAoDevolver(
  condicaoAtual: unknown,
  item: ItemVendaDevolucao | null | undefined
): CondicaoAparelho | undefined {
  if (normalizar(condicaoAtual) !== 'vendido') return undefined;
  return condicaoParaDevolucao(item);
}

/**
 * Remove das observações do aparelho as marcas que a venda deixou, para ele não
 * voltar ao estoque carregando texto de uma venda que não existe mais.
 */
export function limparObservacoesDeVenda(observacoes: unknown): string | null {
  const limpo = String(observacoes ?? '')
    .replace(/BAIXA_ESTOQUE:[^\n|]+(?:\|\s*)?/gi, '')
    .replace(/Venda (?:ATACADO|VAREJO)[^\n|]*(?:\|\s*)?/gi, '')
    .trim();

  return limpo || null;
}
