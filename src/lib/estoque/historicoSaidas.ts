import type { Aparelho } from '@/lib/db/types';
import { ehAparelhoDeCliente, estaNoEstoque } from '@/lib/estoque/ciclo';
import {
  classificarBateria,
  obterCustoAparelho,
  obterPercentualBateria,
  obterPrecoAtacado,
  obterPrecoVenda,
  type NivelBateria,
} from '@/lib/estoque/resumoEstoque';
import { normalizarTexto } from '@/lib/buscaEstoque';
import { formatarSaudeBateria, getAparelhoCodigo, parseMonetaryValue } from '@/lib/utils';

export type TipoSaida = 'varejo' | 'atacado' | 'outro';
export type FiltroTipoSaida = 'todos' | TipoSaida;
export type PeriodoSaida = 'todos' | 'hoje' | '7d' | '30d' | 'mes_atual' | 'personalizado';
export type OrdenacaoSaida =
  | 'saida_recente'
  | 'saida_antiga'
  | 'modelo_az'
  | 'maior_valor'
  | 'maior_bateria';

export interface ItemSaidaHistorico {
  id: string;
  aparelho: Aparelho & Record<string, any>;
  marca: string;
  modelo: string;
  tituloModelo: string;
  capacidade: string;
  cor: string;
  corSwatch: string | null;
  bateriaTexto: string;
  bateriaPct: number | null;
  nivelBateria: NivelBateria | null;
  condicaoFisica: string;
  imei: string;
  numeroSerie: string;
  codigo: string;
  categoria: string;
  detalheCategoria: string;
  acessorios: string;
  tipoSaida: TipoSaida;
  comprador: string;
  formaPagamento: string;
  motivoLegivel: string;
  observacaoLimpa: string;
  dataSaida: string | null;
  temHorarioSaida: boolean;
  timestampSaida: number | null;
  dataEntrada: string | null;
  diasEmEstoque: number | null;
  valorSaida: number | null;
  custo: number;
  lucro: number | null;
}

export interface FiltrosHistoricoSaidas {
  tipo: FiltroTipoSaida;
  periodo: PeriodoSaida;
  dataInicio?: string;
  dataFim?: string;
  busca: string;
  ordenacao: OrdenacaoSaida;
  agora?: Date;
}

export interface GrupoDiaSaida {
  chave: string;
  rotulo: string;
  subtitulo: string;
  itens: ItemSaidaHistorico[];
  totalVarejo: number;
  totalAtacado: number;
  totalOutro: number;
  valorTotalVendas: number;
}

export interface ResumoSaidas {
  total: number;
  varejo: number;
  atacado: number;
  outro: number;
  valorTotalVendas: number;
  custoTotal: number;
  lucroTotal: number;
}

const SINONIMOS_CORES: Record<string, string[]> = {
  azul: ['blue', 'pacific blue', 'sierra blue', 'titanio azul', 'blue titanium', 'sky blue', 'marinho', 'ultramarino'],
  blue: ['azul', 'pacific blue', 'sierra blue', 'titanio azul', 'blue titanium'],
  preto: ['black', 'space black', 'grafite', 'graphite', 'noite', 'midnight', 'dark', 'preta', 'jet black'],
  black: ['preto', 'space black', 'grafite', 'graphite', 'noite', 'midnight', 'dark', 'preta'],
  branco: ['white', 'starlight', 'estelar', 'silver', 'prata', 'branca'],
  white: ['branco', 'starlight', 'estelar', 'silver', 'prata', 'branca'],
  prata: ['silver', 'white', 'branco', 'estelar'],
  silver: ['prata', 'white', 'branco', 'estelar'],
  dourado: ['gold', 'dourada', 'deserto', 'desert'],
  gold: ['dourado', 'dourada', 'deserto', 'desert'],
  deserto: ['desert', 'dourado', 'gold', 'titanio deserto'],
  roxo: ['purple', 'deep purple', 'violeta', 'roxa', 'lilas'],
  purple: ['roxo', 'deep purple', 'violeta', 'roxa'],
  verde: ['green', 'alpine green', 'verdes', 'teal'],
  green: ['verde', 'alpine green'],
  rosa: ['pink', 'rose', 'rose gold'],
  pink: ['rosa', 'rose', 'rose gold'],
  natural: ['titanio natural', 'natural titanium', 'titanio'],
  cinza: ['gray', 'grey', 'space gray', 'space grey', 'grafite'],
  vermelho: ['red', 'product red', 'vermelha'],
  amarelo: ['yellow', 'amarela'],
  laranja: ['orange'],
};

const FORMAS_PAGAMENTO_LABEL: Record<string, string> = {
  pix: 'PIX',
  dinheiro: 'Dinheiro',
  cartao_credito: 'Cartão de Crédito',
  credito: 'Cartão de Crédito',
  cartao_debito: 'Cartão de Débito',
  debito: 'Cartão de Débito',
  fiado: 'A Prazo / Fiado',
  prazo: 'A Prazo / Fiado',
  a_prazo: 'A Prazo / Fiado',
  boleto: 'Boleto',
  trade_in: 'Troca / Upgrade',
  troca: 'Troca / Upgrade',
  transferencia: 'Transferência',
};

const MOTIVOS_SAIDA_LABEL: Record<string, string> = {
  venda: 'Venda',
  baixa_manual: 'Baixa manual',
  baixa_massa: 'Baixa em massa',
  conferencia: 'Baixa na conferência',
  perda: 'Perda / Avaria',
  devolucao_fornecedor: 'Devolução ao fornecedor',
  transferencia: 'Transferência',
};

function expandirAtalhosBusca(termo: string): string {
  let t = termo.toLowerCase().trim();
  t = t.replace(/\b(\d{1,2})pm\b/g, '$1 pro max');
  t = t.replace(/\b(\d{1,2})p\b/g, '$1 pro');
  t = t.replace(/\b(\d{1,2})m\b/g, '$1 mini');
  t = t.replace(/\b(\d{1,2})plus\b/g, '$1 plus');
  t = t.replace(/\bpromax\b/g, 'pro max');
  return t;
}

/** Mapeia cor comercial de celular para um swatch discreto de identificação rápida. */
export function corVisualSwatch(cor?: string | null): string | null {
  const norm = normalizarTexto(cor || '');
  if (!norm) return null;
  if (norm.includes('deserto') || norm.includes('desert')) return '#d4b185';
  if (norm.includes('natural')) return '#a8a29e';
  if (norm.includes('dourad') || norm.includes('gold')) return '#eab308';
  if (norm.includes('rosa') || norm.includes('pink') || norm.includes('rose')) return '#f472b6';
  if (norm.includes('roxo') || norm.includes('purple') || norm.includes('violet') || norm.includes('lilas')) return '#a855f7';
  if (norm.includes('azul') || norm.includes('blue') || norm.includes('ultramarino') || norm.includes('sierra') || norm.includes('marinho')) return '#3b82f6';
  if (norm.includes('verde') || norm.includes('green') || norm.includes('teal')) return '#22c55e';
  if (norm.includes('vermelh') || norm.includes('red') || norm.includes('coral')) return '#ef4444';
  if (norm.includes('laranja') || norm.includes('orange')) return '#f97316';
  if (norm.includes('amarel') || norm.includes('yellow')) return '#facc15';
  if (norm.includes('branc') || norm.includes('white') || norm.includes('starlight') || norm.includes('estelar')) return '#f1f5f9';
  if (norm.includes('prata') || norm.includes('silver')) return '#cbd5e1';
  if (norm.includes('grafite') || norm.includes('cinza') || norm.includes('gray') || norm.includes('grey')) return '#64748b';
  if (norm.includes('pret') || norm.includes('black') || norm.includes('midnight') || norm.includes('noite') || norm.includes('dark')) return '#1e293b';
  return null;
}

function extrairTituloModelo(marca: string, modelo: string): string {
  const m = marca.trim();
  const mod = modelo.trim();
  if (!m) return mod || 'Sem modelo';
  if (!mod) return m;
  const mNorm = normalizarTexto(m);
  const modNorm = normalizarTexto(mod);
  if (modNorm.includes(mNorm)) return mod;
  // "iPhone ..." já identifica Apple de forma limpa sem poluir visualmente
  if (mNorm === 'apple' && modNorm.startsWith('iphone')) return mod;
  return `${m} ${mod}`.trim();
}

function normalizarDataSaidaBruta(bruto?: string | null): { iso: string | null; ts: number | null; temHorario: boolean } {
  if (!bruto) return { iso: null, ts: null, temHorario: false };
  let texto = String(bruto).trim();
  if (!texto) return { iso: null, ts: null, temHorario: false };

  // Data sem horário: usar meio-dia local evita deslocar para o dia anterior em UTC-3
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    const [ano, mes, dia] = texto.split('-').map(Number);
    const localMidday = new Date(ano, mes - 1, dia, 12, 0, 0);
    if (!Number.isNaN(localMidday.getTime())) {
      return { iso: localMidday.toISOString(), ts: localMidday.getTime(), temHorario: false };
    }
    return { iso: null, ts: null, temHorario: false };
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{1,2}$/.test(texto)) {
    texto += ':00:00';
  } else if (/^\d{4}-\d{2}-\d{2}T\d{1,2}:\d{2}$/.test(texto)) {
    texto += ':00';
  }

  const ts = Date.parse(texto);
  if (!Number.isFinite(ts)) return { iso: null, ts: null, temHorario: false };
  return { iso: new Date(ts).toISOString(), ts, temHorario: true };
}

function extrairMatchBaixa(obs: string): { dataBruta: string | null; resto: string } {
  if (!obs) return { dataBruta: null, resto: '' };

  // Se houver múltiplas marcas BAIXA_ESTOQUE em linhas separadas, pega a última (mais recente)
  const linhasBaixa = obs
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /BAIXA_ESTOQUE:/i.test(l));

  const alvo = linhasBaixa.length > 0 ? linhasBaixa[linhasBaixa.length - 1] : obs;

  const match =
    alvo.match(
      /BAIXA_ESTOQUE:(\d{4}-\d{2}-\d{2}(?:T\d{1,2}(?::\d{2}(?::\d{2}(?:\.\d+)?)?)?(?:Z|[+-]\d{2}:?\d{2})?)?):([\s\S]*)$/i
    ) ||
    alvo.match(/BAIXA_ESTOQUE:([^:\n]+(?::\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?):([\s\S]*)$/i) ||
    alvo.match(/BAIXA_ESTOQUE:([^:\n]+):([\s\S]*)$/i);

  if (!match) return { dataBruta: null, resto: '' };
  return {
    dataBruta: match[1]?.trim() || null,
    resto: match[2]?.trim() || '',
  };
}

function formatarFormaPagamento(raw?: string | null): string {
  const limpo = String(raw || '').trim();
  if (!limpo) return '';
  const chave = normalizarTexto(limpo).replace(/\s+/g, '_');
  return FORMAS_PAGAMENTO_LABEL[chave] || limpo;
}

function extrairObservacaoLimpa(obs: string): string {
  if (!obs) return '';
  const segmentosBrutos = obs
    .replace(/\[MANUTENCAO:[^\]]*\]/gi, '')
    .split(/\r?\n|\|/)
    .map((s) => s.trim())
    .filter(Boolean);

  const notas: string[] = [];
  const vistos = new Set<string>();

  for (const seg of segmentosBrutos) {
    if (/^BAIXA_ESTOQUE:/i.test(seg)) continue;
    if (/^Venda\s+(?:VAREJO|ATACADO|PERDA|MANUTENCAO)\b/i.test(seg)) continue;
    if (/^(?:ID|IMEI|Valor|Custo|Lucro|Pgto|Comprador|Bateria|Sa[uú]de(?:\s+da\s+bateria)?)\s*:/i.test(seg)) continue;
    if (/^Aparelho removido do estoque manualmente\.?$/i.test(seg)) continue;

    const semPrefixo = seg.replace(/^Obs\s*:\s*/i, '').trim();
    if (!semPrefixo) continue;
    if (/^BAIXA_ESTOQUE:/i.test(semPrefixo)) continue;

    const chave = normalizarTexto(semPrefixo);
    if (!vistos.has(chave)) {
      vistos.add(chave);
      notas.push(semPrefixo);
    }
  }

  return notas.join(' · ');
}

function extrairMotivoLegivel(
  tipoSaida: TipoSaida,
  motivoColuna: string | null | undefined,
  restoBaixa: string
): string {
  if (tipoSaida === 'atacado') return 'Venda no Atacado';
  if (tipoSaida === 'varejo') return 'Venda no Varejo';

  const colNorm = String(motivoColuna || '').trim().toLowerCase();
  if (colNorm && MOTIVOS_SAIDA_LABEL[colNorm]) {
    return MOTIVOS_SAIDA_LABEL[colNorm];
  }

  const primeiroTrecho = restoBaixa.split('|')[0]?.trim() || '';
  if (primeiroTrecho && !/^Venda\s+/i.test(primeiroTrecho)) {
    return primeiroTrecho.replace(/\.$/, '');
  }

  return 'Baixa de estoque';
}

/** Constrói a lista normalizada de saídas do estoque a partir dos aparelhos. */
export function construirHistoricoSaidas(aparelhos: any[]): ItemSaidaHistorico[] {
  if (!Array.isArray(aparelhos)) return [];

  return aparelhos
    .filter((aparelho: any) => aparelho && !estaNoEstoque(aparelho) && !ehAparelhoDeCliente(aparelho))
    .map((aparelho: any): ItemSaidaHistorico => {
      const obs = String(aparelho.observacoes || '');
      const { dataBruta: dataBaixaObs, resto: restoBaixa } = extrairMatchBaixa(obs);

      // Mantém precedência da marca BAIXA_ESTOQUE (atualizada pelo EditarVendaRegistroModal)
      // com fallback para a coluna data_saida gravada pelo ciclo de vida.
      const dataResolvida =
        normalizarDataSaidaBruta(dataBaixaObs).iso !== null
          ? normalizarDataSaidaBruta(dataBaixaObs)
          : normalizarDataSaidaBruta(aparelho.data_saida || aparelho.dataSaida || null);

      const motivoLower = restoBaixa.toLowerCase();
      const obsLower = obs.toLowerCase();
      const motivoColuna = String(aparelho.motivo_saida || '').toLowerCase();

      let tipoSaida: TipoSaida = 'outro';
      if (motivoLower.includes('atacado') || obsLower.includes('venda atacado') || obsLower.includes('atacado')) {
        tipoSaida = 'atacado';
      } else if (
        motivoLower.includes('varejo') ||
        obsLower.includes('venda varejo') ||
        aparelho.condicao === 'vendido' ||
        aparelho.status === 'vendido' ||
        motivoColuna === 'venda'
      ) {
        tipoSaida = 'varejo';
      }

      // Comprador / destino
      const matchCompradorObs = obs.match(/Comprador:\s*([^|\n]+)/i);
      const matchParaObs = restoBaixa.match(/para\s+(.+?)(?:\s+por\s+R\$|\s*\||\n|$)/i);
      const comprador = String(
        aparelho.cliente || matchCompradorObs?.[1] || matchParaObs?.[1] || ''
      ).trim();

      // Forma de pagamento
      const matchPgto = obs.match(/Pgto:\s*([^|\n]+)/i);
      const formaPagamento = formatarFormaPagamento(matchPgto?.[1]);

      // Valores financeiros
      const matchValObs = obs.match(/(?:Valor:\s*R\$|por\s*R\$)\s*([\d.,]+)/i);
      const valObsNum = matchValObs ? parseMonetaryValue(matchValObs[1]) : 0;
      let valorSaida: number | null = null;
      if (valObsNum > 0) {
        valorSaida = valObsNum;
      } else if (tipoSaida === 'atacado') {
        const vAtacado = obterPrecoAtacado(aparelho) || obterPrecoVenda(aparelho);
        valorSaida = vAtacado > 0 ? vAtacado : null;
      } else if (tipoSaida === 'varejo') {
        const vVarejo = obterPrecoVenda(aparelho);
        valorSaida = vVarejo > 0 ? vVarejo : null;
      }

      const matchCustoObs = obs.match(/Custo:\s*R\$\s*([\d.,]+)/i);
      const custoObsNum = matchCustoObs ? parseMonetaryValue(matchCustoObs[1]) : 0;
      const custo = custoObsNum > 0 ? custoObsNum : obterCustoAparelho(aparelho);

      const matchLucroObs = obs.match(/Lucro:\s*R\$\s*(-?[\d.,]+)/i);
      let lucro: number | null = null;
      if (matchLucroObs) {
        lucro = parseMonetaryValue(matchLucroObs[1]);
      } else if (tipoSaida !== 'outro' && valorSaida !== null && valorSaida > 0 && custo > 0) {
        lucro = Number((valorSaida - custo).toFixed(2));
      }

      // Datas & tempo em estoque
      const dataEntradaRaw = aparelho.dataCadastro || aparelho.created_at || null;
      const tsEntrada = dataEntradaRaw ? Date.parse(String(dataEntradaRaw)) : NaN;
      const diasEmEstoque =
        dataResolvida.ts !== null && Number.isFinite(tsEntrada)
          ? Math.max(0, Math.round((dataResolvida.ts - tsEntrada) / 86400000))
          : null;

      // Especificações
      const marca = String(aparelho.marca || '').trim();
      const modelo = String(aparelho.modelo || '').trim();
      const tituloModelo = extrairTituloModelo(marca, modelo);
      const capacidade = String(aparelho.capacidade || '').trim();
      const cor = String(aparelho.cor || '').trim();
      const bateriaTexto = formatarSaudeBateria(aparelho);
      const bateriaPct = obterPercentualBateria(aparelho);
      const nivelBateria = classificarBateria(bateriaPct);
      const condicaoBruta = String(aparelho.condicao || '').trim().toLowerCase();
      const condicaoFisica = condicaoBruta && condicaoBruta !== 'vendido' ? condicaoBruta : '';
      const imei = String(aparelho.imei || '').trim();
      const numeroSerie = String(aparelho.numeroSerie || aparelho.numero_serie || '').trim();
      const codigo = getAparelhoCodigo(aparelho);
      const categoria = String(aparelho.categoria || 'aparelho').trim();
      const detalheCategoria = [aparelho.tamanho_ml, aparelho.tipo_perfume, aparelho.tipo_acessorio]
        .filter(Boolean)
        .join(' · ');

      return {
        id: String(aparelho.id || codigo),
        aparelho,
        marca,
        modelo,
        tituloModelo,
        capacidade,
        cor,
        corSwatch: corVisualSwatch(cor),
        bateriaTexto,
        bateriaPct,
        nivelBateria,
        condicaoFisica,
        imei,
        numeroSerie,
        codigo,
        categoria,
        detalheCategoria,
        acessorios: String(aparelho.acessorios || '').trim(),
        tipoSaida,
        comprador,
        formaPagamento,
        motivoLegivel: extrairMotivoLegivel(tipoSaida, aparelho.motivo_saida, restoBaixa),
        observacaoLimpa: extrairObservacaoLimpa(obs),
        dataSaida: dataResolvida.iso,
        temHorarioSaida: dataResolvida.temHorario,
        timestampSaida: dataResolvida.ts,
        dataEntrada: Number.isFinite(tsEntrada) ? String(dataEntradaRaw) : null,
        diasEmEstoque,
        valorSaida,
        custo,
        lucro,
      };
    });
}

function inicioDoDiaLocal(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function fimDoDiaLocal(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function parseDataInputLocal(yyyyMmDd?: string): Date | null {
  if (!yyyyMmDd || !/^\d{4}-\d{2}-\d{2}$/.test(yyyyMmDd)) return null;
  const [ano, mes, dia] = yyyyMmDd.split('-').map(Number);
  const d = new Date(ano, mes - 1, dia);
  return Number.isNaN(d.getTime()) ? null : d;
}

function passaNoPeriodo(item: ItemSaidaHistorico, filtros: FiltrosHistoricoSaidas): boolean {
  if (filtros.periodo === 'todos') return true;
  if (item.timestampSaida === null) return false;

  const agora = filtros.agora ?? new Date();
  const inicioHoje = inicioDoDiaLocal(agora).getTime();
  const fimHoje = fimDoDiaLocal(agora).getTime();

  if (filtros.periodo === 'hoje') {
    return item.timestampSaida >= inicioHoje && item.timestampSaida <= fimHoje;
  }
  if (filtros.periodo === '7d') {
    const limite = inicioHoje - 6 * 86400000;
    return item.timestampSaida >= limite && item.timestampSaida <= fimHoje;
  }
  if (filtros.periodo === '30d') {
    const limite = inicioHoje - 29 * 86400000;
    return item.timestampSaida >= limite && item.timestampSaida <= fimHoje;
  }
  if (filtros.periodo === 'mes_atual') {
    const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1, 0, 0, 0, 0).getTime();
    return item.timestampSaida >= inicioMes && item.timestampSaida <= fimHoje;
  }
  if (filtros.periodo === 'personalizado') {
    const dIni = parseDataInputLocal(filtros.dataInicio);
    const dFim = parseDataInputLocal(filtros.dataFim);
    if (dIni && item.timestampSaida < inicioDoDiaLocal(dIni).getTime()) return false;
    if (dFim && item.timestampSaida > fimDoDiaLocal(dFim).getTime()) return false;
    return true;
  }
  return true;
}

function passaNaBuscaInteligente(item: ItemSaidaHistorico, busca: string): boolean {
  if (!busca || !busca.trim()) return true;

  const termoLimpo = normalizarTexto(expandirAtalhosBusca(busca));
  const tokens = termoLimpo.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;

  const temTokenPro = tokens.includes('pro');
  const temTokenMax = tokens.includes('max') || tokens.includes('pm');

  const modeloNorm = normalizarTexto(item.modelo);
  if (temTokenPro && !temTokenMax && modeloNorm.includes('max')) {
    return false;
  }

  const corNorm = normalizarTexto(item.cor);
  const sinonimosCorItem = [corNorm];
  if (corNorm) {
    for (const [chave, sinonimos] of Object.entries(SINONIMOS_CORES)) {
      if (corNorm.includes(chave)) sinonimosCorItem.push(...sinonimos);
    }
  }

  const dataFormatada = item.dataSaida
    ? new Date(item.dataSaida).toLocaleDateString('pt-BR')
    : '';
  const mesExtenso = item.dataSaida
    ? normalizarTexto(new Date(item.dataSaida).toLocaleDateString('pt-BR', { month: 'long' }))
    : '';

  const batStr = item.bateriaPct !== null ? String(item.bateriaPct) : '';

  const textoCompleto = [
    normalizarTexto(item.marca),
    modeloNorm,
    normalizarTexto(item.tituloModelo),
    normalizarTexto(item.capacidade),
    corNorm,
    ...sinonimosCorItem,
    batStr,
    batStr ? `${batStr}%` : '',
    batStr ? `bateria ${batStr}` : '',
    item.imei.toLowerCase(),
    normalizarTexto(item.numeroSerie),
    normalizarTexto(item.codigo),
    normalizarTexto(item.comprador),
    normalizarTexto(item.formaPagamento),
    normalizarTexto(item.motivoLegivel),
    normalizarTexto(item.observacaoLimpa),
    normalizarTexto(item.condicaoFisica),
    normalizarTexto(item.detalheCategoria),
    item.tipoSaida,
    dataFormatada,
    mesExtenso,
  ].join(' ');

  for (const token of tokens) {
    const semPct = token.replace('%', '');
    const bateBateria =
      (token.endsWith('%') || /^\d{2,3}$/.test(token)) && batStr !== '' && batStr === semPct;
    const sinonimosToken = [token, ...(SINONIMOS_CORES[token] || [])];
    const bateCor = sinonimosToken.some((s) => corNorm.includes(s));

    if (!textoCompleto.includes(token) && !bateBateria && !bateCor) {
      return false;
    }
  }

  return true;
}

/** Filtra e ordena o histórico de saídas por tipo, período, busca inteligente e critério de ordenação. */
export function filtrarEOrdenarSaidas(
  saidas: ItemSaidaHistorico[],
  filtros: FiltrosHistoricoSaidas
): ItemSaidaHistorico[] {
  const filtradas = saidas.filter((item) => {
    if (filtros.tipo !== 'todos' && item.tipoSaida !== filtros.tipo) return false;
    if (!passaNoPeriodo(item, filtros)) return false;
    if (!passaNaBuscaInteligente(item, filtros.busca)) return false;
    return true;
  });

  const ordenadas = [...filtradas];

  ordenadas.sort((a, b) => {
    if (filtros.ordenacao === 'saida_recente') {
      // Itens com data de saída conhecida sempre aparecem antes dos sem data
      if (a.timestampSaida !== null && b.timestampSaida === null) return -1;
      if (a.timestampSaida === null && b.timestampSaida !== null) return 1;
      if (a.timestampSaida !== null && b.timestampSaida !== null && b.timestampSaida !== a.timestampSaida) {
        return b.timestampSaida - a.timestampSaida;
      }
      const entA = a.dataEntrada ? Date.parse(a.dataEntrada) : 0;
      const entB = b.dataEntrada ? Date.parse(b.dataEntrada) : 0;
      return entB - entA;
    }

    if (filtros.ordenacao === 'saida_antiga') {
      if (a.timestampSaida !== null && b.timestampSaida === null) return -1;
      if (a.timestampSaida === null && b.timestampSaida !== null) return 1;
      if (a.timestampSaida !== null && b.timestampSaida !== null && a.timestampSaida !== b.timestampSaida) {
        return a.timestampSaida - b.timestampSaida;
      }
      const entA = a.dataEntrada ? Date.parse(a.dataEntrada) : 0;
      const entB = b.dataEntrada ? Date.parse(b.dataEntrada) : 0;
      return entA - entB;
    }

    if (filtros.ordenacao === 'modelo_az') {
      const cmp = a.tituloModelo.localeCompare(b.tituloModelo, 'pt-BR', { sensitivity: 'base' });
      if (cmp !== 0) return cmp;
      return (b.timestampSaida ?? 0) - (a.timestampSaida ?? 0);
    }

    if (filtros.ordenacao === 'maior_valor') {
      const va = a.valorSaida ?? -1;
      const vb = b.valorSaida ?? -1;
      if (vb !== va) return vb - va;
      return (b.timestampSaida ?? 0) - (a.timestampSaida ?? 0);
    }

    if (filtros.ordenacao === 'maior_bateria') {
      const ba = a.bateriaPct ?? -1;
      const bb = b.bateriaPct ?? -1;
      if (bb !== ba) return bb - ba;
      return (b.timestampSaida ?? 0) - (a.timestampSaida ?? 0);
    }

    return 0;
  });

  return ordenadas;
}

function chaveDiaLocal(d: Date): string {
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

function capitalizar(texto: string): string {
  if (!texto) return texto;
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Agrupa saídas por dia de saída (para leitura cronológica limpa em linha do tempo). */
export function agruparSaidasPorDia(
  saidas: ItemSaidaHistorico[],
  agora: Date = new Date()
): GrupoDiaSaida[] {
  const grupos = new Map<string, GrupoDiaSaida>();
  const chaveHoje = chaveDiaLocal(agora);
  const ontem = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - 1);
  const chaveOntem = chaveDiaLocal(ontem);
  const anoAtual = agora.getFullYear();

  for (const item of saidas) {
    let chave = 'sem-data';
    let rotulo = 'Sem data de saída registrada';
    let subtitulo = '';

    if (item.timestampSaida !== null) {
      const d = new Date(item.timestampSaida);
      chave = chaveDiaLocal(d);
      const diaMes = d
        .toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
        .replace(/\.$/, '');
      const diaMesAno = d
        .toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
        .replace(/\./g, '');

      if (chave === chaveHoje) {
        rotulo = 'Hoje';
        subtitulo = diaMes;
      } else if (chave === chaveOntem) {
        rotulo = 'Ontem';
        subtitulo = diaMes;
      } else {
        const semana = capitalizar(
          d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace(/\.$/, '')
        );
        rotulo = d.getFullYear() === anoAtual ? `${semana}, ${diaMes}` : `${semana}, ${diaMesAno}`;
        subtitulo = d.toLocaleDateString('pt-BR');
      }
    }

    let grupo = grupos.get(chave);
    if (!grupo) {
      grupo = {
        chave,
        rotulo,
        subtitulo,
        itens: [],
        totalVarejo: 0,
        totalAtacado: 0,
        totalOutro: 0,
        valorTotalVendas: 0,
      };
      grupos.set(chave, grupo);
    }

    grupo.itens.push(item);
    if (item.tipoSaida === 'varejo') grupo.totalVarejo += 1;
    else if (item.tipoSaida === 'atacado') grupo.totalAtacado += 1;
    else grupo.totalOutro += 1;

    if (item.tipoSaida !== 'outro' && item.valorSaida && item.valorSaida > 0) {
      grupo.valorTotalVendas += item.valorSaida;
    }
  }

  return Array.from(grupos.values());
}

/** Calcula os totais consolidados das saídas exibidas. */
export function calcularResumoSaidas(saidas: ItemSaidaHistorico[]): ResumoSaidas {
  let varejo = 0;
  let atacado = 0;
  let outro = 0;
  let valorTotalVendas = 0;
  let custoTotal = 0;
  let lucroTotal = 0;

  for (const s of saidas) {
    if (s.tipoSaida === 'varejo') varejo += 1;
    else if (s.tipoSaida === 'atacado') atacado += 1;
    else outro += 1;

    if (s.tipoSaida !== 'outro' && s.valorSaida && s.valorSaida > 0) {
      valorTotalVendas += s.valorSaida;
    }
    if (s.custo > 0) {
      custoTotal += s.custo;
    }
    if (s.lucro !== null) {
      lucroTotal += s.lucro;
    }
  }

  return {
    total: saidas.length,
    varejo,
    atacado,
    outro,
    valorTotalVendas,
    custoTotal,
    lucroTotal,
  };
}

/** Formata data e hora da saída para exibição amigável. */
export function formatarDataHoraSaida(item: ItemSaidaHistorico): {
  data: string;
  hora: string;
  completo: string;
} {
  if (!item.dataSaida || item.timestampSaida === null) {
    return { data: 'Sem data', hora: '', completo: 'Sem data registrada' };
  }
  const d = new Date(item.timestampSaida);
  const data = d.toLocaleDateString('pt-BR');
  const hora = item.temHorarioSaida
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : '';
  return {
    data,
    hora,
    completo: hora ? `${data} às ${hora}` : data,
  };
}

/** Gera resumo limpo da saída para copiar e compartilhar. */
export function montarResumoTextoSaida(item: ItemSaidaHistorico): string {
  const { completo } = formatarDataHoraSaida(item);
  const linhas = [
    `*${item.tituloModelo}${item.capacidade ? ` ${item.capacidade}` : ''}*`,
    item.cor ? `Cor: ${item.cor}` : '',
    item.bateriaTexto ? `Bateria: ${item.bateriaTexto}` : '',
    item.imei ? `IMEI: ${item.imei}` : '',
    item.numeroSerie ? `Nº Série: ${item.numeroSerie}` : '',
    item.codigo ? `Código: #${item.codigo}` : '',
    `Saída: ${completo} (${item.motivoLegivel})`,
    item.comprador ? `Destino: ${item.comprador}` : '',
    item.formaPagamento ? `Pagamento: ${item.formaPagamento}` : '',
    item.observacaoLimpa ? `Obs: ${item.observacaoLimpa}` : '',
  ].filter(Boolean);

  return linhas.join('\n');
}
