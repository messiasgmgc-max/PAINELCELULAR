/**
 * O PostgREST devolve no máximo 1000 linhas por requisição, sem avisar. Uma loja com
 * 1339 vendas via só 1000 no Dashboard e no Atacado: faturamento e fiado errados.
 *
 * Use com uma ordenação estável (termine com .order('id')), senão uma linha pode
 * pular de página entre uma requisição e outra.
 */

export const TAMANHO_PAGINA = 1000;
const LIMITE_PAGINAS = 200;

type Resposta<T> = { data: T[] | null; error: unknown };

export async function buscarTodasPaginas<T>(
  consultar: (de: number, ate: number) => PromiseLike<Resposta<T>>,
  tamanho: number = TAMANHO_PAGINA
): Promise<T[]> {
  const todas: T[] = [];
  for (let pagina = 0; pagina < LIMITE_PAGINAS; pagina += 1) {
    const de = pagina * tamanho;
    const { data, error } = await consultar(de, de + tamanho - 1);
    if (error) throw error;
    const lote = data || [];
    todas.push(...lote);
    if (lote.length < tamanho) return todas;
  }
  throw new Error(`Consulta passou de ${LIMITE_PAGINAS * tamanho} linhas.`);
}
