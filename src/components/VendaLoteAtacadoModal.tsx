import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  X, 
  Boxes, 
  ShoppingBag, 
  Search, 
  Plus,
  Minus,
  Trash2,
  Camera, 
  CheckCircle2, 
  AlertCircle, 
  User, 
  Calendar, 
  DollarSign, 
  TrendingUp, 
  MessageCircle,
  Package,
  Layers
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
import { registrarVendaAtomica } from '@/lib/vendas/vendaAtomica';

interface VendaLoteAtacadoModalProps {
  isOpen: boolean;
  onClose: () => void;
  aparelhosEstoque: Aparelho[];
  lojaId: string | null;
  onSuccess: () => Promise<void>;
  abrirScannerInicial?: boolean;
}

export interface ItemLoteAtacado {
  aparelhoId: string;
  aparelho: Aparelho;
  quantidade: number;
  maxEstoque: number;
  precoUnitario: number;
  custoUnitario: number;
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
  const [itensPedido, setItensPedido] = useState<ItemLoteAtacado[]>([]);
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

  const keyBufferRef = useRef<string>('');
  const keyTimeoutRef = useRef<any>(null);

  // Reseta ao abrir/fechar
  useEffect(() => {
    if (isOpen) {
      setItensPedido([]);
      setBusca('');
      setCategoriaFiltro('todos');
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

  // Obter estoque máximo real de um produto
  const getMaxEstoque = (aparelho: Aparelho): number => {
    if (typeof aparelho.quantidade === 'number' && aparelho.quantidade > 0) {
      return aparelho.quantidade;
    }
    return 1;
  };

  // Preço padrão de atacado
  const getPrecoPadrao = (aparelho: Aparelho): number => {
    const valAtacado = (aparelho as any).precoAtacado ?? (aparelho as any).preco_atacado ?? aparelho.preco ?? 0;
    return Number(valAtacado) || 0;
  };

  // Adicionar produto ao pedido
  const handleAdicionarProduto = (aparelho: Aparelho, qtdAdicionar = 1) => {
    const maxEstoque = getMaxEstoque(aparelho);

    setItensPedido((prev) => {
      const index = prev.findIndex((item) => item.aparelhoId === aparelho.id);

      if (index >= 0) {
        // Já existe no pedido -> incrementa quantidade
        const itemAtual = prev[index];
        const novaQtd = itemAtual.quantidade + qtdAdicionar;

        if (novaQtd > itemAtual.maxEstoque) {
          toast.warning(`Limite de estoque atingido para ${aparelho.modelo} (Máx: ${itemAtual.maxEstoque} un).`);
          return prev;
        }

        const atualizados = [...prev];
        atualizados[index] = {
          ...itemAtual,
          quantidade: novaQtd,
        };
        toast.success(`+1 ${aparelho.modelo} adicionado (${novaQtd} no pedido)`);
        return atualizados;
      } else {
        // Não existe -> adiciona novo item
        const precoUnitario = getPrecoPadrao(aparelho);
        const custoUnitario = Number(aparelho.custo) || 0;
        const qtdInicial = Math.min(qtdAdicionar, maxEstoque);

        toast.success(`📦 ${aparelho.modelo} adicionado ao pedido!`);
        return [
          ...prev,
          {
            aparelhoId: aparelho.id,
            aparelho,
            quantidade: qtdInicial,
            maxEstoque,
            precoUnitario,
            custoUnitario,
          },
        ];
      }
    });
  };

  // Alterar quantidade de um item no pedido
  const handleAlterarQuantidade = (aparelhoId: string, novaQtd: number) => {
    setItensPedido((prev) => {
      if (novaQtd <= 0) {
        return prev.filter((it) => it.aparelhoId !== aparelhoId);
      }

      return prev.map((it) => {
        if (it.aparelhoId === aparelhoId) {
          if (novaQtd > it.maxEstoque) {
            toast.warning(`Estoque máximo disponível: ${it.maxEstoque} un.`);
            return { ...it, quantidade: it.maxEstoque };
          }
          return { ...it, quantidade: novaQtd };
        }
        return it;
      });
    });
  };

  // Alterar preço unitário de um item no pedido
  const handleAlterarPrecoUnitario = (aparelhoId: string, novoPreco: number) => {
    setItensPedido((prev) =>
      prev.map((it) => (it.aparelhoId === aparelhoId ? { ...it, precoUnitario: Math.max(0, novoPreco) } : it))
    );
  };

  // Remover item do pedido
  const handleRemoverItem = (aparelhoId: string) => {
    setItensPedido((prev) => prev.filter((it) => it.aparelhoId !== aparelhoId));
  };

  // Limpar todo o pedido
  const handleLimparPedido = () => {
    setItensPedido([]);
  };

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
      handleAdicionarProduto(found, 1);
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

  // Totais financeiros do pedido
  const totais = useMemo(() => {
    let valorTotal = 0;
    let custoTotal = 0;
    let totalUnidades = 0;

    itensPedido.forEach((it) => {
      const qtd = it.quantidade;
      valorTotal += qtd * it.precoUnitario;
      custoTotal += qtd * it.custoUnitario;
      totalUnidades += qtd;
    });

    const lucroTotal = valorTotal - custoTotal;
    const margemMedia = custoTotal > 0 ? ((lucroTotal / custoTotal) * 100).toFixed(1) : '100';

    return {
      valorTotal,
      custoTotal,
      lucroTotal,
      margemMedia,
      totalUnidades,
      totalProdutos: itensPedido.length,
    };
  }, [itensPedido]);

  // Mapa de quantidades no pedido por aparelhoId para badges rápidos
  const mapaQtdNoPedido = useMemo(() => {
    const map = new Map<string, number>();
    itensPedido.forEach((it) => {
      map.set(it.aparelhoId, it.quantidade);
    });
    return map;
  }, [itensPedido]);

  if (!isOpen) return null;

  // Finalizar a venda do lote inteiro
  const handleFinalizarVendaLote = async (e: React.FormEvent) => {
    e.preventDefault();

    if (itensPedido.length === 0) {
      toast.error('Adicione pelo menos 1 produto ao pedido.');
      return;
    }

    if (!comprador.trim()) {
      toast.error('Informe o nome do lojista / comprador (ex: "Junior").');
      return;
    }

    setSalvando(true);
    const toastId = toast.loading(`Registrando venda de ${totais.totalUnidades} unidade(s) para ${comprador.trim()}...`);

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
          registradoPor: usuario?.nome || 'Sistema'
        }
      ] : [];

      const itensPayload = itensPedido.map((it) => {
        const subtotal = Number((it.quantidade * it.precoUnitario).toFixed(2));
        const item = it.aparelho;
        return {
          id: `${Date.now()}_${it.aparelhoId}`,
          aparelhoId: it.aparelhoId,
          condicaoOriginal: item.condicao,
          descricao: `${item.marca} ${item.modelo} ${item.capacidade || ''} ${item.cor || ''}`.trim(),
          quantidade: it.quantidade,
          valorInterno: it.custoUnitario,
          valorExibir: it.precoUnitario,
          desconto: 0,
          tipoDesconto: 'R$',
          total: subtotal,
          observacao: observacoes || 'Venda em Lote Atacado',
        };
      });

      const payloadVenda: any = {
        clienteNome: compradorFinal,
        vendedor: usuario?.nome || 'Sistema',
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
        descricao: `Venda ATACADO (${totais.totalUnidades} un em ${itensPedido.length} itens) para ${compradorFinal}`,
        garantia: observacoes || 'Garantia de Atacado (Teste)',
        descontoTotal: 0,
        taxa_cartao: 0,
        itens: itensPayload,
        pagamentos: [
          {
            id: Date.now().toString(),
            metodo: metodoPgto,
            valor: valorPagoFinal,
            parcelas: 1,
          },
        ],
        loja_id: lojaId || usuario?.lojaId || null,
      };

      // Separar quais itens dão baixa total via registrarVendaAtomica
      // e quais apenas decrementam quantidade no estoque de acessórios/perfumes
      const idsBaixaTotal: string[] = [];
      const itensParaDecrementar: { id: string; novaQtd: number; qtdVendida: number }[] = [];
      const camposAparelho: Record<string, { cliente: string; observacoes: string }> = {};

      for (const it of itensPedido) {
        const item = it.aparelho;
        const precoItem = it.precoUnitario;
        const custoItem = it.custoUnitario;
        const lucroItem = (precoItem - custoItem) * it.quantidade;

        const obsBaixa = [
          `BAIXA_ESTOQUE:${dataIso}:Venda ATACADO (${it.quantidade} un) para ${compradorFinal} por R$ ${precoItem.toFixed(2)}/un | Custo: R$ ${custoItem.toFixed(2)} | Lucro: R$ ${lucroItem.toFixed(2)} | Pgto: ${metodoPgto}`,
          observacoes ? `Obs: ${observacoes.trim()}` : '',
          `ID: ${getAparelhoCodigo(item)}`,
          item.imei ? `IMEI: ${item.imei}` : ''
        ].filter(Boolean).join(' | ');

        if (it.quantidade >= it.maxEstoque) {
          // Todo o estoque desta linha foi vendido -> Baixa total!
          idsBaixaTotal.push(it.aparelhoId);
          camposAparelho[it.aparelhoId] = {
            cliente: compradorFinal,
            observacoes: obsBaixa,
          };
        } else {
          // Apenas parte do estoque foi vendida (ex: 20 de 5000 películas) -> Decrementa
          const novaQtd = it.maxEstoque - it.quantidade;
          itensParaDecrementar.push({
            id: it.aparelhoId,
            novaQtd,
            qtdVendida: it.quantidade,
          });
        }
      }

      // 1. Grava a venda atomicamente com os itens que dão baixa total
      await registrarVendaAtomica(supabase, {
        venda: { ...payloadVenda, loja_id: lojaId || usuario?.lojaId || null },
        aparelhoIds: idsBaixaTotal,
        camposAparelho,
        origem: 'atacado',
        usuarioId: usuario?.id || null,
        usuarioNome: usuario?.nome || null,
        observacao: `Venda ATACADO (${totais.totalUnidades} un) para ${compradorFinal}`,
      });

      // 2. Para itens com baixa parcial de quantidade, decrementa o estoque e audita
      if (itensParaDecrementar.length > 0) {
        for (const dec of itensParaDecrementar) {
          // estoque-guard: sem-ciclo
          await supabase
            .from('aparelhos')
            .update({ quantidade: dec.novaQtd })
            .eq('id', dec.id);

          await supabase
            .from('movimentacoes_estoque')
            .insert({
              loja_id: lojaId || usuario?.lojaId || null,
              aparelho_id: dec.id,
              tipo: 'saida',
              origem: 'atacado',
              usuario_id: usuario?.id || null,
              usuario_nome: usuario?.nome || null,
              observacao: `Saída de ${dec.qtdVendida} un por venda atacado para ${compradorFinal}`,
            });
        }
      }

      // 3. Salva/atualiza dados do lojista
      await upsertComprador(compradorFinal, 'lojista', compradorTelefone || undefined);

      logVenda({
        clienteNome: compradorFinal,
        valorTotal: totais.valorTotal,
        tipoVenda: 'atacado',
        formaPagamento: metodoPgto,
        itensCount: totais.totalUnidades,
      }, usuario, lojaId);

      toast.success(`🎉 Venda de ${totais.totalUnidades} unidade(s) finalizada com sucesso para ${compradorFinal}!`, { id: toastId, duration: 5000 });

      // 4. Notifica o lojista automaticamente no WhatsApp com itens e saldo devedor
      try {
        fetch('/api/atacado/notificar-venda', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lojaId: lojaId || null,
            compradorNome: compradorFinal,
            compradorTelefone: compradorTelefone || undefined,
            itens: itensPedido.map((it) => ({
              modelo: it.aparelho.modelo,
              capacidade: it.aparelho.capacidade,
              cor: it.aparelho.cor,
              imei: it.aparelho.imei,
              codigo: getAparelhoCodigo(it.aparelho),
              quantidade: it.quantidade,
              valor: it.precoUnitario,
              total: Number((it.quantidade * it.precoUnitario).toFixed(2)),
            })),
            valorTotal: totais.valorTotal,
            formaPagamento: metodoPgto,
            dataVencimento: dataVencimento ? new Date(dataVencimento + 'T12:00:00').toISOString() : undefined,
          }),
        })
          .then(async (r) => {
            const j = await r.json();
            if (j.enviado) {
              toast.success(`📲 Comprovante enviado no WhatsApp de ${compradorFinal}!`, { duration: 6000 });
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
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-6xl w-full p-4 sm:p-5 shadow-2xl space-y-3.5 text-white max-h-[95dvh] overflow-hidden flex flex-col my-auto relative">
        
        {/* CABEÇALHO MODAL */}
        <div className="flex items-center justify-between pb-2.5 border-b border-slate-800/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold border border-amber-500/30">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-white">Venda de Atacado / Lojista</h3>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 font-semibold">
                  Rápido & Objetivo
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Selecione produtos, defina as quantidades exatas e finalize com 1 clique
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={() => setShowScannerModal(true)}
              className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold rounded-xl h-8 px-3 flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5 text-amber-400" />
              <span>Bipar Câmera/USB</span>
            </Button>
            <button 
              onClick={onClose} 
              className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
              title="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleFinalizarVendaLote} className="space-y-3 flex flex-col flex-1 overflow-hidden min-h-0">
          
          {/* BARRA SUPERIOR COMPACTA: DADOS PRINCIPAIS DA VENDA */}
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-3 shrink-0 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5">
              
              {/* Lojista / Comprador (5 cols) */}
              <div className="lg:col-span-4 space-y-1">
                <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-amber-400" />
                  Lojista / Comprador *
                </label>
                <CompradorAutocomplete
                  value={comprador}
                  onChange={handleCompradorChange}
                  compradores={compradores}
                  onBuscar={(termo) => buscarCompradores(termo, 'lojista')}
                  tipo="lojista"
                  placeholder="Buscar ou digitar lojista..."
                  required
                />
              </div>

              {/* WhatsApp do Lojista (3 cols) */}
              <div className="lg:col-span-3 space-y-1">
                <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                  WhatsApp
                  <span className="text-[10px] text-slate-500 font-normal">(Comprovante)</span>
                </label>
                <input
                  type="text"
                  value={compradorTelefone}
                  onChange={(e) => setCompradorTelefone(e.target.value)}
                  placeholder="Ex: 31999999999"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              {/* Forma de Pagamento (3 cols) */}
              <div className="lg:col-span-3 space-y-1">
                <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                  Pagamento
                </label>
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

              {/* Data da Venda (2 cols) */}
              <div className="lg:col-span-2 space-y-1">
                <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-amber-400" />
                  Data
                </label>
                <input
                  type="date"
                  value={dataVenda}
                  onChange={(e) => setDataVenda(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2 py-1.5 text-xs text-white outline-none focus:border-amber-500"
                />
              </div>

            </div>

            {/* SE FIADO: FAIXA DE CONFIGURAÇÃO DE PRAZO */}
            {metodoPgto === 'fiado' && (
              <div className="pt-2 border-t border-rose-500/20 grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-center">
                <div className="space-y-0.5">
                  <label className="text-[10px] text-rose-300 font-semibold">Entrada Paga Agora (R$)</label>
                  <input
                    type="text"
                    placeholder="Ex: 500,00"
                    value={valorEntrada}
                    onChange={(e) => setValorEntrada(e.target.value)}
                    className="w-full bg-slate-900 border border-rose-500/40 rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-rose-400 font-mono"
                  />
                </div>
                <div className="space-y-0.5">
                  <label className="text-[10px] text-rose-300 font-semibold">Vencimento (Opcional)</label>
                  <input
                    type="date"
                    value={dataVencimento}
                    onChange={(e) => setDataVencimento(e.target.value)}
                    className="w-full bg-slate-900 border border-rose-500/40 rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-rose-400"
                  />
                </div>
                <div className="text-xs text-rose-300 font-medium sm:text-right pt-2 sm:pt-0">
                  Saldo devedor restante: <strong className="font-mono text-sm text-rose-400">R$ {Math.max(0, totais.valorTotal - (parseFloat(valorEntrada.replace(/[^\d,.]/g, '').replace(',', '.')) || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                </div>
              </div>
            )}
          </div>

          {/* PAINEL CENTRAL (GRID 2 COLUNAS: ESQUERDA CATÁLOGO / DIREITA CARRINHO) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 flex-1 min-h-0 overflow-hidden">
            
            {/* COLUNA ESQUERDA: CATÁLOGO DO ESTOQUE (6 cols) */}
            <div className="lg:col-span-6 flex flex-col space-y-2 min-h-0 border border-slate-800 rounded-2xl p-2.5 bg-slate-950/40">
              
              {/* FILTROS DE CATEGORIA */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar shrink-0">
                <button
                  type="button"
                  onClick={() => setCategoriaFiltro('todos')}
                  className={cn(
                    "px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0",
                    categoriaFiltro === 'todos' ? "bg-amber-500 text-slate-950 shadow-sm" : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
                  )}
                >
                  ✨ Todos ({aparelhosEstoque.length})
                </button>
                <button
                  type="button"
                  onClick={() => setCategoriaFiltro('aparelho')}
                  className={cn(
                    "px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0",
                    categoriaFiltro === 'aparelho' ? "bg-blue-500 text-white shadow-sm" : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
                  )}
                >
                  📱 Celulares
                </button>
                <button
                  type="button"
                  onClick={() => setCategoriaFiltro('perfume')}
                  className={cn(
                    "px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0",
                    categoriaFiltro === 'perfume' ? "bg-rose-500 text-white shadow-sm" : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
                  )}
                >
                  🧴 Perfumes
                </button>
                <button
                  type="button"
                  onClick={() => setCategoriaFiltro('acessorio')}
                  className={cn(
                    "px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0",
                    categoriaFiltro === 'acessorio' ? "bg-purple-500 text-white shadow-sm" : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
                  )}
                >
                  🎧 Acessórios
                </button>
              </div>

              {/* BUSCA RÁPIDA */}
              <div className="relative shrink-0">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Pesquisar produto, modelo, cor, IMEI ou ID..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:border-amber-500 outline-none"
                />
              </div>

              {/* LISTA DE PRODUTOS DISPONÍVEIS */}
              <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 min-h-0">
                {aparelhosFiltrados.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-xs">
                    Nenhum produto encontrado no estoque.
                  </div>
                ) : (
                  aparelhosFiltrados.map((item) => {
                    const precoSug = getPrecoPadrao(item);
                    const isPerfume = item.categoria === 'perfume';
                    const isAcessorio = item.categoria === 'acessorio';
                    const maxEstoque = getMaxEstoque(item);
                    const qtdNoPedido = mapaQtdNoPedido.get(item.id) || 0;
                    const esgotadoNoPedido = qtdNoPedido >= maxEstoque;

                    return (
                      <div
                        key={item.id}
                        onClick={() => {
                          if (!esgotadoNoPedido) {
                            handleAdicionarProduto(item, 1);
                          }
                        }}
                        className={cn(
                          "p-2 rounded-xl border flex items-center justify-between gap-2.5 text-xs transition-all cursor-pointer select-none",
                          qtdNoPedido > 0
                            ? "bg-amber-500/10 border-amber-500/40 text-white"
                            : "bg-slate-900/90 border-slate-800/80 text-slate-300 hover:border-slate-700 hover:bg-slate-900"
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="text-base shrink-0">
                            {isPerfume ? '🧴' : isAcessorio ? '🎧' : '📱'}
                          </span>

                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-white truncate flex items-center gap-1.5">
                              <span>{item.marca} {item.modelo}</span>
                              {item.capacidade && <span className="text-slate-400 text-[10px]">({item.capacidade})</span>}
                              {item.cor && <span className="text-slate-400 text-[10px]">· {item.cor}</span>}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono truncate flex items-center gap-2">
                              <span>ID: {getAparelhoCodigo(item)}</span>
                              {item.imei && <span>· IMEI: {item.imei.slice(-6)}</span>}
                              <span className={cn(
                                "font-sans font-medium px-1.5 py-0.2 rounded",
                                maxEstoque > 1 ? "bg-purple-950/60 text-purple-300 border border-purple-500/30" : "bg-slate-800 text-slate-400"
                              )}>
                                Estoque: {maxEstoque} un
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* PREÇO SUGERIDO E BOTÃO ADICIONAR */}
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            <span className="text-[10px] text-slate-400 block leading-tight">Atacado</span>
                            <span className="font-mono font-bold text-amber-300 text-xs">
                              R$ {precoSug.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                          </div>

                          <Button
                            type="button"
                            size="sm"
                            disabled={esgotadoNoPedido}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAdicionarProduto(item, 1);
                            }}
                            className={cn(
                              "h-7 px-2.5 rounded-lg text-[11px] font-bold cursor-pointer transition-all",
                              qtdNoPedido > 0
                                ? "bg-amber-500 text-slate-950 hover:bg-amber-400"
                                : "bg-slate-800 hover:bg-slate-700 text-white border border-slate-700"
                            )}
                          >
                            {qtdNoPedido > 0 ? (
                              esgotadoNoPedido ? (
                                <span>Máx ({qtdNoPedido})</span>
                              ) : (
                                <span>+{qtdNoPedido}</span>
                              )
                            ) : (
                              <span>+ Add</span>
                            )}
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* COLUNA DIREITA: ITENS DO PEDIDO / CARRINHO DE ATACADO (6 cols) */}
            <div className="lg:col-span-6 flex flex-col space-y-2 min-h-0 border border-slate-800 rounded-2xl p-2.5 bg-slate-950/60">
              
              {/* CABEÇALHO DO CARRINHO */}
              <div className="flex items-center justify-between pb-1 border-b border-slate-800 shrink-0">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-amber-400" />
                  <span className="font-bold text-xs text-white">Itens no Pedido</span>
                  <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-[10px] font-mono">
                    {totais.totalUnidades} un · {totais.totalProdutos} itens
                  </Badge>
                </div>

                {itensPedido.length > 0 && (
                  <button
                    type="button"
                    onClick={handleLimparPedido}
                    className="text-[11px] text-slate-400 hover:text-rose-400 flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    Limpar
                  </button>
                )}
              </div>

              {/* LISTA DOS ITENS ADICIONADOS */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
                {itensPedido.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
                    <Package className="w-10 h-10 text-slate-600 mb-2 opacity-60" />
                    <p className="text-xs font-semibold text-slate-400">Nenhum produto adicionado ainda</p>
                    <p className="text-[11px] text-slate-500 max-w-xs mt-1">
                      Clique nos produtos à esquerda ou use o leitor de código de barras para adicionar ao pedido.
                    </p>
                  </div>
                ) : (
                  itensPedido.map((it) => {
                    const subtotal = it.quantidade * it.precoUnitario;
                    const item = it.aparelho;

                    return (
                      <div
                        key={it.aparelhoId}
                        className="bg-slate-900 border border-slate-800/90 rounded-xl p-2 space-y-1.5 text-xs shadow-sm"
                      >
                        {/* LINHA 1: NOME DO PRODUTO E REMOVER */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <span className="font-bold text-white text-xs truncate block">
                              {item.marca} {item.modelo} {item.capacidade || ''} {item.cor ? `· ${item.cor}` : ''}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              ID: {getAparelhoCodigo(item)} {item.imei ? `· IMEI: ${item.imei}` : ''}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoverItem(it.aparelhoId)}
                            className="p-1 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition-colors cursor-pointer"
                            title="Remover produto do pedido"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* LINHA 2: CONTROLE DE QUANTIDADE, PREÇO UNITÁRIO E SUBTOTAL */}
                        <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/60 bg-slate-950/40 -mx-2 -mb-1 px-2 py-1.5 rounded-b-xl">
                          
                          {/* PREÇO UNITÁRIO EDITÁVEL */}
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-[10px] text-slate-400">Unit: R$</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={it.precoUnitario}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                handleAlterarPrecoUnitario(it.aparelhoId, val);
                              }}
                              className="w-18 bg-slate-900 border border-slate-700 focus:border-amber-400 rounded px-1.5 py-0.5 text-xs font-mono font-bold text-amber-300 text-right outline-none"
                              title="Preço Unitário de Atacado"
                            />
                          </div>

                          {/* CONTROLE DE QUANTIDADE COM [-] [INPUT] [+] */}
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleAlterarQuantidade(it.aparelhoId, it.quantidade - 1)}
                              className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center font-bold text-xs transition-colors cursor-pointer"
                              title="Diminuir quantidade"
                            >
                              <Minus className="w-3 h-3" />
                            </button>

                            <input
                              type="number"
                              min="1"
                              max={it.maxEstoque}
                              value={it.quantidade}
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 1;
                                handleAlterarQuantidade(it.aparelhoId, val);
                              }}
                              className="w-12 bg-slate-900 border border-amber-500/50 focus:border-amber-400 rounded px-1 py-0.5 text-xs font-mono font-bold text-white text-center outline-none"
                              title={`Quantidade no pedido (Máx: ${it.maxEstoque})`}
                            />

                            <button
                              type="button"
                              onClick={() => handleAlterarQuantidade(it.aparelhoId, it.quantidade + 1)}
                              disabled={it.quantidade >= it.maxEstoque}
                              className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center font-bold text-xs transition-colors cursor-pointer disabled:opacity-40"
                              title="Aumentar quantidade"
                            >
                              <Plus className="w-3 h-3" />
                            </button>

                            <span className="text-[10px] text-slate-500 font-mono">
                              /{it.maxEstoque}
                            </span>
                          </div>

                          {/* SUBTOTAL DA LINHA */}
                          <div className="text-right shrink-0">
                            <span className="text-[9px] text-slate-400 block leading-tight">Subtotal</span>
                            <span className="font-mono font-bold text-emerald-400 text-xs">
                              R$ {subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                          </div>

                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* CAMPO DE OBSERVAÇÕES / GARANTIA */}
              <div className="pt-1 shrink-0">
                <input
                  type="text"
                  placeholder="Observação da venda / Garantia de teste (opcional)..."
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>

            </div>

          </div>

          {/* RODAPÉ FIXO OBJETIVO E DE ALTA VELOCIDADE */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3 shrink-0 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-lg">
            
            {/* RESUMO DE VALORES E VOLUMES */}
            <div className="flex items-center gap-4 flex-wrap">
              <div>
                <span className="text-[10px] text-slate-400 block leading-tight">Total de Volumes</span>
                <span className="text-xs font-bold text-white font-mono">
                  {totais.totalUnidades} un <span className="text-slate-400 text-[10px]">({totais.totalProdutos} produtos)</span>
                </span>
              </div>

              <div className="hidden sm:block h-6 w-px bg-slate-800" />

              <div>
                <span className="text-[10px] text-slate-400 block leading-tight">Custo Estimado</span>
                <span className="text-xs font-mono text-slate-300">
                  R$ {totais.custoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="hidden sm:block h-6 w-px bg-slate-800" />

              <div>
                <span className="text-[10px] text-cyan-300 block leading-tight">Lucro Líquido</span>
                <span className="text-xs font-mono font-bold text-cyan-400">
                  R$ {totais.lucroTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ({totais.margemMedia}%)
                </span>
              </div>

              <div className="hidden sm:block h-6 w-px bg-slate-800" />

              <div>
                <span className="text-[10px] text-emerald-400 font-bold block leading-tight">VALOR TOTAL DA VENDA</span>
                <span className="text-base sm:text-lg font-mono font-extrabold text-emerald-400">
                  R$ {totais.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* BOTÕES DE AÇÃO */}
            <div className="flex items-center justify-end gap-2 shrink-0">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="text-xs text-slate-400 hover:text-white cursor-pointer h-9 px-3"
              >
                Cancelar
              </Button>

              <Button
                type="submit"
                disabled={salvando || itensPedido.length === 0}
                className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-extrabold text-xs sm:text-sm gap-2 px-5 py-2 rounded-xl shadow-lg shadow-amber-950/40 cursor-pointer disabled:opacity-50 h-10"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Finalizar Venda ({totais.totalUnidades} un · R$ {totais.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})</span>
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
