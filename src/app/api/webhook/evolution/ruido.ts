/**
 * Decide se uma mensagem de GRUPO merece ir para a IA.
 *
 * Num grupo o bot recebe a conversa inteira da equipe. Sem este filtro, cada
 * "kkk", "ok" ou xingamento virava uma chamada de IA — e o modelo, obrigado a
 * devolver JSON, classificava ruído como comando operacional. Foi assim que um
 * "Fdp" no grupo virou uma resposta de "Acesso Restrito" do bot.
 *
 * Vale SOMENTE para grupo. Em conversa privada o remetente já é um usuário
 * identificado da loja e respostas curtas ("pix", "2500", "sim") são legítimas,
 * porque completam uma ação pendente.
 */

/** Interjeições e reações que nunca são comando. */
const INTERJEICOES = new Set([
  'ok', 'okay', 'blz', 'beleza', 'valeu', 'vlw', 'obrigado', 'obrigada', 'obg',
  'sim', 'nao', 'não', 'aham', 'uhum', 'opa', 'oi', 'ola', 'olá', 'eae', 'salve',
  'boa', 'certo', 'isso', 'exato', 'top', 'show', 'perfeito', 'massa', 'daora',
  'ata', 'aff', 'eita', 'ixi', 'ufa', 'nossa', 'caramba', 'poxa', 'putz',
  'bom', 'dia', 'tarde', 'noite', 'ate', 'até', 'tchau', 'flw', 'falou', 'abraco', 'abraço',
]);

/** Palavrões e desabafos — jamais devem virar ação. */
const XINGAMENTOS = [
  'fdp', 'vsf', 'vtnc', 'pqp', 'tnc', 'krl', 'caralh', 'porra', 'merda', 'bosta',
  'idiota', 'burro', 'imbecil', 'otari', 'corno', 'arrombad', 'desgraç', 'desgrac',
  'puta', 'viado', 'lixo', 'droga', 'inferno', 'palhaç', 'palhac',
];

/** Verbos e substantivos que denunciam intenção operacional de verdade. */
const SINAIS_OPERACIONAIS = [
  'vend', 'compr', 'cadastr', 'registr', 'anota', 'lanç', 'lanc', 'baix',
  'abat', 'pag', 'receb', 'cobr', 'deve', 'devend', 'fiado', 'saldo',
  'estoque', 'aparelh', 'imei', 'preç', 'prec', 'valor', 'custo',
  'os ', 'ordem', 'garantia', 'agend', 'client', 'peça', 'peca', 'tecnic', 'técnic',
  'quanto', 'quais', 'quantos', 'tem ', 'busca', 'procur', 'consulta',
  'altera', 'muda', 'edita', 'corrig', 'remov', 'apaga', 'delet',
  'relatorio', 'relatório', 'faturamento', 'lucro', 'resumo', 'extrato',
];

function normalizar(texto: string): string {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export interface AvaliacaoRuido {
  ehRuido: boolean;
  motivo: string;
}

/**
 * `true` quando a mensagem de grupo deve ser descartada antes da IA.
 *
 * Conservador por construção: na dúvida deixa passar, porque um falso descarte
 * significa ignorar um comando de verdade do lojista.
 */
export function avaliarRuidoDeGrupo(texto: string): AvaliacaoRuido {
  const original = String(texto || '');
  const limpo = normalizar(original);

  if (!limpo) return { ehRuido: true, motivo: 'mensagem vazia' };

  // Comando explícito nunca é ruído — tem gate próprio mais adiante.
  if (original.trim().startsWith('!')) return { ehRuido: false, motivo: 'comando explícito' };

  const somenteLetrasNumeros = limpo.replace(/[^a-z0-9]/g, '');

  // Só emoji, pontuação ou reação ("kkkk", "rsrs", "hahaha").
  if (!somenteLetrasNumeros) return { ehRuido: true, motivo: 'sem texto útil' };
  if (/^(k+|r+s+|h?a+h+a*|e+i+|u+i+|z+)$/.test(somenteLetrasNumeros)) {
    return { ehRuido: true, motivo: 'risada/reação' };
  }

  const temSinalOperacional = SINAIS_OPERACIONAIS.some((s) => limpo.includes(s));

  // Xingamento sem nenhum pedido junto: descarta.
  // ("porra, cadastra o 12 aí" tem sinal operacional e passa.)
  if (!temSinalOperacional && XINGAMENTOS.some((x) => limpo.includes(x))) {
    return { ehRuido: true, motivo: 'xingamento/desabafo' };
  }

  const palavras = limpo.split(/\s+/).filter(Boolean);

  // Mensagem curta feita só de interjeições ("ok", "bom dia", "valeu demais").
  if (palavras.length <= 3 && palavras.every((p) => INTERJEICOES.has(p))) {
    return { ehRuido: true, motivo: 'interjeição' };
  }

  // Uma palavra só, sem sinal operacional, não é comando em grupo.
  if (palavras.length === 1 && !temSinalOperacional) {
    return { ehRuido: true, motivo: 'palavra solta sem intenção' };
  }

  return { ehRuido: false, motivo: temSinalOperacional ? 'sinal operacional' : 'texto livre' };
}
