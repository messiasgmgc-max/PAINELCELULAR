'use client';

import React from 'react';
import type { Aparelho, Cliente, Venda } from '@/lib/db/types';
import { cn, extrairAparelhoEImeiDaVenda, getVendaDataExibicao } from '@/lib/utils';
import { vendaCancelada } from '@/lib/vendas/situacao';
import { diagnosticarVendaPendente } from '@/lib/vendas/pendencias';
import {
  calcularMargemVenda,
  formatarDataHoraVendaCurta,
  obterIniciaisComprador,
} from '@/lib/vendas/resumoVendas';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Calendar,
  ChevronRight,
  Copy,
  CreditCard,
  Edit,
  FileText,
  Mail,
  MessageCircle,
  MoreVertical,
  Printer,
  Repeat,
  RotateCcw,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
  Undo2,
  User,
} from 'lucide-react';
import { toast } from 'sonner';

export interface VendaRowCardProps {
  venda: Venda;
  isAtacado: boolean;
  clientes: Cliente[];
  aparelhos: Aparelho[];
  density?: 'detailed' | 'compact';
  ocultarLucro?: boolean;
  metodoLabel: (metodo: Venda['metodo']) => string;
  onAbrirEdicaoRapida: (venda: Venda, modoCompletar: boolean) => void;
  onReabrirPDV: (venda: Venda) => void;
  onCompletarFormulario: (venda: Venda) => void;
  onImprimirCupom: (venda: Venda) => void;
  onImprimirA4: (venda: Venda) => void;
  onReenviarRecibo: (venda: Venda, canal: 'todos' | 'email' | 'whatsapp') => void;
  onEmitirFiscal: (venda: Venda) => void;
  onConsultarFiscal: (venda: Venda) => void;
  onTrocarItem: (venda: Venda) => void;
  onDesfazer: (venda: Venda) => void;
  onCancelarMenu: (venda: Venda) => void;
  onDescancelar: (venda: Venda) => void;
  onExcluirCancelada: (venda: Venda) => void;
}

function formatarBRL(valor: number): string {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function badgeStatus(status: Venda['status']): { label: string; className: string } {
  if (status === 'pago') {
    return {
      label: 'Pago',
      className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30',
    };
  }
  if (status === 'parcial') {
    return {
      label: 'Parcial',
      className: 'bg-sky-500/15 text-sky-600 dark:text-sky-300 border-sky-500/30',
    };
  }
  if (status === 'pendente') {
    return {
      label: 'Pendente',
      className: 'bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/35',
    };
  }
  return {
    label: 'Cancelado',
    className: 'bg-rose-500/15 text-rose-600 dark:text-rose-300 border-rose-500/30',
  };
}

export function VendaRowCard({
  venda,
  isAtacado,
  clientes,
  aparelhos,
  density = 'detailed',
  ocultarLucro = false,
  metodoLabel,
  onAbrirEdicaoRapida,
  onReabrirPDV,
  onCompletarFormulario,
  onImprimirCupom,
  onImprimirA4,
  onReenviarRecibo,
  onEmitirFiscal,
  onConsultarFiscal,
  onTrocarItem,
  onDesfazer,
  onCancelarMenu,
  onDescancelar,
  onExcluirCancelada,
}: VendaRowCardProps) {
  const cancelada = vendaCancelada(venda);
  const diagnostico = !isAtacado ? diagnosticarVendaPendente(venda, clientes, aparelhos) : null;
  const isPendente = Boolean(diagnostico?.isPendente) && !cancelada;
  const complementaresCliente = (diagnostico?.camposComplementares || []).filter(
    (c) => c === 'E-mail' || c === 'CPF / CNPJ'
  );

  const apInfo = extrairAparelhoEImeiDaVenda(venda, aparelhos);
  const dataExibicao = getVendaDataExibicao(venda);
  const dataCurta = formatarDataHoraVendaCurta(dataExibicao);
  const dataCompletaTitle = dataExibicao.toLocaleString('pt-BR');
  const idCurto = venda.id ? venda.id.slice(-6).toUpperCase() : 'N/A';
  const statusInfo = badgeStatus(venda.status);
  const margem = calcularMargemVenda(venda.valor, venda.lucro);

  const clienteEncontrado = clientes.find(
    (cl) => (venda.clienteId && cl.id === venda.clienteId) || cl.nome === venda.clienteNome
  );
  const telefoneDigitos = String(clienteEncontrado?.telefone || '').replace(/\D/g, '');
  const linkWhatsapp =
    telefoneDigitos.length >= 10
      ? `https://wa.me/${telefoneDigitos.length <= 11 ? `55${telefoneDigitos}` : telefoneDigitos}`
      : null;

  const handleCopiarImei = () => {
    if (!apInfo.imei) return;
    navigator.clipboard.writeText(apInfo.imei);
    toast.success(`IMEI copiado: ${apInfo.imei}`);
  };

  const renderMenuAcoes = () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="Mais ações da venda"
          className="p-2 rounded-xl bg-slate-800/80 border border-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56 space-y-0.5 bg-slate-900 border border-slate-800 text-slate-200 rounded-xl shadow-xl z-[9999]"
      >
        <DropdownMenuItem
          onClick={() => onAbrirEdicaoRapida(venda, false)}
          className="cursor-pointer hover:bg-slate-800 rounded-lg"
        >
          <Edit className="mr-2 h-4 w-4 text-amber-400" />
          Editar Venda / Cliente / Custos
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onReabrirPDV(venda)}
          disabled={cancelada}
          className="cursor-pointer hover:bg-slate-800 rounded-lg"
        >
          <Repeat className="mr-2 h-4 w-4 text-blue-400" />
          Reabrir no PDV
        </DropdownMenuItem>
        {isPendente && (
          <DropdownMenuItem
            onClick={() => onCompletarFormulario(venda)}
            className="cursor-pointer hover:bg-slate-800 rounded-lg"
          >
            <Sparkles className="mr-2 h-4 w-4 text-orange-400" />
            Completar c/ Formulário
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onClick={() => {
            if (linkWhatsapp) window.open(linkWhatsapp, '_blank', 'noopener,noreferrer');
            else toast.info('Cliente sem telefone cadastrado.');
          }}
          className="cursor-pointer hover:bg-slate-800 rounded-lg"
        >
          <MessageCircle className="mr-2 h-4 w-4 text-emerald-400" />
          Chamar no WhatsApp
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="font-normal rounded-lg">
            <Printer className="mr-2 h-4 w-4" />
            Imprimir Recibo
            <ChevronRight className="ml-auto h-4 w-4 opacity-60" />
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent className="w-44 bg-slate-900 border border-slate-800 text-slate-200 rounded-xl">
              <DropdownMenuItem onClick={() => onImprimirCupom(venda)} className="cursor-pointer">
                <Printer className="mr-2 h-4 w-4" />
                Cupom Térmico
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onImprimirA4(venda)} className="cursor-pointer">
                <FileText className="mr-2 h-4 w-4" />
                Recibo A4
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="font-normal rounded-lg">
            <Mail className="mr-2 h-4 w-4" />
            Reenviar Recibo
            <ChevronRight className="ml-auto h-4 w-4 opacity-60" />
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent className="w-44 bg-slate-900 border border-slate-800 text-slate-200 rounded-xl">
              <DropdownMenuItem onClick={() => onReenviarRecibo(venda, 'todos')} className="cursor-pointer">
                <Send className="mr-2 h-4 w-4 text-blue-400" />
                Todos
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onReenviarRecibo(venda, 'email')} className="cursor-pointer">
                <Mail className="mr-2 h-4 w-4" />
                E-mail
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onReenviarRecibo(venda, 'whatsapp')} className="cursor-pointer">
                <MessageCircle className="mr-2 h-4 w-4 text-emerald-400" />
                WhatsApp
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
        <DropdownMenuSeparator className="bg-slate-800" />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="font-normal rounded-lg">
            <FileText className="mr-2 h-4 w-4 text-blue-400" />
            Nota Fiscal
            <ChevronRight className="ml-auto h-4 w-4 opacity-60" />
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent className="w-48 bg-slate-900 border border-slate-800 text-slate-200 rounded-xl">
              <DropdownMenuItem onClick={() => onEmitirFiscal(venda)} className="cursor-pointer">
                <FileText className="mr-2 h-4 w-4 text-blue-400" />
                Emitir NFC-e (Fiscal)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onConsultarFiscal(venda)} className="cursor-pointer">
                <ShieldCheck className="mr-2 h-4 w-4 text-emerald-400" />
                Ver / Consultar DANFE
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
        <DropdownMenuSeparator className="bg-slate-800" />
        <DropdownMenuItem onClick={() => onTrocarItem(venda)} className="cursor-pointer hover:bg-slate-800 rounded-lg">
          <Repeat className="mr-2 h-4 w-4" />
          Trocar Item
        </DropdownMenuItem>
        {cancelada ? (
          <>
            <DropdownMenuItem
              onClick={() => onDescancelar(venda)}
              className="text-emerald-400 focus:bg-emerald-500/10 focus:text-emerald-300 font-semibold cursor-pointer rounded-lg"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Reativar Venda (Descancelar)
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onExcluirCancelada(venda)}
              className="text-rose-400 focus:bg-rose-500/10 focus:text-rose-300 font-semibold cursor-pointer rounded-lg"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Excluir Venda Cancelada
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem
            onClick={() => onCancelarMenu(venda)}
            className="text-rose-500 dark:text-rose-400 focus:bg-rose-500/10 focus:text-rose-400 cursor-pointer rounded-lg"
          >
            <Undo2 className="mr-2 h-4 w-4" />
            Desfazer Venda
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  // MODO COMPACTO (linha densa)
  if (density === 'compact') {
    return (
      <div
        className={cn(
          'rounded-xl border px-3 py-2 transition-all flex items-center justify-between gap-2.5',
          cancelada
            ? 'bg-slate-950/60 border-slate-800 opacity-60'
            : isPendente
              ? 'bg-amber-500/10 border-amber-500/35 hover:border-amber-400/60'
              : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span className="font-mono text-[10px] font-bold text-cyan-500 dark:text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-1.5 py-0.5 rounded-md shrink-0">
            #{idCurto}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-semibold text-xs sm:text-sm text-white truncate">
                {venda.clienteNome}
              </span>
              <span
                className={cn(
                  'text-[9px] font-bold px-1.5 py-0 rounded border shrink-0',
                  isAtacado
                    ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 border-cyan-500/30'
                    : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30'
                )}
              >
                {isAtacado ? 'Atacado' : 'Varejo'}
              </span>
              {isPendente && (
                <button
                  type="button"
                  onClick={() => onAbrirEdicaoRapida(venda, true)}
                  className="text-[10px] font-bold text-amber-600 dark:text-amber-300 bg-amber-500/15 border border-amber-500/35 px-1.5 py-0 rounded shrink-0 cursor-pointer hover:bg-amber-500/25"
                >
                  Completar
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-400 truncate mt-0.5">
              <span className="truncate font-medium text-slate-300">{apInfo.nomeAparelho}</span>
              <span className="hidden sm:inline shrink-0">• {dataCurta}</span>
              <span className="hidden md:inline shrink-0">• {metodoLabel(venda.metodo)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right">
            <p
              className={cn(
                'text-xs sm:text-sm font-bold tabular-nums',
                cancelada ? 'line-through text-slate-400' : 'text-white'
              )}
            >
              {formatarBRL(venda.valor)}
            </p>
            {!ocultarLucro && !cancelada ? (
              <p
                className={cn(
                  'text-[10px] font-semibold tabular-nums',
                  venda.lucro >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-500 dark:text-rose-400'
                )}
              >
                {venda.lucro >= 0 ? '+' : ''}
                {formatarBRL(venda.lucro)}
              </p>
            ) : (
              <span
                className={cn(
                  'text-[9px] font-semibold px-1.5 py-0 rounded border inline-block',
                  statusInfo.className
                )}
              >
                {statusInfo.label}
              </span>
            )}
          </div>
          {renderMenuAcoes()}
        </div>
      </div>
    );
  }

  // MODO DETALHADO (card estruturado em 4 zonas — mesmo estilo de Clientes e Estoque Geral)
  return (
    <div
      className={cn(
        'rounded-2xl border p-3.5 sm:p-4 transition-all duration-200',
        cancelada
          ? 'bg-slate-950/60 border-slate-800 opacity-65'
          : isPendente
            ? 'bg-amber-500/10 border-amber-500/40 hover:border-amber-400/60'
            : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
      )}
    >
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1.35fr)_minmax(0,0.95fr)_auto] gap-3 items-center">
        {/* Zona 1: Cliente, Canal, Data & Pendências */}
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={cn(
              'w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 border mt-0.5',
              cancelada
                ? 'bg-slate-800 text-slate-400 border-slate-800'
                : isPendente
                  ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300 border-amber-500/40'
                  : isAtacado
                    ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 border-cyan-500/30'
                    : 'bg-slate-800 text-emerald-500 dark:text-emerald-300 border-slate-800'
            )}
          >
            {obterIniciaisComprador(venda.clienteNome)}
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h4
                className={cn(
                  'text-sm sm:text-[15px] font-bold truncate',
                  isPendente ? 'text-amber-600 dark:text-amber-200' : 'text-white'
                )}
              >
                {venda.clienteNome}
              </h4>

              <Badge
                variant="outline"
                className={cn(
                  'text-[10px] font-semibold px-2 py-0 border',
                  isAtacado
                    ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 border-cyan-500/30'
                    : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30'
                )}
              >
                {isAtacado ? 'Atacado' : 'Varejo'}
              </Badge>

              <Badge
                variant="outline"
                className={cn('text-[10px] font-semibold px-2 py-0 border', statusInfo.className)}
              >
                {statusInfo.label}
              </Badge>
            </div>

            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-slate-400">
              <span className="font-mono font-bold text-cyan-600 dark:text-cyan-400">
                #{idCurto}
              </span>
              <span
                className="inline-flex items-center gap-1"
                title={dataCompletaTitle}
              >
                <Calendar className="w-3 h-3 shrink-0" />
                {dataCurta}
              </span>
              {venda.vendedor && (
                <span className="inline-flex items-center gap-1 truncate max-w-[140px]">
                  <User className="w-3 h-3 shrink-0" />
                  <span className="truncate">{venda.vendedor}</span>
                </span>
              )}
            </div>

            {isPendente && diagnostico && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => onAbrirEdicaoRapida(venda, true)}
                  className="text-[10px] font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-600 dark:text-amber-200 px-2 py-0.5 rounded-md border border-amber-500/40 cursor-pointer inline-flex items-center gap-1 transition-colors"
                  title={`Completar dados faltantes: ${diagnostico.motivosObrigatorios.join(', ')}`}
                >
                  <Edit className="w-3 h-3" />
                  Completar Notinha
                </button>
                {diagnostico.motivosObrigatorios.map((motivo) => (
                  <span
                    key={motivo}
                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/30"
                  >
                    Falta: {motivo}
                  </span>
                ))}
                {complementaresCliente.map((campo) => (
                  <span
                    key={campo}
                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-800 text-slate-400 border border-slate-800"
                  >
                    Sem {campo}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Zona 2: Produto Vendido & IMEI */}
        <div className="rounded-xl bg-slate-900/80 border border-slate-800 px-3 py-2.5 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 inline-flex items-center gap-1">
              <Smartphone className="w-3 h-3 text-cyan-500 dark:text-cyan-400" />
              Produto vendido
            </span>
            {apInfo.outrosItensCount > 0 && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 border border-cyan-500/25 shrink-0">
                +{apInfo.outrosItensCount}{' '}
                {apInfo.outrosItensCount === 1 ? 'item' : 'itens'}
              </span>
            )}
          </div>

          <p
            className="text-xs sm:text-sm font-semibold text-slate-100 truncate"
            title={apInfo.nomeAparelho}
          >
            {apInfo.nomeAparelho}
          </p>

          <div className="flex items-center gap-2 mt-1 flex-wrap text-[11px]">
            {apInfo.imei ? (
              <button
                type="button"
                onClick={handleCopiarImei}
                title={`Clique para copiar IMEI: ${apInfo.imei}`}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 border border-cyan-500/25 hover:bg-cyan-500/20 transition-colors cursor-pointer"
              >
                <span>
                  IMEI: {apInfo.imei.length > 8 ? `...${apInfo.imei.slice(-6)}` : apInfo.imei}
                </span>
                <Copy className="w-2.5 h-2.5 opacity-80" />
              </button>
            ) : (
              <span className="text-[10px] text-slate-400 italic">Sem IMEI</span>
            )}

            {venda.garantia && (
              <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                <ShieldCheck className="w-3 h-3 text-emerald-500 dark:text-emerald-400" />
                {venda.garantia}
              </span>
            )}
          </div>
        </div>

        {/* Zona 3: Financeiro (Valor, Método e Lucro) */}
        <div className="rounded-xl bg-slate-900/80 border border-slate-800 px-3 py-2.5 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 inline-flex items-center gap-1">
              <CreditCard className="w-3 h-3 text-slate-400" />
              {metodoLabel(venda.metodo)}
            </span>
            {!ocultarLucro && !cancelada && margem !== null && (
              <span
                className={cn(
                  'text-[10px] font-bold px-1.5 py-0.5 rounded-md tabular-nums',
                  margem >= 0
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                    : 'bg-rose-500/15 text-rose-600 dark:text-rose-300'
                )}
              >
                {margem.toFixed(0)}%
              </span>
            )}
          </div>

          <p
            className={cn(
              'text-sm sm:text-base font-extrabold tabular-nums',
              cancelada ? 'line-through text-slate-400' : 'text-white'
            )}
          >
            {formatarBRL(venda.valor)}
          </p>

          {!ocultarLucro && !cancelada ? (
            <p
              className={cn(
                'text-[11px] font-semibold mt-0.5 tabular-nums',
                venda.lucro >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-500 dark:text-rose-400'
              )}
            >
              Lucro: {venda.lucro >= 0 ? '+' : ''}
              {formatarBRL(venda.lucro)}
            </p>
          ) : (
            <p className="text-[11px] text-slate-400 mt-0.5">
              {cancelada ? 'Venda cancelada' : venda.tipoEntrega || 'Retirada'}
            </p>
          )}
        </div>

        {/* Zona 4: Ações Diretas */}
        <div className="flex items-center justify-end gap-1.5 pt-1 lg:pt-0 border-t lg:border-t-0 border-slate-800">
          {!cancelada && (
            <button
              type="button"
              onClick={() => onImprimirA4(venda)}
              title="Imprimir Recibo A4"
              className="p-2 rounded-xl bg-slate-800/80 border border-slate-800 text-slate-300 hover:text-cyan-400 hover:border-cyan-500/40 transition-colors cursor-pointer"
            >
              <Printer className="h-4 w-4" />
            </button>
          )}

          {linkWhatsapp && !cancelada && (
            <a
              href={linkWhatsapp}
              target="_blank"
              rel="noopener noreferrer"
              title="Conversar com cliente no WhatsApp"
              className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors"
            >
              <MessageCircle className="h-4 w-4" />
            </a>
          )}

          {cancelada ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                title="Reativar / Descancelar venda"
                onClick={() => onDescancelar(venda)}
                className="h-9 w-9 p-0 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-500 dark:text-emerald-400 hover:bg-emerald-500/20 cursor-pointer"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                title="Excluir venda cancelada permanentemente"
                onClick={() => onExcluirCancelada(venda)}
                className="h-9 w-9 p-0 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-500 dark:text-rose-400 hover:bg-rose-500/20 cursor-pointer"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <button
              type="button"
              title="Desfazer venda e devolver ao estoque"
              onClick={() => onDesfazer(venda)}
              className="p-2 rounded-xl bg-slate-800/80 border border-slate-800 text-amber-500 hover:text-amber-400 hover:border-amber-500/40 transition-colors cursor-pointer"
            >
              <Undo2 className="h-4 w-4" />
            </button>
          )}

          {renderMenuAcoes()}
        </div>
      </div>
    </div>
  );
}
