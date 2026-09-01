'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  Boxes, 
  ShoppingBag, 
  Search, 
  CheckSquare, 
  Square, 
  DollarSign, 
  TrendingUp, 
  User, 
  Calendar, 
  CreditCard, 
  CheckCircle2, 
  Trash2,
  AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { cn, getAparelhoCodigo } from '@/lib/utils';
import { Aparelho } from '@/lib/db/types';

interface VendaLoteAtacadoModalProps {
  isOpen: boolean;
  onClose: () => void;
  aparelhosEstoque: Aparelho[];
  lojaId: string | null;
  onSuccess: () => Promise<void>;
}

const FORMAS_PAGAMENTO = [
  { id: 'pix', label: 'PIX' },
  { id: 'dinheiro', label: 'Dinheiro' },
  { id: 'cartao_credito', label: 'Cartão de Crédito' },
  { id: 'cartao_debito', label: 'Cartão de Débito' },
  { id: 'fiado', label: 'A Prazo / Fiado' },
  { id: 'boleto', label: 'Boleto' },
];

export function VendaLoteAtacadoModal({
  isOpen,
  onClose,
  aparelhosEstoque,
  lojaId,
  onSuccess,
}: VendaLoteAtacadoModalProps) {
  const [busca, setBusca] = useState('');
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [precosCustomizados, setPrecosCustomizados] = useState<Record<string, number>>({});
  const [comprador, setComprador] = useState('');
  const [metodoPgto, setMetodoPgto] = useState('pix');
  const [dataVenda, setDataVenda] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [observacoes, setObservacoes] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [compradoresRecentes, setCompradoresRecentes] = useState<string[]>([]);

  // Carrega compradores recentes do localStorage
  useEffect(() => {
    try {
      const salvas = localStorage.getItem('painel_celular_compradores_recentes');
      if (salvas) {
        setCompradoresRecentes(JSON.parse(salvas));
      }
    } catch (e) {}
  }, []);

  // Reseta ao abrir/fechar
  useEffect(() => {
    if (isOpen) {
      setSelecionados([]);
      setPrecosCustomizados({});
      setComprador('');
      setObservacoes('');
      setDataVenda(new Date().toISOString().split('T')[0]);
      setMetodoPgto('pix');
    }
  }, [isOpen]);

  // Aparelhos filtrados na busca
  const aparelhosFiltrados = useMemo(() => {
    if (!busca.trim()) return aparelhosEstoque;
    const t = busca.toLowerCase().trim();
    return aparelhosEstoque.filter((a) => {
      const mod = (a.modelo || '').toLowerCase();
      const cor = (a.cor || '').toLowerCase();
      const cap = (a.capacidade || '').toLowerCase();
      const ime = (a.imei || '').toLowerCase();
      const cod = (getAparelhoCodigo(a) || '').toLowerCase();
      return mod.includes(t) || cor.includes(t) || cap.includes(t) || ime.includes(t) || cod.includes(t);
    });
  }, [aparelhosEstoque, busca]);

  // Lista dos objetos de aparelhos selecionados
  const itensSelecionados = useMemo(() => {
    return aparelhosEstoque.filter((a) => selecionados.includes(a.id));
  }, [aparelhosEstoque, selecionados]);

  // Alterna seleção de um aparelho
  const toggleSelecionado = (id: string) => {
    setSelecionados((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      } else {
        const item = aparelhosEstoque.find(a => a.id === id);
        if (item && precosCustomizados[id] === undefined) {
          const valAtacado = (item as any).precoAtacado || item.preco || 0;
          setPrecosCustomizados(p => ({ ...p, [id]: valAtacado }));
        }
        return [...prev, id];
      }
    });
  };

  // Selecionar todos os filtrados
  const handleSelecionarTodos = () => {
    const ids = aparelhosFiltrados.map((a) => a.id);
    const novosPrecos = { ...precosCustomizados };
    aparelhosFiltrados.forEach((a) => {
      if (novosPrecos[a.id] === undefined) {
        novosPrecos[a.id] = (a as any).precoAtacado || a.preco || 0;
      }
    });
    setPrecosCustomizados(novosPrecos);
    setSelecionados((prev) => Array.from(new Set([...prev, ...ids])));
  };

  // Desmarcar todos
  const handleDesmarcarTodos = () => {
    setSelecionados([]);
  };

  // Preço de venda unitário de um item no lote
  const getPrecoItem = (a: Aparelho): number => {
    if (precosCustomizados[a.id] !== undefined) {
      return precosCustomizados[a.id];
    }
    return (a as any).precoAtacado || a.preco || 0;
  };

  // Atualizar preço individual
  const handlePrecoChange = (id: string, valStr: string) => {
    const valLimpo = valStr.replace(/[^\d,.]/g, '').replace(',', '.');
    const num = parseFloat(valLimpo) || 0;
    setPrecosCustomizados((prev) => ({ ...prev, [id]: num }));
  };

  // Totais financeiros do lote
  const totais = useMemo(() => {
    let valorTotal = 0;
    let custoTotal = 0;

    itensSelecionados.forEach((a) => {
      valorTotal += getPrecoItem(a);
      custoTotal += (a.custo || 0);
    });

    const lucroTotal = valorTotal - custoTotal;
    const margemMedia = custoTotal > 0 ? ((lucroTotal / custoTotal) * 100).toFixed(1) : '100';

    return {
      valorTotal,
      custoTotal,
      lucroTotal,
      margemMedia,
    };
  }, [itensSelecionados, precosCustomizados]);

  if (!isOpen) return null;

  const salvarCompradorRecente = (nome: string) => {
    if (!nome || nome.trim().length < 2) return;
    const limpo = nome.trim();
    try {
      const atualizados = [limpo, ...compradoresRecentes.filter(c => c.toLowerCase() !== limpo.toLowerCase())].slice(0, 8);
      setCompradoresRecentes(atualizados);
      localStorage.setItem('painel_celular_compradores_recentes', JSON.stringify(atualizados));
    } catch (e) {}
  };

  // Finalizar a venda do lote inteiro
  const handleFinalizarVendaLote = async (e: React.FormEvent) => {
    e.preventDefault();

    if (itensSelecionados.length === 0) {
      toast.error('Selecione pelo menos 1 aparelho para vender.');
      return;
    }

    if (!comprador.trim()) {
      toast.error('Informe o nome do comprador/lojista (ex: "Junior").');
      return;
    }

    setSalvando(true);
    const toastId = toast.loading(`Registrando venda de ${itensSelecionados.length} aparelho(s) para ${comprador.trim()}...`);

    try {
      const compradorFinal = comprador.trim();
      const dataIso = new Date(dataVenda + 'T12:00:00').toISOString();

      // 1. Atualiza todos os aparelhos selecionados no Supabase
      for (const item of itensSelecionados) {
        const precoItem = getPrecoItem(item);
        const custoItem = item.custo || 0;
        const lucroItem = precoItem - custoItem;

        const obsBaixa = [
          `BAIXA_ESTOQUE:${dataIso}:Venda ATACADO (Lote com ${itensSelecionados.length} itens) para ${compradorFinal} por R$ ${precoItem.toFixed(2)} | Custo: R$ ${custoItem.toFixed(2)} | Lucro: R$ ${lucroItem.toFixed(2)} | Pgto: ${metodoPgto}`,
          observacoes ? `Obs: ${observacoes.trim()}` : '',
          `ID: ${getAparelhoCodigo(item)}`,
          item.imei ? `IMEI: ${item.imei}` : ''
        ].filter(Boolean).join(' | ');

        await supabase
          .from('aparelhos')
          .update({
            ativo: false,
            condicao: 'vendido',
            status: 'vendido',
            cliente: compradorFinal,
            observacoes: obsBaixa,
          })
          .eq('id', item.id);
      }

      // 2. Insere um registro agrupado na tabela 'vendas'
      const payloadVenda: any = {
        clienteNome: compradorFinal,
        vendedor: 'Sistema',
        tipoEntrega: 'Atacado / Lojista',
        valor: totais.valorTotal,
        custo: totais.custoTotal,
        lucro: totais.lucroTotal,
        percentualLucro: parseFloat(totais.margemMedia) || 0,
        dataPagamento: dataIso,
        status: 'pago',
        metodo: metodoPgto,
        descricao: `Venda ATACADO (Lote ${itensSelecionados.length} aparelhos) para ${compradorFinal}`,
        garantia: 'Garantia de Atacado (Teste)',
        descontoTotal: 0,
        itens: itensSelecionados.map((item) => {
          const p = getPrecoItem(item);
          const c = item.custo || 0;
          return {
            id: `${Date.now()}_${item.id}`,
            aparelhoId: item.id,
            descricao: `${item.marca} ${item.modelo} - ${item.capacidade || ''} ${item.cor || ''} (ID: ${getAparelhoCodigo(item)})`,
            quantidade: 1,
            valorInterno: c,
            valorExibir: p,
            desconto: 0,
            tipoDesconto: 'R$',
            total: p,
            observacao: observacoes || 'Venda em Lote Atacado',
          };
        }),
        pagamentos: [
          {
            id: Date.now().toString(),
            metodo: metodoPgto,
            valor: totais.valorTotal,
            parcelas: 1,
          },
        ],
        loja_id: lojaId || null,
        lojaId: lojaId || null,
      };

      await supabase.from('vendas').insert([payloadVenda]);

      salvarCompradorRecente(compradorFinal);

      toast.success(`🎉 Lote de ${itensSelecionados.length} aparelhos vendido com sucesso para ${compradorFinal}!`, { id: toastId, duration: 5000 });
      await onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Erro ao finalizar venda de lote:', err);
      toast.error(`Erro ao finalizar venda: ${err.message || 'Falha no banco'}`, { id: toastId });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
      <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 text-white my-auto shrink-0 relative max-h-[92vh] flex flex-col">
        
        {/* CABEÇALHO */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold border border-amber-500/30">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg text-white">Nova Venda de Atacado (Lote / Múltiplos)</h3>
              <p className="text-xs text-slate-400">
                Selecione um ou vários aparelhos para fechar o pedido de atacado para um lojista
              </p>
            </div>
          </div>

          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleFinalizarVendaLote} className="flex-1 flex flex-col min-h-0 space-y-4">
          
          {/* GRID COM 2 COLUNAS: ESQUERDA (SELEÇÃO DE ESTOQUE) | DIREITA (DADOS DO COMPRADOR & RESUMO) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0">
            
            {/* COLUNA ESQUERDA: LISTA DE APARELHOS DO ESTOQUE (7 cols) */}
            <div className="lg:col-span-7 flex flex-col space-y-2.5 min-h-0">
              <div className="flex items-center justify-between gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Filtrar por modelo, cor, IMEI ou ID..."
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:border-amber-500 outline-none"
                  />
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleSelecionarTodos}
                    className="text-[11px] h-8 px-2 text-amber-400 hover:text-amber-300"
                  >
                    Marcar Todos
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleDesmarcarTodos}
                    className="text-[11px] h-8 px-2 text-slate-400 hover:text-white"
                  >
                    Limpar
                  </Button>
                </div>
              </div>

              {/* LISTA ROLÁVEL COM CHECKBOXES */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[360px] border border-slate-800/80 rounded-2xl p-2 bg-slate-950/60">
                {aparelhosFiltrados.length === 0 ? (
                  <p className="p-8 text-center text-slate-500 text-xs">Nenhum aparelho disponível encontrado.</p>
                ) : (
                  aparelhosFiltrados.map((item) => {
                    const isChecked = selecionados.includes(item.id);
                    const precoItem = getPrecoItem(item);

                    return (
                      <div
                        key={item.id}
                        onClick={() => toggleSelecionado(item.id)}
                        className={cn(
                          "p-2.5 rounded-xl border flex items-center justify-between gap-3 text-xs transition-all cursor-pointer select-none",
                          isChecked
                            ? "bg-amber-500/15 border-amber-500/50 text-white"
                            : "bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700"
                        )}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <button
                            type="button"
                            className={cn("w-4 h-4 rounded flex items-center justify-center transition-colors", isChecked ? "text-amber-400" : "text-slate-500")}
                          >
                            {isChecked ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                          </button>

                          <div className="min-w-0">
                            <div className="font-bold text-white flex items-center gap-1.5">
                              <span className="truncate">{item.modelo}</span>
                              {item.capacidade && <span className="text-slate-400 text-[10px]">{item.capacidade}</span>}
                              {item.cor && <span className="text-slate-400 text-[10px]">· {item.cor}</span>}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              ID: {getAparelhoCodigo(item)} {item.imei ? `· ${item.imei}` : ''} · Custo: R$ {(item.custo || 0).toFixed(0)}
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="font-bold font-mono text-xs text-amber-400">
                            R$ {precoItem.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* COLUNA DIREITA: DADOS DO COMPRADOR & FECHAMENTO (5 cols) */}
            <div className="lg:col-span-5 flex flex-col space-y-3 bg-slate-950 p-4 rounded-2xl border border-slate-800">
              
              {/* COMPRADOR */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-amber-400" />
                    Lojista / Comprador *
                  </label>
                  <span className="text-[10px] text-slate-400">Ex: "Junior"</span>
                </div>

                <input
                  type="text"
                  placeholder="Nome do lojista (ex: Junior)"
                  value={comprador}
                  onChange={(e) => setComprador(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-amber-500 outline-none font-bold"
                  required
                />

                {/* Chips de compradores recentes */}
                {compradoresRecentes.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap pt-0.5">
                    <span className="text-[9px] text-slate-500">Recentes:</span>
                    {compradoresRecentes.slice(0, 5).map((rec) => (
                      <button
                        key={rec}
                        type="button"
                        onClick={() => setComprador(rec)}
                        className="text-[9px] font-bold bg-slate-800 hover:bg-slate-700 text-cyan-300 px-1.5 py-0.5 rounded border border-slate-700 transition-colors cursor-pointer"
                      >
                        {rec}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* FORMA DE PAGAMENTO E DATA */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-400">Pagamento</label>
                  <select
                    value={metodoPgto}
                    onChange={(e) => setMetodoPgto(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white outline-none focus:border-amber-500 cursor-pointer"
                  >
                    {FORMAS_PAGAMENTO.map((f) => (
                      <option key={f.id} value={f.id}>{f.label}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-400">Data</label>
                  <input
                    type="date"
                    value={dataVenda}
                    onChange={(e) => setDataVenda(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* OBSERVAÇÃO */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-400">Observações / Garantia</label>
                <input
                  type="text"
                  placeholder="Ex: Garantia de teste 30 dias..."
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder:text-slate-500 outline-none focus:border-amber-500"
                />
              </div>

              {/* RESUMO FINANCEIRO DO LOTE */}
              <div className="mt-auto p-3 bg-slate-900/90 rounded-xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400 pb-1.5 border-b border-white/5">
                  <span>Itens Selecionados:</span>
                  <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 font-mono text-xs font-bold">
                    {itensSelecionados.length} aparelho(s)
                  </Badge>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Custo Total:</span>
                  <span className="font-mono text-slate-300">R$ {totais.custoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Valor Total Atacado:</span>
                  <span className="font-mono font-bold text-sm text-emerald-400">
                    R$ {totais.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs pt-1.5 border-t border-white/5">
                  <span className="text-cyan-300 font-semibold flex items-center gap-1">
                    <TrendingUp className="w-3.5 h-3.5" /> Lucro Líquido:
                  </span>
                  <span className="font-mono font-bold text-cyan-400">
                    R$ {totais.lucroTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ({totais.margemMedia}%)
                  </span>
                </div>
              </div>

            </div>

          </div>

          {/* BOTÕES DE AÇÃO INFERIORES */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-3 shrink-0">
            <span className="text-xs text-slate-400">
              {itensSelecionados.length === 0 ? 'Nenhum aparelho selecionado' : `${itensSelecionados.length} aparelho(s) prontos para baixa`}
            </span>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="text-xs text-slate-400 hover:text-white"
              >
                Cancelar
              </Button>

              <Button
                type="submit"
                disabled={salvando || itensSelecionados.length === 0}
                className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-bold text-xs gap-2 px-5 py-2.5 rounded-xl shadow-lg shadow-amber-950/40 cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                Finalizar Venda de {itensSelecionados.length} Aparelho(s)
              </Button>
            </div>
          </div>

        </form>

      </div>
    </div>
  );
}
