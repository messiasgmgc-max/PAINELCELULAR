'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, User, X, Package, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CompradorFrequente } from '@/hooks/useCompradores';

interface CompradorAutocompleteProps {
  value: string;
  onChange: (nome: string) => void;
  compradores: CompradorFrequente[];
  onBuscar?: (termo: string) => Promise<CompradorFrequente[]>;
  tipo?: 'lojista' | 'cliente' | 'todos';
  placeholder?: string;
  required?: boolean;
  className?: string;
}

export function CompradorAutocomplete({
  value,
  onChange,
  compradores,
  onBuscar,
  tipo = 'todos',
  placeholder,
  required,
  className,
}: CompradorAutocompleteProps) {
  const [aberto, setAberto] = useState(false);
  const [termoBusca, setTermoBusca] = useState('');
  const [resultadosBusca, setResultadosBusca] = useState<CompradorFrequente[]>([]);
  const [buscando, setBuscando] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<any>(null);

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAberto(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filtra compradores localmente + busca remota
  const sugestoes = useMemo(() => {
    const termo = (termoBusca || value || '').trim().toLowerCase();
    if (!termo) {
      // Sem busca: mostra os mais frequentes
      const filtrados = tipo === 'todos'
        ? compradores
        : compradores.filter(c => c.tipo === tipo);
      return filtrados.slice(0, 10);
    }

    // Com busca: primeiro os resultados remotos, depois fallback local
    if (resultadosBusca.length > 0) return resultadosBusca;

    const filtrados = compradores.filter(c => {
      const matchNome = c.nome.toLowerCase().includes(termo);
      const matchTipo = tipo === 'todos' || c.tipo === tipo;
      return matchNome && matchTipo;
    });

    return filtrados.slice(0, 10);
  }, [compradores, resultadosBusca, termoBusca, value, tipo]);

  // Busca remota debounced
  const handleInputChange = (val: string) => {
    onChange(val);
    setTermoBusca(val);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (val.trim().length >= 1 && onBuscar) {
      setBuscando(true);
      debounceRef.current = setTimeout(async () => {
        try {
          const results = await onBuscar(val.trim());
          setResultadosBusca(results);
        } catch {
          setResultadosBusca([]);
        } finally {
          setBuscando(false);
        }
      }, 250);
    } else {
      setResultadosBusca([]);
      setBuscando(false);
    }
  };

  const handleSelecionar = (comp: CompradorFrequente) => {
    onChange(comp.nome);
    setTermoBusca('');
    setResultadosBusca([]);
    setAberto(false);
  };

  const placeholderText = placeholder || (tipo === 'lojista'
    ? 'Buscar lojista (ex: Junior, Tech Cell...)'
    : 'Buscar comprador / cliente...');

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholderText}
          value={value}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => setAberto(true)}
          className={cn(
            "w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder:text-slate-500 focus:border-cyan-500 outline-none transition-colors",
          )}
          required={required}
          autoComplete="off"
        />
        {value && (
          <button
            type="button"
            onClick={() => {
              onChange('');
              setTermoBusca('');
              setResultadosBusca([]);
              inputRef.current?.focus();
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        {!value && (
          <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        )}
      </div>

      {/* DROPDOWN DE SUGESTÕES */}
      {aberto && (
        <div className="absolute z-[100] top-full left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-h-52 overflow-y-auto scrollbar-thin animate-in fade-in slide-in-from-top-1 duration-150">
          {buscando && (
            <div className="p-3 text-center text-xs text-slate-400">
              Buscando...
            </div>
          )}

          {!buscando && sugestoes.length === 0 && value.trim().length > 0 && (
            <div className="p-3 space-y-1">
              <p className="text-[11px] text-slate-400 text-center">
                Nenhum comprador encontrado com &quot;{value}&quot;
              </p>
              <p className="text-[10px] text-cyan-400 text-center font-bold">
                ✨ Ao confirmar a venda, este nome será salvo automaticamente para as próximas vezes!
              </p>
            </div>
          )}

          {!buscando && sugestoes.length === 0 && value.trim().length === 0 && compradores.length === 0 && (
            <div className="p-3 text-center text-xs text-slate-500">
              Nenhum comprador cadastrado ainda. Digite o nome para criar.
            </div>
          )}

          {!buscando && sugestoes.map((comp) => {
            const isMatch = comp.nome.toLowerCase() === value.trim().toLowerCase();
            return (
              <button
                key={comp.id}
                type="button"
                onClick={() => handleSelecionar(comp)}
                className={cn(
                  "w-full text-left px-3 py-2 flex items-center justify-between gap-2 hover:bg-slate-800 transition-colors cursor-pointer text-xs border-b border-slate-800/60 last:border-0",
                  isMatch && "bg-cyan-500/10"
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className={cn(
                    "w-6 h-6 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-black",
                    comp.tipo === 'lojista'
                      ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                      : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                  )}>
                    {comp.tipo === 'lojista' ? <Package className="w-3 h-3" /> : <User className="w-3 h-3" />}
                  </div>
                  <div className="min-w-0">
                    <span className="font-bold text-white truncate block">{comp.nome}</span>
                    {comp.telefone && (
                      <span className="text-[10px] text-slate-500">{comp.telefone}</span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className={cn(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded-md",
                    comp.tipo === 'lojista'
                      ? "bg-amber-500/10 text-amber-400"
                      : "bg-emerald-500/10 text-emerald-400"
                  )}>
                    {comp.total_compras}x
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
