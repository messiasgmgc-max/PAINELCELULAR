'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { GlassCard } from '@/components/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { DollarSign, TrendingUp, TrendingDown, Calendar, Plus, Search, X, Printer, ShoppingCart, User, Truck, CreditCard, Trash2, Save, Ban, MessageCircle, FileText, Download, Upload } from 'lucide-react';
import { useClientes } from '@/hooks/useClientes';
import { useAparelhos } from '@/hooks/useAparelhos';
import { useTecnicos } from '@/hooks/useTecnicos';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/hooks/useAuth';
import { useStoreConfig } from '@/hooks/useStoreConfig';
import { Aparelho, Cliente, Venda, VendaItem } from '@/lib/db/types';
import { toast } from 'sonner';
import {
  exportDataset,
  findByAliases,
  parseCurrencyLike,
  parseImportFile,
  type ExportColumn,
  type ExportFormat,
} from '@/lib/importExport';

type VendasTabProps = {
  isSidebarCollapsed?: boolean;
  setSidebarCollapsed?: (collapsed: boolean) => void;
};

interface VendasPorPeriodo {
  periodo: string;
  total: number;
  custo: number;
  lucro: number;
  quantidade: number;
}

type PosPagamentoState = {
  metodo: Venda['metodo'];
  parcelas: number;
  detalhes: string;
  valorPago: number;
  status: Venda['status'];
  garantia: string;
  descontoGlobal: number;
  tipoDescontoGlobal: 'R$' | '%';
  pagamentos: PosPagamentoItem[];
};

type PosPagamentoItem = {
  id: string;
  metodo: Venda['metodo'];
  valor: number;
  parcelas: number;
};

const createPagamentoItem = (overrides: Partial<PosPagamentoItem> = {}): PosPagamentoItem => ({
  id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  metodo: 'dinheiro',
  valor: 0,
  parcelas: 1,
  ...overrides,
});

const POS_MODAL_CLOSE_MS = 220;
const SALE_SUCCESS_MS = 1350;
const SALE_EMOJIS = ['🎉', '🥳', '💰', '✨', '🚀', '🔥'];

const createInitialPosPagamento = (): PosPagamentoState => ({
  metodo: 'dinheiro',
  parcelas: 1,
  detalhes: '',
  valorPago: 0,
  status: 'pago',
  garantia: '90 dias',
  descontoGlobal: 0,
  tipoDescontoGlobal: 'R$',
  pagamentos: [createPagamentoItem()],
});

export function VendasTab({ isSidebarCollapsed = false, setSidebarCollapsed }: VendasTabProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isVendasRoute = pathname === '/vendas';
  const { usuario } = useAuth();
  const { config } = useStoreConfig();
  const { clientes, fetchClientes, criarCliente } = useClientes();
  const { aparelhos, fetchAparelhos, criarAparelho, loading: loadingAparelhos, error: erroAparelhos } = useAparelhos();
  const { tecnicos, fetchTecnicos } = useTecnicos();

  const [vendas, setVendas] = useState<Venda[]>([]);
  const [vendasPorPeriodo, setVendasPorPeriodo] = useState<VendasPorPeriodo[]>([]);
  const [filtroBusca, setFiltroBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<string>('');
  const [filtroMetodo, setFiltroMetodo] = useState<string>('');
  const [filtroVendedor, setFiltroVendedor] = useState<string>('');
  const [filtroDataInicio, setFiltroDataInicio] = useState('');
  const [filtroDataFim, setFiltroDataFim] = useState('');
  const [ordenarPor, setOrdenarPor] = useState<'data' | 'cliente' | 'valor' | 'lucro' | 'status' | 'metodo'>('data');
  const [direcaoOrdenacao, setDirecaoOrdenacao] = useState<'asc' | 'desc'>('desc');
  const [showSalesDashboard, setShowSalesDashboard] = useState(true);
  const [loading, setLoading] = useState(true);
  const [showPOS, setShowPOS] = useState(false);
  const [closingPOS, setClosingPOS] = useState(false);
  const [savingVenda, setSavingVenda] = useState(false);
  const [showSaleCelebration, setShowSaleCelebration] = useState(false);
  const [showNovoCliente, setShowNovoCliente] = useState(false);
  const [showNovoAparelho, setShowNovoAparelho] = useState(false);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [isDesktopViewport, setIsDesktopViewport] = useState(false);
  const [posOverlayRect, setPosOverlayRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [confirmDeleteEmail, setConfirmDeleteEmail] = useState('');
  const [confirmDeletePassword, setConfirmDeletePassword] = useState('');
  const [deletingAllVendas, setDeletingAllVendas] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const closePOSTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sidebarBeforePOSRef = useRef<boolean | null>(null);

  // Estados do PDV
  const [posDados, setPosDados] = useState({
    tipoVenda: 'Venda',
    clienteId: '',
    clienteNome: '',
    vendedor: '',
    tipoEntrega: 'Retirada',
    dataVenda: new Date().toISOString().split('T')[0],
  });

  const [posItem, setPosItem] = useState<Partial<VendaItem>>({
    quantidade: 1,
    valorInterno: 0,
    valorExibir: 0,
    desconto: 0,
    tipoDesconto: 'R$',
    observacao: ''
  });

  const [carrinho, setCart] = useState<VendaItem[]>([]);
  const [posPagamento, setPosPagamento] = useState<PosPagamentoState>(() => createInitialPosPagamento());

  const formatCurrencyField = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value || 0));
  };

  const parseCurrencyField = (rawValue: string) => {
    const digits = rawValue.replace(/\D/g, '');
    if (!digits) return 0;
    return Number(digits) / 100;
  };

  // Estados legados para compatibilidade (se necessário) ou removidos
  /* const [formData, setFormData] = useState({
    aparelhoId: '',
    aparelhoDescricao: '',
    valor: 0,
    custo: 0,
    dataPagamento: new Date().toISOString().split('T')[0],
    status: 'pago' as const,
    metodo: 'dinheiro' as const,
    descricao: '',
    garantia: '90 dias',
  }); */

  // Estados para formulários rápidos
  const [novoClienteData, setNovoClienteData] = useState({ nome: '', email: '', telefone: '', cpf: '' });
  const [novoAparelhoData, setNovoAparelhoData] = useState({ marca: '', modelo: '', imei: '', preco: '', custo: '', condicao: 'seminovo' as const });

  const isTypingField = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
  };

  const resolveAparelhoCusto = (aparelho?: Aparelho | null) => {
    if (!aparelho) return 0;
    const raw = (aparelho as any).custo;
    if (typeof raw === 'number') return raw;
    if (typeof raw === 'string') {
      const parsed = parseFloat(raw.replace(',', '.'));
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  };

  const clearPosTimers = () => {
    if (closePOSTimerRef.current) {
      clearTimeout(closePOSTimerRef.current);
      closePOSTimerRef.current = null;
    }
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }
  };

  const openPOSModal = () => {
    clearPosTimers();
    setClosingPOS(false);
    setShowSaleCelebration(false);
    setShowPOS(true);
  };

  const closePOSModal = (options?: { reset?: boolean }) => {
    const shouldReset = options?.reset ?? true;
    if (!showPOS) return;

    clearPosTimers();
    setClosingPOS(true);

    closePOSTimerRef.current = setTimeout(() => {
      setClosingPOS(false);
      setShowPOS(false);
      setShowSaleCelebration(false);
      if (shouldReset) resetPOS();
    }, POS_MODAL_CLOSE_MS);
  };

  const playSaleSuccessSound = () => {
    if (typeof window === 'undefined') return;

    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const audioContext = new AudioContextClass();
    const now = audioContext.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];

    notes.forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.type = index % 2 === 0 ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(frequency, now + index * 0.06);
      gainNode.gain.setValueAtTime(0.0001, now + index * 0.06);
      gainNode.gain.exponentialRampToValueAtTime(0.09, now + index * 0.06 + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.06 + 0.24);
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.start(now + index * 0.06);
      oscillator.stop(now + index * 0.06 + 0.28);
    });

    setTimeout(() => {
      void audioContext.close().catch(() => undefined);
    }, 700);
  };

  const handleShortcutFinalize = () => {
    if (showPOS && !closingPOS) handleFinalizarVenda();
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!showPOS && !showNovoCliente && !showNovoAparelho) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        if (showPOS) closePOSModal();
        if (showNovoCliente) setShowNovoCliente(false);
        if (showNovoAparelho) setShowNovoAparelho(false);
        return;
      }

      if (showPOS && event.key === 'Enter' && !event.shiftKey && !isTypingField(event.target)) {
        event.preventDefault();
        handleShortcutFinalize();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showPOS, closingPOS]);

  useEffect(() => {
    if (!showPOS) return;

    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyTouchAction = document.body.style.touchAction;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.touchAction = previousBodyTouchAction;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [showPOS]);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(min-width: 768px)');
    const syncViewport = () => setIsDesktopViewport(mediaQuery.matches);

    syncViewport();
    mediaQuery.addEventListener('change', syncViewport);

    return () => mediaQuery.removeEventListener('change', syncViewport);
  }, []);

  useEffect(() => {
    if (!setSidebarCollapsed || typeof window === 'undefined') return;
    if (!window.matchMedia('(min-width: 768px)').matches) return;

    if (showPOS) {
      sidebarBeforePOSRef.current = isSidebarCollapsed;
      if (!isSidebarCollapsed) {
        setSidebarCollapsed(true);
      }
      return;
    }

    if (sidebarBeforePOSRef.current === false) {
      setSidebarCollapsed(false);
      sidebarBeforePOSRef.current = null;
    }
  }, [showPOS, isSidebarCollapsed, setSidebarCollapsed]);

  useEffect(() => () => clearPosTimers(), []);

  useEffect(() => {
    if (!isDesktopViewport || typeof window === 'undefined') {
      setPosOverlayRect(null);
      return;
    }

    if (!showPOS && !closingPOS) {
      setPosOverlayRect(null);
      return;
    }

    const syncOverlayRect = () => {
      const main = document.querySelector('main');
      if (!(main instanceof HTMLElement)) {
        setPosOverlayRect(null);
        return;
      }

      const rect = main.getBoundingClientRect();
      if (rect.width < 280 || rect.height < 280) {
        setPosOverlayRect(null);
        return;
      }

      setPosOverlayRect({
        top: Math.round(rect.top),
        left: Math.round(rect.left),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    };

    syncOverlayRect();

    const main = document.querySelector('main');
    const observer = main instanceof HTMLElement && typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(syncOverlayRect)
      : null;

    if (main instanceof HTMLElement && observer) {
      observer.observe(main);
    }

    window.addEventListener('resize', syncOverlayRect);

    return () => {
      window.removeEventListener('resize', syncOverlayRect);
      observer?.disconnect();
    };
  }, [isDesktopViewport, showPOS, closingPOS, isSidebarCollapsed]);

  const posOverlayManualStyle: React.CSSProperties | undefined =
    isDesktopViewport && posOverlayRect
      ? {
          top: `${posOverlayRect.top}px`,
          left: `${posOverlayRect.left}px`,
          width: `${posOverlayRect.width}px`,
          height: `${posOverlayRect.height}px`,
          right: 'auto',
          bottom: 'auto',
        }
      : undefined;

  useEffect(() => {
    if (usuario?.lojaId) {
      carregarVendas();
    }
    fetchClientes();
    fetchAparelhos();
    fetchTecnicos();
  }, [usuario?.lojaId]);

  useEffect(() => {
    if (!isClient || !isVendasRoute) return;

    const nextParams = new URLSearchParams(searchParams.toString());

    let panelParam: string | null = null;
    if (showDeleteAllModal) panelParam = 'delete-all';
    else if (showPOS || closingPOS) panelParam = 'pos';

    if (panelParam) nextParams.set('panel', panelParam);
    else nextParams.delete('panel');

    if (panelParam === 'pos') {
      if (showNovoCliente) nextParams.set('modal', 'novo-cliente');
      else if (showNovoAparelho) nextParams.set('modal', 'novo-aparelho');
      else nextParams.delete('modal');
    } else {
      nextParams.delete('modal');
    }

    if (!showSalesDashboard) nextParams.set('dashboard', '0');
    else nextParams.delete('dashboard');

    const currentQuery = searchParams.toString();
    const nextQuery = nextParams.toString();

    if (nextQuery === currentQuery) return;

    const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;
    window.history.replaceState(window.history.state, '', nextUrl);
  }, [
    isClient,
    isVendasRoute,
    pathname,
    searchParams,
    showPOS,
    closingPOS,
    showNovoCliente,
    showNovoAparelho,
    showDeleteAllModal,
    showSalesDashboard,
  ]);

  const carregarVendas = async () => {
    if (!usuario?.lojaId) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('vendas')
        .select('*')
        .eq('loja_id', usuario.lojaId)
        .order('dataPagamento', { ascending: false });
      
      if (error) throw error;
      const vendasData = data || [];
      setVendas(vendasData);
      calcularVendasPorPeriodo(vendasData);
    } catch (error) {
      console.error('Erro ao carregar vendas:', error);
    } finally {
      setLoading(false);
    }
  };

  const calcularVendasPorPeriodo = (vendas: Venda[]) => {
    const mapa: { [key: string]: VendasPorPeriodo } = {};

    vendas.forEach(venda => {
      if (venda.dataPagamento) {
        const data = new Date(venda.dataPagamento);
        const mes = data.toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' });

        if (!mapa[mes]) {
          mapa[mes] = {
            periodo: mes,
            total: 0,
            custo: 0,
            lucro: 0,
            quantidade: 0,
          };
        }

        mapa[mes].total += venda.valor;
        mapa[mes].custo += venda.custo;
        mapa[mes].lucro += venda.lucro;
        mapa[mes].quantidade += 1;
      }
    });

    setVendasPorPeriodo(Object.values(mapa).reverse());
  };

  const handleFinalizarVenda = async () => {
    try {
      if (savingVenda) return;
      if (carrinho.length === 0) {
        alert('Adicione pelo menos um item ao carrinho.');
        return;
      }
      if (!posDados.clienteId) {
        alert('Selecione um cliente.');
        return;
      }

      setSavingVenda(true);

      // Cálculos Finais
      const totalProdutos = carrinho.reduce((acc, item) => acc + item.total, 0);
      
      let descontoGlobalValor = 0;
      if (posPagamento.tipoDescontoGlobal === '%') {
        descontoGlobalValor = totalProdutos * (posPagamento.descontoGlobal / 100);
      } else {
        descontoGlobalValor = posPagamento.descontoGlobal;
      }

      const valorFinal = totalProdutos - descontoGlobalValor;
      const custoTotal = carrinho.reduce((acc, item) => acc + (item.valorInterno * item.quantidade), 0);
      const lucro = valorFinal - custoTotal;
      const percentualLucro = valorFinal > 0 ? (lucro / valorFinal) * 100 : 0;
      const metodoPrincipal = posPagamento.pagamentos[0]?.metodo || posPagamento.metodo;
      const statusFinal = pagamentosTotal >= valorFinal ? posPagamento.status : 'pendente';

      const vendaDados = {
        clienteId: posDados.clienteId || null, // <--- O SEGREDO PRA SALVAR E EDITAR É ESSE NULL AQUI
        clienteNome: posDados.clienteNome,
        vendedor: posDados.vendedor,
        tipoEntrega: posDados.tipoEntrega,
        itens: carrinho,
        valor: valorFinal,
        custo: custoTotal,
        lucro,
        percentualLucro,
        dataPagamento: posDados.dataVenda,
        status: statusFinal,
        metodo: metodoPrincipal,
        descricao: `Venda PDV - ${carrinho.length} itens`,
        garantia: posPagamento.garantia,
        descontoTotal: descontoGlobalValor,
        pagamentos: posPagamento.pagamentos.map((pagamento) => ({
          id: pagamento.id,
          metodo: pagamento.metodo,
          valor: Number(pagamento.valor) || 0,
          parcelas: Number(pagamento.parcelas) || 1,
        })),
        loja_id: usuario?.lojaId || null // <--- SEGURANÇA AQUI TAMBÉM
      };

      if (editingId) {
        const { error } = await supabase
          .from('vendas')
          .update(vendaDados)
          .eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('vendas').insert([vendaDados]);
        if (error) throw error;
      }

      const aparelhosIds = carrinho.map(item => item.aparelhoId).filter(Boolean);
      if (aparelhosIds.length > 0) {
        const { error: erroEstoque } = await supabase
          .from('aparelhos')
          .update({ ativo: false, condicao: 'vendido' }) 
          .in('id', aparelhosIds);
          
        if (erroEstoque) console.error('Fudeu o estoque:', erroEstoque);
      }

      await carregarVendas();
      setShowSaleCelebration(true);
      playSaleSuccessSound();
      toast.success(editingId ? 'Venda atualizada com sucesso.' : 'Venda finalizada com sucesso.');

      successTimerRef.current = setTimeout(() => {
        closePOSModal();
      }, SALE_SUCCESS_MS);
    } catch (error) {
      console.error('Erro ao salvar venda:', error);
      toast.error('Nao foi possivel salvar a venda.');
    } finally {
      setSavingVenda(false);
    }
  };

  const resetPOS = () => {
    setPosDados({ tipoVenda: 'Venda', clienteId: '', clienteNome: '', vendedor: '', tipoEntrega: 'Retirada', dataVenda: new Date().toISOString().split('T')[0] });
    setCart([]);
    setPosItem({ quantidade: 1, valorInterno: 0, valorExibir: 0, desconto: 0, tipoDesconto: 'R$', observacao: '' });
    setPosPagamento(createInitialPosPagamento());
    setEditingId(null);
  };

  const handleEdit = (venda: Venda) => {
    setPosDados({
      tipoVenda: 'Venda',
      clienteId: venda.clienteId || '',
      clienteNome: venda.clienteNome,
      vendedor: venda.vendedor || '',
      tipoEntrega: venda.tipoEntrega || 'Retirada',
      dataVenda: venda.dataPagamento
    });
    
    // Se for venda antiga sem itens, cria um item fictício
    const itens = venda.itens && venda.itens.length > 0 ? venda.itens : [{
      id: 'legacy',
      aparelhoId: '',
      descricao: venda.descricao || 'Item legado',
      quantidade: 1,
      valorInterno: venda.custo,
      valorExibir: venda.valor,
      desconto: 0,
      tipoDesconto: 'R$',
      total: venda.valor,
      observacao: ''
    } as VendaItem];

    setCart(itens);
    const pagamentosExistentes = Array.isArray((venda as any).pagamentos) ? (venda as any).pagamentos : [];
    const pagamentosNormalizados = pagamentosExistentes.length > 0
      ? pagamentosExistentes.map((pagamento: any, index: number) => createPagamentoItem({
          id: String(pagamento.id || `${venda.id}-pag-${index}`),
          metodo: pagamento.metodo || venda.metodo,
          valor: Number(pagamento.valor || 0),
          parcelas: Number(pagamento.parcelas || 1),
        }))
      : [createPagamentoItem({ metodo: venda.metodo, valor: venda.valor, parcelas: 1 })];

    const updatedPagamento: PosPagamentoState = {
      ...createInitialPosPagamento(),
      metodo: venda.metodo,
      status: venda.status,
      garantia: venda.garantia || '90 dias',
      descontoGlobal: venda.descontoTotal || 0,
      pagamentos: pagamentosNormalizados,
    };

    setPosPagamento(updatedPagamento);

    setEditingId(venda.id);
    openPOSModal();
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Tem certeza que deseja mandar essa venda pro quinto dos infernos? (Os aparelhos voltarão pro estoque)')) {
      try {
        // 1. Pega os dados da venda pra não perder o rastro dos celulares
        const { data: venda, error: erroBusca } = await supabase
          .from('vendas')
          .select('itens')
          .eq('id', id)
          .single();

        if (erroBusca) throw erroBusca;

        // 2. Passa a faca na venda
        const { error: erroDelete } = await supabase.from('vendas').delete().eq('id', id);
        if (erroDelete) throw erroDelete;

        // 3. O Milagre da Ressurreição (Devolve pro estoque)
        if (venda?.itens && venda.itens.length > 0) {
          const aparelhosIds = venda.itens.map((item: any) => item.aparelhoId).filter(Boolean);
          
          if (aparelhosIds.length > 0) {
            const { error: erroEstoque } = await supabase
              .from('aparelhos')
              .update({ ativo: true, condicao: 'seminovo' }) // Botei seminovo, ajusta se precisar
              .in('id', aparelhosIds);
              
            if (erroEstoque) console.error('Erro ao voltar pro estoque:', erroEstoque);
          }
        }

        toast.success('Venda apagada e estoque recuperado, sô!');
        await carregarVendas();
      } catch (error: any) {
        console.error('Erro macabro ao deletar venda:', error);
        // Agora cê vai ver na cara qual é o erro que o Supabase tá dando!
        toast.error(`Deu merda: ${error?.message || 'Falha desconhecida, abre o F12 aí'}`);
      }
    }
  };

  const handleOpenDeleteAllModal = () => {
    setConfirmDeleteEmail(usuario?.email || '');
    setConfirmDeletePassword('');
    setShowDeleteAllModal(true);
  };

  const handleCancelDeleteAll = () => {
    setShowDeleteAllModal(false);
    setConfirmDeletePassword('');
  };

  const handleDeleteAllVendas = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!usuario?.lojaId) {
      alert('Loja não identificada para exclusão em massa.');
      return;
    }

    if (!confirmDeleteEmail || !confirmDeletePassword) {
      alert('Informe email e senha para confirmar.');
      return;
    }

    try {
      setDeletingAllVendas(true);

      const { error: authError } = await supabase.auth.signInWithPassword({
        email: confirmDeleteEmail.trim(),
        password: confirmDeletePassword,
      });

      if (authError) {
        alert('Falha na confirmação de login. Verifique email e senha.');
        return;
      }

      const { error: deleteError } = await supabase
        .from('vendas')
        .delete()
        .eq('loja_id', usuario.lojaId);

      if (deleteError) {
        throw deleteError;
      }

      await carregarVendas();
      setShowDeleteAllModal(false);
      setConfirmDeletePassword('');
      alert('Todas as vendas da loja foram apagadas com sucesso.');
    } catch (error: any) {
      console.error('Erro ao apagar todas as vendas:', error);
      alert(`Erro ao apagar vendas: ${error?.message || 'Falha desconhecida'}`);
    } finally {
      setDeletingAllVendas(false);
    }
  };

  const metodoLabel = (metodo: Venda['metodo']) => {
    if (metodo === 'cartao_credito') return 'Cartão Crédito';
    if (metodo === 'cartao_debito') return 'Cartão Débito';
    if (metodo === 'dinheiro') return 'Dinheiro';
    if (metodo === 'pix') return 'PIX';
    return 'Boleto';
  };

  const statusLabel = (status: Venda['status']) => {
    if (status === 'pago') return 'Pago';
    if (status === 'pendente') return 'Pendente';
    return 'Cancelado';
  };

  const vendasFiltradas = useMemo(() => {
    const vendasBase = vendas.filter((venda) => {
      const cliente = venda.clienteNome || '';
      const vendedor = venda.vendedor || '';
      const busca = filtroBusca.trim().toLowerCase();

      const clienteInfo = clientes.find((c) => c.id === venda.clienteId || c.nome === venda.clienteNome);
      const itensVenda = venda.itens || [];
      const imeisDaVenda = itensVenda
        .map((item) => aparelhos.find((a) => a.id === item.aparelhoId)?.imei || '')
        .join(' ');

      const textoLivre = [
        venda.id,
        venda.clienteNome,
        clienteInfo?.telefone,
        clienteInfo?.email,
        clienteInfo?.cpf,
        venda.vendedor,
        venda.descricao,
        venda.garantia,
        venda.tipoEntrega,
        metodoLabel(venda.metodo),
        statusLabel(venda.status),
        new Date(venda.dataPagamento).toLocaleDateString('pt-BR'),
        ...itensVenda.map((item) => `${item.descricao} ${item.observacao || ''}`),
        imeisDaVenda,
        String(venda.valor),
        String(venda.lucro)
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const matchBusca = !busca || textoLivre.includes(busca);
      const matchStatus = !filtroStatus || venda.status === filtroStatus;
      const matchMetodo = !filtroMetodo || venda.metodo === filtroMetodo;
      const matchVendedor = !filtroVendedor || vendedor.toLowerCase().includes(filtroVendedor.toLowerCase());

      const dataVenda = venda.dataPagamento ? new Date(venda.dataPagamento) : null;
      const matchDataInicio = !filtroDataInicio || (dataVenda && dataVenda >= new Date(`${filtroDataInicio}T00:00:00`));
      const matchDataFim = !filtroDataFim || (dataVenda && dataVenda <= new Date(`${filtroDataFim}T23:59:59`));

      return !!(matchBusca && matchStatus && matchMetodo && matchVendedor && matchDataInicio && matchDataFim);
    });

    const statusRank: Record<Venda['status'], number> = {
      pago: 0,
      pendente: 1,
      cancelado: 2
    };

    const sorted = [...vendasBase].sort((a, b) => {
      let comparison = 0;

      if (ordenarPor === 'data') {
        comparison = new Date(a.dataPagamento).getTime() - new Date(b.dataPagamento).getTime();
      } else if (ordenarPor === 'cliente') {
        comparison = a.clienteNome.localeCompare(b.clienteNome, 'pt-BR');
      } else if (ordenarPor === 'valor') {
        comparison = a.valor - b.valor;
      } else if (ordenarPor === 'lucro') {
        comparison = a.lucro - b.lucro;
      } else if (ordenarPor === 'status') {
        comparison = statusRank[a.status] - statusRank[b.status];
      } else if (ordenarPor === 'metodo') {
        comparison = metodoLabel(a.metodo).localeCompare(metodoLabel(b.metodo), 'pt-BR');
      }

      return direcaoOrdenacao === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }, [vendas, filtroBusca, filtroStatus, filtroMetodo, filtroVendedor, filtroDataInicio, filtroDataFim, ordenarPor, direcaoOrdenacao, clientes, aparelhos]);

  const resumoVendas = {
    totalVendido: vendasFiltradas.reduce((sum, v) => sum + v.valor, 0),
    totalCusto: vendasFiltradas.reduce((sum, v) => sum + v.custo, 0),
    totalLucro: vendasFiltradas.reduce((sum, v) => sum + v.lucro, 0),
    quantidade: vendasFiltradas.length,
    vendPago: vendasFiltradas.filter(v => v.status === 'pago').length,
    vendPendente: vendasFiltradas.filter(v => v.status === 'pendente').length,
  };

  const metodosPagamento = ['dinheiro', 'cartao_credito', 'cartao_debito', 'pix', 'boleto'];

  const dadosPizza = metodosPagamento.map(metodo => ({
    name: metodo === 'cartao_credito' ? 'Cartão Crédito' : 
          metodo === 'cartao_debito' ? 'Cartão Débito' : 
          metodo === 'dinheiro' ? 'Dinheiro' :
          metodo === 'pix' ? 'PIX' : 'Boleto',
    value: vendasFiltradas.filter(v => v.metodo === metodo).reduce((sum, v) => sum + v.valor, 0),
  })).filter(d => d.value > 0);

  const COLORS = ['#ffffff', '#ffffff', '#ffffff', '#ffffff', '#ffffff'];

  const handleNovoClienteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoClienteData.nome || !novoClienteData.telefone) {
      alert('Nome e telefone são obrigatórios');
      return;
    }
    const clientePayload: Omit<Cliente, 'id' | 'dataCadastro' | 'lojaId'> = {
      ...novoClienteData,
      email: novoClienteData.email || 'sem@email.com',
      ativo: true,
    };
    const cliente = await criarCliente(clientePayload as Parameters<typeof criarCliente>[0]);
    if (cliente) {
      setPosDados(prev => ({ ...prev, clienteId: cliente.id, clienteNome: cliente.nome }));
      setShowNovoCliente(false);
      setNovoClienteData({ nome: '', email: '', telefone: '', cpf: '' });
      await fetchClientes();
    }
  };

  const handleNovoAparelhoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const parseCurrencyInput = (value: string) => {
      const digits = value.replace(/\D/g, '');
      return digits ? parseFloat(digits) / 100 : 0;
    };

    if (!novoAparelhoData.marca || !novoAparelhoData.modelo) {
      alert('Marca e modelo são obrigatórios');
      return;
    }

    const custoNum = parseCurrencyInput(novoAparelhoData.custo);
    const precoNum = parseCurrencyInput(novoAparelhoData.preco);
    const imeiSanitizado = novoAparelhoData.imei.replace(/\D/g, '').trim();

    if (precoNum <= 0) {
      alert('Informe um preço de venda válido para cadastrar o aparelho.');
      return;
    }

    const aparelhoPayload: Omit<Aparelho, 'id' | 'dataCadastro' | 'lojaId'> = {
      marca: novoAparelhoData.marca.trim(),
      modelo: novoAparelhoData.modelo.trim(),
      imei: imeiSanitizado || undefined,
      condicao: novoAparelhoData.condicao,
      preco: precoNum,
      custo: custoNum,
      ativo: true,
      capacidade: 'N/A',
      cor: 'N/A'
    };

    const aparelho = await criarAparelho(aparelhoPayload as Parameters<typeof criarAparelho>[0]);

    if (!aparelho) {
      alert(erroAparelhos || 'Não foi possível cadastrar o aparelho. Verifique IMEI duplicado ou tente novamente.');
      return;
    }

    if (aparelho) {
      setPosItem(prev => ({
        ...prev,
        aparelhoId: aparelho.id,
        descricao: `${aparelho.marca} ${aparelho.modelo}`,
        valorExibir: aparelho.preco,
        valorInterno: resolveAparelhoCusto(aparelho) || custoNum
      }));
      setShowNovoAparelho(false);
      setNovoAparelhoData({ marca: '', modelo: '', imei: '', preco: '', custo: '', condicao: 'seminovo' });
      await fetchAparelhos();
    }
  };

  const handleAddItem = () => {
    if (!posItem.aparelhoId && !posItem.descricao) {
      alert('Selecione um aparelho ou descreva o item.');
      return;
    }

    const qtd = posItem.quantidade || 1;
    const valor = posItem.valorExibir || 0;

    const custoDoEstoque = posItem.aparelhoId
      ? resolveAparelhoCusto(aparelhos.find((a) => a.id === posItem.aparelhoId))
      : 0;
    let desconto = 0;

    if (posItem.tipoDesconto === '%') {
      desconto = valor * ((posItem.desconto || 0) / 100);
    } else {
      desconto = posItem.desconto || 0;
    }

    const total = (valor - desconto) * qtd;

    const newItem: VendaItem = {
      id: Date.now().toString(),
      aparelhoId: posItem.aparelhoId || '',
      descricao: posItem.descricao || 'Item Avulso',
      quantidade: qtd,
      valorInterno: posItem.valorInterno || custoDoEstoque || 0,
      valorExibir: valor,
      desconto: posItem.desconto || 0,
      tipoDesconto: posItem.tipoDesconto as 'R$' | '%',
      total: total,
      observacao: posItem.observacao || ''
    };

    setCart([...carrinho, newItem]);
    setPosItem({ quantidade: 1, valorInterno: 0, valorExibir: 0, desconto: 0, tipoDesconto: 'R$', observacao: '', aparelhoId: '', descricao: '' });
  };

  const handleRemoveItem = (id: string) => {
    setCart(carrinho.filter(item => item.id !== id));
  };

  const handleAddPagamento = () => {
    setPosPagamento((current) => ({
      ...current,
      pagamentos: [
        ...current.pagamentos,
        createPagamentoItem({
          metodo: current.pagamentos[current.pagamentos.length - 1]?.metodo || current.metodo,
        }),
      ],
    }));
  };

  const handleUpdatePagamento = (pagamentoId: string, patch: Partial<PosPagamentoItem>) => {
    setPosPagamento((current) => ({
      ...current,
      pagamentos: current.pagamentos.map((pagamento) => (
        pagamento.id === pagamentoId ? { ...pagamento, ...patch } : pagamento
      )),
    }));
  };

  const handleRemovePagamento = (pagamentoId: string) => {
    setPosPagamento((current) => {
      const nextPagamentos = current.pagamentos.filter((pagamento) => pagamento.id !== pagamentoId);
      return {
        ...current,
        pagamentos: nextPagamentos.length > 0 ? nextPagamentos : [createPagamentoItem()],
      };
    });
  };

  const handleReceberValorTotal = () => {
    setPosPagamento((current) => ({
      ...current,
      pagamentos: [
        createPagamentoItem({
          metodo: current.pagamentos[0]?.metodo || current.metodo,
          valor: totalFinal > 0 ? Number(totalFinal.toFixed(2)) : 0,
          parcelas: current.pagamentos[0]?.parcelas || 1,
        }),
      ],
    }));
  };

  // Cálculos do PDV em tempo real
  const subtotalCarrinho = carrinho.reduce((acc, item) => acc + item.total, 0);
  const descontoGlobalValor = posPagamento.tipoDescontoGlobal === '%' 
    ? subtotalCarrinho * (posPagamento.descontoGlobal / 100) 
    : posPagamento.descontoGlobal;
  const totalFinal = subtotalCarrinho - descontoGlobalValor;
  const pagamentosTotal = useMemo(() => posPagamento.pagamentos.reduce((sum, pagamento) => sum + (Number(pagamento.valor) || 0), 0), [posPagamento.pagamentos]);
  const troco = Math.max(0, pagamentosTotal - totalFinal);
  const saldo = Math.max(0, totalFinal - pagamentosTotal);

  const VENDA_COLUMNS: ExportColumn[] = [
    { key: 'id', label: 'ID' },
    { key: 'clienteNome', label: 'Cliente' },
    { key: 'vendedor', label: 'Vendedor' },
    { key: 'dataPagamento', label: 'Data Pagamento' },
    { key: 'metodo', label: 'Metodo' },
    { key: 'valor', label: 'Valor' },
    { key: 'status', label: 'Status' },
  ];

  const parseImportedDate = (rawValue: string): string => {
    const value = String(rawValue || '').trim();
    if (!value) return new Date().toISOString();

    const nativeDate = new Date(value);
    if (!Number.isNaN(nativeDate.getTime())) {
      return nativeDate.toISOString();
    }

    const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (!match) return new Date().toISOString();

    const [, dd, mm, yyyy, hh = '00', min = '00', ss = '00'] = match;
    const parsed = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min), Number(ss));
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
  };

  const mapImportedStatus = (rawStatus: string): 'pendente' | 'pago' | 'cancelado' => {
    const status = String(rawStatus || '').toLowerCase();
    if (status.includes('cancel')) return 'cancelado';
    if (status.includes('pend')) return 'pendente';
    if (status.includes('concluido') || status.includes('concluído') || status.includes('pago')) return 'pago';
    return 'pago';
  };

  const mapImportedMetodo = (rawMetodo: string): Venda['metodo'] => {
    const metodo = String(rawMetodo || '').toLowerCase();
    if (metodo.includes('credito')) return 'cartao_credito';
    if (metodo.includes('debito')) return 'cartao_debito';
    if (metodo.includes('boleto')) return 'boleto';
    if (metodo.includes('dinheiro')) return 'dinheiro';
    if (metodo.includes('pix')) return 'pix';
    return 'pix';
  };

  const handleExportVendas = async () => {
    if (vendas.length === 0) {
      alert('Nenhuma venda para exportar.');
      return;
    }

    const formatoEscolhido = window
      .prompt('Formato para exportar vendas: csv ou xls', 'csv')
      ?.toLowerCase()
      .trim() as ExportFormat | undefined;

    if (!formatoEscolhido || !['csv', 'xls'].includes(formatoEscolhido)) {
      alert('Formato invalido. Use csv ou xls.');
      return;
    }

    await exportDataset({
      fileNameBase: `vendas_${new Date().toISOString().slice(0, 10)}`,
      title: 'Exportacao de Vendas',
      format: formatoEscolhido,
      columns: VENDA_COLUMNS,
      rows: vendas.map((venda) => ({
        id: venda.id,
        clienteNome: venda.clienteNome,
        vendedor: venda.vendedor || '',
        dataPagamento: new Date(venda.dataPagamento).toLocaleString('pt-BR'),
        metodo: venda.metodo,
        valor: venda.valor,
        status: venda.status,
      })),
    });
  };

  const handleOpenImportVendas = () => {
    importInputRef.current?.click();
  };

  const handleImportVendas = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!usuario?.lojaId) {
      alert('Sessao sem loja ativa para importar vendas.');
      return;
    }

    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const importedRows = await parseImportFile(file);

      if (importedRows.length === 0) {
        alert('Arquivo sem dados validos para importacao.');
        return;
      }

      const { data: existentes, error: existentesError } = await supabase
        .from('vendas')
        .select('descricao, clienteNome, dataPagamento, valor')
        .eq('loja_id', usuario.lojaId);

      if (existentesError) throw existentesError;

      const chavesExistentes = new Set(
        (existentes || []).map((item: any) => {
          const cliente = String(item.clienteNome || '').trim().toLowerCase();
          const data = String(item.dataPagamento || '').slice(0, 10);
          const valor = Number(item.valor || 0).toFixed(2);
          const ref = /Referencia\s+(\S+)/i.exec(String(item.descricao || ''))?.[1] || '';
          return `${ref}|${cliente}|${data}|${valor}`;
        })
      );

      const chavesNoLote = new Set<string>();
      const payload = importedRows
        .map((row) => {
          // Baseado no CSV enviado: _col1=id, _col2=cliente, _col3=vendedor, _col4=data, _col5=origem, _col6=valor, _col7=status
          const clienteNome = findByAliases(row, ['cliente', 'clientenome', 'nomecliente', '_col2']);
          const vendedor = findByAliases(row, ['vendedor', 'tecnico', '_col3']);
          const dataPagamento = parseImportedDate(findByAliases(row, ['datapagamento', 'data', '_col4']));
          const origem = findByAliases(row, ['origem', 'canal', 'metodo', 'formapagamento', '_col5']);
          const metodo = mapImportedMetodo(origem);
          const valor = parseCurrencyLike(findByAliases(row, ['valor', 'total', 'valorfinal', '_col6']));
          const status = mapImportedStatus(findByAliases(row, ['status', 'situacao', '_col7']));
          const idOrigem = findByAliases(row, ['id', 'numero', 'codigo', '_col1']);

          const chave = `${idOrigem}|${clienteNome.trim().toLowerCase()}|${dataPagamento.slice(0, 10)}|${Number(valor || 0).toFixed(2)}`;
          if (!clienteNome || !Number.isFinite(valor) || chavesExistentes.has(chave) || chavesNoLote.has(chave)) {
            return null;
          }

          chavesNoLote.add(chave);

          return {
            clienteNome,
            vendedor,
            tipoEntrega: 'Retirada',
            itens: [],
            valor,
            custo: 0,
            lucro: valor,
            percentualLucro: valor > 0 ? 100 : 0,
            dataPagamento,
            status,
            metodo,
            descricao: idOrigem
              ? `Importado - Referencia ${idOrigem}${origem ? ` - Origem ${origem}` : ''}`
              : `Importado por arquivo${origem ? ` - Origem ${origem}` : ''}`,
            garantia: '90 dias',
            descontoTotal: 0,
            loja_id: usuario.lojaId,
          };
        })
        .filter((venda): venda is NonNullable<typeof venda> => Boolean(venda));

      if (payload.length === 0) {
        alert('Nenhuma linha nova para importar. Tudo ja estava cadastrado ou sem dados minimos.');
        return;
      }

      const { error: insertError } = await supabase.from('vendas').insert(payload);
      if (insertError) throw insertError;

      await carregarVendas();
      alert(`Importacao concluida: ${payload.length} vendas inseridas.`);
    } catch (importError: any) {
      console.error('Erro ao importar vendas:', importError);
      alert(`Erro ao importar vendas: ${importError?.message || 'Falha desconhecida'}`);
    } finally {
      event.target.value = '';
    }
  };

  const handleGerarCupomTermico = async (venda: Venda) => {
    try {
      const logoHtml = config.logoLoja ? `<img src="${config.logoLoja}" style="max-height: 48px; max-width: 120px; margin: 0 auto 8px auto; display: block;" />` : '';
      const assinaturaEmpresaUrl = config.assinaturaLoja;
      const itensHtml = (venda.itens && venda.itens.length > 0 ? venda.itens : [{ descricao: venda.descricao || 'Produto/serviço', quantidade: 1, valorExibir: venda.valor, total: venda.valor, desconto: venda.descontoTotal || 0, observacao: '' }])
        .map(item => `
          <div style="margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px dashed #222;">
            <div style="display: flex; justify-content: space-between; gap: 8px; font-weight: 600;">
              <span>${item.descricao}</span>
              <span>R$ ${item.total.toFixed(2).replace('.', ',')}</span>
            </div>
            <div style="font-size: 10px; color: #444; margin-top: 3px;">
              ${item.quantidade}x R$ ${item.valorExibir.toFixed(2).replace('.', ',')} ${(item.desconto > 0 ? `| Desc. R$ ${item.desconto.toFixed(2).replace('.', ',')}` : '')}
            </div>
            ${item.observacao ? `<div style="font-size: 10px; color: #666; margin-top: 2px;">${item.observacao}</div>` : ''}
          </div>
        `).join('');

      const qrData = encodeURIComponent(`Recibo:${venda.id};Data:${new Date(venda.dataPagamento).toLocaleDateString('pt-BR')};Cliente:${venda.clienteNome || 'N/A'};Valor:R$${(venda.valor || 0).toFixed(2)};Garantia:${venda.garantia || '90 dias'}`);
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${qrData}`;

      const cupomHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8" />
          <title>Recibo de Venda #${venda.id.slice(-6).toUpperCase()}</title>
          <style>
            html { color-scheme: light; background: #fff !important; }
            body { font-family: 'Courier New', Courier, monospace; font-size: 12px; color: #000; background: #fff !important; margin: 0; padding: 12px; width: 100%; max-width: 320px; }
            @page { size: 80mm auto; margin: 3mm; }
            @media print { body { padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact; } }
            .center { text-align: center; }
            .bold { font-weight: 700; }
            .divider { border-top: 1px dashed #000; margin: 8px 0; }
            .small { font-size: 10px; }
            .signature-image { max-width: 120px; max-height: 44px; object-fit: contain; margin: 0 auto -8px auto; display: block; }
            .signature-box { text-align: center; margin-top: 8px; }
            .signature-label { font-size: 10px; font-weight: 700; }
          </style>
        </head>
        <body>
          <div class="center">
            ${logoHtml}
            <div class="bold" style="font-size: 16px;">${config.nomeLoja || 'PHONE CENTER'}</div>
            <div class="small">Assistência Técnica e Vendas</div>
          </div>
          <div class="divider"></div>
          <div class="bold">RECIBO DE VENDA</div>
          <div class="small">Nº ${venda.id.slice(-6).toUpperCase()}</div>
          <div class="small">Data: ${new Date(venda.dataPagamento).toLocaleString('pt-BR')}</div>
          <div class="small">Cliente: ${venda.clienteNome || 'Não informado'}</div>
          <div class="small">Vendedor: ${venda.vendedor || 'Não informado'}</div>
          <div class="small">Forma de Pagto: ${venda.metodo ? venda.metodo.toUpperCase().replace('_', ' ') : 'NÃO INFORMADO'}</div>
          <div class="divider"></div>
          ${itensHtml}
          <div class="divider"></div>
          <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: 700;">
            <span>TOTAL</span>
            <span>R$ ${(venda.valor || 0).toFixed(2).replace('.', ',')}</span>
          </div>
          ${(venda.descontoTotal && venda.descontoTotal > 0) ? `<div class="small" style="text-align: right;">Desconto: R$ ${venda.descontoTotal.toFixed(2).replace('.', ',')}</div>` : ''}
          <div class="divider"></div>
          <div class="center" style="margin-bottom: 8px;">
            <img src="${qrCodeUrl}" alt="QR Code" style="width: 120px; height: 120px; object-fit: contain; margin: 0 auto;" />
            <div class="small">Validação de garantia</div>
          </div>
          <div class="bold center">GARANTIA</div>
          <div class="small center">Válida por ${venda.garantia || '90 dias'} a partir da data da compra.</div>
          <div class="small center">Não pode molhar. Não pode abrir o aparelho.</div>
          <div class="small center">Apresente este recibo para qualquer atendimento de garantia.</div>
          <div class="divider"></div>
          <div class="signature-box">
            ${assinaturaEmpresaUrl ? `<img src="${assinaturaEmpresaUrl}" alt="Assinatura da loja" class="signature-image" onerror="this.style.display='none'" />` : ''}
            <div class="signature-label">Assinatura / Carimbo da Loja</div>
          </div>
          <div class="center small">Obrigado pela preferência!</div>
          <script>window.onload = function() { window.print(); window.onafterprint = function(){ window.close(); } }</script>
        </body>
        </html>
      `;

      const printWindow = window.open('', '_blank', 'width=380,height=700');
      if (printWindow) {
        printWindow.document.write(cupomHtml);
        printWindow.document.close();
      } else {
        alert('Por favor, permita pop-ups para imprimir o comprovante.');
      }
    } catch (err) {
      console.error('Erro ao gerar recibo térmico:', err);
      alert('Erro ao gerar comprovante de venda.');
    }
  };

  const handleGerarReciboA4 = async (venda: Venda) => {
    try {
      const dataAtual = new Date().toLocaleDateString('pt-BR');
      const assinaturaEmpresaUrl = config.assinaturaLoja;
      
      // Mapeamento dos itens
      const itensHtmlA4 = venda.itens && venda.itens.length > 0 
        ? venda.itens.map(item => `
            <tr>
              <td style="text-align: center;">${(item as any).codigo || ''}</td>
              <td>${item.descricao} <br><small style="color: #666;">${item.observacao || ''}</small></td>
              <td style="text-align: center;">${item.quantidade}</td>
              <td style="text-align: right;">R$ ${item.valorExibir.toFixed(2).replace('.', ',')}</td>
              <td style="text-align: right;">R$ ${(item.desconto || 0).toFixed(2).replace('.', ',')}</td>
              <td style="text-align: right;">R$ ${item.total.toFixed(2).replace('.', ',')}</td>
            </tr>
          `).join('')
        : `<tr>
             <td style="text-align: center;">-</td>
             <td>${venda.descricao || 'Produto Genérico'}</td>
             <td style="text-align: center;">1</td>
             <td style="text-align: right;">R$ ${venda.valor.toFixed(2).replace('.', ',')}</td>
             <td style="text-align: right;">R$ 0,00</td>
             <td style="text-align: right;">R$ ${venda.valor.toFixed(2).replace('.', ',')}</td>
           </tr>`;

      const valorTotalVenda = ((venda as any).valorTotal || venda.valor || 0);

      const conteudoHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Recibo de Venda</title>
          <style>
            @page { size: A4 portrait; margin: 1.5cm; }
            html { color-scheme: light; background: #fff !important; }
            @media print {
              body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact; }
            }
            body { font-family: Arial, sans-serif; font-size: 11px; color: #000; background: #fff !important; margin: 0; padding: 0; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
            th, td { border: 1px solid #000; padding: 5px; text-align: left; }
            .no-border, .no-border td { border: none; padding: 2px; }
            .section-title { background-color: #f0f0f0; font-weight: bold; text-align: center; padding: 6px 4px; }
            .small-text { font-size: 10px; line-height: 1.3; }
            .footer-grid { display: flex; gap: 10px; flex-wrap: wrap; }
            .footer-grid .box { border: 1px solid #000; padding: 8px; }
            .footer-grid .box-qr { width: 32%; min-width: 140px; text-align: center; }
            .footer-grid .box-terms { width: 66%; min-width: 180px; font-size: 10px; line-height: 1.3; }
            .signature-row { display: flex; gap: 24px; justify-content: space-between; align-items: flex-end; margin-top: 20px; }
            .signature-col { width: 48%; text-align: center; }
            .signature-holder { height: 44px; display: flex; align-items: flex-end; justify-content: center; margin-bottom: -4px; }
            .signature-image { max-width: 180px; max-height: 64px; object-fit: contain; display: block; }
            .signature-line { border-top: 1px solid #000; padding-top: 6px; font-weight: 700; }
            .signature-subtitle { display: block; margin-top: 2px; font-size: 10px; font-weight: 400; }
          </style>
        </head>
        <body>

          <!-- Canhoto de Recebimento -->
          <table>
            <tr>
            <td colspan="3" class="section-title">RECIBO DE ${config.nomeLoja || 'LOJA NÃO CONFIGURADA'} - OS PRODUTOS E/OU SERVIÇOS CONSTANTES NO PEDIDO</td>
            </tr>
            <tr>
              <td style="width: 30%;">Data de recebimento<br><br>___/___/______</td>
              <td style="width: 40%;">Identificação e assinatura do recebedor<br><br>_________________________________________</td>
              <td style="width: 30%; text-align: center;">Recibo da venda:<br><b>${venda.id || ''}</b></td>
            </tr>
          </table>

          <hr style="border-top: 1px dashed #000; margin: 15px 0;">

          <!-- Dados da Empresa -->
          <table class="no-border" style="margin-bottom: 18px;">
            <tr>
              <td style="width: 150px; vertical-align: top;">
                ${config.logoLoja ? `<img src="${config.logoLoja}" style="max-height: 80px; max-width: 140px; display: block;" />` : ''}
              </td>
              <td style="vertical-align: top; padding-left: 8px;">
                <h2 style="margin: 0 0 5px 0; font-size: 16px;">${config.nomeLoja || 'LOJA NÃO CONFIGURADA'}</h2>
                <div class="small-text">${config.enderecoLoja || 'Endereço não configurado'}</div>
                <div class="small-text">CNPJ: ${config.cnpjLoja || 'Não informado'} | Tel: ${config.telefoneLoja || 'Não informado'}</div>
              </td>
              <td style="text-align: right; vertical-align: top; font-size: 11px;">
                Data: ${dataAtual}<br>
                VENDEDOR: ${venda.vendedor || 'Não informado'}<br>
                <b>RECIBO DA VENDA: ${venda.id || ''}</b>
              </td>
            </tr>
          </table>

          <!-- Dados do Cliente -->
          <table>
            <tr><td colspan="4" class="section-title">DESTINATÁRIO/REMETENTE</td></tr>
            <tr>
              <td style="width: 40%;">Nome/Razão social<br><b>${(venda as any).cliente?.nome || venda.clienteNome || ''}</b></td>
              <td style="width: 20%;">Telefone<br>${(venda as any).cliente?.telefone || ''}</td>
              <td style="width: 20%;">CPF/CNPJ<br>${(venda as any).cliente?.documento || ''}</td>
              <td style="width: 20%;">E-mail<br>${(venda as any).cliente?.email || ''}</td>
            </tr>
          </table>

          <!-- Produtos -->
          <table>
            <tr><td colspan="6" class="section-title">DADOS DO PRODUTO</td></tr>
            <tr style="font-weight: bold; text-align: center;">
              <td style="width: 10%;">Cód</td>
              <td style="width: 45%; text-align: left;">Produto</td>
              <td style="width: 5%;">Qtd</td>
              <td style="width: 15%;">Valor Unitário</td>
              <td style="width: 10%;">Desconto</td>
              <td style="width: 15%;">Valor Total</td>
            </tr>
            ${itensHtmlA4}
            <tr>
              <td colspan="5" style="text-align: right; font-weight: bold;">Total</td>
              <td style="text-align: right; font-weight: bold;">R$ ${valorTotalVenda.toFixed(2).replace('.', ',')}</td>
            </tr>
          </table>

          <!-- Termos de Garantia -->
          <div class="box" style="margin-top: 10px; margin-bottom: 8px; padding: 10px;">
            <div style="font-weight: bold; margin-bottom: 6px;">TERMO DE GARANTIA</div>
            <div class="small-text">Garantia de ${venda.garantia || '90 dias'} a partir da data da compra. Válida somente para serviços e peças fornecidos pela empresa.</div>
            <div class="small-text" style="margin-top: 6px;">Esta garantia não cobre:</div>
            <ul class="small-text" style="margin: 4px 0 0 16px; padding: 0; list-style: disc inside;">
              <li>Queda, umidade, líquidos ou danos acidentais;</li>
              <li>Uso indevido, instalação incorreta ou violação do produto;</li>
              <li>Abertura ou tentativa de conserto por terceiros não autorizados;</li>
              <li>Não pode molhar e não pode abrir o aparelho.</li>
            </ul>
            <div class="small-text" style="margin-top: 6px;"><b>Apresente este recibo junto com o equipamento no atendimento.</b></div>
          </div>

          <!-- Assinaturas -->
          <div class="signature-row">
            <div class="signature-col">
              <div class="signature-holder"></div>
              <div class="signature-line">
                Assinatura do Cliente
                <span class="signature-subtitle">${(venda as any).cliente?.nome || venda.clienteNome || 'Não informado'}</span>
              </div>
            </div>
            <div class="signature-col">
              <div class="signature-holder">
                ${assinaturaEmpresaUrl ? `<img src="${assinaturaEmpresaUrl}" alt="Assinatura da loja" class="signature-image" onerror="this.style.display='none'" />` : ''}
              </div>
              <div class="signature-line">
                Assinatura / Carimbo da Loja
                <span class="signature-subtitle">${config.nomeLoja || 'LOJA NÃO CONFIGURADA'}</span>
              </div>
            </div>
          </div>
          <div style="text-align: center; margin-top: 16px; font-weight: bold;">
            OBRIGADO PELA PREFERÊNCIA.
          </div>
          <script>window.onload = function() { window.print(); window.onafterprint = function(){ window.close(); } };</script>
        </body>
        </html>
      `;

      const printWindow = window.open('', '_blank');
      if (printWindow) { 
        printWindow.document.write(conteudoHtml); 
        printWindow.document.close(); 
      } 
      else { alert("Por favor, permita pop-ups no navegador para imprimir o comprovante."); }
    } catch (err) {
      console.error("Erro ao gerar nota:", err);
      alert("Erro ao gerar comprovante de venda.");
    }
  };

  return (
    <div className="panel-shell relative min-h-[calc(100dvh-12.625rem)] sm:min-h-[calc(100dvh-13.125rem)] space-y-4 sm:space-y-6 pb-40 sm:pb-6">
        {/* Header com Botão */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-white drop-shadow-sm">Vendas</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">Controle de vendas e faturamento</p>
          </div>
          <div className="scroll-row w-full sm:w-auto sm:pb-0">
            <input
              ref={importInputRef}
              type="file"
              accept=".csv,.xls,.xlsx"
              onChange={handleImportVendas}
              className="hidden"
            />
            <Button
              variant="outline"
              onClick={handleExportVendas}
              className="h-9 text-xs sm:text-sm shrink-0 whitespace-nowrap"
            >
              <Download className="mr-2 h-4 w-4" />
              Exportar
            </Button>
            <Button
              variant="outline"
              onClick={handleOpenImportVendas}
              className="h-9 text-xs sm:text-sm shrink-0 whitespace-nowrap"
            >
              <Upload className="mr-2 h-4 w-4" />
              Importar
            </Button>
            <Button 
              onClick={() => {
                openPOSModal();
                if (editingId) setEditingId(null);
              }}
              className="btn-ios h-9 text-xs sm:text-sm shrink-0 whitespace-nowrap"
            >
              + Nova Venda
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleOpenDeleteAllModal}
              disabled={vendas.length === 0}
              className="h-9 text-xs sm:text-sm shrink-0 whitespace-nowrap"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Apagar Todas
            </Button>
          </div>
        </div>

        {/* Modal PDV Completo */}
        {isClient && (showPOS || closingPOS) && createPortal(
            <div
             className={`fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-3 sm:p-4 overflow-hidden transition-opacity duration-300 ${closingPOS ? 'opacity-0' : 'opacity-100'}`}
            >
             <div className={`relative flex flex-col w-full max-w-[1360px] max-h-full overflow-hidden rounded-[1.5rem] bg-white/10 dark:bg-slate-900/60 backdrop-blur-3xl border border-white/20 shadow-[0_0_50px_rgba(0,0,0,0.5)] transition-all duration-300 will-change-transform ${closingPOS ? 'scale-95 opacity-0' : 'scale-100 opacity-100'}`}>
              {showSaleCelebration && (
                <div className="sale-success-overlay">
                  <div className="sale-success-badge">🎉 PARABENS PELA VENDA 🎉</div>
                  {SALE_EMOJIS.map((emoji, index) => (
                    <span
                      key={`${emoji}-${index}`}
                      className="sale-success-emoji"
                      style={{
                        ['--emoji-x' as '--emoji-x']: `${12 + index * 14}`,
                        ['--emoji-delay' as '--emoji-delay']: `${index * 70}`,
                      } as React.CSSProperties}
                    >
                      {emoji}
                    </span>
                  ))}
                  {Array.from({ length: 18 }).map((_, index) => (
                    <span
                      key={index}
                      className="sale-confetti"
                      style={{
                        ['--confetti-x' as '--confetti-x']: `${6 + index * 5}`,
                        ['--confetti-delay' as '--confetti-delay']: `${index * 32}`,
                        ['--confetti-rotate' as '--confetti-rotate']: `${(index % 6) * 24}`,
                        ['--confetti-drift' as '--confetti-drift']: `${(index % 2 === 0 ? 1 : -1) * (28 + index * 3)}`,
                        ['--confetti-hue' as '--confetti-hue']: `${200 + (index % 5) * 22}`,
                      } as React.CSSProperties}
                    />
                  ))}
                </div>
              )}
              
              {/* Header do PDV */}
              <div className="modal-header !py-2.5 !px-3 backdrop-blur-xl max-sm:flex-col max-sm:items-start max-sm:gap-2">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5 text-blue-600" />
                  <h2 className="modal-title">{editingId ? 'Editar Venda' : 'Nova Venda'}</h2>
                </div>
                <div className="flex items-center gap-2 max-sm:w-full max-sm:justify-end">
                  <Button onClick={handleFinalizarVenda} disabled={savingVenda} className="h-9 bg-green-600 hover:bg-green-700 gap-2 shadow-lg shadow-green-500/20 disabled:opacity-70">
                    <Save className="w-4 h-4" /> {savingVenda ? 'SALVANDO...' : 'FINALIZAR VENDA'}
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => closePOSModal()}>
                    <X className="w-5 h-5" />
                  </Button>
                </div>
              </div>

              {/* Resumo Fixo (Cards) - Liquid Glass */}
              <div className="p-2 bg-white/10 dark:bg-black/20 backdrop-blur-md border-b border-white/10 z-10">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <GlassCard className="!p-2 rounded-xl bg-white/30 dark:bg-white/5 border-white/10">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase">📦 Valor Produtos</p>
                    <p className="text-sm font-bold leading-tight">R$ {subtotalCarrinho.toFixed(2)}</p>
                  </GlassCard>
                  <GlassCard className="!p-2 rounded-xl bg-white/30 dark:bg-white/5 border-white/10">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase">💰 Pagamentos</p>
                    <p className="text-sm font-bold leading-tight">R$ {pagamentosTotal.toFixed(2)}</p>
                  </GlassCard>
                  <GlassCard className="!p-2 rounded-xl bg-white/30 dark:bg-white/5 border-white/10">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase">📉 Saldo</p>
                    <p className="text-sm font-bold leading-tight">R$ {saldo.toFixed(2)}</p>
                  </GlassCard>
                  <GlassCard className="!p-2 rounded-xl bg-white/30 dark:bg-white/5 border-white/10">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase">💵 Troco</p>
                    <p className="text-sm font-bold leading-tight">R$ {troco.toFixed(2)}</p>
                  </GlassCard>
                </div>
              </div>

              <div className="modal-body modal-scrollbar !pt-2 !pb-1.5 !px-2.5 flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-2.5 items-start">
                  <div className="xl:col-span-8 space-y-2.5">
                
                {/* Seção 1: Dados da Venda */}
                <GlassCard className="!p-2.5 bg-white/40 dark:bg-white/5 rounded-2xl border-white/10">
                  <div className="pb-2 mb-2 border-b border-white/10">
                    <h3 className="text-sm font-bold uppercase text-slate-500 flex items-center gap-2">
                      <User className="w-4 h-4" /> Dados da Venda
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_180px] gap-2">
                    <select 
                      className="input-glass"
                      value={posDados.tipoVenda}
                      onChange={e => setPosDados({...posDados, tipoVenda: e.target.value})}
                    >
                      <option>Venda</option>
                      <option>Orçamento</option>
                      <option>Troca</option>
                    </select>

                <div className="flex gap-2 min-w-0">
                  <select
                      className="input-glass min-w-0 flex-1"
                      value={posDados.clienteId}
                    onChange={(e) => {
                      const cliente = clientes.find(c => c.id === e.target.value);
                        setPosDados({ ...posDados, clienteId: e.target.value, clienteNome: cliente?.nome || '' });
                    }}
                  >
                    <option value="">Cliente</option>
                    {clientes.map(c => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                  <Button type="button" size="icon" variant="outline" onClick={() => setShowNovoCliente(true)} className="h-11 w-11 shrink-0 bg-white/50 backdrop-blur">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                    <select 
                      className="input-glass"
                      value={posDados.vendedor}
                      onChange={e => setPosDados({...posDados, vendedor: e.target.value})}
                    >
                      <option value="">Vendedor</option>
                      {tecnicos.map(t => <option key={t.id} value={t.nome}>{t.nome}</option>)}
                    </select>

                    <select 
                      className="input-glass"
                      value={posDados.tipoEntrega}
                      onChange={e => setPosDados({...posDados, tipoEntrega: e.target.value})}
                    >
                      <option>Retirada</option>
                      <option>Entrega</option>
                      <option>Correios</option>
                    </select>

                    <input 
                      type="date" 
                      className="input-glass"
                      value={posDados.dataVenda}
                      onChange={e => setPosDados({...posDados, dataVenda: e.target.value})}
                    />
                  </div>
                </GlassCard>

                {/* Seção 2: Itens da Venda */}
                <GlassCard className="!p-2.5 bg-white/40 dark:bg-white/5 rounded-2xl border-white/10">
                  <div className="pb-2 mb-2 border-b border-white/10">
                    <h3 className="text-sm font-bold uppercase text-slate-500 flex items-center gap-2">
                      <ShoppingCart className="w-4 h-4" /> Itens da Venda
                    </h3>
                  </div>
                  <div className="space-y-1.5">
                    {/* Input de Item */}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[minmax(0,1.75fr)_minmax(88px,0.55fr)_minmax(120px,0.8fr)_minmax(120px,0.8fr)_minmax(180px,1fr)_64px] gap-2 items-end bg-white/30 dark:bg-black/30 p-2 rounded-xl border border-white/10 animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="flex gap-2 min-w-0 md:col-span-2 xl:col-span-1">
                        <select
                          className="input-glass min-w-0 flex-1 transition-all duration-200 hover:shadow-md"
                          value={posItem.aparelhoId}
                          onChange={(e) => {
                            const aparelho = aparelhos.find(a => a.id === e.target.value);
                            const custo = resolveAparelhoCusto(aparelho);
                            setPosItem({
                              ...posItem,
                              aparelhoId: e.target.value,
                              descricao: aparelho ? `${aparelho.marca} ${aparelho.modelo}` : '',
                              valorExibir: aparelho ? aparelho.preco : 0,
                              valorInterno: aparelho ? custo : 0
                            });
                          }}
                        >
                          <option value="">Produto</option>
                          {aparelhos.map(a => (
                            <option key={a.id} value={a.id}>{a.marca} {a.modelo} - R$ {a.preco.toFixed(2).replace('.', ',')}</option>
                          ))}
                        </select>
                        <Button type="button" size="icon" variant="outline" onClick={() => setShowNovoAparelho(true)} className="h-11 w-11 shrink-0 bg-white/50 backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg">
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="md:col-span-1 xl:col-span-1">
                        <label className="text-[11px] text-gray-500 ml-1">Qtd</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          min="1"
                          className="input-glass h-11 transition-all duration-200 hover:shadow-md focus:shadow-lg"
                          value={posItem.quantidade}
                          onChange={e => setPosItem({...posItem, quantidade: parseInt(e.target.value.replace(/\D/g, '')) || 1})}
                        />
                      </div>

                      <div className="md:col-span-1 xl:col-span-1">
                        <label className="text-[10px] font-bold text-blue-500 ml-1 uppercase">Custo (R$)</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          className="input-glass h-11 border-blue-500/30 transition-all duration-200 hover:shadow-md focus:shadow-lg"
                          placeholder="0,00"
                          value={formatCurrencyField(posItem.valorInterno || 0)}
                          onChange={e => setPosItem({...posItem, valorInterno: parseCurrencyField(e.target.value)})}
                        />
                      </div>

                      <div className="md:col-span-1 xl:col-span-1">
                        <label className="text-[10px] font-bold text-green-500 ml-1 uppercase">Venda (R$)</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          className="input-glass h-11 border-green-500/30 transition-all duration-200 hover:shadow-md focus:shadow-lg"
                          placeholder="0,00"
                          value={formatCurrencyField(posItem.valorExibir || 0)}
                          onChange={e => setPosItem({...posItem, valorExibir: parseCurrencyField(e.target.value)})}
                        />
                      </div>

                      <div className="md:col-span-1 xl:col-span-1">
                        <label className="text-[11px] text-gray-500 ml-1">Desconto</label>
                        <div className="flex h-11 overflow-hidden rounded-xl border border-white/10 bg-white/20 dark:bg-black/20 transition-all duration-200 focus-within:border-blue-500/50 focus-within:ring-2 focus-within:ring-blue-500/15">
                          <input
                            type="text"
                            inputMode="numeric"
                            className="min-w-0 flex-1 border-0 bg-transparent px-3 text-sm outline-none placeholder:text-gray-400 dark:placeholder:text-gray-500"
                            placeholder="0,00"
                            value={formatCurrencyField(posItem.desconto || 0)}
                            onChange={e => setPosItem({...posItem, desconto: parseCurrencyField(e.target.value)})}
                          />
                          <div className="flex shrink-0 items-center gap-1 border-l border-white/10 px-1.5">
                            <button
                              type="button"
                              onClick={() => setPosItem({...posItem, tipoDesconto: 'R$'})}
                              className={`h-7 min-w-7 rounded-full px-2 text-[10px] font-bold transition-all duration-200 ${posItem.tipoDesconto === 'R$' ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25' : 'bg-white/70 text-slate-700 hover:bg-white dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/20'}`}
                            >
                              R$
                            </button>
                            <button
                              type="button"
                              onClick={() => setPosItem({...posItem, tipoDesconto: '%'})}
                              className={`h-7 min-w-7 rounded-full px-2 text-[10px] font-bold transition-all duration-200 ${posItem.tipoDesconto === '%' ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25' : 'bg-white/70 text-slate-700 hover:bg-white dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/20'}`}
                            >
                              %
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="md:col-span-2 xl:col-span-1">
                        <Button onClick={handleAddItem} className="w-full h-11 bg-blue-600 hover:bg-blue-700 rounded-xl shadow-lg shadow-blue-500/20 transition-all duration-200 hover:-translate-y-0.5">
                          <Plus className="w-4 h-5" />
                        </Button>
                      </div>
                    </div>

                    {/* Tabela de Itens */}
                    {carrinho.length > 0 ? (
                      <div className="border border-white/10 rounded-xl overflow-hidden">
                        <table className="w-full text-xs">
                        <thead className="bg-white/20 dark:bg-black/20 text-xs uppercase text-gray-500">
                          <tr>
                            <th className="p-1.5 text-left">Produto</th>
                            <th className="p-1.5 text-center">Qtd</th>
                            <th className="p-1.5 text-right">Custo Unit.</th>
                            <th className="p-1.5 text-right">Vlr Unit.</th>
                            <th className="p-1.5 text-right">Desc.</th>
                            <th className="p-1.5 text-right">Total</th>
                            <th className="p-1.5 text-center">Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/10">
                          {carrinho.map(item => (
                            <tr key={item.id} className="hover:bg-white/5">
                              <td className="p-1.5">{item.descricao} <span className="text-[10px] text-gray-400 block">{item.observacao}</span></td>
                              <td className="p-1.5 text-center">{item.quantidade}</td>
                              <td className="p-1.5 text-right text-blue-500">R$ {item.valorInterno.toFixed(2)}</td>
                              <td className="p-1.5 text-right">R$ {item.valorExibir.toFixed(2)}</td>
                              <td className="p-1.5 text-right text-red-500">
                                {item.desconto > 0 ? `-${item.tipoDesconto === 'R$' ? 'R$' : ''}${item.desconto}${item.tipoDesconto === '%' ? '%' : ''}` : '-'}
                              </td>
                              <td className="p-1.5 text-right font-bold">R$ {item.total.toFixed(2)}</td>
                              <td className="p-1.5 text-center">
                                <button onClick={() => handleRemoveItem(item.id)} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4" /></button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-white/10 dark:bg-black/10 font-bold">
                          <tr>
                            <td colSpan={5} className="p-1.5 text-right">Subtotal:</td>
                            <td className="p-1.5 text-right">R$ {subtotalCarrinho.toFixed(2)}</td>
                            <td></td>
                          </tr>
                        </tfoot>
                        </table>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-white/20 bg-white/20 dark:bg-black/20 px-3 py-2 text-center text-xs text-gray-500">
                        Nenhum item adicionado
                      </div>
                    )}

                    {/* Desconto Total */}
                    <div className="flex flex-wrap justify-end items-center gap-2 bg-white/30 dark:bg-black/30 p-2 rounded-xl border border-white/10">
                      <span className="text-sm font-medium">Desconto Total:</span>
                      <input 
                        type="text" 
                        inputMode="numeric"
                        className="w-24 input-glass py-1 h-8 text-right" 
                        value={formatCurrencyField(posPagamento.descontoGlobal)} 
                        onChange={e => setPosPagamento((current): PosPagamentoState => ({...current, descontoGlobal: parseCurrencyField(e.target.value)}))} 
                      />
                      <div className="flex border border-white/20 rounded-lg overflow-hidden">
                        <button 
                          type="button"
                          className={`px-2 py-1 text-xs ${posPagamento.tipoDescontoGlobal === 'R$' ? 'bg-blue-600 text-white' : 'bg-white/50 dark:bg-black/50'}`}
                          onClick={() => setPosPagamento((current): PosPagamentoState => ({...current, tipoDescontoGlobal: 'R$'}))}
                        >R$</button>
                        <button 
                          type="button"
                          className={`px-2 py-1 text-xs ${posPagamento.tipoDescontoGlobal === '%' ? 'bg-blue-600 text-white' : 'bg-white/50 dark:bg-black/50'}`}
                          onClick={() => setPosPagamento((current): PosPagamentoState => ({...current, tipoDescontoGlobal: '%'}))}
                        >%</button>
                      </div>
                      <button type="button" onClick={() => setPosPagamento((current): PosPagamentoState => ({...current, descontoGlobal: 0}))} className="text-xs text-red-500 underline ml-2">Limpar</button>
                    </div>
                  </div>
                </GlassCard>

                  </div>

                {/* Seção 3: Pagamento */}
                <div className="xl:col-span-4 space-y-2.5">
                <GlassCard className="!p-2.5 bg-white/40 dark:bg-white/5 rounded-2xl border-white/10">
                  <div className="pb-2 mb-2 border-b border-white/10">
                    <h3 className="text-sm font-bold uppercase text-slate-500 flex items-center gap-2">
                      <CreditCard className="w-4 h-4" /> Dados do Pagamento
                    </h3>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs text-gray-500 ml-1">Formas de Pagamento</label>
                      <Button type="button" variant="outline" size="sm" onClick={handleAddPagamento} className="h-8 gap-2">
                        <Plus className="h-4 w-4" /> Adicionar forma
                      </Button>
                    </div>

                    <div className="space-y-2">
                      {posPagamento.pagamentos.map((pagamento, index) => (
                        <div key={pagamento.id} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1.1fr)_minmax(120px,0.65fr)_minmax(92px,0.55fr)_42px] gap-2 items-end bg-white/20 dark:bg-black/20 rounded-xl border border-white/10 p-2 animate-in fade-in slide-in-from-top-2 duration-200">
                          <div>
                            <label className="text-[11px] text-gray-500 ml-1">Método {index + 1}</label>
                            <select
                              className="input-glass"
                              value={pagamento.metodo}
                              onChange={(e) => handleUpdatePagamento(pagamento.id, { metodo: e.target.value as Venda['metodo'] })}
                            >
                              <option value="dinheiro">Dinheiro</option>
                              <option value="cartao_credito">Cartão Crédito</option>
                              <option value="cartao_debito">Cartão Débito</option>
                              <option value="pix">PIX</option>
                              <option value="boleto">Boleto</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-[11px] text-gray-500 ml-1">Valor</label>
                            <input
                              type="text"
                              inputMode="numeric"
                              className="input-glass font-bold text-green-600"
                              placeholder="0,00"
                              value={formatCurrencyField(pagamento.valor || 0)}
                              onChange={(e) => handleUpdatePagamento(pagamento.id, { valor: parseCurrencyField(e.target.value) })}
                            />
                          </div>
                          <div>
                            <label className="text-[11px] text-gray-500 ml-1">Parcelas</label>
                            <select
                              className="input-glass"
                              value={pagamento.parcelas}
                              disabled={pagamento.metodo !== 'cartao_credito'}
                              onChange={(e) => handleUpdatePagamento(pagamento.id, { parcelas: parseInt(e.target.value) })}
                            >
                              {[1, 2, 3, 4, 5, 6, 10, 12].map((parcela) => <option key={parcela} value={parcela}>{parcela}x</option>)}
                            </select>
                          </div>
                          <div className="flex items-center justify-end">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemovePagamento(pagamento.id)}
                              className="h-9 w-9 text-red-500 hover:bg-red-500/10"
                              disabled={posPagamento.pagamentos.length === 1}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/20 dark:bg-black/20 px-3 py-2 text-xs sm:text-sm">
                      <div className="flex flex-wrap items-center gap-3 text-gray-600 dark:text-gray-300">
                        <span>Total pago: <strong>R$ {pagamentosTotal.toFixed(2)}</strong></span>
                        <span>Restante: <strong>R$ {saldo.toFixed(2)}</strong></span>
                        <span>Troco: <strong>R$ {troco.toFixed(2)}</strong></span>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={handleReceberValorTotal} className="h-8 gap-2">
                        Receber valor total
                      </Button>
                    </div>

                    <div>
                      <label className="text-xs text-gray-500 ml-1">Garantia</label>
                      <input 
                        type="text" 
                        className="input-glass" 
                        value={posPagamento.garantia} 
                        onChange={e => setPosPagamento((current): PosPagamentoState => ({...current, garantia: e.target.value}))} 
                      />
                    </div>
                    <div className="sm:col-span-2 xl:col-span-1">
                      <label className="text-xs text-gray-500 ml-1">Detalhes / Obs Pagamento</label>
                      <input 
                        type="text" 
                        className="input-glass" 
                        value={posPagamento.detalhes} 
                        onChange={e => setPosPagamento((current): PosPagamentoState => ({...current, detalhes: e.target.value}))} 
                      />
                    </div>
                  </div>
                </GlassCard>
                </div>

                </div>

              </div>

              {/* Footer Ações */}
              <div className="shrink-0 p-2 border-t border-white/10 bg-white/20 dark:bg-white/5 backdrop-blur-xl flex justify-end gap-2">
                <Button variant="outline" onClick={() => closePOSModal()} className="h-9 gap-2 bg-white/50 hover:bg-white/80 border-white/20">
                  <Ban className="w-4 h-4" /> Cancelar
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}

        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowSalesDashboard((prev) => !prev)}
            className="w-full sm:w-auto"
          >
            {showSalesDashboard ? 'Ocultar Painel' : 'Mostrar Painel'}
          </Button>
        </div>

        {showSalesDashboard && (
          <>
        {/* Cards de Resumo */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <GlassCard hoverEffect={true} className="rounded-3xl">
            <div className="flex flex-row items-center justify-between pb-2">
              <h3 className="text-xs sm:text-sm font-medium">Total Vendido</h3>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-bold">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(resumoVendas.totalVendido)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{resumoVendas.quantidade} vendas</p>
            </div>
          </GlassCard>

          <GlassCard hoverEffect={true} className="rounded-3xl">
            <div className="flex flex-row items-center justify-between pb-2">
              <h3 className="text-xs sm:text-sm font-medium">Lucro Total</h3>
              <TrendingUp className="h-4 w-4 text-green-600" />
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-bold text-green-600">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(resumoVendas.totalLucro)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {resumoVendas.totalVendido > 0 ? ((resumoVendas.totalLucro / resumoVendas.totalVendido) * 100).toFixed(1) : 0}% de margem
              </p>
            </div>
          </GlassCard>

          <GlassCard hoverEffect={true} className="rounded-3xl">
            <div className="flex flex-row items-center justify-between pb-2">
              <h3 className="text-xs sm:text-sm font-medium">Pagas</h3>
              <Badge variant="default" className="text-xs">{resumoVendas.vendPago}</Badge>
            </div>
            <div>
              <div className="text-2xl font-bold">{resumoVendas.vendPago}</div>
              <p className="text-xs text-muted-foreground mt-1">Confirmadas</p>
            </div>
          </GlassCard>

          <GlassCard hoverEffect={true} className="rounded-3xl">
            <div className="flex flex-row items-center justify-between pb-2">
              <h3 className="text-xs sm:text-sm font-medium">Pendentes</h3>
              <Badge variant="secondary" className="text-xs">{resumoVendas.vendPendente}</Badge>
            </div>
            <div>
              <div className="text-2xl font-bold">{resumoVendas.vendPendente}</div>
              <p className="text-xs text-muted-foreground mt-1">À receber</p>
            </div>
          </GlassCard>
        </div>

        {/* Gráficos */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Gráfico de Vendas por Período */}
          <GlassCard className="rounded-3xl">
            <div className="pb-4 border-b border-white/10 mb-4">
              <h3 className="text-base sm:text-lg font-bold">Vendas por Período</h3>
              <p className="text-xs sm:text-sm text-muted-foreground">Últimos 12 meses</p>
            </div>
            <div>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={vendasPorPeriodo}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="periodo" tick={{ fontSize: 12 }} stroke="rgba(150,150,150,0.5)" />
                  <YAxis tick={{ fontSize: 12 }} stroke="rgba(150,150,150,0.5)" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.8)', borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    formatter={(value: any) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((value || 0))} 
                  />
                  <Legend />
                  <Line type="monotone" dataKey="total" stroke="#3b82f6" name="Vendido" strokeWidth={3} dot={{r: 4}} />
                  <Line type="monotone" dataKey="lucro" stroke="#10b981" name="Lucro" strokeWidth={3} dot={{r: 4}} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>

          {/* Gráfico de Métodos de Pagamento */}
          <GlassCard className="rounded-3xl">
            <div className="pb-4 border-b border-white/10 mb-4">
              <h3 className="text-base sm:text-lg font-bold">Métodos de Pagamento</h3>
              <p className="text-xs sm:text-sm text-muted-foreground">Distribuição por método</p>
            </div>
            <div>
              {dadosPizza.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={dadosPizza}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry) => `${(entry.value / resumoVendas.totalVendido * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {COLORS.map((color, index) => (
                        <Cell key={`cell-${index}`} fill={color} />
                      ))}
                    </Pie>
                    <Tooltip 
                       contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.8)', borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                       formatter={(value: any) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((value || 0))} 
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  Sem dados de pagamento
                </div>
              )}
            </div>
          </GlassCard>
        </div>
          </>
        )}

        {/* Filtros */}
        <GlassCard className="p-4 rounded-3xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <input
              type="text"
              placeholder="Buscar cliente, IMEI, item, vendedor, valor..."
              value={filtroBusca}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFiltroBusca(e.target.value)}
              className="input-glass h-10 sm:h-auto"
            />
            <select
              className="input-glass h-10 sm:h-auto"
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value)}
            >
              <option value="">Todos os status</option>
              <option value="pago">Pago</option>
              <option value="pendente">Pendente</option>
              <option value="cancelado">Cancelado</option>
            </select>
            <select
              className="input-glass h-10 sm:h-auto"
              value={filtroMetodo}
              onChange={(e) => setFiltroMetodo(e.target.value)}
            >
              <option value="">Todos os métodos</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="cartao_credito">Cartão Crédito</option>
              <option value="cartao_debito">Cartão Débito</option>
              <option value="pix">PIX</option>
              <option value="boleto">Boleto</option>
            </select>
            <input
              type="text"
              placeholder="Filtrar por vendedor..."
              value={filtroVendedor}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFiltroVendedor(e.target.value)}
              className="input-glass h-10 sm:h-auto"
            />
            <input
              type="date"
              value={filtroDataInicio}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFiltroDataInicio(e.target.value)}
              className="input-glass h-10 sm:h-auto"
              aria-label="Data inicial"
            />
            <input
              type="date"
              value={filtroDataFim}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFiltroDataFim(e.target.value)}
              className="input-glass h-10 sm:h-auto"
              aria-label="Data final"
            />
            <select
              className="input-glass h-10 sm:h-auto"
              value={ordenarPor}
              onChange={(e) => setOrdenarPor(e.target.value as 'data' | 'cliente' | 'valor' | 'lucro' | 'status' | 'metodo')}
            >
              <option value="data">Ordenar por data</option>
              <option value="cliente">Ordenar por cliente</option>
              <option value="valor">Ordenar por valor</option>
              <option value="lucro">Ordenar por lucro</option>
              <option value="status">Ordenar por status</option>
              <option value="metodo">Ordenar por método</option>
            </select>
            <select
              className="input-glass h-10 sm:h-auto"
              value={direcaoOrdenacao}
              onChange={(e) => setDirecaoOrdenacao(e.target.value as 'asc' | 'desc')}
            >
              <option value="desc">Mais recentes / maiores</option>
              <option value="asc">Mais antigos / menores</option>
            </select>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setFiltroBusca('');
                setFiltroStatus('');
                setFiltroMetodo('');
                setFiltroVendedor('');
                setFiltroDataInicio('');
                setFiltroDataFim('');
                setOrdenarPor('data');
                setDirecaoOrdenacao('desc');
              }}
              className="h-10 sm:h-auto"
            >
              Limpar filtros
            </Button>
          </div>
        </GlassCard>

        {/* Tabela de Vendas */}
        <GlassCard className="rounded-3xl">
          <div className="pb-4 border-b border-white/10 mb-4">
            <h3 className="text-base sm:text-lg font-bold">Vendas Registradas</h3>
            <p className="text-xs sm:text-sm text-muted-foreground">{vendasFiltradas.length} vendas</p>
          </div>
          <div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-white/10">
                  <tr className="text-xs sm:text-sm text-left">
                    <th className="py-3 px-2">Cliente</th>
                    <th className="text-left py-3 px-2 hidden sm:table-cell">Aparelho</th>
                    <th className="text-right py-3 px-2">Valor</th>
                    <th className="text-right py-3 px-2 hidden sm:table-cell">Lucro</th>
                    <th className="py-3 px-2 hidden sm:table-cell">Método</th>
                    <th className="py-3 px-2">Status</th>
                    <th className="text-right py-3 px-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {vendasFiltradas.map((venda) => (
                    <tr key={venda.id} className="border-b border-white/10 last:border-0 text-xs sm:text-sm hover:bg-white/5 transition-colors">
                      <td className="py-3 px-2 font-medium">{venda.clienteNome}</td>
                      <td className="py-3 px-2 hidden sm:table-cell text-muted-foreground">{venda.itens && venda.itens.length > 0 ? `${venda.itens.length} itens` : venda.descricao}</td>
                      <td className="py-3 px-2 text-right font-bold">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(venda.valor)}
                      </td>
                      <td className="py-3 px-2 text-right hidden sm:table-cell text-green-600 font-medium">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(venda.lucro)}
                      </td>
                      <td className="py-3 px-2 hidden sm:table-cell text-xs">
                        {metodoLabel(venda.metodo)}
                      </td>
                      <td className="py-3 px-2">
                        <Badge variant={venda.status === 'pago' ? 'default' : venda.status === 'pendente' ? 'secondary' : 'outline'} className="text-xs">
                          {venda.status === 'pago' ? 'Pago' : venda.status === 'pendente' ? 'Pendente' : 'Cancelado'}
                        </Badge>
                      </td>
                      <td className="py-3 px-2 text-right">
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(venda)}
                            className="h-8 text-xs hover:bg-white/10"
                          >
                            Editar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(venda.id)}
                            className="h-8 text-xs text-red-500 hover:bg-red-500/10"
                          >
                            Excluir
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleGerarCupomTermico(venda)}
                            className="h-8 text-xs text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                            title="Cupom Térmico"
                          >
                            <Printer className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleGerarReciboA4(venda)}
                            className="h-8 text-xs text-blue-600 hover:bg-blue-500/10"
                            title="Recibo A4"
                          >
                            <FileText className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { const c = clientes.find(cl => cl.nome === venda.clienteNome); if(c) window.open(`https://wa.me/55${c.telefone.replace(/\D/g, '')}`, '_blank'); }}
                            className="h-8 text-xs text-green-600 hover:bg-green-500/10"
                          >
                            <MessageCircle className="w-3 h-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {loading && vendas.length === 0 && (
                <div className="text-center py-8 text-blue-500 font-medium">
                  Carregando dados das vendas...
                </div>
              )}
              {!loading && vendasFiltradas.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhuma venda encontrada com os critérios atuais.
                </div>
              )}
            </div>
          </div>
        </GlassCard>
      {/* Modal Novo Cliente */}
      {isClient && showNovoCliente && createPortal(
        <div className="modal-overlay modal-overlay-fit z-[60]">
          <GlassCard className="modal-panel modal-panel-fit modal-panel-md w-full my-4">
            <div className="modal-header">
              <h3 className="modal-title">Novo Cliente</h3>
              <Button variant="ghost" size="icon" onClick={() => setShowNovoCliente(false)}><X className="w-4 h-4" /></Button>
            </div>
            <div className="modal-body-scroll">
              <form onSubmit={handleNovoClienteSubmit} className="space-y-4">
                <input type="text" placeholder="Nome *" required className="input-glass" value={novoClienteData.nome} onChange={e => setNovoClienteData({...novoClienteData, nome: e.target.value})} />
                <input type="tel" inputMode="tel" placeholder="Telefone *" required className="input-glass" value={novoClienteData.telefone} onChange={e => setNovoClienteData({...novoClienteData, telefone: e.target.value})} />
                <input type="email" placeholder="Email" className="input-glass" value={novoClienteData.email} onChange={e => setNovoClienteData({...novoClienteData, email: e.target.value})} />
                <input type="text" inputMode="numeric" pattern="[0-9]*" placeholder="CPF" className="input-glass" value={novoClienteData.cpf} onChange={e => setNovoClienteData({...novoClienteData, cpf: e.target.value.replace(/\D/g, '')})} />
                <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700">Cadastrar Cliente</Button>
              </form>
            </div>
          </GlassCard>
        </div>,
        document.body
      )}

      {/* Modal Novo Aparelho */}
      {isClient && showNovoAparelho && createPortal(
        <div className="modal-overlay modal-overlay-fit z-[60]">
          <GlassCard className="modal-panel modal-panel-fit modal-panel-md w-full my-4">
            <div className="modal-header">
              <div>
                <h3 className="modal-title">Novo Aparelho</h3>
                <p className="modal-subtitle">Cadastro rápido para adicionar item na venda.</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setShowNovoAparelho(false)}><X className="w-4 h-4" /></Button>
            </div>
            <div className="modal-body-scroll">
              <form onSubmit={handleNovoAparelhoSubmit} className="space-y-4">
                <input type="text" placeholder="Marca *" required className="input-glass" value={novoAparelhoData.marca} onChange={e => setNovoAparelhoData({...novoAparelhoData, marca: e.target.value})} />
                <input type="text" placeholder="Modelo *" required className="input-glass" value={novoAparelhoData.modelo} onChange={e => setNovoAparelhoData({...novoAparelhoData, modelo: e.target.value})} />
                <input type="tel" inputMode="numeric" pattern="[0-9]*" placeholder="IMEI" className="input-glass" value={novoAparelhoData.imei} onChange={e => setNovoAparelhoData({...novoAparelhoData, imei: e.target.value.replace(/\D/g, '')})} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground ml-1 uppercase">Preço Custo</label>
                    <input 
                      type="text" 
                      inputMode="decimal"
                      placeholder="R$ 0,00" 
                      className="input-glass" 
                      value={novoAparelhoData.custo} 
                      onChange={e => {
                        const v = e.target.value.replace(/\D/g, '');
                        if (!v) {
                          setNovoAparelhoData({...novoAparelhoData, custo: ''});
                          return;
                        }
                        const custoNum = parseInt(v) / 100;
                        const vendaNum = custoNum + 300;
                        const formattedCusto = `R$ ${custoNum.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
                        const formattedVenda = `R$ ${vendaNum.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
                        setNovoAparelhoData({...novoAparelhoData, custo: formattedCusto, preco: formattedVenda});
                      }} 
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground ml-1 uppercase">Preço Venda</label>
                    <input 
                      type="text" 
                      inputMode="decimal"
                      placeholder="R$ 0,00" 
                      className="input-glass" 
                      value={novoAparelhoData.preco} 
                      onChange={e => {
                        const v = e.target.value.replace(/\D/g, '');
                        const formatted = (parseInt(v) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                        setNovoAparelhoData({...novoAparelhoData, preco: v ? `R$ ${formatted}` : ''});
                      }} 
                    />
                  </div>
                </div>
                <select 
                  className="input-glass"
                  value={novoAparelhoData.condicao}
                  onChange={e => setNovoAparelhoData({...novoAparelhoData, condicao: e.target.value as any})}
                >
                  <option value="novo">Novo</option>
                  <option value="seminovo">Seminovo</option>
                  <option value="usado">Usado</option>
                </select>

                <div className="flex gap-2 pt-2">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setShowNovoAparelho(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={loadingAparelhos} className="flex-1 bg-blue-600 hover:bg-blue-700">
                    {loadingAparelhos ? 'Cadastrando...' : 'Cadastrar'}
                  </Button>
                </div>
              </form>
            </div>
          </GlassCard>
        </div>,
        document.body
      )}

      {isClient && showDeleteAllModal && createPortal(
        <div className="modal-overlay modal-overlay-fit z-[70]">
          <GlassCard className="modal-panel modal-panel-fit modal-panel-md w-full my-4">
            <div className="modal-header">
              <div>
                <h3 className="modal-title text-red-600">Apagar todas as vendas</h3>
                <p className="modal-subtitle">Esta ação remove definitivamente todos os registros de vendas da loja.</p>
              </div>
              <Button variant="ghost" size="icon" onClick={handleCancelDeleteAll}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="modal-body-scroll">
              <form onSubmit={handleDeleteAllVendas} className="space-y-4">
                <input
                  type="email"
                  className="input-glass"
                  placeholder="Email da conta"
                  value={confirmDeleteEmail}
                  onChange={(e) => setConfirmDeleteEmail(e.target.value)}
                  required
                />
                <input
                  type="password"
                  className="input-glass"
                  placeholder="Senha"
                  value={confirmDeletePassword}
                  onChange={(e) => setConfirmDeletePassword(e.target.value)}
                  required
                />

                <div className="flex gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={handleCancelDeleteAll}
                    disabled={deletingAllVendas}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    variant="destructive"
                    className="flex-1"
                    disabled={deletingAllVendas}
                  >
                    {deletingAllVendas ? 'Apagando...' : 'Confirmar e Apagar'}
                  </Button>
                </div>
              </form>
            </div>
          </GlassCard>
        </div>,
        document.body
      )}
    </div>
  );
}
