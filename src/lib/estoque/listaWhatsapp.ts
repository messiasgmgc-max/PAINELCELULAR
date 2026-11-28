import { formatarSaudeBateria, getAparelhoCodigo } from '@/lib/utils';
import { isAparelhoEmManutencao } from '@/lib/manutencao';
import { estaNoEstoque } from '@/lib/estoque/ciclo';

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

export function observacaoParaLista(observacoes: unknown): string {
  if (typeof observacoes !== 'string' || !observacoes.trim()) return '';

  const semTagsManutencao = observacoes.replace(/\[MANUTENCAO:[^\]]*\]/gi, '');

  for (const bruto of semTagsManutencao.split('|')) {
    const segmento = bruto.replace(EMOJI, '').trim();
    if (!segmento || SEGMENTO_TECNICO.test(segmento)) continue;
    if (/^\d{1,3}\s*%(\s*bat[a-z]*)?$/i.test(segmento)) continue;

    const semRotulo = segmento.replace(/^(obs|observa[cç][aã]o|observa[cç][oõ]es)\s*:\s*/i, '');
    const limpo = tirarParentesesDeFora(semRotulo);
    if (limpo && limpo.length <= LIMITE_OBSERVACAO) return limpo;
  }
  return '';
}

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

export function getEmojiItem(a: any): string {
  const mod = String(a?.modelo || '').toLowerCase();
  const cor = String(a?.cor || '').toLowerCase();

  if (mod.includes('macbook') || mod.includes('mac book')) return '💻';
  if (mod.includes('watch')) return '⌚️';
  if (mod.includes('pencil')) return '✏️';
  if (mod.includes('ps5') || mod.includes('ps4') || mod.includes('xbox') || mod.includes('nintendo') || mod.includes('switch')) return '🎮';
  if (mod.includes('airpods') || mod.includes('airpod')) return '🎧';

  if (cor.includes('desert') || cor.includes('deserto')) return '🏜';
  if (cor.includes('natural') || cor.includes('cinza') || cor.includes('gray') || cor.includes('grey')) return '🔘';
  if (cor.includes('branco') || cor.includes('white') || cor.includes('silver') || cor.includes('prata') || cor.includes('starlight') || cor.includes('estelar')) return '⚪️';
  if (cor.includes('preto') || cor.includes('black') || cor.includes('grafite') || cor.includes('dark') || cor.includes('midnight') || cor.includes('meia-noite') || cor.includes('space')) return '⚫️';
  if (cor.includes('azul') || cor.includes('blue') || cor.includes('sierra') || cor.includes('pacifico')) return '🔵';
  if (cor.includes('roxo') || cor.includes('purple') || cor.includes('lilás') || cor.includes('lilas') || cor.includes('violeta')) return '🟣';
  if (cor.includes('rosa') || cor.includes('pink') || cor.includes('rose')) return '🌸';
  if (cor.includes('dourado') || cor.includes('gold') || cor.includes('amarelo') || cor.includes('yellow')) return '🟡';
  if (cor.includes('verde') || cor.includes('green') || cor.includes('alpino')) return '🟢';
  if (cor.includes('vermelho') || cor.includes('red')) return '🔴';
  if (cor.includes('laranja') || cor.includes('orange')) return '🟧';

  return '📱';
}

const REGEX_NAO_IPHONE =
  /\b(samsung|galaxy|xiaomi|redmi|poco|motorola|moto|edge|realme|infinix|oppo|oneplus|asus|google|pixel|nokia|huawei|honor|sony|ps5|ps4|playstation|xbox|nintendo|switch|ipad|watch|macbook|mac\s*book|pencil|airpods?|jbl|perfume|capinha|pelicula|pel[ií]cula|cabo|fonte|carregador)\b/i;

const OUTROS_APPLE_ORDEM = ['ipad', 'watch', 'macbook', 'mac book', 'pencil', 'airpod'];

interface ChaveOrdenacaoModelo {
  /** 0 = iPhone, 1 = outros Apple, 2 = demais marcas/modelos */
  tier: number;
  /** Geração numérica (maior = mais novo). Para outros Apple, índice negativo na lista. */
  geracao: number;
  /** Sub-ordem dentro da mesma geração: 0=Pro Max, 1=Pro, 2=Plus, 3=Air, 4=Base, 5=e, 6=Mini */
  variante: number;
  texto: string;
}

export function extrairChaveOrdenacaoModelo(modelo: string): ChaveOrdenacaoModelo {
  const limpo = String(modelo || '')
    .replace(/^Apple\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  const lower = limpo.toLowerCase();

  // 1. Outros produtos Apple (iPad, Watch, MacBook, Pencil, AirPods)
  const idxApple = OUTROS_APPLE_ORDEM.findIndex((p) => lower.includes(p));
  if (idxApple !== -1) {
    return { tier: 1, geracao: -idxApple, variante: 0, texto: lower };
  }

  // 2. Linha iPhone (suporta qualquer geração numérica: 20, 19, 18, 17, 16, 16e, 15... até 6, X/XR/XS/SE)
  if (!REGEX_NAO_IPHONE.test(lower)) {
    // 2a. Gerações numéricas (ex: iPhone 18 Pro Max, 18 Pro, 17 Air, iPhone 16e, 16e, iPhone 13 Mini)
    const matchNum = lower.match(
      /^(?:iphone\s*|ip\s*)?(2\d|1\d|[6-9])(?:\s*(e)\b|\s+(pro\s*max|promax|p\s*max|pm|pro|plus|\+|air|mini)\b|\b)/i
    );
    if (matchNum) {
      const geracao = Number(matchNum[1]);
      const sufixoE = Boolean(matchNum[2]);
      const sufixo = (matchNum[3] || '').toLowerCase().replace(/\s+/g, '');

      let variante = 4; // Base (ex: iPhone 16, iPhone 18)
      if (sufixoE || /\b\d+\s*e\b/.test(lower)) {
        variante = 5; // iPhone 16e logo abaixo do iPhone 16 (dentro da família 16)
      } else if (['promax', 'pmax', 'pm'].includes(sufixo) || /\bpro\s*max\b/.test(lower)) {
        variante = 0;
      } else if (sufixo === 'pro' || /\bpro\b/.test(lower)) {
        variante = 1;
      } else if (sufixo === 'plus' || sufixo === '+' || /\bplus\b/.test(lower)) {
        variante = 2;
      } else if (sufixo === 'air' || /\bair\b/.test(lower)) {
        variante = 3;
      } else if (sufixo === 'mini' || /\bmini\b/.test(lower)) {
        variante = 6;
      }

      return { tier: 0, geracao, variante, texto: lower };
    }

    // 2b. Linha X (XS Max, XS, XR, X)
    const matchX = lower.match(/^(?:iphone\s*|ip\s*)?(xs\s*max|xs|xr|x)\b/i);
    if (matchX) {
      const tok = matchX[1].replace(/\s+/g, '');
      const geracao = tok === 'xsmax' ? 10.4 : tok === 'xs' ? 10.3 : tok === 'xr' ? 10.2 : 10.1;
      return { tier: 0, geracao, variante: 0, texto: lower };
    }

    // 2c. Linha SE (SE 3, SE 2, SE)
    const matchSe = lower.match(/^(?:iphone\s*|ip\s*)?se(?:\s*(?:\(?(\d)))?/i);
    if (matchSe) {
      const sub = matchSe[1] ? Number(matchSe[1]) : 0;
      return { tier: 0, geracao: 6 + sub * 0.1, variante: 0, texto: lower };
    }
  }

  // 3. Demais marcas / modelos
  return { tier: 2, geracao: 0, variante: 0, texto: lower };
}

export function sortGruposModelos(a: string, b: string): number {
  const ka = extrairChaveOrdenacaoModelo(a);
  const kb = extrairChaveOrdenacaoModelo(b);

  if (ka.tier !== kb.tier) return ka.tier - kb.tier;
  if (ka.geracao !== kb.geracao) return kb.geracao - ka.geracao;
  if (ka.variante !== kb.variante) return ka.variante - kb.variante;
  return a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' });
}

function normalizarNomeGrupoModelo(modeloBruto: unknown): { chave: string; titulo: string } {
  const raw = String(modeloBruto || '')
    .replace(/^Apple\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!raw) return { chave: 'outros', titulo: 'Outros' };

  const keyInfo = extrairChaveOrdenacaoModelo(raw);
  let titulo = raw;

  if (keyInfo.tier === 0) {
    // Garante prefixo consistente "iPhone " e padroniza sufixo "16e", "Pro Max", "Pro", "Plus", "Air", "Mini"
    if (/^ip\s+/i.test(titulo)) {
      titulo = titulo.replace(/^ip\s+/i, 'iPhone ');
    } else if (/^iphone\b/i.test(titulo)) {
      titulo = titulo.replace(/^iphone\b/i, 'iPhone');
    } else {
      titulo = `iPhone ${titulo}`;
    }

    titulo = titulo
      .replace(/\b(\d{1,2})\s*e\b/gi, '$1e')
      .replace(/\bpro\s*max\b/gi, 'Pro Max')
      .replace(/\bpromax\b/gi, 'Pro Max')
      .replace(/\bpro\b/gi, 'Pro')
      .replace(/\bplus\b/gi, 'Plus')
      .replace(/\bair\b/gi, 'Air')
      .replace(/\bmini\b/gi, 'Mini')
      .replace(/\bxs\s*max\b/gi, 'XS Max')
      .replace(/\bxs\b/gi, 'XS')
      .replace(/\bxr\b/gi, 'XR')
      .replace(/\bse\b/gi, 'SE')
      .replace(/\s+/g, ' ')
      .trim();
  }

  return {
    chave: titulo.toLowerCase(),
    titulo,
  };
}

function quantidadeItem(a: any): number {
  const q = Number(a?.quantidade);
  return Number.isFinite(q) && q > 1 ? Math.floor(q) : 1;
}

function capacidadeParaNumero(capacidade: unknown): number {
  const txt = String(capacidade || '').toLowerCase().trim();
  if (!txt || txt === 'n/a') return Number.MAX_SAFE_INTEGER;
  const matchTb = txt.match(/(\d+(?:[.,]\d+)?)\s*tb/);
  if (matchTb) return parseFloat(matchTb[1].replace(',', '.')) * 1024;
  const matchGb = txt.match(/(\d+)/);
  if (matchGb) return parseInt(matchGb[1], 10);
  return Number.MAX_SAFE_INTEGER;
}

function bateriaParaNumero(a: any): number {
  const str = bateriaParaLista(a);
  const num = parseInt(str.replace(/\D/g, ''), 10);
  return Number.isFinite(num) ? num : -1;
}

type TipoSecaoEstoque =
  | 'lacrado'
  | 'seminovo'
  | 'danificado'
  | 'acessorio'
  | 'perfume'
  | 'outro'
  | 'manutencao';

interface DefinicaoSecao {
  id: TipoSecaoEstoque;
  emoji: string;
  tituloSecao: string;
  rotuloResumo: string;
}

const SECOES_ESTOQUE: DefinicaoSecao[] = [
  { id: 'lacrado', emoji: '🆕', tituloSecao: 'LACRADOS / NOVOS', rotuloResumo: 'Lacrados/Novos' },
  { id: 'seminovo', emoji: '📱', tituloSecao: 'SEMINOVOS', rotuloResumo: 'Seminovos' },
  { id: 'danificado', emoji: '⚠️', tituloSecao: 'COM DETALHE', rotuloResumo: 'Com detalhe' },
  { id: 'acessorio', emoji: '🎧', tituloSecao: 'ACESSÓRIOS', rotuloResumo: 'Acessórios' },
  { id: 'perfume', emoji: '🧴', tituloSecao: 'PERFUMES', rotuloResumo: 'Perfumes' },
  { id: 'outro', emoji: '📦', tituloSecao: 'OUTROS', rotuloResumo: 'Outros' },
  { id: 'manutencao', emoji: '🔧', tituloSecao: 'EM MANUTENÇÃO', rotuloResumo: 'Em manutenção' },
];

export function classificarTipoEstoque(a: any): TipoSecaoEstoque {
  if (isAparelhoEmManutencao(a)) return 'manutencao';

  const cat = String(a?.categoria || '').toLowerCase().trim();
  if (cat === 'acessorio' || cat === 'acessório') return 'acessorio';
  if (cat === 'perfume') return 'perfume';
  if (cat === 'outro') return 'outro';

  const cond = String(a?.condicao || '').toLowerCase().trim();
  if (cond === 'novo' || cond === 'lacrado' || cond === 'novo/lacrado' || cond === 'lacrado/novo' || cond === 'new' || cond === 'sealed') {
    return 'lacrado';
  }
  if (cond === 'danificado') {
    return 'danificado';
  }
  if (!cond) {
    const modObs = `${a?.modelo || ''} ${a?.observacoes || ''}`.toLowerCase();
    if (/\blacrado\b/.test(modObs)) return 'lacrado';
  }

  return 'seminovo';
}

export interface OpcoesListaEstoque {
  modoAtacado?: boolean;
  nomeLoja?: string;
  /** Inclui IMEI/código no modo atacado (usado em `!estoque completo`). Padrão: false no atacado, true no estoque normal. */
  incluirCodigo?: boolean;
  /** Inclui aparelhos em manutenção na lista (usado em `!estoque completo`). Padrão: false. */
  incluirManutencao?: boolean;
}

export type ModoComandoListaEstoque = 'estoque' | 'atacado' | 'completo';

/**
 * Identifica se uma mensagem do WhatsApp pede a lista de estoque
 * (`!estoque`, `!lista`, `!lista atacado`, `!estoque completo`, etc.)
 * e retorna o modo correspondente, ou `null` se não for um pedido de lista.
 */
export function detectarComandoListaEstoque(texto: string): ModoComandoListaEstoque | null {
  const lower = String(texto || '').trim().toLowerCase();
  if (!lower) return null;

  const ehPedido =
    /^!\s*estoque\b/i.test(lower) ||
    /^!\s*lista(?:\s*atacado)?\b/i.test(lower) ||
    lower === 'estoque' ||
    lower === 'cardapio' ||
    lower === 'cardápio' ||
    lower === 'tabela' ||
    /^(?:manda|envia|gera|passa|ver|quero)?\s*(?:a\s+)?lista(?:\s+(?:atualizada|de\s+estoque|do\s+estoque|(?:de\s+|do\s+|no\s+)?atacado))?$/i.test(
      lower
    );

  if (!ehPedido) return null;

  if (/\batacado\b/i.test(lower) || /^!\s*listaatacado\b/i.test(lower)) {
    return 'atacado';
  }
  if (lower.includes('complet') || lower.includes('detalhe')) {
    return 'completo';
  }
  return 'estoque';
}

function valorAtacadoItem(a: any): number {
  const candidatos = [a?.precoAtacado, a?.preco_atacado, a?.preco];
  for (const c of candidatos) {
    const num = Number(c);
    if (Number.isFinite(num) && num > 0) return num;
  }
  return 0;
}

/**
 * Gera a mensagem formatada de estoque para WhatsApp (Estoque geral ou Atacado).
 * Aparelhos com técnico / em manutenção são excluídos por padrão (exceto quando `incluirManutencao: true`).
 * No modo atacado, substitui o IMEI/código ao lado do aparelho pelo valor de atacado + observação.
 */
export function gerarListaEstoqueWhatsApp(
  aparelhos: any[],
  opcoes: OpcoesListaEstoque = {}
): string {
  const modoAtacado = Boolean(opcoes.modoAtacado);
  const incluirCodigo = opcoes.incluirCodigo ?? !modoAtacado;
  const incluirManutencao = Boolean(opcoes.incluirManutencao);
  const nomeLoja = (opcoes.nomeLoja || 'PHONE CENTER').trim().toUpperCase();

  // 1. Filtra aparelhos ativos no estoque
  const disponiveis = (aparelhos || []).filter((a) => {
    if (!a) return false;
    if (a.ativo === false) return false;
    if (a.status === 'vendido' || a.status === 'baixado' || a.condicao === 'vendido') return false;
    if (typeof estaNoEstoque === 'function' && !estaNoEstoque(a)) return false;

    // Aparelhos com técnicos / em manutenção não entram na lista de venda (varejo nem atacado)
    if (!incluirManutencao && isAparelhoEmManutencao(a)) {
      return false;
    }
    return true;
  });

  if (disponiveis.length === 0) {
    return modoAtacado
      ? `📦 *ESTOQUE ATACADO - ${nomeLoja}*\n\nNenhum aparelho disponível em estoque no momento.`
      : `📋 *ESTOQUE DISPONÍVEL - ${nomeLoja}*\n\nNenhum aparelho disponível no momento.`;
  }

  const dataCurta = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  });

  // 2. Separa por tipo (Lacrados/Novos, Seminovos, Acessórios, Perfumes, etc.) com contagem real de unidades
  const porSecao = new Map<TipoSecaoEstoque, any[]>();
  let totalUnidades = 0;

  disponiveis.forEach((a) => {
    const secao = classificarTipoEstoque(a);
    const lista = porSecao.get(secao);
    if (lista) lista.push(a);
    else porSecao.set(secao, [a]);
    totalUnidades += quantidadeItem(a);
  });

  const secoesAtivas = SECOES_ESTOQUE
    .map((def) => {
      const itens = porSecao.get(def.id) || [];
      const qtd = itens.reduce((acc, item) => acc + quantidadeItem(item), 0);
      return { def, itens, qtd };
    })
    .filter((s) => s.itens.length > 0);

  const labelUnidade = totalUnidades === 1 ? 'aparelho' : 'aparelhos';
  const resumoTipos = secoesAtivas
    .map((s) => `${s.def.emoji} ${s.def.rotuloResumo}: *${s.qtd}*`)
    .join(' | ');

  let texto = modoAtacado
    ? `📦 *ESTOQUE ATACADO - ${nomeLoja} (${dataCurta})*\nTotal: *${totalUnidades} ${labelUnidade}* em estoque\n${resumoTipos}\n\n`
    : `🔄 *ESTOQUE DISPONÍVEL - ${nomeLoja} (${dataCurta})*\nTotal: *${totalUnidades} ${labelUnidade}* em estoque\n${resumoTipos}\n\n`;

  secoesAtivas.forEach(({ def, itens: itensSecao, qtd: qtdSecao }) => {
    texto += `${def.emoji} *${def.tituloSecao} (${qtdSecao})*\n\n`;

    // Agrupa por modelo normalizado dentro de cada tipo
    const grupos = new Map<string, { titulo: string; itens: any[] }>();
    itensSecao.forEach((a) => {
      const { chave, titulo } = normalizarNomeGrupoModelo(a.modelo);
      const grupo = grupos.get(chave);
      if (grupo) grupo.itens.push(a);
      else grupos.set(chave, { titulo, itens: [a] });
    });

    Array.from(grupos.values())
      .sort((a, b) => sortGruposModelos(a.titulo, b.titulo))
      .forEach(({ titulo: modeloHeader, itens }) => {
        const qtdModelo = itens.reduce((acc, item) => acc + quantidadeItem(item), 0);
        texto += `*${modeloHeader} (${qtdModelo})*\n`;

        // Ordena itens dentro do modelo por capacidade, cor e bateria (maior primeiro)
        const itensOrdenados = [...itens].sort((a, b) => {
          const capDiff = capacidadeParaNumero(a.capacidade) - capacidadeParaNumero(b.capacidade);
          if (capDiff !== 0) return capDiff;
          const corDiff = String(a.cor || '').localeCompare(String(b.cor || ''), 'pt-BR', { sensitivity: 'base' });
          if (corDiff !== 0) return corDiff;
          return bateriaParaNumero(b) - bateriaParaNumero(a);
        });

        itensOrdenados.forEach((a) => {
          const emoji = getEmojiItem(a);

          let imeiReal = String(a.imei || '').trim();
          if (!imeiReal && a.observacoes) {
            const matchImei = String(a.observacoes).match(/IMEI:\s*([A-Za-z0-9]+)/i);
            if (matchImei) imeiReal = matchImei[1];
          }

          const codigoDisplay = imeiReal ? imeiReal : (getAparelhoCodigo(a) || '');
          const capacidadeStr = a.capacidade && a.capacidade !== 'N/A' ? `${a.capacidade}` : '';

          let corLimpa = String(a.cor || '')
            .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F]/gu, '')
            .trim();
          if (corLimpa.toLowerCase() === 'padrão' || corLimpa.toLowerCase() === 'padrao') {
            corLimpa = '';
          }

          const bateriaStr = bateriaParaLista(a);

          const valAtacado = valorAtacadoItem(a);
          const precoAtacadoStr = valAtacado > 0
            ? `*R$ ${valAtacado.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}*`
            : '';

          const obsCurta = observacaoParaLista(a.observacoes);
          const obsExtra = obsCurta ? ` (${obsCurta})` : '';
          const qtdUnit = quantidadeItem(a);
          const qtdTag = qtdUnit > 1 ? ` (x${qtdUnit})` : '';

          const partes = [];
          if (capacidadeStr) partes.push(capacidadeStr);
          if (corLimpa) partes.push(corLimpa);
          if (bateriaStr) partes.push(bateriaStr);

          const detalheItem = partes.length > 0 ? ` ${partes.join(' ')}` : '';

          let linhaItem = '';
          if (modoAtacado) {
            const precoTag = precoAtacadoStr ? ` - ${precoAtacadoStr}` : '';
            const tagCodigo = incluirCodigo && codigoDisplay ? ` (${codigoDisplay})` : '';
            linhaItem = `${emoji}${detalheItem}${qtdTag}${precoTag}${tagCodigo}${obsExtra}`;
          } else {
            const tagCodigo = incluirCodigo && codigoDisplay ? ` - ${codigoDisplay}` : '';
            linhaItem = `${emoji}${detalheItem}${qtdTag}${tagCodigo}${obsExtra}`;
          }

          texto += `${linhaItem}\n`;
        });
        texto += '\n';
      });
  });

  return texto.trim();
}
