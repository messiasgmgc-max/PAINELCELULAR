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

const ORDENS_HIERARQUIA = [
  'iphone 17 pro max', 'iphone 17 pro', 'iphone 17 plus', 'iphone 17',
  'iphone 16 pro max', 'iphone 16 pro', 'iphone 16 plus', 'iphone 16',
  'iphone 15 pro max', 'iphone 15 pro', 'iphone 15 plus', 'iphone 15',
  'iphone 14 pro max', 'iphone 14 pro', 'iphone 14 plus', 'iphone 14',
  'iphone 13 pro max', 'iphone 13 pro', 'iphone 13 mini', 'iphone 13',
  'iphone 12 pro max', 'iphone 12 pro', 'iphone 12 mini', 'iphone 12',
  'iphone 11 pro max', 'iphone 11 pro', 'iphone 11',
  'iphone xs max', 'iphone xs', 'iphone xr', 'iphone x',
  'iphone 8 plus', 'iphone 8', 'iphone 7 plus', 'iphone 7',
  'iphone se 3', 'iphone se 2', 'iphone se',
  'ipad', 'watch', 'macbook', 'pencil', 'airpods'
];

function sortGruposModelos(a: string, b: string): number {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();

  const idxA = ORDENS_HIERARQUIA.findIndex((o) => aLower.includes(o));
  const idxB = ORDENS_HIERARQUIA.findIndex((o) => bLower.includes(o));

  if (idxA !== -1 && idxB !== -1) return idxA - idxB;
  if (idxA !== -1) return -1;
  if (idxB !== -1) return 1;
  return a.localeCompare(b);
}

export interface OpcoesListaEstoque {
  modoAtacado?: boolean;
  nomeLoja?: string;
}

/**
 * Gera a mensagem formatada de estoque para WhatsApp (Varejo ou Atacado).
 * Aparelhos com técnico / em manutenção são automaticamente EXCLUÍDOS do varejo.
 */
export function gerarListaEstoqueWhatsApp(
  aparelhos: any[],
  opcoes: OpcoesListaEstoque = {}
): string {
  const modoAtacado = Boolean(opcoes.modoAtacado);
  const nomeLoja = (opcoes.nomeLoja || 'PHONE CENTER').trim().toUpperCase();

  // 1. Filtra aparelhos ativos no estoque
  let disponiveis = (aparelhos || []).filter((a) => {
    if (!a) return false;
    if (a.ativo === false) return false;
    if (a.status === 'vendido' || a.status === 'baixado' || a.condicao === 'vendido') return false;
    if (typeof estaNoEstoque === 'function' && !estaNoEstoque(a)) return false;

    // REGRA SOLICITADA: Aparelhos com técnicos / em manutenção NÃO aparecem na lista de varejo!
    if (!modoAtacado && isAparelhoEmManutencao(a)) {
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

  // Agrupa por modelo
  const grupos: Record<string, any[]> = {};
  disponiveis.forEach((a) => {
    const modeloClean = a.modelo ? String(a.modelo).replace(/^Apple\s+/i, '').trim() : 'Outros';
    if (!grupos[modeloClean]) grupos[modeloClean] = [];
    grupos[modeloClean].push(a);
  });

  let texto = modoAtacado
    ? `📦 *ESTOQUE ATACADO - ${nomeLoja} (${dataCurta})*\nTotal: *${disponiveis.length} aparelhos* em estoque\n\n`
    : `🔄 *ESTOQUE DISPONÍVEL - ${nomeLoja} (${dataCurta})*\nTotal: *${disponiveis.length} aparelhos* em estoque\n\n`;

  Object.entries(grupos)
    .sort(([a], [b]) => sortGruposModelos(a, b))
    .forEach(([modeloHeader, itens]) => {
      texto += `*${modeloHeader}*\n`;
      itens.forEach((a) => {
        const emoji = getEmojiItem(a);

        let imeiReal = String(a.imei || '').trim();
        if (!imeiReal && a.observacoes) {
          const matchImei = String(a.observacoes).match(/IMEI:\s*([A-Za-z0-9]+)/i);
          if (matchImei) imeiReal = matchImei[1];
        }

        const codigoDisplay = imeiReal ? imeiReal : (getAparelhoCodigo(a) || '');
        const capacidadeStr = a.capacidade && a.capacidade !== 'N/A' ? `${a.capacidade}` : '';

        let corLimpa = String(a.cor || '')
          .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')
          .trim();
        if (corLimpa.toLowerCase() === 'padrão' || corLimpa.toLowerCase() === 'padrao') {
          corLimpa = '';
        }

        const bateriaStr = bateriaParaLista(a);

        const valAtacado = (a as any).precoAtacado || a.preco_atacado || a.preco || 0;
        const precoAtacadoStr = valAtacado > 0
          ? `*R$ ${Number(valAtacado).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}*`
          : '';

        const obsCurta = observacaoParaLista(a.observacoes);
        const obsExtra = obsCurta ? ` (${obsCurta})` : '';

        const partes = [];
        if (capacidadeStr) partes.push(capacidadeStr);
        if (corLimpa) partes.push(corLimpa);
        if (bateriaStr) partes.push(bateriaStr);

        const detalheItem = partes.length > 0 ? ` ${partes.join(' ')}` : '';

        let linhaItem = '';
        if (modoAtacado) {
          const tagCodigo = codigoDisplay ? ` (${codigoDisplay})` : '';
          const precoTag = precoAtacadoStr ? ` ➔ ${precoAtacadoStr}` : '';
          linhaItem = `${emoji}${detalheItem}${precoTag}${tagCodigo}${obsExtra}`;
        } else {
          const tagCodigo = codigoDisplay ? ` - ${codigoDisplay}` : '';
          linhaItem = `${emoji}${detalheItem}${tagCodigo}${obsExtra}`;
        }

        texto += `${linhaItem}\n`;
      });
      texto += '\n';
    });

  return texto.trim();
}
