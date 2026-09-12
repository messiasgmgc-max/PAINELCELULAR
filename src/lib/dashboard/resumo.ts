/**
 * Números do Dashboard calculados no banco (RPC dashboard_resumo, migration
 * supabase/migrations/20260913_dados_dashboard_resumo.sql).
 *
 * Antes o painel baixava todas as vendas e somava no navegador: venda sem data
 * contava como de hoje, o dia vinha em UTC (venda das 22h caía no dia seguinte),
 * o gráfico ordenava "dd/mm" como texto e a taxa do cartão não saía do lucro.
 *
 * As funções de regra abaixo espelham o SQL e são a referência testada:
 *   - dia da venda = dataPagamento no fuso de São Paulo; sem data não entra;
 *   - cancelada ou estornada não entra (src/lib/vendas/situacao.ts);
 *   - lucro líquido = lucro bruto - taxa_cartao;
 *   - venda com vários pagamentos divide o valor na proporção de cada pagamento.
 */
import { vendaConta } from '../vendas/situacao';

export const FUSO_LOJA = 'America/Sao_Paulo';
export const LIMITE_DIAS_PARADO = 60;
const MAX_DIAS_SERIE = 400;
const DIA = /^\d{4}-\d{2}-\d{2}$/;

export interface TotaisVendas {
  quantidade: number;
  faturamento: number;
  custo: number;
  lucroBruto: number;
  taxas: number;
  lucroLiquido: number;
  ticketMedio: number;
}

export interface DiaVendas {
  dia: string;
  quantidade: number;
  faturamento: number;
  custo: number;
  lucroBruto: number;
  taxas: number;
  lucroLiquido: number;
}

export interface FormaPagamentoResumo {
  forma: string;
  rotulo: string;
  quantidade: number;
  valor: number;
}

export interface GrupoCapitalParado {
  modelo: string;
  capacidade: string;
  quantidade: number;
  custoParado: number;
  semCusto: number;
  diasMaisAntigo: number | null;
  diasMedio: number | null;
  acimaLimite: number;
  alerta: boolean;
}

export interface CapitalParado {
  limiteDias: number;
  quantidade: number;
  custoParado: number;
  acimaLimite: number;
  grupos: GrupoCapitalParado[];
}

export interface ResumoDashboard {
  inicio: string;
  fim: string;
  totais: TotaisVendas;
  porDia: DiaVendas[];
  porFormaPagamento: FormaPagamentoResumo[];
  capitalParado: CapitalParado;
}

export interface VendaParaResumo {
  status?: unknown;
  dataPagamento?: string | null;
  valor?: unknown;
  custo?: unknown;
  lucro?: unknown;
  taxa_cartao?: unknown;
  metodo?: string | null;
  pagamentos?: unknown;
}

// ---------------------------------------------------------------------------
// Conversões
// ---------------------------------------------------------------------------

/** Número vindo do banco (numeric chega como number ou texto). Qualquer outra coisa vira 0. */
export function numeroSeguro(valor: unknown): number {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;
  if (typeof valor === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(valor)) return Number(valor);
  return 0;
}

function numeroOuNulo(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  return numeroSeguro(valor);
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : '';
}

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === 'object' && !Array.isArray(valor) ? (valor as Record<string, unknown>) : {};
}

function lista(valor: unknown): Record<string, unknown>[] {
  return Array.isArray(valor) ? valor.map(objeto) : [];
}

function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}

export function formatarReais(valor: number): string {
  const n = Number.isFinite(valor) ? valor : 0;
  return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ---------------------------------------------------------------------------
// Regras (espelho do SQL)
// ---------------------------------------------------------------------------

/** Dia (AAAA-MM-DD) de um instante no fuso da loja, ou null se não houver data válida. */
export function diaNoFusoDaLoja(data: string | Date | null | undefined): string | null {
  if (!data) return null;
  const instante = data instanceof Date ? data : new Date(data);
  if (Number.isNaN(instante.getTime())) return null;
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: FUSO_LOJA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instante);
  const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? '';
  return `${parte('year')}-${parte('month')}-${parte('day')}`;
}

function ordenarPeriodo(inicio: string, fim: string): [string, string] {
  return inicio <= fim ? [inicio, fim] : [fim, inicio];
}

export function vendaEntraNoResumo(venda: VendaParaResumo, inicio: string, fim: string): boolean {
  if (!vendaConta(venda)) return false;
  const dia = diaNoFusoDaLoja(venda.dataPagamento ?? null);
  if (!dia) return false;
  const [de, ate] = ordenarPeriodo(inicio, fim);
  return dia >= de && dia <= ate;
}

export function calcularTotaisVendas(vendas: VendaParaResumo[], inicio: string, fim: string): TotaisVendas {
  let quantidade = 0;
  let faturamento = 0;
  let custo = 0;
  let lucroBruto = 0;
  let taxas = 0;

  for (const venda of vendas) {
    if (!vendaEntraNoResumo(venda, inicio, fim)) continue;
    const valor = numeroSeguro(venda.valor);
    const custoVenda = numeroSeguro(venda.custo);
    quantidade += 1;
    faturamento += valor;
    custo += custoVenda;
    lucroBruto += venda.lucro === null || venda.lucro === undefined ? valor - custoVenda : numeroSeguro(venda.lucro);
    taxas += numeroSeguro(venda.taxa_cartao);
  }

  return {
    quantidade,
    faturamento: arredondar(faturamento),
    custo: arredondar(custo),
    lucroBruto: arredondar(lucroBruto),
    taxas: arredondar(taxas),
    lucroLiquido: arredondar(lucroBruto - taxas),
    ticketMedio: quantidade > 0 ? arredondar(faturamento / quantidade) : 0,
  };
}

/** Valor da venda por forma de pagamento. Vários pagamentos: divide na proporção de cada um. */
export function dividirPorFormaPagamento(venda: VendaParaResumo): Array<{ forma: string; valor: number }> {
  const valor = numeroSeguro(venda.valor);
  const metodoVenda = texto(venda.metodo) || 'nao_informado';
  const pagamentos = (Array.isArray(venda.pagamentos) ? venda.pagamentos : [])
    .map((p) => {
      const pagamento = objeto(p);
      return { forma: texto(pagamento.metodo) || metodoVenda, valor: numeroSeguro(pagamento.valor) };
    })
    .filter((p) => p.valor > 0);
  const soma = pagamentos.reduce((total, p) => total + p.valor, 0);

  if (soma <= 0) return [{ forma: metodoVenda, valor }];
  return pagamentos.map((p) => ({ forma: p.forma, valor: (valor * p.valor) / soma }));
}

export function alertaCapitalParado(diasMaisAntigo: number | null, limite: number = LIMITE_DIAS_PARADO): boolean {
  return diasMaisAntigo !== null && diasMaisAntigo > limite;
}

const ROTULOS_FORMA: Record<string, string> = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
  fiado: 'Fiado',
  boleto: 'Boleto',
  troca: 'Troca',
  trade_in: 'Troca',
  nao_informado: 'Não informado',
};

export function rotuloFormaPagamento(forma: string): string {
  const chave = forma.trim().toLowerCase();
  if (ROTULOS_FORMA[chave]) return ROTULOS_FORMA[chave];
  const limpo = forma.replace(/_/g, ' ').trim();
  return limpo ? limpo.charAt(0).toUpperCase() + limpo.slice(1) : 'Não informado';
}

// ---------------------------------------------------------------------------
// Resposta da RPC
// ---------------------------------------------------------------------------

export function resumoVazio(): ResumoDashboard {
  return {
    inicio: '',
    fim: '',
    totais: { quantidade: 0, faturamento: 0, custo: 0, lucroBruto: 0, taxas: 0, lucroLiquido: 0, ticketMedio: 0 },
    porDia: [],
    porFormaPagamento: [],
    capitalParado: { limiteDias: LIMITE_DIAS_PARADO, quantidade: 0, custoParado: 0, acimaLimite: 0, grupos: [] },
  };
}

export function normalizarResumoDashboard(bruto: unknown): ResumoDashboard {
  const raiz = objeto(bruto);
  const totais = objeto(raiz.totais);
  const capital = objeto(raiz.capital_parado);
  const limiteDias = numeroSeguro(raiz.limite_dias_parado) || LIMITE_DIAS_PARADO;

  return {
    inicio: texto(raiz.inicio),
    fim: texto(raiz.fim),
    totais: {
      quantidade: numeroSeguro(totais.quantidade),
      faturamento: numeroSeguro(totais.faturamento),
      custo: numeroSeguro(totais.custo),
      lucroBruto: numeroSeguro(totais.lucro_bruto),
      taxas: numeroSeguro(totais.taxas),
      lucroLiquido: numeroSeguro(totais.lucro_liquido),
      ticketMedio: numeroSeguro(totais.ticket_medio),
    },
    porDia: lista(raiz.por_dia)
      .map((d) => ({
        dia: texto(d.dia),
        quantidade: numeroSeguro(d.quantidade),
        faturamento: numeroSeguro(d.faturamento),
        custo: numeroSeguro(d.custo),
        lucroBruto: numeroSeguro(d.lucro_bruto),
        taxas: numeroSeguro(d.taxas),
        lucroLiquido: numeroSeguro(d.lucro_liquido),
      }))
      .filter((d) => DIA.test(d.dia)),
    porFormaPagamento: lista(raiz.por_forma_pagamento).map((f) => {
      const forma = texto(f.forma) || 'nao_informado';
      return {
        forma,
        rotulo: rotuloFormaPagamento(forma),
        quantidade: numeroSeguro(f.quantidade),
        valor: numeroSeguro(f.valor),
      };
    }),
    capitalParado: {
      limiteDias,
      quantidade: numeroSeguro(capital.quantidade),
      custoParado: numeroSeguro(capital.custo_parado),
      acimaLimite: numeroSeguro(capital.acima_limite),
      grupos: lista(capital.grupos).map((g) => {
        const diasMaisAntigo = numeroOuNulo(g.dias_mais_antigo);
        return {
          modelo: texto(g.modelo) || 'Sem modelo',
          capacidade: texto(g.capacidade),
          quantidade: numeroSeguro(g.quantidade),
          custoParado: numeroSeguro(g.custo_parado),
          semCusto: numeroSeguro(g.sem_custo),
          diasMaisAntigo,
          diasMedio: numeroOuNulo(g.dias_medio),
          acimaLimite: numeroSeguro(g.acima_limite),
          alerta: alertaCapitalParado(diasMaisAntigo, limiteDias),
        };
      }),
    },
  };
}

/** Mensagem para a tela quando a RPC falha (ex.: migration ainda não aplicada). */
export function mensagemErroResumo(erro: unknown): string {
  const e = objeto(erro);
  const codigo = texto(e.code);
  const mensagem = texto(e.message);
  if (codigo === 'PGRST202' || codigo === '42883' || mensagem.includes('dashboard_resumo')) {
    return 'O resumo de vendas ainda não foi instalado no banco (migration 20260913_dados_dashboard_resumo).';
  }
  return 'Não foi possível carregar os números de vendas do período.';
}

// ---------------------------------------------------------------------------
// Gráfico diário (vendas da RPC + OS do painel)
// ---------------------------------------------------------------------------

/** Dias entre início e fim (inclusive). Período longo demais devolve lista vazia. */
export function listarDias(inicio: string, fim: string, maximo: number = MAX_DIAS_SERIE): string[] {
  if (!DIA.test(inicio) || !DIA.test(fim)) return [];
  const [de, ate] = ordenarPeriodo(inicio, fim);
  const cursor = new Date(`${de}T00:00:00Z`);
  const final = new Date(`${ate}T00:00:00Z`);
  const dias: string[] = [];
  while (cursor <= final) {
    if (dias.length >= maximo) return [];
    dias.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dias;
}

export function rotuloDia(dia: string): string {
  const [, mes, diaDoMes] = dia.split('-');
  return mes && diaDoMes ? `${diaDoMes}/${mes}` : dia;
}

interface OsParaResumo {
  dataEntrada?: string | null;
  status?: string | null;
  precoVenda?: unknown;
  lucro?: unknown;
}

/** OS do período pela data de entrada no fuso da loja. OS sem data não entra (antes contava como hoje). */
export function filtrarOsDoPeriodo<T extends { dataEntrada?: string | null }>(ordens: T[], inicio: string, fim: string): T[] {
  if (!DIA.test(inicio) || !DIA.test(fim)) return [];
  const [de, ate] = ordenarPeriodo(inicio, fim);
  return ordens.filter((os) => {
    const dia = diaNoFusoDaLoja(os.dataEntrada ?? null);
    return !!dia && dia >= de && dia <= ate;
  });
}

/** Receita e lucro das OS entregues por dia de entrada. */
export function somarOsPorDia(ordens: OsParaResumo[]): Record<string, { receita: number; lucro: number }> {
  const porDia: Record<string, { receita: number; lucro: number }> = {};
  for (const os of ordens) {
    if (os.status !== 'entregue') continue;
    const dia = diaNoFusoDaLoja(os.dataEntrada ?? null);
    if (!dia) continue;
    porDia[dia] ??= { receita: 0, lucro: 0 };
    porDia[dia].receita += numeroSeguro(os.precoVenda);
    porDia[dia].lucro += numeroSeguro(os.lucro);
  }
  return porDia;
}

export interface PontoGraficoDiario {
  dia: string;
  rotulo: string;
  receitaVendas: number;
  lucroVendas: number;
  receitaOS: number;
  lucroOS: number;
}

export function montarGraficoDiario(
  inicio: string,
  fim: string,
  vendasPorDia: DiaVendas[],
  osPorDia: Record<string, { receita: number; lucro: number }>
): PontoGraficoDiario[] {
  const vendas = new Map(vendasPorDia.map((d) => [d.dia, d]));
  let dias = listarDias(inicio, fim);
  if (dias.length === 0) {
    dias = Array.from(new Set([...vendas.keys(), ...Object.keys(osPorDia)])).sort();
  }

  return dias.map((dia) => ({
    dia,
    rotulo: rotuloDia(dia),
    receitaVendas: arredondar(vendas.get(dia)?.faturamento ?? 0),
    lucroVendas: arredondar(vendas.get(dia)?.lucroLiquido ?? 0),
    receitaOS: arredondar(osPorDia[dia]?.receita ?? 0),
    lucroOS: arredondar(osPorDia[dia]?.lucro ?? 0),
  }));
}
