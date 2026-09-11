/**
 * Recibo A4 (src/lib/reciboA4.ts) pronto para virar PDF dentro da própria página.
 *
 * O recibo é um documento HTML inteiro, feito para abrir numa janela e imprimir: tem
 * <style> com regras para body e table e um script que chama window.print(). Para gerar
 * o PDF sem abrir janela, o conteúdo entra num container da página; sem escopo, essas
 * regras mudariam por um instante as tabelas do próprio sistema.
 */

export const CLASSE_RECIBO_PDF = 'recibo-pdf';

function escoparCss(css: string, classe: string): string {
  return css.replace(/([^{}]+)\{/g, (_trecho, seletores: string) => {
    const lista = seletores
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => (/^(html|body)$/i.test(s) ? `.${classe}` : `.${classe} ${s}`));
    return `${lista.join(', ')} {`;
  });
}

export function escoparHtmlRecibo(html: string, classe: string = CLASSE_RECIBO_PDF): string {
  const estilos = Array.from(html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi))
    .map((m) => m[1])
    .join('\n');
  const corpo = (html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .trim();
  return `<div class="${classe}"><style>${escoparCss(estilos, classe)}</style>${corpo}</div>`;
}

interface NoDeEstilo {
  closest(seletor: string): unknown;
  remove(): void;
}

/**
 * Tira da cópia da página (onclone do html2canvas) os estilos do sistema, mantendo só o
 * CSS do recibo. O Tailwind do sistema usa cores oklch, que o html2canvas não entende:
 * "Attempting to parse an unsupported color function 'oklch'", e o PDF não era gerado.
 */
export function removerEstilosDoSistema(
  doc: { querySelectorAll(seletor: string): ArrayLike<NoDeEstilo> },
  classe: string = CLASSE_RECIBO_PDF
): number {
  let removidos = 0;
  for (const no of Array.from(doc.querySelectorAll('link[rel="stylesheet"], style'))) {
    if (no.closest(`.${classe}`)) continue;
    no.remove();
    removidos += 1;
  }
  return removidos;
}
