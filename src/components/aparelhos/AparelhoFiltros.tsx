import React from "react";
import { Search, Smartphone, SprayCan, Headphones, Package, Sparkles, Camera } from "lucide-react";
import { cn } from "@/lib/utils";

interface Contagens {
  todos: number;
  aparelhos: number;
  perfumes: number;
  acessorios: number;
  outros: number;
}

interface AparelhoFiltrosProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  categoriaFiltro: string;
  setCategoriaFiltro: (cat: any) => void;
  contagens: Contagens;
  onOpenScanner: () => void;
}

export function AparelhoFiltros({
  searchTerm,
  setSearchTerm,
  categoriaFiltro,
  setCategoriaFiltro,
  contagens,
  onOpenScanner
}: AparelhoFiltrosProps) {
  return (
    <div className="space-y-4 sticky top-0 z-10 bg-slate-950/80 backdrop-blur-md pb-2 pt-2 border-b border-slate-800/50 -mx-4 px-4 sm:mx-0 sm:px-0">
      {/* Abas / Chips de Categoria com fade nas bordas */}
      <div className="relative">
        <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar touch-pan-x overscroll-contain snap-x">
          <button
            type="button"
            onClick={() => setCategoriaFiltro('todos')}
            className={cn(
              "px-3 py-1.5 rounded-full text-[11px] sm:text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer snap-start",
              categoriaFiltro === 'todos' 
                ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-950/40" 
                : "bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700"
            )}
          >
            <Sparkles className="w-3.5 h-3.5" /> Todos ({contagens.todos})
          </button>

          <button
            type="button"
            onClick={() => setCategoriaFiltro('aparelho')}
            className={cn(
              "px-3 py-1.5 rounded-full text-[11px] sm:text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer snap-start",
              categoriaFiltro === 'aparelho' 
                ? "bg-blue-500 text-white shadow-md shadow-blue-950/40" 
                : "bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700"
            )}
          >
            <Smartphone className="w-3.5 h-3.5" /> Celulares ({contagens.aparelhos})
          </button>

          <button
            type="button"
            onClick={() => setCategoriaFiltro('perfume')}
            className={cn(
              "px-3 py-1.5 rounded-full text-[11px] sm:text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer snap-start",
              categoriaFiltro === 'perfume' 
                ? "bg-rose-500 text-white shadow-md shadow-rose-950/40" 
                : "bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700"
            )}
          >
            <SprayCan className="w-3.5 h-3.5" /> Perfumes ({contagens.perfumes})
          </button>

          <button
            type="button"
            onClick={() => setCategoriaFiltro('acessorio')}
            className={cn(
              "px-3 py-1.5 rounded-full text-[11px] sm:text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer snap-start",
              categoriaFiltro === 'acessorio' 
                ? "bg-purple-500 text-white shadow-md shadow-purple-950/40" 
                : "bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700"
            )}
          >
            <Headphones className="w-3.5 h-3.5" /> Acessórios ({contagens.acessorios})
          </button>

          <button
            type="button"
            onClick={() => setCategoriaFiltro('outro')}
            className={cn(
              "px-3 py-1.5 rounded-full text-[11px] sm:text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer snap-start",
              categoriaFiltro === 'outro' 
                ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-950/40" 
                : "bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700"
            )}
          >
            <Package className="w-3.5 h-3.5" /> Outros ({contagens.outros})
          </button>
        </div>
        {/* Fades nas bordas */}
        <div className="absolute top-0 right-0 bottom-0 w-8 bg-gradient-to-l from-slate-950/80 to-transparent pointer-events-none" />
      </div>

      {/* Barra de Busca com Scanner */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar IMEI, modelo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-cyan-500 outline-none transition-colors"
          />
        </div>
        <button
          type="button"
          onClick={onOpenScanner}
          className="h-10 w-10 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl flex items-center justify-center text-cyan-400 transition-colors shrink-0"
        >
          <Camera className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
