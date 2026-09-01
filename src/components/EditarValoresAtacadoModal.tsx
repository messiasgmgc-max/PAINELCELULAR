'use client';

import React, { useState, useMemo } from 'react';
import { 
  X, 
  Search, 
  Check, 
  Package, 
  Tag, 
  DollarSign, 
  Sparkles, 
  RefreshCw, 
  Save,
  CheckCircle2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { cn, parseMonetaryValue } from '@/lib/utils';
import { Aparelho } from '@/lib/db/types';

interface EditarValoresAtacadoModalProps {
  isOpen: boolean;
  onClose: () => void;
  aparelhos: Aparelho[];
  onEstoqueAtualizado: () => Promise<void>;
}

export function EditarValoresAtacadoModal({
  isOpen,
  onClose,
  aparelhos,
  onEstoqueAtualizado,
}: EditarValoresAtacadoModalProps) {
  const [busca, setBusca] = useState('');
  const [margemPadrao, setMargemPadrao] = useState<string>('150');
  const [valoresEditados, setValoresEditados] = useState<Record<string, number>>({});
  const [salvando, setSalvando] = useState(false);

  // Inicializa mapa de edições com valores atuais do estoque
  const aparelhosAtivos = useMemo(() => {
    return aparelhos.filter((a) => a.ativo !== false && a.condicao !== 'vendido');
  }, [aparelhos]);

  // Filtro por texto
  const aparelhosFiltrados = useMemo(() => {
    if (!busca.trim()) return aparelhosAtivos;
    const termo = busca.toLowerCase().trim();
    return aparelhosAtivos.filter((a) => {
      const mod = (a.modelo || '').toLowerCase();
      const mar = (a.marca || '').toLowerCase();
      const cor = (a.cor || '').toLowerCase();
      const ime = (a.imei || '').toLowerCase();
      return mod.includes(termo) || mar.includes(termo) || cor.includes(termo) || ime.includes(termo);
    });
  }, [aparelhosAtivos, busca]);

  // Agrupamento por Modelo
  const gruposModelos = useMemo(() => {
    const map: Record<string, Aparelho[]> = {};
    aparelhosFiltrados.forEach((a) => {
      const modeloKey = a.modelo ? a.modelo.replace(/^Apple\s+/i, '').trim() : 'Outros';
      if (!map[modeloKey]) map[modeloKey] = [];
      map[modeloKey].push(a);
    });
    return map;
  }, [aparelhosFiltrados]);

  if (!isOpen) return null;

  const handlePrecoAtacadoChange = (id: string, val: string) => {
    const num = parseMonetaryValue(val);
    setValoresEditados((prev) => ({
      ...prev,
      [id]: num,
    }));
  };

  const getValorAtacadoItem = (a: Aparelho): number => {
    if (valoresEditados[a.id] !== undefined) {
      return valoresEditados[a.id];
    }
    return (a as any).precoAtacado || (a as any).preco_atacado || a.preco || 0;
  };

  // Aplica margem Custo + R$ X para todos os aparelhos filtrados
  const aplicarMargemEmLote = () => {
    const margem = parseMonetaryValue(margemPadrao) || 0;
    const novosValores: Record<string, number> = { ...valoresEditados };
    let alterados = 0;

    aparelhosFiltrados.forEach((a) => {
      const custoNum = a.custo || 0;
      if (custoNum > 0) {
        novosValores[a.id] = custoNum + margem;
        alterados++;
      } else if (a.preco > 0) {
        novosValores[a.id] = Math.max(0, a.preco - margem);
        alterados++;
      }
    });

    setValoresEditados(novosValores);
    toast.success(`Margem de R$ ${margem} aplicada para ${alterados} aparelhos!`);
  };

  // Aplica valor fixo para todos os itens de um modelo específico
  const aplicarValorModelo = (itensModelo: Aparelho[], valorFixo: number) => {
    const novosValores: Record<string, number> = { ...valoresEditados };
    itensModelo.forEach((a) => {
      novosValores[a.id] = valorFixo;
    });
    setValoresEditados(novosValores);
    toast.info(`Valor de R$ ${valorFixo.toLocaleString('pt-BR')} aplicado a ${itensModelo.length} unidade(s).`);
  };

  // Salva em lote no Supabase
  const handleSalvarTodos = async () => {
    setSalvando(true);
    const toastId = toast.loading("Salvando valores de atacado...");

    try {
      const idsParaAtualizar = Object.keys(valoresEditados);
      if (idsParaAtualizar.length === 0) {
        toast.info("Nenhuma alteração pendente de salvamento.", { id: toastId });
        setSalvando(false);
        return;
      }

      let alteradosSucesso = 0;

      for (const id of idsParaAtualizar) {
        const novoPrecoAtacado = valoresEditados[id];
        
        // Tenta atualizar com precoAtacado (camelCase)
        let { error } = await supabase
          .from('aparelhos')
          .update({ 
            precoAtacado: novoPrecoAtacado,
            preco_atacado: novoPrecoAtacado 
          })
          .eq('id', id);

        // Se der erro de coluna não encontrada, tenta individualmente
        if (error) {
          const res1 = await supabase
            .from('aparelhos')
            .update({ precoAtacado: novoPrecoAtacado })
            .eq('id', id);

          if (res1.error) {
            const res2 = await supabase
              .from('aparelhos')
              .update({ preco_atacado: novoPrecoAtacado })
              .eq('id', id);
            error = res2.error;
          } else {
            error = null;
          }
        }

        if (!error) {
          alteradosSucesso++;
        }
      }

      toast.success(`⚡ ${alteradosSucesso} preço(s) de atacado atualizado(s) com sucesso!`, { id: toastId, duration: 4000 });
      await onEstoqueAtualizado();
      setValoresEditados({});
      onClose();
    } catch (err: any) {
      console.error("Erro ao salvar preços de atacado:", err);
      toast.error(`Erro ao salvar: ${err.message || 'Falha na conexão'}`, { id: toastId });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-start p-2 sm:p-4 pt-2 sm:pt-4 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
      <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl p-3.5 sm:p-6 shadow-2xl space-y-4 text-white max-h-[96vh] flex flex-col my-0 shrink-0">
        
        {/* CABEÇALHO */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold border border-amber-500/30">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg text-white">Editar Valores de Atacado em Lote</h3>
              <p className="text-xs text-slate-400">
                Ajuste os preços de atacado para exportação da lista de revenda ({aparelhosAtivos.length} em estoque)
              </p>
            </div>
          </div>

          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* FERRAMENTAS EM LOTE E BUSCA */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 bg-slate-950 rounded-2xl border border-slate-800 shrink-0">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por modelo, cor ou IMEI..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-amber-500 outline-none"
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1 text-xs">
              <span className="text-slate-400 text-[11px]">Margem Custo +</span>
              <span className="text-slate-400 text-[11px]">R$</span>
              <input
                type="number"
                value={margemPadrao}
                onChange={(e) => setMargemPadrao(e.target.value)}
                className="w-16 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-amber-400 font-bold outline-none text-center"
              />
            </div>
            <Button
              size="sm"
              onClick={aplicarMargemEmLote}
              className="bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 font-bold text-xs rounded-xl gap-1.5 cursor-pointer h-9"
            >
              <Sparkles className="w-3.5 h-3.5" /> Aplicar em Todos
            </Button>
          </div>
        </div>

        {/* LISTA AGRUPADA POR MODELO */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1 min-h-0 max-h-[50vh]">
          {Object.keys(gruposModelos).length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-center p-6 text-slate-500 space-y-2">
              <Package className="w-8 h-8 opacity-40 mx-auto" />
              <p className="text-xs font-medium">Nenhum aparelho encontrado com a busca informada.</p>
            </div>
          ) : (
            Object.entries(gruposModelos).map(([modelo, itens]) => {
              const primeiroValor = getValorAtacadoItem(itens[0]);

              return (
                <div key={modelo} className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-white">{modelo}</span>
                      <Badge variant="outline" className="bg-slate-800 text-amber-400 text-[10px] border-slate-700">
                        {itens.length} unidade(s)
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const valPrompt = prompt(`Definir valor de atacado em R$ para TODOS os ${modelo}:`, String(primeiroValor || ''));
                          if (valPrompt !== null) {
                            const valLimpo = valPrompt.replace(/[^\d,.]/g, '').replace(',', '.');
                            const valNum = parseFloat(valLimpo) || 0;
                            aplicarValorModelo(itens, valNum);
                          }
                        }}
                        className="text-[11px] font-bold text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 px-2.5 py-1 rounded-lg border border-amber-500/20 transition-colors cursor-pointer"
                      >
                        Definir Valor do Grupo
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    {itens.map((item) => {
                      const valorAtual = getValorAtacadoItem(item);
                      const foiEditado = valoresEditados[item.id] !== undefined;

                      return (
                        <div
                          key={item.id}
                          className={cn(
                            "p-3 rounded-xl border flex items-center justify-between gap-3 text-xs transition-all",
                            foiEditado
                              ? "bg-amber-950/20 border-amber-500/40 text-amber-100"
                              : "bg-slate-950/80 border-slate-800 text-slate-300"
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-white flex items-center gap-2">
                              <span>{item.capacidade || ''}</span>
                              {item.cor && <span className="text-slate-400">· {item.cor}</span>}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono truncate mt-0.5">
                              Custo: R$ {(item.custo || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | Varejo: R$ {(item.preco || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-xs font-bold text-amber-400">Atacado R$</span>
                            <input
                              type="number"
                              value={valorAtual > 0 ? valorAtual : ''}
                              onChange={(e) => handlePrecoAtacadoChange(item.id, e.target.value)}
                              placeholder="1750"
                              className="w-24 bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1 text-xs text-white font-bold font-mono text-right outline-none focus:border-amber-500"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* RODAPÉ COM AÇÃO DE SALVAMENTO */}
        <div className="pt-3 border-t border-slate-800 flex items-center justify-between shrink-0">
          <span className="text-xs text-slate-400">
            {Object.keys(valoresEditados).length > 0 ? (
              <strong className="text-amber-400">{Object.keys(valoresEditados).length} aparelho(s) com alteração pendente</strong>
            ) : (
              'Altere os valores individuais ou use as ferramentas acima'
            )}
          </span>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-xs text-slate-400 hover:text-white"
            >
              Cancelar
            </Button>

            <Button
              onClick={handleSalvarTodos}
              disabled={salvando}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs gap-2 px-5 py-2.5 rounded-xl shadow-lg shadow-amber-950/30 cursor-pointer"
            >
              <Save className="w-4 h-4" /> Salvar Todos os Atacados ({Object.keys(valoresEditados).length})
            </Button>
          </div>
        </div>

      </div>
    </div>
  );
}
