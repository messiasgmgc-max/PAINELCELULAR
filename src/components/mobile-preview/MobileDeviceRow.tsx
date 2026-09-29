'use client';

import React from 'react';
import { Smartphone, Battery, ChevronRight, Tag, ShieldCheck, DollarSign } from 'lucide-react';

export interface MockAparelho {
  id: string;
  modelo: string;
  capacidade: string;
  cor: string;
  bateria?: number | null;
  preco_venda: number;
  preco_custo?: number;
  preco_atacado?: number;
  status: 'Em estoque' | 'Reservado' | 'Vendido' | 'Em manutenção';
  imei?: string;
  condicao?: string;
  categoria?: string;
}

interface MobileDeviceRowProps {
  aparelho: MockAparelho;
  density: 'compact' | 'detailed';
  onClick: () => void;
}

export function MobileDeviceRow({ aparelho, density, onClick }: MobileDeviceRowProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Em estoque':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'Reservado':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      case 'Vendido':
        return 'bg-slate-700/50 text-slate-400 border-slate-600/30';
      case 'Em manutenção':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/30';
      default:
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
    }
  };

  // MODO 1: LINHA ULTRA COMPACTA (52px de altura)
  if (density === 'compact') {
    return (
      <div
        onClick={onClick}
        className="w-full h-[52px] px-3 py-1.5 bg-slate-900/60 hover:bg-slate-800/80 active:bg-blue-950/40 border border-slate-800/70 hover:border-blue-500/30 rounded-xl flex items-center justify-between gap-2.5 transition-all cursor-pointer select-none group"
      >
        {/* Ícone / Mini Thumb 36px */}
        <div className="w-9 h-9 rounded-lg bg-blue-950/40 border border-blue-500/20 flex items-center justify-center shrink-0 text-blue-400 group-hover:scale-105 transition-transform">
          <Smartphone className="w-4 h-4" />
        </div>

        {/* Informações Principais (Modelo + Capacidade + Cor) */}
        <div className="flex-1 min-w-0 pr-1">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-xs sm:text-sm text-white truncate">
              {aparelho.modelo}
            </span>
            <span className="text-[10px] font-semibold text-blue-400 px-1 py-0.2 bg-blue-950/60 rounded border border-blue-500/20 shrink-0">
              {aparelho.capacidade}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[10.5px] text-slate-400 truncate">
            <span className="truncate">{aparelho.cor}</span>
            {aparelho.bateria && (
              <>
                <span className="text-slate-600">•</span>
                <span className={`font-medium ${aparelho.bateria <= 80 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {aparelho.bateria}% bat
                </span>
              </>
            )}
          </div>
        </div>

        {/* Preço e Status */}
        <div className="flex items-center gap-2 shrink-0 text-right">
          <div>
            <div className="font-bold text-xs sm:text-sm text-cyan-300">
              R$ {aparelho.preco_venda.toLocaleString('pt-BR')}
            </div>
            <span className={`inline-block text-[9.5px] px-1.5 py-0.2 font-medium rounded-full border ${getStatusColor(aparelho.status)}`}>
              {aparelho.status}
            </span>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all" />
        </div>
      </div>
    );
  }

  // MODO 2: CARD TRADICIONAL DETALHADO (~180px - para comparação)
  return (
    <div
      onClick={onClick}
      className="w-full p-4 bg-slate-900/80 hover:bg-slate-800/90 border border-slate-800 rounded-2xl space-y-3 transition-all cursor-pointer"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-blue-950/40 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
            <Smartphone className="w-6 h-6" />
          </div>
          <div>
            <h4 className="font-bold text-sm text-white">{aparelho.modelo}</h4>
            <p className="text-xs text-slate-400">{aparelho.capacidade} • {aparelho.cor}</p>
          </div>
        </div>
        <span className={`text-xs px-2 py-0.5 font-medium rounded-full border ${getStatusColor(aparelho.status)}`}>
          {aparelho.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs text-slate-300 bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/60">
        <div>
          <span className="text-[10px] text-slate-500 block">Bateria</span>
          <span className="font-semibold text-emerald-400">{aparelho.bateria || '--'}%</span>
        </div>
        <div>
          <span className="text-[10px] text-slate-500 block">IMEI</span>
          <span className="font-mono text-[10px] text-slate-400 truncate block">
            {aparelho.imei || '359483029182741'}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
        <span className="text-xs text-slate-400">Preço de Venda:</span>
        <span className="text-base font-bold text-cyan-300">
          R$ {aparelho.preco_venda.toLocaleString('pt-BR')}
        </span>
      </div>
    </div>
  );
}
