'use client';

import { useEffect, useRef, useState } from 'react';
import { Aparelho } from '@/lib/db/types';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, Plus, Search, X } from 'lucide-react';
import { filtrarESortearAparelhos } from '@/lib/buscaEstoque';
import { estaNoEstoque, type EstadoCicloAparelho } from '@/lib/estoque/ciclo';
import { getAparelhoCodigo } from '@/lib/utils';

const aparelhoNoEstoque = (a: Aparelho): boolean =>
  estaNoEstoque(a as unknown as EstadoCicloAparelho);

export interface ProdutoComboboxProps {
  aparelhos: Aparelho[];
  value: string;
  onChange: (aparelhoId: string) => void;
  onCadastrarNovo?: (termo: string) => void;
}

export function ProdutoCombobox({
  aparelhos,
  value,
  onChange,
  onCadastrarNovo,
}: ProdutoComboboxProps) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [buscarVendidosSemCliente, setBuscarVendidosSemCliente] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  // Com a opção marcada entram também os que já saíram do estoque (vendidos ou baixados).
  const disponiveis = buscarVendidosSemCliente
    ? aparelhos
    : aparelhos.filter(aparelhoNoEstoque);
  const selecionado = aparelhos.find((a) => a.id === value);

  const filtrados = filtrarESortearAparelhos(disponiveis, searchTerm);

  const formatSelectedText = (a: Aparelho) => {
    const cod = getAparelhoCodigo(a);
    const imei = a.imei || a.numeroSerie || '';
    const idTag = `[ID: ${cod}] `;
    const imeiTag = imei ? `[IMEI: ${imei}] ` : '';
    const capTag = a.capacidade ? ` ${a.capacidade}` : '';
    const corTag = a.cor ? ` - ${a.cor}` : '';
    const precoStr = ` - R$ ${(a.preco || 0).toFixed(2).replace('.', ',')}`;
    return `${idTag}${imeiTag}${a.marca || ''} ${a.modelo || ''}${capTag}${corTag}${precoStr}`;
  };

  return (
    <div ref={containerRef} className="relative flex-1 min-w-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="input-glass min-w-0 w-full text-left flex items-center justify-between gap-2 h-11 px-3 py-2 text-xs font-mono"
      >
        <span className="truncate">
          {selecionado ? (
            <span className="font-bold text-emerald-400">
              {formatSelectedText(selecionado)}
            </span>
          ) : (
            <span className="text-muted-foreground font-sans">🔍 Pesquisar por ID, IMEI ou Modelo...</span>
          )}
        </span>
        <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 w-full sm:min-w-[500px] md:min-w-[620px] bg-slate-900/98 backdrop-blur-2xl border border-white/20 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.8)] z-[9999] overflow-hidden flex flex-col max-h-84 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="p-2.5 border-b border-white/10 bg-black/40 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-emerald-400 shrink-0 ml-1" />
              <input
                ref={inputRef}
                type="text"
                className="bg-transparent border-none outline-none text-xs w-full text-white placeholder-slate-400 font-mono"
                placeholder="Digite o ID (ex: 8665041), IMEI (ex: 9551984) ou Modelo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button type="button" onClick={() => setSearchTerm('')} className="p-1 text-slate-400 hover:text-white">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <label className="flex items-center gap-1.5 px-1 pt-1 text-[11px] text-amber-300 font-bold cursor-pointer border-t border-white/5">
              <input
                type="checkbox"
                checked={buscarVendidosSemCliente}
                onChange={(e) => setBuscarVendidosSemCliente(e.target.checked)}
                className="rounded border-amber-500 text-amber-500 focus:ring-amber-500"
              />
              <span>🔗 Buscar também entre aparelhos já baixados / vendidos</span>
            </label>
          </div>

          <div className="overflow-y-auto divide-y divide-white/5 text-xs font-mono flex-1 max-h-64">
            {filtrados.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground text-xs font-sans space-y-2">
                <p>Nenhum aparelho encontrado com &quot;{searchTerm}&quot;.</p>
                {onCadastrarNovo && searchTerm.trim() && (
                  <button
                    type="button"
                    onClick={() => {
                      onCadastrarNovo(searchTerm.trim());
                      setOpen(false);
                      setSearchTerm('');
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/40 bg-blue-500/15 px-3 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-500/25"
                  >
                    <Plus className="h-3.5 w-3.5" /> Cadastrar &quot;{searchTerm.trim()}&quot;
                  </button>
                )}
              </div>
            ) : (
              filtrados.map((a) => {
                const imei = a.imei || a.numeroSerie || '';
                const isSelected = a.id === value;
                const cod = getAparelhoCodigo(a);
                const jaBaixado = !aparelhoNoEstoque(a);
                return (
                  <div
                    key={a.id}
                    onClick={() => {
                      onChange(a.id);
                      setOpen(false);
                      setSearchTerm('');
                    }}
                    className={`p-3 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                      isSelected ? 'bg-emerald-600/30 border-l-4 border-emerald-500' : 'hover:bg-white/10'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-blue-400 bg-blue-950/90 px-2 py-0.5 rounded border border-blue-500/40 text-[11px]">
                          ID: {cod}
                        </span>
                        {imei && (
                          <span className="font-bold text-emerald-400 bg-emerald-950/90 px-2 py-0.5 rounded border border-emerald-500/40 text-[11px]">
                            IMEI: {imei}
                          </span>
                        )}
                        {jaBaixado && (
                          <span className="font-bold text-amber-300 bg-amber-950/90 px-1.5 py-0.5 rounded border border-amber-500/40 text-[10px]">
                            ⚠️ Já Baixado
                          </span>
                        )}
                        <span className="font-bold text-white text-xs">
                          {a.marca} {a.modelo}
                        </span>
                        {a.capacidade && <span className="text-slate-300 text-[11px]">{a.capacidade}</span>}
                        {a.cor && <span className="text-blue-400 text-[11px]">{a.cor}</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-bold text-emerald-400 block text-xs">
                        R$ {(a.preco || 0).toFixed(2).replace('.', ',')}
                      </span>
                      <Badge variant={a.condicao === 'novo' ? 'default' : 'secondary'} className="text-[9px] py-0 px-1.5 mt-0.5">
                        {a.condicao === 'novo' ? 'Lacrado' : 'Seminovo'}
                      </Badge>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export const ComboboxAparelhos = ProdutoCombobox;
