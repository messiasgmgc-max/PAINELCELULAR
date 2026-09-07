/**
 * Utilitário para formatação e sanitização de mensagens para WhatsApp.
 * Remove poluição visual, asteriscos soltos, duplos e garante padrão WhatsApp.
 */
export function sanitizarTextoWhatsApp(texto: string): string {
  if (!texto || typeof texto !== 'string') return '';

  let t = texto;

  // 1. Substitui asteriscos triplos ***texto*** por *texto*
  t = t.replace(/\*{3,}([^*\n]+?)\*{3,}/g, '*$1*');

  // 2. Substitui markdown tradicional de IA (**texto**) por negrito do WhatsApp (*texto*)
  t = t.replace(/\*{2}([^*\n]+?)\*{2}/g, '*$1*');

  // 3. Corrige espaços adjacentes aos asteriscos que impedem o WhatsApp de renderizar negrito:
  // Ex: "* texto *" -> "*texto*", "*texto *" -> "*texto*", "* texto*" -> "*texto*"
  t = t.replace(/(^|[\s([«"'])\*\s+([^*\n]+?)\s+\*([\s)\]»"'.,!?:;]|$)/g, '$1*$2*$3');
  t = t.replace(/(^|[\s([«"'])\*\s+([^*\n]+?)\*([\s)\]»"'.,!?:;]|$)/g, '$1*$2*$3');
  t = t.replace(/(^|[\s([«"'])\*([^*\n]+?)\s+\*([\s)\]»"'.,!?:;]|$)/g, '$1*$2*$3');

  // 4. Remove aninhamento inválido de marcadores:
  // Ex: "*• *Nome:* valor*" -> "• *Nome:* valor"
  t = t.replace(/\*\s*•\s*\*([^*\n]+?)\*/g, '• *$1*');

  // 5. Remove asteriscos colados duplicados
  t = t.replace(/\*{2,}/g, '*');

  // 6. Remove asteriscos órfãos soltos (ex: " * " ou isolados)
  t = t.replace(/(^|\s)\*\s*\*(\s|$)/g, '$1$2');
  t = t.replace(/(^|\s)\*(\s|$)/g, '$1$2');

  // 7. Corrige dois-pontos dentro do negrito com asterisco colado (*Nome:* ou *Nome: *)
  t = t.replace(/\*([^*\n:]+?):\s*\*/g, '*$1:*');

  // 8. Limpa quebras de linha excessivas (mais de 2 consecutivas) para manter mensagens compactas
  t = t.replace(/\n{3,}/g, '\n\n');

  return t.trim();
}