import type { Venda } from '@/lib/db/types';
import { isVendaAtacado } from '@/lib/vendas/pendencias';
import { vendaCancelada, vendaConta } from '@/lib/vendas/situacao';

export interface ResumoVendasPeriodo {
  totalRegistros: number;
  totalValidas: number;
  totalCanceladas: number;
  totalVarejo: number;
  totalAtacado: number;
  vendasPagas: number;
  vendasEmAberto: number;
  faturamentoTotal: number;
  lucroTotal: number;
  margemMedia: number;
  ticketMedio: number;
  valorEmAberto: number;
}

function numeroSeguro(valor: unknown): number {
  const num = Number(valor);
  return Number.isFinite(num) ? num : 0;
}

export function calcularResumoVendas(vendas: Venda[]): ResumoVendasPeriodo {
  let totalValidas = 0;
  let totalCanceladas = 0;
  let totalVarejo = 0;
  let totalAtacado = 0;
  let vendasPagas = 0;
  let vendasEmAberto = 0;
  let faturamentoTotal = 0;
  let lucroTotal = 0;
  let valorEmAberto = 0;

  for (const venda of vendas) {
    if (!venda) continue;
    if (vendaCancelada(venda) || !vendaConta(venda)) {
      totalCanceladas += 1;
      continue;
    }

    totalValidas += 1;
    const valor = Math.max(0, numeroSeguro(venda.valor));
    const lucro = numeroSeguro(venda.lucro);

    faturamentoTotal += valor;
    lucroTotal += lucro;

    if (isVendaAtacado(venda)) totalAtacado += 1;
    else totalVarejo += 1;

    if (venda.status === 'pendente' || venda.status === 'parcial') {
      vendasEmAberto += 1;
      const saldoExplicito = numeroSeguro(venda.saldoDevedor);
      const pago = numeroSeguro(venda.valorPago);
      const restante =
        saldoExplicito > 0 ? saldoExplicito : Math.max(0, valor - pago);
      valorEmAberto += restante;
    } else {
      vendasPagas += 1;
    }
  }

  const margemMedia = faturamentoTotal > 0 ? (lucroTotal / faturamentoTotal) * 100 : 0;
  const ticketMedio = totalValidas > 0 ? faturamentoTotal / totalValidas : 0;

  return {
    totalRegistros: vendas.length,
    totalValidas,
    totalCanceladas,
    totalVarejo,
    totalAtacado,
    vendasPagas,
    vendasEmAberto,
    faturamentoTotal,
    lucroTotal,
    margemMedia,
    ticketMedio,
    valorEmAberto,
  };
}

export function obterIniciaisComprador(nome: string | null | undefined): string {
  const partes = String(nome || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (partes.length === 0) return 'CL';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase();
}

export function formatarDataHoraVendaCurta(
  data: Date,
  agora: Date = new Date()
): string {
  if (Number.isNaN(data.getTime())) return '—';

  const hora = data.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).getTime();
  const inicioData = new Date(data.getFullYear(), data.getMonth(), data.getDate()).getTime();
  const diffDias = Math.round((inicioHoje - inicioData) / (1000 * 60 * 60 * 24));

  if (diffDias === 0) return `Hoje • ${hora}`;
  if (diffDias === 1) return `Ontem • ${hora}`;

  const diaMes = data.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: data.getFullYear() === agora.getFullYear() ? undefined : '2-digit',
  });
  return `${diaMes} • ${hora}`;
}

export function calcularMargemVenda(valor: number, lucro: number): number | null {
  if (!Number.isFinite(valor) || valor <= 0 || !Number.isFinite(lucro)) return null;
  return (lucro / valor) * 100;
}
