import { redirect } from 'next/navigation';

/** Endereço antigo da página de teste: a animação virou a /assinar principal. */
export default async function AssinarTeste3dRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams();
  for (const [chave, valor] of Object.entries(await searchParams)) {
    for (const v of Array.isArray(valor) ? valor : valor === undefined ? [] : [valor]) params.append(chave, v);
  }
  const query = params.toString();
  redirect(query ? `/assinar?${query}` : '/assinar');
}
