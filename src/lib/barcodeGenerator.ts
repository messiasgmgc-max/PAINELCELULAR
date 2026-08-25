// Helper para gerar código de barras Code128 em formato SVG string para etiquetas e recibos

export function generateCode128SvgString(text: string, options?: { height?: number; width?: number; showText?: boolean }): string {
  const code = String(text || '').trim();
  if (!code) return '';

  const height = options?.height || 36;
  const showText = options?.showText !== false;

  // Usa JsBarcode em ambiente browser ou fallback limpo
  if (typeof window !== 'undefined') {
    try {
      const JsBarcode = require('jsbarcode');
      const svgNode = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      JsBarcode(svgNode, code, {
        format: 'CODE128',
        width: options?.width || 1.5,
        height: height,
        displayValue: showText,
        fontSize: 10,
        margin: 2,
        background: '#ffffff',
        lineColor: '#000000',
      });
      return svgNode.outerHTML;
    } catch (e) {
      console.warn('JsBarcode SVG fallback:', e);
    }
  }

  // Fallback SVG simples
  return `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="${height}" viewBox="0 0 140 ${height}">
    <rect width="140" height="${height}" fill="#ffffff"/>
    <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="monospace" font-size="11" fill="#000000">${code}</text>
  </svg>`;
}
