import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  AlertCircle,
  Camera,
  QrCode,
  MessageCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { cn, getAparelhoCodigo, obterDataHoraVenda } from '@/lib/utils';
import { Aparelho } from '@/lib/db/types';
import { BarcodeScannerModal } from '@/components/BarcodeScannerModal';
import { CompradorAutocomplete } from '@/components/CompradorAutocomplete';
import { useCompradores } from '@/hooks/useCompradores';
import { useAuth } from '@/hooks/useAuth';
import { logVenda } from '@/lib/logger';

interface VendaLoteAtacadoModalProps {
  isOpen: boolean;
  onClose: () => void;
  aparelhosEstoque: Aparelho[];
  lojaId: string | null;
  onSuccess: () => Promise<void>;
  abrirScannerInicial?: boolean;
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
  abrirScannerInicial = false,
}: VendaLoteAtacadoModalProps) {
  const [busca, setBusca] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState<'todos' | 'aparelho' | 'perfume' | 'acessorio' | 'outro'>('todos');
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [precosCustomizados, setPrecosCustomizados] = useState<Record<string, number>>({});
  const [comprador, setComprador] = useState('');
  const [compradorTelefone, setCompradorTelefone] = useState('');
  const [metodoPgto, setMetodoPgto] = useState('pix');
  const [valorEntrada, setValorEntrada] = useState('');
  const [dataVencimento, setDataVencimento] = useState('');
  const [dataVenda, setDataVenda] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [observacoes, setObservacoes] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [showScannerModal, setShowScannerModal] = useState(abrirScannerInicial);
  const { usuario } = useAuth();

  const { compradores, buscarCompradores, upsertComprador } = useCompradores(lojaId);
  
  const handleCompradorChange = (novoNome: string) => {
    setComprador(novoNome);
    if (!novoNome.trim()) {
      setCompradorTelefone('');
      return;
    }
    const matchComp = compradores.find(c => c.nome.trim().toLowerCase() === novoNome.trim().toLowerCase());
    if (matchComp?.telefone) {
      setCompradorTelefone(matchComp.telefone);
    }
  };

  const keyBufferRef = useRef<string>('');
  const keyTimeoutRef = useRef<any>(null);

  // Reseta ao abrir/fechar
  useEffect(() => {
    if (isOpen) {
      setSelecionados([]);
      setPrecosCustomizados({});
      setComprador('');
      setCompradorTelefone('');
      setObservacoes('');
      setValorEntrada('');
      setDataVencimento('');
      setDataVenda(new Date().toISOString().split('T')[0]);
      setMetodoPgto('pix');
      if (abrirScannerInicial) {
        setShowScannerModal(true);
      }
    }
  }, [isOpen, abrirScannerInicial]);

  // Processamento de código de barras lido por Câmera ou Leitor USB
  const handleBarcodeScanned = (barcode: string) => {
    if (!barcode || !barcode.trim()) return;
    const clean = barcode.trim().toLowerCase();

    const found = aparelhosEstoque.find((a) => {
      const cod = (getAparelhoCodigo(a) || '').toLowerCase();
      const aCod = (a.codigo || '').toLowerCase();
      const ime = (a.imei || '').toLowerCase();
      const num = (a.numeroSerie || '').toLowerCase();
      const id = (a.id || '').toLowerCase();

      return (
        cod === clean ||
        aCod === clean ||
        ime === clean ||
        num === clean ||
        id === clean ||
        (clean.length >= 4 && (ime.endsWith(clean) || cod.endsWith(clean)))
      );
    });

    if (found) {
      setSelecionados((prev) => {
        if (!prev.includes(found.id)) {
          if (precosCustomizados[found.id] === undefined) {
            const valAtacado = (found as any).precoAtacado || found.preco || 0;
            setPrecosCustomizados((p) => ({ ...p, [found.id]: valAtacado }));
          }
          toast.success(`📦 ${found.marca} ${found.modelo} adicionado ao lote!`, { duration: 3000 });
          return [...prev, found.id];
        } else {
          toast.info(`ℹ️ ${found.marca} ${found.modelo} já está no lote.`);
          return prev;
        }
      });
    } else {
      toast.error(`⚠️ Código "${barcode}" não encontrado no estoque ativo.`);
    }
  };

  // Captura automática de leitor USB / Bluetooth no modal
  useEffect(() => {
    if (!isOpen || showScannerModal) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput = activeEl?.tagName === 'INPUT' || activeEl?.tagName === 'TEXTAREA' || activeEl?.tagName === 'SELECT';
      if (isInput) return;

      if (e.key === 'Enter') {
        if (keyBufferRef.current.length >= 3) {
          e.preventDefault();
          const codeToProcess = keyBufferRef.current;
          keyBufferRef.current = '';
          handleBarcodeScanned(codeToProcess);
        }
        keyBufferRef.current = '';
      } else if (e.key.length === 1) {
        keyBufferRef.current += e.key;
        if (keyTimeoutRef.current) clearTimeout(keyTimeoutRef.current);
        keyTimeoutRef.current = setTimeout(() => {
          keyBufferRef.current = '';
        }, 120);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (keyTimeoutRef.current) clearTimeout(keyTimeoutRef.current);
    };
  }, [isOpen, showScannerModal, aparelhosEstoque]);

  // Aparelhos filtrados na busca e categoria
  const aparelhosFiltrados = useMemo(() => {
    return aparelhosEstoque.filter((a) => {
      // Filtro de categoria
      if (categoriaFiltro !== 'todos') {
        const cat = a.categoria || 'aparelho';
        if (cat !== categoriaFiltro) return false;
      }

      // Filtro de texto
      if (!busca.trim()) return true;
      const t = busca.toLowerCase().trim();
      const mod = (a.modelo || '').toLowerCase();
      const cor = (a.cor || '').toLowerCase();
      const cap = (a.capacidade || '').toLowerCase();
      const ime = (a.imei || '').toLowerCase();
      const cod = (getAparelhoCodigo(a) || '').toLowerCase();
      return mod.includes(t) || cor.includes(t) || cap.includes(t) || ime.includes(t) || cod.includes(t);
    });
  }, [aparelhosEstoque, busca, categoriaFiltro]);

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
      const dataIso = obterDataHoraVenda(dataVenda);
      const valorEntradaNum = parseFloat(valorEntrada.replace(/[^\d,.]/g, '').replace(',', '.')) || 0;
      const isFiado = metodoPgto === 'fiado';
      const statusFinal = isFiado ? (valorEntradaNum > 0 ? 'parcial' : 'pendente') : 'pago';
      const saldoDevedorFinal = isFiado ? Math.max(0, totais.valorTotal - valorEntradaNum) : 0;
      const valorPagoFinal = isFiado ? valorEntradaNum : totais.valorTotal;

      const historicoAbatimentos = (isFiado && valorEntradaNum > 0) ? [
        {
          id: `${Date.now()}_entrada`,
          data: dataIso,
          valor: valorEntradaNum,
          metodo: 'pix',
          observacao: 'Entrada paga no momento da compra',
          registradoPor: 'Sistema'
        }
      ] : [];

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
        dataVencimento: dataVencimento ? new Date(dataVencimento + 'T12:00:00').toISOString() : undefined,
        status: statusFinal,
        metodo: metodoPgto,
        valorPago: valorPagoFinal,
        saldoDevedor: saldoDevedorFinal,
        historicoAbatimentos,
        descricao: `Venda ATACADO (Lote ${itensSelecionados.length} itens) para ${compradorFinal}`,
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
            valor: valorPagoFinal,
            parcelas: 1,
          },
        ],
        loja_id: lojaId || null,
      };

      const { error: errInsert } = await supabase.from('vendas').insert([payloadVenda]);
      if (errInsert) {
        console.error('Erro ao inserir venda em lote:', errInsert);
        throw errInsert;
      }

      await upsertComprador(compradorFinal, 'lojista', compradorTelefone || undefined);

      logVenda({
        clienteNome: compradorFinal,
        valorTotal: totais.valorTotal,
        tipoVenda: 'atacado',
        formaPagamento: metodoPgto,
        itensCount: itensSelecionados.length,
      }, usuario, lojaId);

      toast.success(`🎉 Lote de ${itensSelecionados.length} aparelhos vendido com sucesso para ${compradorFinal}!`, { id: toastId, duration: 5000 });

      // Notifica o lojista automaticamente no WhatsApp com itens e saldo devedor
      try {
        fetch('/api/atacado/notificar-venda', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lojaId: lojaId || null,
            compradorNome: compradorFinal,
            compradorTelefone: compradorTelefone || undefined,
            itens: itensSelecionados.map((item) => ({
              modelo: item.modelo,
              capacidade: item.capacidade,
              cor: item.cor,
              imei: item.imei,
              codigo: getAparelhoCodigo(item),
              valor: getPrecoItem(item),
            })),
            valorTotal: totais.valorTotal,
            formaPagamento: metodoPgto,
            dataVencimento: dataVencimento ? new Date(dataVencimento + 'T12:00:00').toISOString() : undefined,
          }),
        })
          .then(async (r) => {
            const j = await r.json();
            if (j.enviado) {
              toast.success(`📲 Comprovante e saldo devedor enviados no WhatsApp de ${compradorFinal}!`, { duration: 6000 });
            }
          })
          .catch((eW) => console.warn('Aviso notificação WhatsApp atacado lote:', eW));
      } catch (eW) {
        console.warn('Erro ao disparar notificação WhatsApp atacado lote:', eW);
      }

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
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-5xl w-full p-4 sm:p-6 shadow-2xl space-y-4 text-white max-h-[92dvh] overflow-y-auto flex flex-col my-auto relative">
        
        {/* CABEÇALHO */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold border border-amber-500/30">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base sm:text-lg text-white">Nova Venda de Atacado (Lote / Múltiplos)</h3>
                <Button
                  type="button"
                  onClick={() => setShowScannerModal(true)}
                  className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[11px] font-bold rounded-xl h-6 px-2 flex items-center gap-1 shadow-sm cursor-pointer shrink-0"
                >
                  <Camera className="w-3 h-3 text-amber-400" />
                  Bipar Câmera/USB
                </Button>
              </div>
              <p className="text-xs text-slate-400">
                Selecione ou bipe aparelhos para fechar o pedido de atacado para um lojista
              </p>
            </div>
          </div>

          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleFinalizarVendaLote} className="space-y-4 flex flex-col flex-1">
          
          {/* GRID COM 2 COLUNAS: ESQUERDA (SELEÇÃO DE ESTOQUE) | DIREITA (DADOS DO COMPRADOR & RESUMO) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            
            {/* COLUNA ESQUERDA: LISTA DE APARELHOS DO ESTOQUE (7 cols) */}
            <div className="lg:col-span-7 flex flex-col space-y-2.5 min-h-0">
              
              {/* FILTROS DE CATEGORIA */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar touch-pan-x">
                <button
                  type="button"
                  onClick={() => setCategoriaFiltro('todos')}
                  className={cn(
                    "px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer",
                    categoriaFiltro === 'todos' ? "bg-amber-500 text-slate-950 shadow-sm" : "bg-slate-950 text-slate-400 hover:text-white border border-slate-800"
                  )}
                >
                  ✨ Todos ({aparelhosEstoque.length})
                </button>
                <button
                  type="button"
                  onClick={() => setCategoriaFiltro('aparelho')}
                  className={cn(
                    "px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer",
                    categoriaFiltro === 'aparelho' ? "bg-blue-500 text-white shadow-sm" : "bg-slate-950 text-slate-400 hover:text-white border border-slate-800"
                  )}
                >
                  📱 Celulares
                </button>
                <button
                  type="button"
                  onClick={() => setCategoriaFiltro('perfume')}
                  className={cn(
                    "px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer",
                    categoriaFiltro === 'perfume' ? "bg-rose-500 text-white shadow-sm" : "bg-slate-950 text-slate-400 hover:text-white border border-slate-800"
                  )}
                >
                  🧴 Perfumes
                </button>
                <button
                  type="button"
                  onClick={() => setCategoriaFiltro('acessorio')}
                  className={cn(
                    "px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer",
                    categoriaFiltro === 'acessorio' ? "bg-purple-500 text-white shadow-sm" : "bg-slate-950 text-slate-400 hover:text-white border border-slate-800"
                  )}
                >
                  🎧 Acessórios
                </button>
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Filtrar por modelo, marca, cor, IMEI ou ID..."
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:border-amber-500 outline-none"
                  />
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    type="button"
                    onClick={() => setShowScannerModal(true)}
                    className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[11px] font-bold rounded-xl h-8 px-2.5 flex items-center gap-1.5 shadow-sm cursor-pointer shrink-0"
                    title="Bipar código de barras ou IMEI com a câmera ou leitor USB"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Bipar</span>
                  </Button>
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
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[340px] border border-slate-800/80 rounded-2xl p-2 bg-slate-950/60">
                {aparelhosFiltrados.length === 0 ? (
                  <p className="p-8 text-center text-slate-500 text-xs">Nenhum produto disponível encontrado.</p>
                ) : (
                  aparelhosFiltrados.map((item) => {
                    const isChecked = selecionados.includes(item.id);
                    const precoItem = getPrecoItem(item);
                    const isPerfume = item.categoria === 'perfume';
                    const isAcessorio = item.categoria === 'acessorio';

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
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <button
                            type="button"
                            className={cn("w-4 h-4 rounded flex items-center justify-center transition-colors shrink-0", isChecked ? "text-amber-400" : "text-slate-500")}
                          >
                            {isChecked ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                          </button>

                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-white flex items-center gap-1.5 flex-wrap">
                              <span>{isPerfume ? '🧴' : isAcessorio ? '🎧' : '📱'}</span>
                              <span className="truncate">{item.marca} {item.modelo}</span>
                              {item.capacidade && <span className="text-slate-400 text-[10px]">({item.capacidade})</span>}
                              {item.cor && <span className="text-slate-400 text-[10px]">· {item.cor}</span>}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              ID: {getAparelhoCodigo(item)} {item.imei ? `· IMEI: ${item.imei}` : ''} · Custo: R$ {(item.custo || 0).toFixed(0)}
                            </div>
                          </div>
                        </div>

                        {/* INPUT PARA EDITAR O VALOR DE VENDA DESTE ITEM */}
                        <div 
                          className="flex items-center gap-1.5 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="text-[10px] font-bold text-amber-400">R$</span>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={precosCustomizados[item.id] !== undefined ? precosCustomizados[item.id] : precoItem}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              setPrecosCustomizados((prev) => ({ ...prev, [item.id]: val }));
                              if (!selecionados.includes(item.id)) {
                                setSelecionados((prev) => [...prev, item.id]);
                              }
                            }}
                            placeholder="0"
                            className="w-24 bg-slate-950 border border-amber-500/40 focus:border-amber-400 rounded-lg px-2 py-1 text-xs font-bold font-mono text-amber-300 text-right outline-none ring-0 shadow-inner"
                            title="Digite ou altere o valor deste item para a venda"
                          />
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
                  <span className="text-[10px] text-amber-400 font-medium">💡 Busca inteligente salva no banco</span>
                </div>

                <CompradorAutocomplete
                  value={comprador}
                  onChange={handleCompradorChange}
                  compradores={compradores}
                  onBuscar={(termo) => buscarCompradores(termo, 'lojista')}
                  tipo="lojista"
                  placeholder="Buscar lojista ou digitar novo (ex: Junior, Tech Cell...)"
                  required
                />
                <div className="pt-1">
                  <label className="text-[11px] font-semibold text-slate-400 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                      WhatsApp do Lojista (Notificação Automática)
                    </span>
                    <span className="text-[10px] text-slate-500">Opcional</span>
                  </label>
                  <input
                    type="text"
                    value={compradorTelefone}
                    onChange={(e) => setCompradorTelefone(e.target.value)}
                    placeholder="Ex: 31999999999 ou (31) 99999-9999"
                    className="w-full mt-1 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
              </div>

              {/* LISTA DOS ITENS SELECIONADOS NO PEDIDO */}
              {itensSelecionados.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-400">
                    <span>Itens no Pedido ({itensSelecionados.length})</span>
                    <span className="text-[10px] text-amber-400 font-normal">Valores unitários editáveis</span>
                  </div>
                  <div className="max-h-32 overflow-y-auto space-y-1 pr-1 border border-slate-800 rounded-xl p-1.5 bg-slate-900/50">
                    {itensSelecionados.map((item) => {
                      const preco = getPrecoItem(item);
                      return (
                        <div key={item.id} className="flex items-center justify-between gap-1.5 p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-[11px]">
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-white truncate">{item.marca} {item.modelo} {item.capacidade || ''}</p>
                            <p className="text-[9px] text-slate-400 font-mono">ID: {getAparelhoCodigo(item)} · Custo: R$ {(item.custo || 0).toFixed(0)}</p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-[10px] font-bold text-amber-400">R$</span>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={precosCustomizados[item.id] !== undefined ? precosCustomizados[item.id] : preco}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                setPrecosCustomizados((prev) => ({ ...prev, [item.id]: val }));
                              }}
                              className="w-20 bg-slate-900 border border-amber-500/40 rounded px-1.5 py-0.5 text-[11px] font-mono font-bold text-amber-300 text-right outline-none focus:border-amber-400"
                            />
                            <button
                              type="button"
                              onClick={() => toggleSelecionado(item.id)}
                              className="text-slate-500 hover:text-rose-400 p-0.5 rounded cursor-pointer"
                              title="Remover do lote"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

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
                  <label className="text-[11px] font-bold text-slate-400">Data da Venda</label>
                  <input
                    type="date"
                    value={dataVenda}
                    onChange={(e) => setDataVenda(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* CAMPOS ADICIONAIS QUANDO FOR FIADO / A PRAZO */}
              {metodoPgto === 'fiado' && (
                <div className="p-3 bg-rose-950/30 border border-rose-500/30 rounded-xl space-y-2.5 animate-in fade-in duration-150">
                  <div className="flex items-center gap-1.5 text-rose-400 font-bold text-xs">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Configuração de Fiado / A Prazo
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-300">Entrada Paga Agora (R$)</label>
                      <input
                        type="text"
                        placeholder="Ex: 500,00"
                        value={valorEntrada}
                        onChange={(e) => setValorEntrada(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-rose-500 font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-300">Vencimento (Opcional)</label>
                      <input
                        type="date"
                        value={dataVencimento}
                        onChange={(e) => setDataVencimento(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-rose-500"
                      />
                    </div>
                  </div>

                  <div className="text-[11px] text-rose-300 flex items-center justify-between pt-1 border-t border-rose-500/20">
                    <span>Ficará devendo:</span>
                    <strong className="font-mono text-xs">
                      R$ {Math.max(0, totais.valorTotal - (parseFloat(valorEntrada.replace(/[^\d,.]/g, '').replace(',', '.')) || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </strong>
                  </div>
                </div>
              )}

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
              <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400 pb-1.5 border-b border-white/5">
                  <span>Itens Selecionados:</span>
                  <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 font-mono text-xs font-bold">
                    {itensSelecionados.length} item(ns)
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

          {/* BOTÕES DE AÇÃO INFERIORES (STICKY FOOTER COM FUNDO SÓLIDO PARA NUNCA SOBREPOR) */}
          <div className="sticky bottom-0 bg-slate-900/98 backdrop-blur-md pt-3.5 pb-1 border-t border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 -mx-4 -mb-4 px-4 sm:-mx-6 sm:-mb-6 sm:px-6 rounded-b-3xl z-20 shadow-2xl">
            <span className="text-xs text-slate-400 font-medium text-center sm:text-left">
              {itensSelecionados.length === 0 ? 'Nenhum aparelho selecionado' : `${itensSelecionados.length} aparelho(s) prontos para baixa`}
            </span>

            <div className="flex items-center justify-end gap-2.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                Cancelar
              </Button>

              <Button
                type="submit"
                disabled={salvando || itensSelecionados.length === 0}
                className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-bold text-xs sm:text-sm gap-2 px-6 py-2.5 rounded-xl shadow-lg shadow-amber-950/40 cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                Finalizar Venda de {itensSelecionados.length} Aparelho(s)
              </Button>
            </div>
          </div>

        </form>

      </div>

      {/* MODAL SCANNER DE CÓDIGO DE BARRAS / CÂMERA / USB */}
      <BarcodeScannerModal
        isOpen={showScannerModal}
        onClose={() => setShowScannerModal(false)}
        onScan={handleBarcodeScanned}
        keepOpenOnScan={true}
        title="Bipar Produtos do Atacado"
        subtitle="Aponte a câmera ou use o leitor de código de barras USB"
      />
    </div>
  );
}
