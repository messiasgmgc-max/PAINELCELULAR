'use client';

import React from "react";
import { Search, Camera, X } from "lucide-react";

interface AparelhoFiltrosProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  onOpenScanner?: () => void;
  // Propriedades opcionais para compatibilidade retroativa
  categoriaFiltro?: string;
  setCategoriaFiltro?: (cat: any) => void;
  contagens?: any;
}

export function AparelhoFiltros({
  searchTerm,
  setSearchTerm,
  onOpenScanner
}: AparelhoFiltrosProps) {
  return (
    <div className="w-full">
      {/* Barra de Busca e Leitor com Design Integrado e Padronizado (Azul do Sistema) */}
      <div className="flex items-center gap-2 bg-slate-900/60 p-1.5 sm:p-2 rounded-2xl border border-white/10 shadow-inner">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por IMEI, modelo, cor, capacidade ou código..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950/70 border border-slate-800 focus:border-blue-500 rounded-xl pl-9 pr-8 py-2 text-xs sm:text-sm text-white placeholder:text-slate-500 outline-none transition-all shadow-inner"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5 cursor-pointer"
              title="Limpar busca"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {onOpenScanner && (
          <button
            type="button"
            onClick={onOpenScanner}
            className="h-9 w-9 sm:h-10 sm:w-10 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 rounded-xl flex items-center justify-center text-blue-300 hover:text-white transition-all shrink-0 cursor-pointer shadow-sm active:scale-95"
            title="Escanear IMEI ou código de barras com a câmera"
          >
            <Camera className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />
          </button>
        )}
      </div>
    </div>
  );
}
