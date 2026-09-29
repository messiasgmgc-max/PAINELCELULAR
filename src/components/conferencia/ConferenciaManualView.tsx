'use client';

import React, { useState, useMemo } from 'react';
import { Search, ChevronDown, ChevronRight, CheckSquare, Square, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatarSaudeBateria, getAparelhoCodigo, cn, sortModelosCronologico, parseCapacidadeGB } from '@/lib/utils';

interface ConferenciaManualViewProps {
  aparelhosEstoque: any[];
  idsConfirmadosSet: Set<string>;
  onToggleItem: (aparelho: any) => void;
  onMarcarGrupo: (itens: any[], marcar: boolean) => void;
  onDesfazerLote?: () => void;
  podeDesfazerLote?: boolean;
}

export function ConferenciaManualView({
  aparelhosEstoque,
  idsConfirmadosSet,
  onToggleItem,
  onMarcarGrupo,
  onDesfazerLote,
  podeDesfazerLote,
}: ConferenciaManualViewProps) {
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'faltando' | 'encontrados'>('todos');
  const [gruposAbertos, setGruposAbertos] = useState<Record<string, boolean>>({});

  // Filtragem
  const aparelhosFiltrados = useMemo(() => {
    let lista = aparelhosEstoque;

    if (filtroStatus === 'faltando') {
      lista = lista.filter((a) => !idsConfirmadosSet.has(a.id));
    } else if (filtroStatus === 'encontrados') {
      lista = lista.filter((a) => idsConfirmadosSet.has(a.id));
    }

    if (!busca.trim()) return lista;

    const termo = busca.toLowerCase().trim();
    return lista.filter((a) => {
      const mod = (a.modelo || '').toLowerCase();
      const cor = (a.cor || '').toLowerCase();
      const cap = (a.capacidade || '').toLowerCase();
      const ime = (a.imei || '').toLowerCase();
      const cod = (getAparelhoCodigo(a) || '').toLowerCase();
      const num = (a.numeroSerie || '').toLowerCase();

      // Busca inclusive por final do IMEI
      const imeiLimpo = ime.replace(/\D/g, '');
      const termoLimpo = termo.replace(/\D/g, '');
      const finalMatch = termoLimpo.length >= 3 && imeiLimpo.endsWith(termoLimpo);

      return (
        mod.includes(termo) ||
        cor.includes(termo) ||
        cap.includes(termo) ||
        ime.includes(termo) ||
        cod.includes(termo) ||
        num.includes(termo) ||
        finalMatch
      );
    });
  }, [aparelhosEstoque, idsConfirmadosSet, filtroStatus, busca]);

  // Agrupamento por modelo ordenado rigorosamente do mais ANTIGO para o mais NOVO
  const grupos = useMemo(() => {
    const map: Record<string, any[]> = {};
    aparelhosFiltrados.forEach((item) => {
      const nome = item.modelo || 'Outros';
      if (!map[nome]) map[nome] = [];
      map[nome].push(item);
    });

    return Object.entries(map)
      .map(([modelo, itens]) => {
        // Ordena itens dentro do modelo por capacidade crescente, cor e IMEI
        itens.sort((a, b) => {
          const capA = parseCapacidadeGB(a.capacidade);
          const capB = parseCapacidadeGB(b.capacidade);
          if (capA !== capB) return capA - capB;
          const corComp = (a.cor || '').localeCompare(b.cor || '', 'pt-BR');
          if (corComp !== 0) return corComp;
          return (a.imei || '').localeCompare(b.imei || '');
        });

        return {
          modelo,
          itens,
          confirmados: itens.filter((i) => idsConfirmadosSet.has(i.id)).length,
          total: itens.length,
        };
      })
      .sort((a, b) => sortModelosCronologico(a.modelo, b.modelo, 'antigo_para_novo'));
  }, [aparelhosFiltrados, idsConfirmadosSet]);

  const toggleGrupo = (modelo: string) => {
    setGruposAbertos((prev) => ({
      ...prev,
      [modelo]: prev[modelo] === undefined ? false : !prev[modelo],
    }));
  };

  const totalConfirmados = useMemo(() => {
    return aparelhosEstoque.filter((a) => idsConfirmadosSet.has(a.id)).length;
  }, [aparelhosEstoque, idsConfirmadosSet]);

  return (
    <div className="flex flex-col gap-3 min-h-0 flex-1">
      {/* Barra de Busca e Filtros */}
      <div className="space-y-2.5 shrink-0 bg-slate-950 p-3 rounded-2xl border border-slate-800">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar modelo, cor, IMEI ou final..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-cyan-500 outline-none"
          />
        </div>

        {/* Chips de Status e Contador Fixo */}
        <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFiltroStatus('todos')}
              className={cn(
                "px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer",
                filtroStatus === 'todos' ? "bg-cyan-500 text-slate-950" : "bg-slate-900 text-slate-400 hover:text-white"
              )}
            >
              Todos ({aparelhosEstoque.length})
            </button>
            <button
              type="button"
              onClick={() => setFiltroStatus('faltando')}
              className={cn(
                "px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer",
                filtroStatus === 'faltando' ? "bg-amber-500 text-slate-950" : "bg-slate-900 text-slate-400 hover:text-white"
              )}
            >
              Faltando ({aparelhosEstoque.length - totalConfirmados})
            </button>
            <button
              type="button"
              onClick={() => setFiltroStatus('encontrados')}
              className={cn(
                "px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer",
                filtroStatus === 'encontrados' ? "bg-emerald-500 text-slate-950" : "bg-slate-900 text-slate-400 hover:text-white"
              )}
            >
              Encontrados ({totalConfirmados})
            </button>
          </div>

          <div className="font-mono text-xs font-bold text-cyan-400">
            {totalConfirmados} de {aparelhosEstoque.length} conferidos
          </div>
        </div>
      </div>

      {/* Snackbar / Banner de Desfazer Ação em Lote */}
      {podeDesfazerLote && (
        <div className="bg-cyan-950/80 border border-cyan-500/40 rounded-xl px-3 py-2 flex items-center justify-between gap-2 text-xs animate-in fade-in shrink-0">
          <span className="text-cyan-200">Ação em lote aplicada.</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDesfazerLote}
            className="text-cyan-400 hover:text-cyan-300 font-bold gap-1.5 h-7 text-xs px-2"
          >
            <Undo2 className="w-3.5 h-3.5" /> Desfazer
          </Button>
        </div>
      )}

      {/* Lista de Grupos com Scroll Próprio */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0 scrollbar-soft">
        {grupos.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            Nenhum aparelho encontrado com este filtro.
          </div>
        ) : (
          grupos.map((grupo) => {
            const aberto = gruposAbertos[grupo.modelo] ?? true;
            const todosConfirmados = grupo.confirmados === grupo.total && grupo.total > 0;

            return (
              <div key={grupo.modelo} className="rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden">
                {/* Header do Grupo */}
                <div 
                  className="p-3 bg-slate-900/80 flex items-center justify-between gap-2 cursor-pointer select-none hover:bg-slate-900"
                  onClick={() => toggleGrupo(grupo.modelo)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {aberto ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
                    <span className="font-bold text-xs sm:text-sm text-white truncate">
                      {grupo.modelo}
                    </span>
                    <Badge variant="outline" className="text-[10px] text-cyan-400 border-cyan-500/30 shrink-0">
                      {grupo.confirmados}/{grupo.total}
                    </Badge>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMarcarGrupo(grupo.itens, !todosConfirmados);
                    }}
                    className="text-[11px] font-bold text-cyan-400 hover:text-cyan-300 px-2 py-1 rounded-lg hover:bg-cyan-950/40 shrink-0 whitespace-nowrap cursor-pointer"
                  >
                    {todosConfirmados ? 'Desmarcar Grupo' : 'Marcar Grupo'}
                  </button>
                </div>

                {/* Itens do Grupo */}
                {aberto && (
                  <div className="divide-y divide-slate-800/60">
                    {grupo.itens.map((item) => {
                      const confirmado = idsConfirmadosSet.has(item.id);
                      const saude = formatarSaudeBateria(item);
                      const codigo = getAparelhoCodigo(item);

                      return (
                        <div
                          key={item.id}
                          onClick={() => onToggleItem(item)}
                          className={cn(
                            "min-h-[56px] px-3.5 py-2.5 flex items-center justify-between gap-3 cursor-pointer select-none transition-colors",
                            confirmado ? "bg-emerald-950/20 hover:bg-emerald-950/30" : "hover:bg-slate-900/60"
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            {/* Linha 1: Modelo */}
                            <div className="flex items-center gap-2">
                              <span className={cn("text-xs font-bold truncate", confirmado ? "text-emerald-300" : "text-white")}>
                                {item.modelo}
                              </span>
                              {confirmado && (
                                <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[9px] h-4 px-1 shrink-0">
                                  ✓ Conferido
                                </Badge>
                              )}
                            </div>

                            {/* Linha 2: GB, Cor, Bateria e IMEI */}
                            <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-400 mt-0.5 font-mono">
                              {item.capacidade && <span className="text-slate-300 font-semibold">{item.capacidade}</span>}
                              {item.cor && <span className="text-cyan-400">{item.cor}</span>}
                              {saude && <span className="text-emerald-400 font-semibold">🔋 {saude}</span>}
                              <span>IMEI: {item.imei || '-'}</span>
                              {codigo && <span>· ID: {codigo}</span>}
                            </div>
                          </div>

                          {/* Checkbox de Toque Fácil */}
                          <div className="shrink-0 pl-2">
                            {confirmado ? (
                              <CheckSquare className="w-5 h-5 text-emerald-400" />
                            ) : (
                              <Square className="w-5 h-5 text-slate-600" />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
