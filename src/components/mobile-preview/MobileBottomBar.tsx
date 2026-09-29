'use client';

import React from 'react';
import { Search, Plus, Filter, QrCode, CheckSquare, Sparkles } from 'lucide-react';

interface MobileBottomBarProps {
  onSearchClick: () => void;
  onFilterClick: () => void;
  onNewDeviceClick: () => void;
  onConferirClick: () => void;
  filtrosAtivosCount: number;
}

export function MobileBottomBar({
  onSearchClick,
  onFilterClick,
  onNewDeviceClick,
  onConferirClick,
  filtrosAtivosCount,
}: MobileBottomBarProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 p-2 sm:p-3 pointer-events-none flex justify-center">
      <nav className="pointer-events-auto w-full max-w-md h-16 rounded-2xl bg-slate-900/90 backdrop-blur-xl border border-blue-500/20 shadow-2xl shadow-black/60 px-3 flex items-center justify-around gap-1">
        {/* 1. Busca Rápida */}
        <button
          onClick={onSearchClick}
          className="flex flex-col items-center justify-center gap-0.5 text-slate-400 hover:text-blue-400 active:scale-95 transition-all p-1.5 rounded-xl hover:bg-slate-800/50 cursor-pointer min-w-[54px]"
          title="Buscar Aparelho"
        >
          <Search className="w-5 h-5" />
          <span className="text-[10px] font-medium tracking-tight">Buscar</span>
        </button>

        {/* 2. Filtros com Badge Dinâmico */}
        <button
          onClick={onFilterClick}
          className="relative flex flex-col items-center justify-center gap-0.5 text-slate-400 hover:text-blue-400 active:scale-95 transition-all p-1.5 rounded-xl hover:bg-slate-800/50 cursor-pointer min-w-[54px]"
          title="Filtros"
        >
          <div className="relative">
            <Filter className="w-5 h-5" />
            {filtrosAtivosCount > 0 && (
              <span className="absolute -top-1 -right-2 bg-blue-600 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-md animate-pulse">
                {filtrosAtivosCount}
              </span>
            )}
          </div>
          <span className="text-[10px] font-medium tracking-tight">Filtros</span>
        </button>

        {/* 3. Botão Principal Central em Destaque (+ NOVO APARELHO) */}
        <button
          onClick={onNewDeviceClick}
          className="relative -top-3 bg-gradient-to-tr from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white rounded-2xl w-14 h-14 flex flex-col items-center justify-center shadow-lg shadow-blue-500/30 border-2 border-slate-900 active:scale-90 transition-all cursor-pointer shrink-0"
          title="Cadastrar Novo Aparelho"
        >
          <Plus className="w-6 h-6 stroke-[2.5]" />
          <span className="text-[9px] font-bold tracking-tight -mt-0.5">Novo</span>
        </button>

        {/* 4. Conferir Estoque */}
        <button
          onClick={onConferirClick}
          className="flex flex-col items-center justify-center gap-0.5 text-slate-400 hover:text-blue-400 active:scale-95 transition-all p-1.5 rounded-xl hover:bg-slate-800/50 cursor-pointer min-w-[54px]"
          title="Conferência de Estoque"
        >
          <CheckSquare className="w-5 h-5 text-blue-400" />
          <span className="text-[10px] font-medium tracking-tight">Conferir</span>
        </button>

        {/* 5. Scanner / Leitor Rápido */}
        <button
          onClick={onConferirClick}
          className="flex flex-col items-center justify-center gap-0.5 text-slate-400 hover:text-blue-400 active:scale-95 transition-all p-1.5 rounded-xl hover:bg-slate-800/50 cursor-pointer min-w-[54px]"
          title="Scanner de IMEI / QR"
        >
          <QrCode className="w-5 h-5" />
          <span className="text-[10px] font-medium tracking-tight">Scanner</span>
        </button>
      </nav>
    </div>
  );
}
