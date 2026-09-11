/**
 * Etiquetas pendentes.
 *
 * Aparelho que entra pela lista do MercadoPhone costuma ficar sem etiqueta: a lista é
 * rápida e a aba Etiquetas fica para depois. Numa loja, 53 de 111 aparelhos no estoque
 * nunca tiveram etiqueta impressa pelo sistema. Depois de aplicar a lista, o estoque
 * oferece gerar as etiquetas e abre a aba Etiquetas com esses aparelhos marcados.
 *
 * "Sem etiqueta" = contador `etiquetas_impressas` zerado. Só conta o que foi impresso
 * pelo sistema: etiqueta feita à mão não aparece aqui.
 */

const CHAVE = 'phonecenter:etiquetas:preselecao';
const VALIDADE_MS = 15 * 60 * 1000;

type Armazenamento = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function armazenamentoPadrao(): Armazenamento | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

export function etiquetasImpressas(aparelho: object | null | undefined): number {
  if (!aparelho) return 0;
  const a = aparelho as Record<string, unknown>;
  return Number(a.etiquetas_impressas ?? a.etiquetasImpressas ?? 0) || 0;
}

export function semEtiqueta(aparelho: object | null | undefined): boolean {
  return !!aparelho && etiquetasImpressas(aparelho) === 0;
}

/** Ids de uma lista aplicada que precisam de etiqueta: os novos e os existentes nunca etiquetados. */
export function idsParaEtiquetar(params: {
  idsCriados: string[];
  atualizados: Array<{ id: string } & object>;
}): string[] {
  const existentes = params.atualizados.filter(semEtiqueta).map((a) => a.id);
  return Array.from(new Set([...params.idsCriados, ...existentes].filter(Boolean)));
}

/** Guarda os aparelhos que a aba Etiquetas deve abrir marcados. */
export function guardarPreselecaoEtiquetas(
  ids: string[],
  armazenamento: Armazenamento | null = armazenamentoPadrao(),
  agora: number = Date.now()
): void {
  if (!armazenamento || ids.length === 0) return;
  try {
    armazenamento.setItem(CHAVE, JSON.stringify({ ids, criadoEm: agora }));
  } catch {
    // Sem armazenamento (aba anônima, cota cheia): a aba abre com a seleção padrão.
  }
}

/** Lê e apaga a pré-seleção. Vencida ou inválida vira null. */
export function consumirPreselecaoEtiquetas(
  armazenamento: Armazenamento | null = armazenamentoPadrao(),
  agora: number = Date.now()
): string[] | null {
  if (!armazenamento) return null;
  try {
    const bruto = armazenamento.getItem(CHAVE);
    armazenamento.removeItem(CHAVE);
    if (!bruto) return null;
    const dados = JSON.parse(bruto) as { ids?: unknown; criadoEm?: unknown };
    if (typeof dados.criadoEm !== 'number' || agora - dados.criadoEm > VALIDADE_MS) return null;
    const ids = Array.isArray(dados.ids) ? dados.ids.filter((id): id is string => typeof id === 'string' && id.length > 0) : [];
    return ids.length > 0 ? ids : null;
  } catch {
    return null;
  }
}
