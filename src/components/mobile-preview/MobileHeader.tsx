'use client';

import React from 'react';
import { Sparkles, Moon, Sun, Bell, QrCode } from 'lucide-react';
import { formatarNomeLojaAbreviado } from '@/lib/utils';

interface MobileHeaderProps {
  nomeLoja?: string;
  categoriaAtiva: string;
  onSelectCategoria: (cat: string) => void;
  isVisible: boolean;
}

export function MobileHeader({
  nomeLoja = 'Phone Center',
  categoriaAtiva,
  onSelectCategoria,
  isVisible,
}: MobileHeaderProps) {
  const categorias = ['Todos', 'iPhones Novos', 'Seminovos', 'Xiaomi', 'Acessórios'];
  const nomes = formatarNomeLojaAbreviado(nomeLoja);

  return (
    <header
      className={`sticky top-0 z-30 w-full bg-slate-950/85 backdrop-blur-xl border-b border-slate-800/80 transition-transform duration-300 ${
        isVisible ? 'translate-y-0' : '-translate-y-full'
      }`}
    >
      {/* Linha Superior: Nome da Loja + Status Rápido */}
      <div className="h-13 px-3.5 flex items-center justify-between gap-2 border-b border-slate-900">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-white font-black text-xs shadow-md shadow-blue-600/30 shrink-0">
            PC
          </div>
          <div className="min-w-0">
            <h1 className="font-extrabold text-sm sm:text-base text-white tracking-tight truncate">
              {nomes.medio}
            </h1>
            <p className="text-[10px] text-blue-400 font-medium">Gestão Inteligente</p>
          </div>
        </div>

        {/* Badges de Status / Ações Rápidas */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold">
            Online
          </span>
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        </div>
      </div>

      {/* Carrossel Compacto de Categorias (Linha Única sem quebra) */}
      <div className="px-3 py-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth">
        {categorias.map((cat) => {
          const active = categoriaAtiva === cat;
          return (
            <button
              key={cat}
              onClick={() => onSelectCategoria(cat)}
              className={`text-xs px-3 py-1 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer ${
                active
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 border border-blue-500'
                  : 'bg-slate-900/90 text-slate-400 hover:text-white border border-slate-800/80 hover:bg-slate-800'
              }`}
            >
              {cat}
            </button>
          );
        })}
      </div>
    </header>
  );
}
