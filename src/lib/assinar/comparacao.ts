/**
 * Comparação Phone Center x MercadoPhone e ancoragem de preço (mensal x anual).
 *
 * Preços do concorrente: páginas públicas consultadas em 10/09/2026. Só entram
 * recursos que o Phone Center realmente tem; do concorrente só o que a consulta
 * mostrou. Nada aqui é estimativa: são os preços publicados e contas sobre eles.
 */

import { PLANOS_SISTEMA, type PeriodoFaturamento, type TipoPlano } from '@/lib/planos-config';

export const DATA_CONSULTA_MERCADOPHONE = '2026-09-10';
export const DATA_CONSULTA_MERCADOPHONE_TEXTO = '10/09/2026';

/** Recursos comparados lado a lado (existem no Phone Center em todos os planos). */
export type RecursoComparado = 'mais_de_um_usuario' | 'os' | 'nota_fiscal' | 'app' | 'etiquetas';

export interface PlanoMercadoPhone {
  id: 'plus' | 'pro' | 'pro_max';
  nome: string;
  precoMensal: number;
  /** Recursos comparados que a consulta confirmou neste plano. */
  inclui: RecursoComparado[];
  /** Resumo do que a página pública do plano mostrava na consulta. */
  resumo: string;
}

export const PLANOS_MERCADOPHONE: readonly PlanoMercadoPhone[] = Object.freeze([
  { id: 'plus', nome: 'Plus', precoMensal: 129.99, inclui: [], resumo: '1 usuário; sem OS, nota fiscal, app e etiquetas' },
  { id: 'pro', nome: 'Pro', precoMensal: 219.99, inclui: ['os', 'nota_fiscal', 'app', 'etiquetas'], resumo: 'OS, nota fiscal, app e etiquetas' },
  { id: 'pro_max', nome: 'Pro Max', precoMensal: 399.99, inclui: [], resumo: 'Catálogo, CRM e API' },
]);

export interface RecursoPhoneCenter {
  recurso: RecursoComparado;
  titulo: string;
  /** Plano mais barato do Phone Center que tem o recurso. */
  plano: TipoPlano;
  detalhe: string;
  /** O que a consulta mostrou sobre o recurso no MercadoPhone. */
  noMercadoPhone: string;
}

export const RECURSOS_COMPARADOS: readonly RecursoPhoneCenter[] = Object.freeze([
  {
    recurso: 'mais_de_um_usuario',
    titulo: 'Mais de um usuário',
    plano: 'entrada',
    detalhe: 'Usuários sem limite, sem cobrança por usuário',
    noMercadoPhone: 'Plus: 1 usuário',
  },
  {
    recurso: 'os',
    titulo: 'Ordem de serviço (OS)',
    plano: 'entrada',
    detalhe: 'OS da assistência técnica no painel e no bot',
    noMercadoPhone: 'A partir do Pro',
  },
  {
    recurso: 'nota_fiscal',
    titulo: 'Nota fiscal',
    plano: 'entrada',
    detalhe: 'NFC-e e NF-e pela Focus NFe (conta e certificado digital da loja)',
    noMercadoPhone: 'A partir do Pro',
  },
  {
    recurso: 'app',
    titulo: 'App no celular',
    plano: 'entrada',
    detalhe: 'Painel instalável na tela inicial (Android e iPhone)',
    noMercadoPhone: 'A partir do Pro',
  },
  {
    recurso: 'etiquetas',
    titulo: 'Etiquetas',
    plano: 'entrada',
    detalhe: 'Impressão de etiquetas dos aparelhos',
    noMercadoPhone: 'A partir do Pro',
  },
]);

const arred2 = (v: number) => Math.round(v * 100) / 100;

/** Plano mais barato do MercadoPhone que (pela consulta) tem todos os recursos pedidos. */
export function planoMercadoPhoneMaisBaratoCom(recursos: readonly RecursoComparado[]): PlanoMercadoPhone | null {
  const candidatos = PLANOS_MERCADOPHONE.filter((p) => recursos.every((r) => p.inclui.includes(r)));
  if (candidatos.length === 0) return null;
  return candidatos.reduce((a, b) => (b.precoMensal < a.precoMensal ? b : a));
}

export interface ResumoComparacao {
  recursos: RecursoComparado[];
  mercadoPhone: PlanoMercadoPhone;
  phoneCenter: { plano: TipoPlano; nome: string; precoMensal: number };
  diferencaMensal: number;
  diferencaAnual: number;
}

/**
 * OS + nota fiscal + app + etiquetas: quanto custa ter os quatro em cada sistema
 * (mensal, sem desconto de ciclo dos dois lados).
 */
export function resumoComparacao(): ResumoComparacao {
  const recursos: RecursoComparado[] = ['os', 'nota_fiscal', 'app', 'etiquetas'];
  const mp = planoMercadoPhoneMaisBaratoCom(recursos);
  if (!mp) throw new Error('Comparação sem plano do MercadoPhone com os recursos');
  const planoPc = RECURSOS_COMPARADOS.filter((r) => recursos.includes(r.recurso))
    .map((r) => r.plano)
    .reduce<TipoPlano>((maior, p) => (ordemPlano(p) > ordemPlano(maior) ? p : maior), 'entrada');
  const pc = PLANOS_SISTEMA[planoPc];
  const diferencaMensal = arred2(mp.precoMensal - pc.precos.mensal.valorMensal);
  return {
    recursos,
    mercadoPhone: mp,
    phoneCenter: { plano: planoPc, nome: pc.nome, precoMensal: pc.precos.mensal.valorMensal },
    diferencaMensal,
    diferencaAnual: arred2(diferencaMensal * 12),
  };
}

function ordemPlano(p: TipoPlano): number {
  return p === 'entrada' ? 0 : p === 'intermediario' ? 1 : 2;
}

/** Meses cobertos por um ciclo de cobrança. */
export function mesesDoPeriodo(periodo: PeriodoFaturamento): number {
  return periodo === 'anual' ? 12 : periodo === 'trimestral' ? 3 : 1;
}

/** Quanto o ciclo economiza frente a pagar o mensal pelo mesmo número de meses. */
export function economiaDoPeriodo(tipo: TipoPlano, periodo: PeriodoFaturamento): number {
  const plano = PLANOS_SISTEMA[tipo];
  if (!plano) return 0;
  const meses = mesesDoPeriodo(periodo);
  return Math.max(0, arred2(plano.precos.mensal.valorMensal * meses - plano.precos[periodo].valorTotal));
}

export function formatarPreco(valor: number): string {
  return (Number.isFinite(valor) ? valor : 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
