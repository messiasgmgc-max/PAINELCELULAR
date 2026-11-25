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
  onOpenScanner,
}: AparelhoFiltrosProps) {
  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <div className="relative flex-1 min-w-0">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Buscar por modelo, IMEI, cor, capacidade, bateria ou código (ex: 16pm 256)..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="input-glass pl-10 pr-9 w-full h-10 text-xs sm:text-sm"
        />
        {searchTerm && (
          <button
            type="button"
            onClick={() => setSearchTerm("")}
            aria-label="Limpar busca"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5 cursor-pointer transition-colors"
            title="Limpar busca"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {onOpenScanner && (
        <button
          type="button"
          onClick={onOpenScanner}
          className="h-10 w-10 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/35 rounded-xl flex items-center justify-center text-cyan-500 dark:text-cyan-300 transition-all shrink-0 cursor-pointer active:scale-95"
          title="Escanear IMEI ou código de barras com a câmera"
          aria-label="Escanear IMEI ou código de barras"
        >
          <Camera className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
      )}
    </div>
  );
}
