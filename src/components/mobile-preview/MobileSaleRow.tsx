'use client';

import React from 'react';
import { ShoppingBag, ChevronRight, User, CreditCard, Banknote, QrCode } from 'lucide-react';

export interface MockVenda {
  id: string;
  cliente_nome: string;
  cliente_telefone?: string;
  cliente_cpf?: string;
  cliente_email?: string;
  aparelho_modelo: string;
  aparelho_capacidade: string;
  aparelho_imei?: string;
  valor_total: number;
  valor_custo?: number;
  lucro?: number;
  forma_pagamento: 'PIX' | 'Cartão' | 'Dinheiro' | 'Misto';
  tipo_venda: 'Varejo' | 'Atacado';
  vendedor: string;
  created_at: string;
  garantia_dias?: number;
}

interface MobileSaleRowProps {
  venda: MockVenda;
  density: 'compact' | 'detailed';
  onClick: () => void;
}

export function MobileSaleRow({ venda, density, onClick }: MobileSaleRowProps) {
  const getPagamentoBadge = (forma: string) => {
    switch (forma) {
      case 'PIX':
        return { label: 'PIX', bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' };
      case 'Cartão':
        return { label: 'Cartão', bg: 'bg-blue-500/10 text-blue-400 border-blue-500/20' };
      case 'Dinheiro':
        return { label: 'Dinheiro', bg: 'bg-amber-500/10 text-amber-400 border-amber-500/20' };
      default:
        return { label: forma, bg: 'bg-slate-700/30 text-slate-300 border-slate-700' };
    }
  };

  const pag = getPagamentoBadge(venda.forma_pagamento);

  // MODO 1: LINHA ULTRA COMPACTA (52px de altura)
  if (density === 'compact') {
    return (
      <div
        onClick={onClick}
        className="w-full h-[54px] px-3 py-1.5 bg-slate-900/60 hover:bg-slate-800/80 active:bg-blue-950/40 border border-slate-800/70 hover:border-blue-500/30 rounded-xl flex items-center justify-between gap-2.5 transition-all cursor-pointer select-none group"
      >
        {/* Ícone de Venda / Avatar Inicial do Cliente */}
        <div className="w-9 h-9 rounded-lg bg-emerald-950/40 border border-emerald-500/30 flex items-center justify-center shrink-0 text-emerald-400 font-bold text-xs group-hover:scale-105 transition-transform">
          {venda.cliente_nome.slice(0, 2).toUpperCase()}
        </div>

        {/* Informações da Venda (Cliente + Aparelho) */}
        <div className="flex-1 min-w-0 pr-1">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-xs sm:text-sm text-white truncate">
              {venda.cliente_nome}
            </span>
            <span className={`text-[9.5px] px-1.5 py-0.2 rounded border font-semibold shrink-0 ${pag.bg}`}>
              {pag.label}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[10.5px] text-slate-400 truncate">
            <span className="text-slate-300 font-medium truncate">
              {venda.aparelho_modelo} ({venda.aparelho_capacidade})
            </span>
            <span className="text-slate-600">•</span>
            <span className="text-slate-400 shrink-0">{venda.created_at}</span>
          </div>
        </div>

        {/* Valor da Venda */}
        <div className="flex items-center gap-2 shrink-0 text-right">
          <div>
            <div className="font-bold text-xs sm:text-sm text-emerald-400">
              R$ {venda.valor_total.toLocaleString('pt-BR')}
            </div>
            <span className="inline-block text-[9.5px] px-1.5 py-0.2 font-medium rounded-full bg-slate-800 text-slate-400 border border-slate-700/60">
              {venda.tipo_venda}
            </span>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all" />
        </div>
      </div>
    );
  }

  // MODO 2: CARD DETALHADO TRADICIONAL (~180px)
  return (
    <div
      onClick={onClick}
      className="w-full p-4 bg-slate-900/80 hover:bg-slate-800/90 border border-slate-800 rounded-2xl space-y-3 transition-all cursor-pointer"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-950/40 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-sm shrink-0">
            {venda.cliente_nome.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h4 className="font-bold text-sm text-white">{venda.cliente_nome}</h4>
            <p className="text-xs text-slate-400">
              {venda.aparelho_modelo} • {venda.aparelho_capacidade}
            </p>
          </div>
        </div>
        <span className={`text-xs px-2 py-0.5 font-medium rounded-full border ${pag.bg}`}>
          {pag.label}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs text-slate-300 bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/60">
        <div>
          <span className="text-[10px] text-slate-500 block">Vendedor</span>
          <span className="font-semibold text-white">{venda.vendedor}</span>
        </div>
        <div>
          <span className="text-[10px] text-slate-500 block">Data / Hora</span>
          <span className="text-slate-300">{venda.created_at}</span>
        </div>
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
        <span className="text-xs text-slate-400">Valor Total:</span>
        <span className="text-base font-bold text-emerald-400">
          R$ {venda.valor_total.toLocaleString('pt-BR')}
        </span>
      </div>
    </div>
  );
}
