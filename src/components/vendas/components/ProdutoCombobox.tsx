'use client';

import { useState } from 'react';
import { Aparelho } from '@/lib/db/types';
import { Search, ChevronDown, Check } from 'lucide-react';
import { formatarMoeda } from '../utils/vendasUtils';

interface ProdutoComboboxProps {
  aparelhos: Aparelho[];
  value: string;
  onChange: (aparelhoId: string) => void;
}

export function ProdutoCombobox({ aparelhos, value, onChange }: ProdutoComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selectedAparelho = aparelhos.find((a) => a.id === value);

  const filtered = aparelhos.filter((a) => {
    const q = query.toLowerCase();
    return (
      a.modelo.toLowerCase().includes(q) ||
      a.marca.toLowerCase().includes(q) ||
      (a.imei && a.imei.toLowerCase().includes(q)) ||
      (a.numeroSerie && a.numeroSerie.toLowerCase().includes(q)) ||
      (a.cor && a.cor.toLowerCase().includes(q)) ||
      (a.capacidade && a.capacidade.toLowerCase().includes(q))
    );
  });

  return (
    <div className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm input-glass text-left rounded-xl transition-all"
      >
        <span className="truncate">
          {selectedAparelho ? (
            <span className="font-medium text-slate-800 dark:text-white">
              📱 {selectedAparelho.marca} {selectedAparelho.modelo} ({selectedAparelho.capacidade || 'N/A'}) -{' '}
              {formatarMoeda(selectedAparelho.preco)}
            </span>
          ) : (
            <span className="text-slate-400">Selecione um aparelho do estoque...</span>
          )}
        </span>
        <ChevronDown className={`w-4 h-4 ml-2 opacity-50 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1.5 z-50 w-full rounded-2xl border border-white/15 bg-slate-900/98 dark:bg-slate-950/98 shadow-2xl backdrop-blur-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="p-2 border-b border-white/10 flex items-center gap-2">
              <Search className="w-4 h-4 text-slate-400 ml-2" />
              <input
                type="text"
                placeholder="Buscar por modelo, IMEI, cor..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full bg-transparent text-sm text-white focus:outline-none py-1"
                autoFocus
              />
            </div>
            <div className="max-h-60 overflow-y-auto p-1 scrollbar-soft space-y-1">
              {filtered.length === 0 ? (
                <div className="p-3 text-xs text-center text-slate-400">Nenhum aparelho encontrado.</div>
              ) : (
                filtered.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      onChange(a.id);
                      setOpen(false);
                      setQuery('');
                    }}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left text-xs sm:text-sm transition-colors ${
                      value === a.id ? 'bg-blue-600/30 text-blue-300 font-medium' : 'text-slate-200 hover:bg-white/10'
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-white">
                        {a.marca} {a.modelo} <span className="text-slate-400 font-normal">({a.capacidade})</span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {a.cor || 'Cor padrão'} • IMEI: {a.imei || a.numeroSerie || 'N/A'}
                      </div>
                    </div>
                    <div className="text-right ml-2 shrink-0">
                      <div className="font-bold text-emerald-400">{formatarMoeda(a.preco)}</div>
                      {value === a.id && <Check className="w-4 h-4 text-blue-400 ml-auto mt-0.5" />}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
