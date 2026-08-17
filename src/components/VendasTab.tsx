'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { GlassCard } from '@/components/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { DollarSign, TrendingUp, TrendingDown, Calendar, Plus, Search, X, Printer, ShoppingCart, User, Truck, CreditCard, Trash2, Save, Ban, MessageCircle, FileText, Download, Upload, Mail, XCircle, MoreVertical, FileInput, Repeat, ChevronDown, Filter, RotateCcw, Edit, AlertCircle, Loader2, Sparkles } from 'lucide-react';
import { useClientes } from '@/hooks/useClientes';
import { useAparelhos } from '@/hooks/useAparelhos';
import { useTecnicos } from '@/hooks/useTecnicos';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/hooks/useAuth';
import { useStoreConfig } from '@/hooks/useStoreConfig';
import { Aparelho, Cliente, Venda, VendaItem } from '@/lib/db/types';
import { getAparelhoCodigo } from '@/lib/utils';
import { toast } from 'sonner';
import { generateReciboA4Html } from '@/lib/reciboA4';
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

function ProdutoCombobox({
  aparelhos,
  value,
  onChange,
}: {
  aparelhos: Aparelho[];
  value: string;
  onChange: (aparelhoId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
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

  const disponiveis = aparelhos.filter(a => a.ativo !== false && a.condicao !== 'vendido' && (a as any).status !== 'vendido');
  const selecionado = disponiveis.find(a => a.id === value);

  const filtrados = disponiveis.filter(a => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    const codigoStr = getAparelhoCodigo(a).toLowerCase();
    const imeiStr = (a.imei || a.numeroSerie || '').toLowerCase();
    const modeloStr = (a.modelo || '').toLowerCase();
    const marcaStr = (a.marca || '').toLowerCase();
    const corStr = (a.cor || '').toLowerCase();
    const capStr = (a.capacidade || '').toLowerCase();
    return (
      codigoStr.includes(term) ||
      imeiStr.includes(term) ||
      modeloStr.includes(term) ||
      marcaStr.includes(term) ||
      corStr.includes(term) ||
      capStr.includes(term) ||
      `${marcaStr} ${modeloStr}`.includes(term)
    );
  });

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
        <div className="absolute left-0 top-full mt-1.5 w-full min-w-[340px] sm:min-w-[500px] md:min-w-[620px] bg-slate-900/98 backdrop-blur-2xl border border-white/20 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.8)] z-[9999] overflow-hidden flex flex-col max-h-84 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="p-2.5 border-b border-white/10 bg-black/40 flex items-center gap-2">
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

          <div className="overflow-y-auto divide-y divide-white/5 text-xs font-mono flex-1 max-h-64">
            {filtrados.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground text-xs font-sans">
                Nenhum aparelho encontrado com "{searchTerm}".
              </div>
            ) : (
              filtrados.map((a) => {
                const imei = a.imei || a.numeroSerie || '';
                const isSelected = a.id === value;
                const cod = getAparelhoCodigo(a);
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

const ComboboxAparelhos = ProdutoCombobox;

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
  const [mostrarFiltrosAvancados, setMostrarFiltrosAvancados] = useState(false);
  const [showSalesDashboard, setShowSalesDashboard] = useState(true);
  const [loading, setLoading] = useState(true);
  const [showPOS, setShowPOS] = useState(false);
  const [closingPOS, setClosingPOS] = useState(false);
  const [savingVenda, setSavingVenda] = useState(false);
  const [showSaleCelebration, setShowSaleCelebration] = useState(false);
  const [showNovoCliente, setShowNovoCliente] = useState(false);
  const [showNovoAparelho, setShowNovoAparelho] = useState(false);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [showImportarPedidoModal, setShowImportarPedidoModal] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [isDesktopViewport, setIsDesktopViewport] = useState(false);
  const [posOverlayRect, setPosOverlayRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [confirmDeleteEmail, setConfirmDeleteEmail] = useState('');
  const [confirmDeletePassword, setConfirmDeletePassword] = useState('');
  const [deletingAllVendas, setDeletingAllVendas] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showReenviarNotinhaPrompt, setShowReenviarNotinhaPrompt] = useState(false);
  const [textoPedido, setTextoPedido] = useState('');
  const [processingAiText, setProcessingAiText] = useState(false);
  const [showDadosFaltantesModal, setShowDadosFaltantesModal] = useState(false);
  const [aiParsedData, setAiParsedData] = useState<any>(null);
  const [selectedStockAparelhoId, setSelectedStockAparelhoId] = useState('');
  const [dadosFaltantesForm, setDadosFaltantesForm] = useState({
    clienteNome: '',
    clienteTelefone: '',
    clienteEmail: '',
    marca: 'Apple',
    modelo: '',
    capacidade: '128GB',
    cor: '',
    condicao: 'seminovo' as 'seminovo' | 'novo',
    imei: '',
    preco: '',
    custo: '',
    vendedor: '',
    formaPagamento: 'pix',
    dataVenda: new Date().toISOString().slice(0, 10),
    observacoes: '',
  });
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const closePOSTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sidebarBeforePOSRef = useRef<boolean | null>(null);

  // Estados do PDV
  const formatForDatetimeLocal = (dateString?: string) => {
    const d = dateString ? new Date(dateString) : new Date();
    if (isNaN(d.getTime())) {
      const now = new Date();
      return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    }
    const localISOTime = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    return localISOTime;
  };

  const [posDados, setPosDados] = useState({
    tipoVenda: 'Venda',
    clienteId: '',
    clienteNome: '',
    vendedor: '',
    tipoEntrega: 'Retirada',
    dataVenda: formatForDatetimeLocal(),
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
    if (showImportarPedidoModal) setShowImportarPedidoModal(false);
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
    showImportarPedidoModal,
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

  const aplicarVendaAI = async (parsedData: any) => {
    try {
      toast.info('⚡ Finalizando venda e registrando e-mail...');

      // 1. Garantir e atualizar Cliente com E-mail, CPF e Data de Nascimento
      let clienteIdFinal = '';
      let clienteNomeFinal = parsedData.cliente?.nome || 'Cliente Consumidor';
      let clienteObj: Cliente | null = null;
      const emailFinal = parsedData.cliente?.email && parsedData.cliente.email !== '' ? parsedData.cliente.email : 'sem@email.com';
      const cpfFinal = parsedData.cliente?.cpf || '';
      const nascFinal = parsedData.cliente?.dataNascimento || parsedData.cliente?.data_nascimento || '';
      
      if (parsedData.cliente?.nome || parsedData.cliente?.email) {
        const clienteExistente = clientes.find(c => 
          (parsedData.cliente?.email && c.email && c.email.toLowerCase() === parsedData.cliente.email.toLowerCase()) ||
          (parsedData.cliente?.nome && c.nome.toLowerCase() === parsedData.cliente.nome.toLowerCase()) ||
          (parsedData.cliente?.telefone && c.telefone.replace(/\D/g, '') === parsedData.cliente.telefone.replace(/\D/g, ''))
        );

        if (clienteExistente) {
          clienteIdFinal = clienteExistente.id;
          clienteNomeFinal = clienteExistente.nome;
          clienteObj = clienteExistente;

          const clientUpdates: Record<string, any> = {};
          if (emailFinal !== 'sem@email.com' && (!clienteExistente.email || clienteExistente.email === 'sem@email.com')) {
            clientUpdates.email = emailFinal;
          }
          if (cpfFinal && (!clienteExistente.cpf || clienteExistente.cpf === '')) {
            clientUpdates.cpf = cpfFinal;
          }
          if (nascFinal && (!(clienteExistente as any).data_nascimento || (clienteExistente as any).data_nascimento === '')) {
            clientUpdates.data_nascimento = nascFinal;
          }

          if (Object.keys(clientUpdates).length > 0) {
            await supabase.from('clientes').update(clientUpdates).eq('id', clienteExistente.id);
            clienteObj = { ...clienteExistente, ...clientUpdates };
            await fetchClientes();
          }
        } else {
          const clientPayload: Record<string, any> = {
            nome: parsedData.cliente?.nome || 'Cliente Consumidor',
            telefone: parsedData.cliente?.telefone || '00000000000',
            email: emailFinal,
            cpf: cpfFinal,
            data_nascimento: nascFinal,
            loja_id: usuario?.lojaId || null
          };
          Object.keys(clientPayload).forEach(k => {
            if (clientPayload[k] === '' || clientPayload[k] === null) delete clientPayload[k];
          });

          const { data: novoCli, error: errCli } = await supabase
            .from('clientes')
            .insert([clientPayload])
            .select()
            .maybeSingle();

          if (errCli) {
            delete clientPayload.cpf;
            delete clientPayload.data_nascimento;
            const { data: retryCli } = await supabase
              .from('clientes')
              .insert([clientPayload])
              .select()
              .maybeSingle();
            if (retryCli) {
              clienteIdFinal = retryCli.id;
              clienteNomeFinal = retryCli.nome;
              clienteObj = retryCli as Cliente;
              await fetchClientes();
            }
          } else if (novoCli) {
            clienteIdFinal = novoCli.id;
            clienteNomeFinal = novoCli.nome;
            clienteObj = novoCli as Cliente;
            await fetchClientes();
          }
        }
      }

      // 2. Garantir Aparelho
      let aparelhoFinal: Aparelho | null = null;

      if (selectedStockAparelhoId) {
        aparelhoFinal = aparelhos.find(a => a.id === selectedStockAparelhoId) || null;
      }

      if (!aparelhoFinal && parsedData.aparelho?.modelo) {
        const disponiveis = aparelhos.filter(a => a.ativo !== false && a.condicao !== 'vendido' && (a as any).status !== 'vendido');
        aparelhoFinal = disponiveis.find(a => 
          (parsedData.aparelho?.imei && a.imei && a.imei.toLowerCase() === parsedData.aparelho.imei.toLowerCase()) ||
          (`${a.marca} ${a.modelo}`.toLowerCase().includes(parsedData.aparelho.modelo.toLowerCase()))
        ) || null;
      }

      if (!aparelhoFinal && parsedData.aparelho?.modelo) {
        const uniqueId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `ap_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const apPayload: Record<string, any> = {
          id: uniqueId,
          marca: parsedData.aparelho.marca || 'Apple',
          modelo: parsedData.aparelho.modelo,
          capacidade: parsedData.aparelho.capacidade || '128GB',
          cor: parsedData.aparelho.cor || '',
          imei: parsedData.aparelho.imei || '',
          preco: Number(parsedData.aparelho.preco || parsedData.valorTotal || 0),
          custo: Number(parsedData.aparelho.custo || 0),
          condicao: parsedData.aparelho.condicao || 'seminovo',
          ativo: true,
          loja_id: usuario?.lojaId || null
        };

        const { data: novoAp, error: errAp } = await supabase
          .from('aparelhos')
          .insert([apPayload])
          .select()
          .maybeSingle();

        if (errAp) {
          delete apPayload.saude_bateria;
          delete apPayload.codigo;
          const { data: retryAp } = await supabase
            .from('aparelhos')
            .insert([apPayload])
            .select()
            .maybeSingle();
          if (retryAp) {
            aparelhoFinal = retryAp as Aparelho;
            await fetchAparelhos();
          }
        } else if (novoAp) {
          aparelhoFinal = novoAp as Aparelho;
          await fetchAparelhos();
        }
      }

      const valorVenda = Number(parsedData.valorTotal || parsedData.aparelho?.preco || 0);
      const custoVenda = Number(parsedData.aparelho?.custo || aparelhoFinal?.custo || 0);
      const metodoPgto: Venda['metodo'] = parsedData.formaPagamento === 'pix' ? 'pix' :
                                         parsedData.formaPagamento === 'cartao_credito' ? 'cartao_credito' :
                                         parsedData.formaPagamento === 'cartao_debito' ? 'cartao_debito' :
                                         parsedData.formaPagamento === 'dinheiro' ? 'dinheiro' : 'outros';

      const condicaoTexto = (parsedData.aparelho?.condicao || aparelhoFinal?.condicao) === 'novo' ? 'Lacrado' : 'Seminovo';
      const cartItem: VendaItem = {
        id: Date.now().toString(),
        aparelhoId: aparelhoFinal?.id,
        descricao: `${parsedData.aparelho?.marca || 'Aparelho'} ${parsedData.aparelho?.modelo || ''} ${parsedData.aparelho?.capacidade || ''} ${parsedData.aparelho?.cor || ''} (${condicaoTexto})`.trim(),
        quantidade: 1,
        valorInterno: custoVenda,
        valorExibir: valorVenda,
        desconto: 0,
        tipoDesconto: 'R$',
        total: valorVenda,
        observacao: parsedData.observacoes || (parsedData.aparelho?.imei ? `IMEI: ${parsedData.aparelho.imei}` : '')
      };

      const dataPagamentoIso = (() => {
        if (!parsedData.dataVenda) return new Date().toISOString();
        try {
          const str = String(parsedData.dataVenda);
          const d = new Date(str.includes('T') ? str : `${str}T12:00:00`);
          return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
        } catch (e) {
          return new Date().toISOString();
        }
      })();

      const lucroVenda = valorVenda - custoVenda;
      const percentualLucro = valorVenda > 0 ? (lucroVenda / valorVenda) * 100 : 0;

      // 3. Inserir e FINALIZAR A VENDA DIRETO no banco de dados!
      const vendaPayload = {
        clienteId: clienteIdFinal || null,
        clienteNome: clienteNomeFinal,
        vendedor: parsedData.vendedor || posDados.vendedor || 'Sistema IA',
        tipoEntrega: 'Retirada',
        itens: [cartItem],
        valor: valorVenda,
        custo: custoVenda,
        lucro: lucroVenda,
        percentualLucro,
        dataPagamento: dataPagamentoIso,
        status: 'pago',
        metodo: metodoPgto,
        descricao: `Venda Gerada por IA - ${cartItem.descricao}`,
        garantia: `${config?.garantiaDias || 90} dias`,
        descontoTotal: 0,
        pagamentos: [{ id: Date.now().toString(), metodo: metodoPgto, valor: valorVenda, parcelas: 1 }],
        loja_id: usuario?.lojaId || null
      };

      const { data: vendaCriada, error: erroVenda } = await supabase
        .from('vendas')
        .insert([vendaPayload])
        .select()
        .single();

      if (erroVenda) throw erroVenda;

      // 4. Dar baixa no aparelho no estoque imediatamente
      if (aparelhoFinal?.id) {
        await supabase
          .from('aparelhos')
          .update({ ativo: false, condicao: 'vendido' })
          .eq('id', aparelhoFinal.id);
        await fetchAparelhos();
      }

      await carregarVendas();
      setShowSaleCelebration(true);
      playSaleSuccessSound();

      // 5. Disparar e-mail de recibo pro cliente se houver e-mail válido
      if (clienteObj && clienteObj.email && clienteObj.email !== 'sem@email.com') {
        const emailEnviado = await dispararEmailReciboComPdf(vendaCriada, clienteObj);
        if (emailEnviado) {
          toast.success(`🚀 Venda finalizada! Recibo enviado para ${clienteObj.email}`);
        } else {
          toast.success('🚀 Venda finalizada com sucesso! (Erro ao disparar e-mail)');
        }
      } else {
        toast.success('🚀 Venda finalizada com sucesso!');
      }

      // 6. Gerar Notinha / Recibo A4 automaticamente
      handleGerarReciboA4(vendaCriada);
    } catch (err: any) {
      console.error('Erro ao aplicar venda por IA:', err);
      toast.error(err.message || 'Erro ao finalizar venda por IA');
    } finally {
      setProcessingAiText(false);
    }
  };

  const handleProcessarTextoVenda = async () => {
    if (!textoPedido.trim()) {
      toast.error('Cole o texto da venda na área indicada.');
      return;
    }

    setProcessingAiText(true);
    try {
      const res = await fetch('/api/ai/parse-venda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: textoPedido, lojaId: usuario?.lojaId }),
      });

      const result = await res.json();
      if (!res.ok || !result.ok) {
        throw new Error(result.error || 'Falha ao ler o texto com a IA.');
      }

      const parsed = result.data;
      setShowImportarPedidoModal(false);

      const faltantes = parsed.camposFaltantes || [];

      // Tenta encontrar e pré-selecionar o aparelho do estoque por Código/ID, IMEI ou Modelo
      let matchedStockId = '';
      const disponiveis = aparelhos.filter(a => a.ativo !== false && a.condicao !== 'vendido' && (a as any).status !== 'vendido');
      const codAi = String(parsed.aparelho?.codigo || '').toLowerCase().replace(/\D/g, '');
      if (codAi) {
        const apMatch = disponiveis.find(a => getAparelhoCodigo(a).includes(codAi));
        if (apMatch) matchedStockId = apMatch.id;
      }
      if (!matchedStockId && parsed.aparelho?.imei) {
        const apMatch = disponiveis.find(a => a.imei && a.imei.toLowerCase() === parsed.aparelho.imei.toLowerCase());
        if (apMatch) matchedStockId = apMatch.id;
      }
      if (!matchedStockId && parsed.aparelho?.modelo) {
        const apMatch = disponiveis.find(a => `${a.marca} ${a.modelo}`.toLowerCase().includes(parsed.aparelho.modelo.toLowerCase()));
        if (apMatch) matchedStockId = apMatch.id;
      }

      if (faltantes.length > 0) {
        setAiParsedData(parsed);
        const apPreSel = matchedStockId ? disponiveis.find(a => a.id === matchedStockId) : null;
        setDadosFaltantesForm({
          clienteNome: parsed.cliente?.nome || '',
          clienteTelefone: parsed.cliente?.telefone || '',
          clienteEmail: parsed.cliente?.email || '',
          marca: apPreSel ? apPreSel.marca : parsed.aparelho?.marca || 'Apple',
          modelo: apPreSel ? apPreSel.modelo : parsed.aparelho?.modelo || '',
          capacidade: apPreSel ? (apPreSel.capacidade || '128GB') : parsed.aparelho?.capacidade || '128GB',
          cor: apPreSel ? (apPreSel.cor || '') : parsed.aparelho?.cor || '',
          condicao: (apPreSel ? apPreSel.condicao : parsed.aparelho?.condicao === 'novo' ? 'novo' : 'seminovo') as 'seminovo' | 'novo',
          imei: apPreSel ? (apPreSel.imei || apPreSel.numeroSerie || '') : parsed.aparelho?.imei || '',
          preco: apPreSel ? String(apPreSel.preco) : parsed.aparelho?.preco ? String(parsed.aparelho.preco) : parsed.valorTotal ? String(parsed.valorTotal) : '',
          custo: apPreSel ? String((apPreSel as any).custo || 0) : parsed.aparelho?.custo ? String(parsed.aparelho.custo) : '',
          vendedor: parsed.vendedor || posDados.vendedor || '',
          formaPagamento: parsed.formaPagamento || 'pix',
          dataVenda: parsed.dataVenda ? String(parsed.dataVenda).slice(0, 10) : new Date().toISOString().slice(0, 10),
          observacoes: parsed.observacoes || '',
        });
        setSelectedStockAparelhoId(matchedStockId);
        setShowDadosFaltantesModal(true);
      } else {
        await aplicarVendaAI(parsed);
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao processar texto por IA');
    } finally {
      setProcessingAiText(false);
    }
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

      const dataPagamentoFinalIso = (() => {
        if (!posDados.dataVenda) return new Date().toISOString();
        try {
          const str = String(posDados.dataVenda);
          const d = new Date(str.includes('T') ? str : `${str}T12:00:00`);
          return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
        } catch (e) {
          return new Date().toISOString();
        }
      })();

      const vendaDados = {
        clienteId: posDados.clienteId || null,
        clienteNome: posDados.clienteNome,
        vendedor: posDados.vendedor,
        tipoEntrega: posDados.tipoEntrega,
        itens: carrinho,
        valor: valorFinal,
        custo: custoTotal,
        lucro,
        percentualLucro,
        dataPagamento: dataPagamentoFinalIso,
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
        loja_id: usuario?.lojaId || null
      };

      let vendaSalva = null;

      if (editingId) {
        const { data, error } = await supabase
          .from('vendas')
          .update(vendaDados)
          .eq('id', editingId)
          .select()
          .single();
        if (error) throw error;
        vendaSalva = data;
      } else {
        const { data, error } = await supabase
          .from('vendas')
          .insert([vendaDados])
          .select()
          .single();
        if (error) throw error;
        vendaSalva = data;
      }

      const aparelhosIds = carrinho.map(item => item.aparelhoId).filter(Boolean);
      if (aparelhosIds.length > 0) {
        const { error: erroEstoque } = await supabase
          .from('aparelhos')
          .update({ ativo: false, condicao: 'vendido' }) 
          .in('id', aparelhosIds);
          
        if (erroEstoque) console.error('Erro ao dar baixa no estoque:', erroEstoque);
        await fetchAparelhos();
      }

       
      const clienteVenda = clientes.find(c => c.id === posDados.clienteId);
      
      if (clienteVenda && clienteVenda.email && clienteVenda.email !== 'sem@email.com') {
        
        // 1. Monta as linhas da tabela igualzinho a sua notinha A4
        const itensHtmlA4 = carrinho.map(item => `
          <tr>
            <td style="border: 1px solid #000; padding: 6px; text-align: left;">
              ${item.descricao} <br><small style="color: #666;">${item.observacao || ''}</small>
            </td>
            <td style="border: 1px solid #000; padding: 6px; text-align: center;">${item.quantidade}</td>
            <td style="border: 1px solid #000; padding: 6px; text-align: right;">R$ ${item.valorExibir.toFixed(2).replace('.', ',')}</td>
            <td style="border: 1px solid #000; padding: 6px; text-align: right;">R$ ${(item.desconto || 0).toFixed(2).replace('.', ',')}</td>
            <td style="border: 1px solid #000; padding: 6px; text-align: right; font-weight: bold;">R$ ${item.total.toFixed(2).replace('.', ',')}</td>
          </tr>
        `).join('');

        // 2. Monta o corpor do email com cara de Nota Fiscal Impressa
        const htmlDoRecibo = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <title>Recibo de Venda</title>
          </head>
          <body style="font-family: Arial, sans-serif; background-color: #f4f4f5; padding: 20px; color: #000;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #ccc; padding: 30px; border-radius: 4px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              
              <!-- Cabeçalho da Loja -->
              <div style="text-align: center; border-bottom: 2px dashed #000; padding-bottom: 15px; margin-bottom: 20px;">
                <h1 style="margin: 0; font-size: 22px; text-transform: uppercase;">${config?.nomeLoja || 'PHONE CENTER'}</h1>
                <p style="margin: 5px 0 0 0; font-size: 12px; color: #555;">Assistência Técnica e Vendas</p>
                <p style="margin: 2px 0 0 0; font-size: 12px; font-weight: bold;">RECIBO DE VENDA N° ${vendaSalva?.id ? vendaSalva.id.slice(-6).toUpperCase() : '000000'}</p>
              </div>

              <!-- Dados da Venda e Cliente -->
              <table style="width: 100%; margin-bottom: 20px; font-size: 13px; line-height: 1.5;">
                <tr>
                  <td style="width: 50%; vertical-align: top;">
                    <b>Cliente:</b> ${clienteVenda.nome}<br>
                    <b>Telefone:</b> ${clienteVenda.telefone || 'N/A'}<br>
                    <b>CPF:</b> ${clienteVenda.cpf || 'N/A'}
                  </td>
                  <td style="width: 50%; text-align: right; vertical-align: top;">
                    <b>Data:</b> ${new Date().toLocaleDateString('pt-BR')}<br>
                    <b>Vendedor:</b> ${posDados.vendedor || 'Padrão'}<br>
                    <b>Forma de Pagto:</b> ${posPagamento.pagamentos[0]?.metodo.toUpperCase().replace('_', ' ')}
                  </td>
                </tr>
              </table>

              <!-- Tabela de Produtos -->
              <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 20px;">
                <thead>
                  <tr style="background-color: #f0f0f0;">
                    <th style="border: 1px solid #000; padding: 8px; text-align: left;">Produto</th>
                    <th style="border: 1px solid #000; padding: 8px; text-align: center;">Qtd</th>
                    <th style="border: 1px solid #000; padding: 8px; text-align: right;">Vlr Unit.</th>
                    <th style="border: 1px solid #000; padding: 8px; text-align: right;">Desc.</th>
                    <th style="border: 1px solid #000; padding: 8px; text-align: right;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${itensHtmlA4}
                </tbody>
                <tfoot>
                  <tr>
                    <td colspan="4" style="border: 1px solid #000; padding: 10px; text-align: right; font-weight: bold; font-size: 14px;">TOTAL:</td>
                    <td style="border: 1px solid #000; padding: 10px; text-align: right; font-weight: bold; font-size: 14px;">R$ ${valorFinal.toFixed(2).replace('.', ',')}</td>
                  </tr>
                </tfoot>
              </table>

              <!-- Termos de Garantia (Igualzinho o seu) -->
              <div style="border: 1px solid #000; padding: 15px; font-size: 11px; margin-bottom: 20px; background-color: #fafafa;">
                <p style="margin: 0 0 8px 0; font-weight: bold; text-align: center; font-size: 13px;">TERMO DE GARANTIA</p>
                <p style="margin: 0 0 5px 0;">Garantia de <b>${posPagamento.garantia}</b> a partir da data da compra. Válida somente para serviços e peças fornecidos pela empresa.</p>
                <p style="margin: 0 0 3px 0;"><b>Esta garantia não cobre:</b></p>
                <ul style="margin: 0; padding-left: 20px;">
                  <li>Queda, umidade, líquidos ou danos acidentais;</li>
                  <li>Uso indevido, instalação incorreta ou violação do produto;</li>
                  <li>Abertura ou tentativa de conserto por terceiros não autorizados;</li>
                  <li>Não pode molhar e não pode abrir o aparelho.</li>
                </ul>
              </div>

              <div style="text-align: center; font-weight: bold; font-size: 14px; margin-top: 30px;">
                OBRIGADO PELA PREFERÊNCIA!
              </div>

            </div>
          </body>
          </html>
        `;

        // Envia o recibo em formato PDF em anexo no e-mail
        dispararEmailReciboComPdf(vendaSalva, clienteVenda);
      } else {
        console.log('Cliente sem email cadastrado. Pula envio de recibo por e-mail.');
      }

      const foiEdicao = Boolean(editingId);
      await carregarVendas();
      setShowSaleCelebration(true);
      playSaleSuccessSound();
      toast.success(foiEdicao ? 'Venda atualizada com sucesso.' : 'Venda finalizada com sucesso.');

      if (foiEdicao && vendaSalva) {
        setVendaEditadaNotinha(vendaSalva);
        setShowReenviarNotinhaPrompt(true);
      } else if (vendaSalva) {
        handleGerarReciboA4(vendaSalva);
      }

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
    setPosDados({ tipoVenda: 'Venda', clienteId: '', clienteNome: '', vendedor: '', tipoEntrega: 'Retirada', dataVenda: formatForDatetimeLocal() });
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
      dataVenda: formatForDatetimeLocal(venda.dataPagamento || (venda as any).created_at)
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

        toast.success('Venda excluída e estoque recuperado com sucesso.');
        await carregarVendas();
      } catch (error: any) {
        console.error('Erro ao excluir venda:', error);
        toast.error('Erro ao excluir venda: ' + (error?.message || 'Falha no servidor'));
      }
    }
  };

  // Função auxiliar para gerar o HTML do recibo A4
  const getReciboA4Html = (venda: Venda, clienteVenda?: Cliente, isForEmail: boolean = false, overrideStoreData?: any) => {
    const storeObj = overrideStoreData || {
      nome: config?.nomeLoja || 'Phone Center',
      endereco: config?.enderecoLoja || '',
      cnpj: config?.cnpjLoja || '',
      telefone: config?.telefoneLoja || '',
      email: config?.emailLoja || '',
      logo_url: config?.logoLoja || null,
      assinatura_url: config?.assinaturaLoja || null,
    };
    return generateReciboA4Html(venda, storeObj, clienteVenda, isForEmail);
  };

  const dispararEmailReciboComPdf = async (venda: Venda, clienteVenda: Cliente) => {
    try {
      const publicLink = `${window.location.origin}/recibo/${venda.id}`;
      const nomeLoja = config?.nomeLoja || 'Phone Center';
      const logoHtml = config?.logoLoja ? `<img src="${config.logoLoja}" style="max-height: 60px; margin-bottom: 12px; display: block; margin-left: auto; margin-right: auto;" />` : '';

      const emailCorpoHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
          <div style="text-align: center; margin-bottom: 20px;">
            ${logoHtml}
            <h2 style="color: #0f172a; margin: 0 0 6px 0; font-size: 20px;">${nomeLoja}</h2>
            <p style="color: #64748b; margin: 0; font-size: 13px;">Comprovante Digital de Venda #${venda.id.slice(-6).toUpperCase()}</p>
          </div>
          
          <div style="background-color: #f8fafc; padding: 18px; border-radius: 12px; border: 1px solid #cbd5e1; margin-bottom: 24px; font-size: 14px; color: #334155; line-height: 1.6;">
            <p style="margin: 0 0 10px 0;">Olá, <b>${clienteVenda.nome}</b>!</p>
            <p style="margin: 0 0 10px 0;">Obrigado por comprar na <b>${nomeLoja}</b>!</p>
            <p style="margin: 0;">Seu comprovante de venda digital e termo de garantia estão disponíveis para visualização e impressão a qualquer momento no botão abaixo:</p>
          </div>

          <div style="text-align: center; margin: 28px 0;">
            <a href="${publicLink}" target="_blank" style="display: inline-block; background-color: #059669; color: #ffffff; padding: 14px 28px; border-radius: 10px; font-weight: bold; text-decoration: none; font-size: 15px; box-shadow: 0 4px 6px -1px rgba(5, 150, 105, 0.2);">
              📱 Visualizar Recibo Digital Online
            </a>
          </div>

          <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 11px; color: #94a3b8; text-align: center;">
            Este e-mail foi enviado automaticamente por ${nomeLoja}. Por favor, mantenha este comprovante para efeito de garantia.
          </div>
        </div>
      `;

      await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          para: clienteVenda.email,
          assunto: `Recibo de Compra #${venda.id.slice(-6).toUpperCase()} - ${nomeLoja}`,
          mensagem: emailCorpoHtml,
        }),
      });
      return true;
    } catch (err) {
      console.error('Erro ao enviar e-mail:', err);
      return false;
    }
  };

  const handleReenviarRecibo = async (venda: Venda) => {
    if (!venda.clienteId) {
      toast.error('Cliente não associado a esta venda.');
      return;
    }
    const clienteVenda = clientes.find(c => c.id === venda.clienteId);
    if (!clienteVenda || !clienteVenda.email || clienteVenda.email === 'sem@email.com') {
      toast.error('Cliente sem e-mail cadastrado.');
      return;
    }

    const toastId = toast.loading('Enviando e-mail do recibo...');

    try {
      const ok = await dispararEmailReciboComPdf(venda, clienteVenda);
      if (ok) {
        toast.success('E-mail com recibo digital enviado com sucesso!', { id: toastId });
      } else {
        toast.error('Erro ao enviar e-mail.', { id: toastId });
      }
    } catch (error) {
      console.error('Erro ao reenviar recibo:', error);
      toast.error('Erro ao reenviar recibo.', { id: toastId });
    }
  };

  const handleCancelarVenda = async (venda: Venda) => {
    if (!window.confirm(`Tem certeza que deseja CANCELAR a venda ${venda.id.slice(-6).toUpperCase()}? Os itens serão devolvidos ao estoque.`)) return;
    await handleDelete(venda.id); // Reutiliza a lógica de exclusão que já devolve itens ao estoque
    toast.info(`Venda ${venda.id.slice(-6).toUpperCase()} cancelada e itens devolvidos ao estoque.`);
  };

  const handleTrocarItem = (venda: Venda) => {
    handleEdit(venda); // Abre o PDV em modo de edição
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
        const timeA = new Date((a as any).created_at || a.dataPagamento).getTime();
        const timeB = new Date((b as any).created_at || b.dataPagamento).getTime();
        comparison = timeA - timeB;
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

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

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
      // Busca dados completos da loja no banco ou do config
      let storeData = {
        nomeLoja: config?.nomeLoja || 'Phone Center',
        enderecoLoja: config?.enderecoLoja && config.enderecoLoja !== 'Endereço não configurado' ? config.enderecoLoja : '',
        cnpjLoja: config?.cnpjLoja && config.cnpjLoja !== 'Não informado' ? config.cnpjLoja : '',
        telefoneLoja: config?.telefoneLoja && config.telefoneLoja !== 'Não informado' ? config.telefoneLoja : '',
        emailLoja: config?.emailLoja || '',
        logoLoja: config?.logoLoja || null,
        assinaturaLoja: config?.assinaturaLoja || null,
      };

      const targetLojaId = (venda as any).loja_id || (venda as any).lojaId || usuario?.lojaId;
      let dbLoja: any = null;
      if (targetLojaId) {
        const { data: found } = await supabase
          .from('lojas')
          .select('*')
          .eq('id', targetLojaId)
          .maybeSingle();
        dbLoja = found;
      }
      if (!dbLoja) {
        const { data: fallbackLoja } = await supabase
          .from('lojas')
          .select('*')
          .limit(1)
          .maybeSingle();
        dbLoja = fallbackLoja;
      }

      if (dbLoja) {
        storeData = {
          nomeLoja: dbLoja.nome || storeData.nomeLoja,
          enderecoLoja: dbLoja.endereco || storeData.enderecoLoja,
          cnpjLoja: dbLoja.cnpj || storeData.cnpjLoja,
          telefoneLoja: dbLoja.telefone || storeData.telefoneLoja,
          emailLoja: dbLoja.email || storeData.emailLoja,
          logoLoja: dbLoja.logo_url || storeData.logoLoja,
          assinaturaLoja: dbLoja.assinatura_url || storeData.assinaturaLoja,
        };
      }

      const logoHtml = storeData.logoLoja ? `<img src="${storeData.logoLoja}" style="max-height: 54px; max-width: 130px; margin: 0 auto 8px auto; display: block;" />` : '';
      const assinaturaEmpresaUrl = storeData.assinaturaLoja;
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

      const formatarMetodoCupom = (m: string) => {
        const map: Record<string, string> = {
          pix: 'PIX',
          dinheiro: 'DINHEIRO',
          cartao_credito: 'CARTÃO DE CRÉDITO',
          cartao_debito: 'CARTÃO DE DÉBITO',
          parcelado: 'PARCELADO',
          outros: 'OUTROS',
        };
        return map[String(m || '').toLowerCase()] || String(m || 'PIX').toUpperCase();
      };

      const pagamentosCupomTexto = (venda as any).pagamentos && Array.isArray((venda as any).pagamentos) && (venda as any).pagamentos.length > 0
        ? (venda as any).pagamentos.map((p: any) => {
            const label = formatarMetodoCupom(p.metodo);
            const valorStr = p.valor ? ` R$ ${Number(p.valor).toFixed(2).replace('.', ',')}` : '';
            const parcStr = p.parcelas && p.parcelas > 1 ? ` (${p.parcelas}x)` : '';
            return `${label}${parcStr}${valorStr}`;
          }).join(' + ')
        : formatarMetodoCupom(venda.metodo || (venda as any).formaPagamento || 'PIX');

      const publicReceiptUrl = `${window.location.origin}/recibo/${venda.id}`;
      const qrData = encodeURIComponent(publicReceiptUrl);
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${qrData}`;

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
            <div class="bold" style="font-size: 16px;">${storeData.nomeLoja}</div>
            ${storeData.enderecoLoja ? `<div class="small">${storeData.enderecoLoja}</div>` : ''}
            ${(storeData.cnpjLoja || storeData.telefoneLoja) ? `<div class="small">${storeData.cnpjLoja ? `CNPJ: ${storeData.cnpjLoja}` : ''} ${storeData.telefoneLoja ? `| Tel: ${storeData.telefoneLoja}` : ''}</div>` : ''}
            <div class="small" style="margin-top: 2px;">Assistência Técnica e Vendas</div>
          </div>
          <div class="divider"></div>
          <div class="bold">RECIBO DE VENDA</div>
          <div class="small">Nº ${venda.id.slice(-6).toUpperCase()}</div>
          <div class="small">Data: ${new Date(venda.dataPagamento).toLocaleString('pt-BR')}</div>
          <div class="small">Cliente: ${venda.clienteNome || 'Não informado'}</div>
          <div class="small">Vendedor: ${venda.vendedor || 'Não informado'}</div>
          <div class="small">Forma(s) de Pagto: <b>${pagamentosCupomTexto}</b></div>
          <div class="divider"></div>
          ${itensHtml}
          <div class="divider"></div>
          <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: 700;">
            <span>TOTAL</span>
            <span>R$ ${(venda.valor || 0).toFixed(2).replace('.', ',')}</span>
          </div>
          ${(venda.descontoTotal && venda.descontoTotal > 0) ? `<div class="small" style="text-align: right;">Desconto: R$ ${venda.descontoTotal.toFixed(2).replace('.', ',')}</div>` : ''}
          <div class="divider"></div>
          <div class="center" style="margin: 10px 0;">
            <img src="${qrCodeUrl}" alt="QR Code" style="width: 130px; height: 130px; object-fit: contain; margin: 0 auto; display: block;" />
            <div class="small bold" style="margin-top: 4px;">Recibo Digital & Garantia Online</div>
            <div class="small" style="font-size: 9px; color: #444;">Escaneie o QR Code para acessar no celular</div>
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
      const clienteVenda = clientes.find(c => c.id === venda.clienteId);
      
      let storeData = {
        nomeLoja: config?.nomeLoja || 'Phone Center',
        enderecoLoja: config?.enderecoLoja && config.enderecoLoja !== 'Endereço não configurado' ? config.enderecoLoja : '',
        cnpjLoja: config?.cnpjLoja && config.cnpjLoja !== 'Não informado' ? config.cnpjLoja : '',
        telefoneLoja: config?.telefoneLoja && config.telefoneLoja !== 'Não informado' ? config.telefoneLoja : '',
        emailLoja: config?.emailLoja || '',
        logoLoja: config?.logoLoja || null,
        assinaturaLoja: config?.assinaturaLoja || null,
      };

      const targetLojaId = (venda as any).loja_id || (venda as any).lojaId || usuario?.lojaId;
      let dbLoja: any = null;
      if (targetLojaId) {
        const { data: found } = await supabase
          .from('lojas')
          .select('*')
          .eq('id', targetLojaId)
          .maybeSingle();
        dbLoja = found;
      }
      if (!dbLoja) {
        const { data: fallbackLoja } = await supabase
          .from('lojas')
          .select('*')
          .limit(1)
          .maybeSingle();
        dbLoja = fallbackLoja;
      }

      if (dbLoja) {
        storeData = {
          nomeLoja: dbLoja.nome || storeData.nomeLoja,
          enderecoLoja: dbLoja.endereco || storeData.enderecoLoja,
          cnpjLoja: dbLoja.cnpj || storeData.cnpjLoja,
          telefoneLoja: dbLoja.telefone || storeData.telefoneLoja,
          emailLoja: dbLoja.email || storeData.emailLoja,
          logoLoja: dbLoja.logo_url || storeData.logoLoja,
          assinaturaLoja: dbLoja.assinatura_url || storeData.assinaturaLoja,
        };
      }

      const conteudoHtml = getReciboA4Html(venda, clienteVenda, false, storeData);

      const printWindow = window.open('', '_blank');
      if (printWindow) { 
        printWindow.document.write(conteudoHtml); 
        printWindow.document.close(); 
      } else { 
        alert("Por favor, permita pop-ups no navegador para imprimir o comprovante."); 
      }
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
          <div className="scroll-row w-full pb-1">
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
              <Upload className="mr-1.5 h-4 w-4" />
              Importar CSV
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowImportarPedidoModal(true)}
              className="h-9 text-xs sm:text-sm shrink-0 whitespace-nowrap"
            >
              <FileInput className="mr-1.5 h-4 w-4" />
              Importar Pedido
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 items-center">
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

                    {/* Data e Horário em 2 Campos Compactos para não Cortar */}
                    <div className="flex gap-1.5 shrink-0 items-center">
                      <input 
                        type="date" 
                        title="Data da Venda"
                        className="input-glass text-xs h-11 w-[125px] shrink-0 px-2"
                        value={posDados.dataVenda ? posDados.dataVenda.split('T')[0] : new Date().toISOString().split('T')[0]}
                        onChange={e => {
                          const novaData = e.target.value;
                          const horaAtual = posDados.dataVenda && posDados.dataVenda.includes('T') 
                            ? posDados.dataVenda.split('T')[1].slice(0, 5) 
                            : new Date().toTimeString().slice(0, 5);
                          setPosDados({ ...posDados, dataVenda: `${novaData}T${horaAtual}` });
                        }}
                      />
                      <input 
                        type="time" 
                        title="Horário da Venda"
                        className="input-glass text-xs h-11 w-[85px] shrink-0 px-1.5"
                        value={posDados.dataVenda && posDados.dataVenda.includes('T') 
                          ? posDados.dataVenda.split('T')[1].slice(0, 5) 
                          : new Date().toTimeString().slice(0, 5)}
                        onChange={e => {
                          const novaHora = e.target.value;
                          const dataAtual = posDados.dataVenda 
                            ? posDados.dataVenda.split('T')[0] 
                            : new Date().toISOString().split('T')[0];
                          setPosDados({ ...posDados, dataVenda: `${dataAtual}T${novaHora}` });
                        }}
                      />
                    </div>
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
                        <ProdutoCombobox
                          aparelhos={aparelhos}
                          value={posItem.aparelhoId}
                          onChange={(aparelhoId) => {
                            const aparelho = aparelhos.find(a => a.id === aparelhoId);
                            const custo = resolveAparelhoCusto(aparelho);
                            setPosItem({
                              ...posItem,
                              aparelhoId,
                              descricao: aparelho ? `${aparelho.marca} ${aparelho.modelo}` : '',
                              valorExibir: aparelho ? aparelho.preco : 0,
                              valorInterno: aparelho ? custo : 0
                            });
                          }}
                        />
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
                              className="input-glass bg-slate-950/80 text-white border border-white/20 focus:bg-slate-950 focus:text-white"
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
                              className="input-glass font-bold text-emerald-400 bg-slate-950/90 border border-white/20 focus:bg-slate-950 focus:text-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                              placeholder="0,00"
                              value={formatCurrencyField(pagamento.valor || 0)}
                              onChange={(e) => handleUpdatePagamento(pagamento.id, { valor: parseCurrencyField(e.target.value) })}
                            />
                          </div>
                          <div>
                            <label className="text-[11px] text-gray-500 ml-1">Parcelas</label>
                            <select
                              className="input-glass bg-slate-950/80 text-white border border-white/20 focus:bg-slate-950 focus:text-white"
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

        {/* Tabela de Vendas e Filtros Integrados */}
        <GlassCard className="rounded-3xl p-4 sm:p-6 space-y-4">
          {/* Cabeçalho + Barra de Filtros Resumida */}
          <div className="flex flex-col gap-3 pb-4 border-b border-white/10">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base sm:text-lg font-bold">Vendas Registradas</h3>
                <p className="text-xs sm:text-sm text-muted-foreground">{vendasFiltradas.length} de {vendas.length} vendas registradas</p>
              </div>

              {/* Ações Rápidas de Filtro */}
              <div className="flex items-center gap-2">
                {(filtroBusca || filtroStatus || filtroMetodo || filtroVendedor || filtroDataInicio || filtroDataFim || ordenarPor !== 'data' || direcaoOrdenacao !== 'desc') && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
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
                    className="text-xs text-red-400 hover:text-red-300 h-8 px-2.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-1" />
                    Limpar
                  </Button>
                )}
                <Button
                  type="button"
                  variant={mostrarFiltrosAvancados ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setMostrarFiltrosAvancados(!mostrarFiltrosAvancados)}
                  className="text-xs h-8"
                >
                  <Filter className="w-3.5 h-3.5 mr-1" />
                  {mostrarFiltrosAvancados ? 'Ocultar Filtros' : 'Filtros Avançados'}
                </Button>
              </div>
            </div>

            {/* Linha Principal de Filtros Rápidos */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              <div className="relative lg:col-span-2">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Buscar cliente, IMEI, item, vendedor ou valor..."
                  value={filtroBusca}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFiltroBusca(e.target.value)}
                  className="input-glass pl-9 text-xs h-9 w-full"
                />
              </div>

              <select
                className="input-glass text-xs h-9 w-full"
                value={filtroStatus}
                onChange={(e) => setFiltroStatus(e.target.value)}
              >
                <option value="">Todos os status</option>
                <option value="pago">Pago</option>
                <option value="pendente">Pendente</option>
                <option value="cancelado">Cancelado</option>
              </select>

              <select
                className="input-glass text-xs h-9 w-full"
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
            </div>

            {/* Painel Expansível de Filtros Avançados */}
            {mostrarFiltrosAvancados && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-2 border-t border-white/5 animate-in fade-in slide-in-from-top-1 duration-200">
                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1">Vendedor</label>
                  <input
                    type="text"
                    placeholder="Nome do vendedor..."
                    value={filtroVendedor}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFiltroVendedor(e.target.value)}
                    className="input-glass text-xs h-9 w-full"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1">Período De</label>
                  <input
                    type="date"
                    value={filtroDataInicio}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFiltroDataInicio(e.target.value)}
                    className="input-glass text-xs h-9 w-full"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1">Até</label>
                  <input
                    type="date"
                    value={filtroDataFim}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFiltroDataFim(e.target.value)}
                    className="input-glass text-xs h-9 w-full"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1">Ordenar por</label>
                  <div className="flex gap-1">
                    <select
                      className="input-glass text-xs h-9 flex-1"
                      value={ordenarPor}
                      onChange={(e) => setOrdenarPor(e.target.value as any)}
                    >
                      <option value="data">Data</option>
                      <option value="cliente">Cliente</option>
                      <option value="valor">Valor</option>
                      <option value="lucro">Lucro</option>
                      <option value="status">Status</option>
                      <option value="metodo">Método</option>
                    </select>
                    <select
                      className="input-glass text-xs h-9 shrink-0 w-24"
                      value={direcaoOrdenacao}
                      onChange={(e) => setDirecaoOrdenacao(e.target.value as any)}
                    >
                      <option value="desc">Decres.</option>
                      <option value="asc">Cresc.</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-white/10">
                  <tr className="text-xs sm:text-sm text-left">
                    <th className="py-3 px-2">ID</th>
                    <th className="py-3 px-2 hidden md:table-cell">Data & Horário</th>
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
                      <td className="py-3 px-2 font-mono text-xs text-blue-400 font-bold">#{venda.id ? venda.id.slice(-6).toUpperCase() : 'N/A'}</td>
                      <td className="py-3 px-2 hidden md:table-cell text-xs text-muted-foreground whitespace-nowrap">
                        {new Date((venda as any).created_at || venda.dataPagamento).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                      <td className="py-3 px-2 font-medium">{venda.clienteNome}</td>
                      <td className="py-3 px-2 hidden sm:table-cell text-muted-foreground">{venda.itens && venda.itens.length > 0 ? `${venda.itens.length} itens` : venda.descricao}</td>
                      <td className="py-3 px-2 text-right font-bold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(venda.valor)}</td>
                      <td className="py-3 px-2 text-right hidden sm:table-cell text-green-600 font-medium">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(venda.lucro)}</td>
                      <td className="py-3 px-2 hidden sm:table-cell text-xs">{metodoLabel(venda.metodo)}</td>
                      <td className="py-3 px-2">
                        <Badge variant={venda.status === 'pago' ? 'default' : venda.status === 'pendente' ? 'secondary' : 'outline'} className="text-xs">
                          {venda.status === 'pago' ? 'Pago' : venda.status === 'pendente' ? 'Pendente' : 'Cancelado'}
                        </Badge>
                      </td>
                      <td className="py-3 px-2 text-right">
                        <div className="flex gap-2 justify-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              <DropdownMenuItem onClick={() => handleEdit(venda)}>
                                <Edit className="mr-2 h-4 w-4 text-blue-400" />
                                Editar Venda
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => { const c = clientes.find(cl => cl.nome === venda.clienteNome); if(c) window.open(`https://wa.me/55${c.telefone.replace(/\D/g, '')}`, '_blank'); }}>
                                <MessageCircle className="mr-2 h-4 w-4 text-emerald-400" />
                                Chamar no WhatsApp
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleGerarCupomTermico(venda)}>
                                <Printer className="mr-2 h-4 w-4" />
                                Cupom Térmico
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleGerarReciboA4(venda)}>
                                <FileText className="mr-2 h-4 w-4" />
                                Recibo A4
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleReenviarRecibo(venda)}>
                                <Mail className="mr-2 h-4 w-4" />
                                Reenviar Recibo
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleTrocarItem(venda)}>
                                <Repeat className="mr-2 h-4 w-4" />
                                Trocar Item
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleCancelarVenda(venda)}
                                className="text-red-600 focus:bg-red-500/10 focus:text-red-600"
                              >
                                <XCircle className="mr-2 h-4 w-4" />
                                Cancelar Venda
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
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

      {/* Modal Prompt de Reenvio de Notinha pós Edição */}
      {isClient && showReenviarNotinhaPrompt && vendaEditadaNotinha && createPortal(
        <div className="modal-overlay modal-overlay-fit z-[70]">
          <GlassCard className="modal-panel modal-panel-fit modal-panel-md w-full my-4">
            <div className="modal-header">
              <h3 className="modal-title flex items-center gap-2 text-blue-400 font-bold">
                <FileText className="w-5 h-5 text-blue-500" /> Venda Alterada com Sucesso!
              </h3>
              <Button variant="ghost" size="icon" onClick={() => setShowReenviarNotinhaPrompt(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="modal-body-scroll p-6 space-y-4 text-center">
              <p className="text-sm font-medium">
                Os dados da venda <span className="font-mono text-blue-400 font-bold">#{vendaEditadaNotinha.id ? vendaEditadaNotinha.id.slice(-6).toUpperCase() : ''}</span> foram atualizados no sistema.
              </p>
              <p className="text-xs text-muted-foreground">
                Deseja gerar ou reenviar a notinha com as novas informações para o cliente <strong className="text-white">{vendaEditadaNotinha.clienteNome}</strong>?
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
                <Button
                  type="button"
                  onClick={() => {
                    handleGerarCupomTermico(vendaEditadaNotinha);
                    setShowReenviarNotinhaPrompt(false);
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-xs font-bold"
                >
                  <Printer className="w-4 h-4 mr-1" /> Cupom Térmico
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    handleGerarReciboA4(vendaEditadaNotinha);
                    setShowReenviarNotinhaPrompt(false);
                  }}
                  className="bg-indigo-600 hover:bg-indigo-700 text-xs font-bold"
                >
                  <FileText className="w-4 h-4 mr-1" /> Recibo A4
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    handleReenviarRecibo(vendaEditadaNotinha);
                    setShowReenviarNotinhaPrompt(false);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-xs font-bold"
                >
                  <Mail className="w-4 h-4 mr-1" /> WhatsApp / Email
                </Button>
              </div>
            </div>

            <div className="flex justify-end p-4 border-t border-white/10">
              <Button variant="outline" size="sm" onClick={() => setShowReenviarNotinhaPrompt(false)}>
                Concluir sem Reenviar
              </Button>
            </div>
          </GlassCard>
        </div>,
        document.body
      )}

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

      {/* Modal Importar Pedido via Groq IA */}
      {isClient && showImportarPedidoModal && createPortal(
        <div className="modal-overlay modal-overlay-fit z-[60]">
          <GlassCard className="modal-panel modal-panel-fit modal-panel-md w-full my-4">
            <div className="modal-header">
              <div>
                <h3 className="modal-title flex items-center gap-2 text-blue-400 font-bold">
                  <Sparkles className="w-5 h-5 text-blue-400 animate-pulse" /> Venda por Texto Inteligente (Groq IA)
                </h3>
                <p className="modal-subtitle">
                  Cole qualquer texto de venda (mensagens do WhatsApp, formulários ou anotações) para gerar a venda automaticamente.
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setShowImportarPedidoModal(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="modal-body-scroll">
              <form onSubmit={(e) => { e.preventDefault(); handleProcessarTextoVenda(); }} className="space-y-4">
                <textarea
                  className="input-glass min-h-[220px] font-sans text-sm p-3 border-blue-500/20 focus:border-blue-500"
                  placeholder="Ex: Vendi um iPhone 13 Pro 128GB Grafite IMEI 358921098492041 para o cliente Carlos Silva por R$ 3.500 no Pix pelo vendedor Lucas..."
                  value={textoPedido}
                  onChange={(e) => setTextoPedido(e.target.value)}
                  disabled={processingAiText}
                  required
                />
                <div className="flex gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setShowImportarPedidoModal(false)}
                    disabled={processingAiText}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={processingAiText}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 font-bold gap-2 shadow-lg shadow-blue-500/20"
                  >
                    {processingAiText ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Lendo texto com IA...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" /> Processar e Gerar Venda
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </div>
          </GlassCard>
        </div>,
        document.body
      )}

      {/* Modal Popup de Preenchimento de Dados Faltantes */}
      {isClient && showDadosFaltantesModal && createPortal(
        <div className="modal-overlay modal-overlay-fit z-[75]">
          <GlassCard className="modal-panel modal-panel-fit modal-panel-md w-full max-w-xl my-4 border-amber-500/30">
            <div className="modal-header bg-amber-500/10 border-b border-amber-500/20">
              <div>
                <h3 className="modal-title flex items-center gap-2 text-amber-400 font-bold">
                  <AlertCircle className="w-5 h-5 text-amber-400 animate-bounce" />
                  Dados Pendentes para Concluir Venda
                </h3>
                <p className="modal-subtitle text-slate-300">
                  A IA leu seu texto, mas identificou que faltam informações cruciais. Preencha abaixo para finalizar:
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setShowDadosFaltantesModal(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="modal-body-scroll p-4 space-y-4">
              {/* Opção de Seleção de Aparelho do Estoque */}
              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl space-y-1.5">
                <label className="text-xs font-bold text-blue-400 uppercase flex items-center gap-1.5">
                  <ShoppingCart className="w-4 h-4" /> Selecionar Aparelho do Estoque (Opcional)
                </label>
                <ComboboxAparelhos
                  aparelhos={aparelhos.filter(a => a.ativo !== false && a.condicao !== 'vendido' && (a as any).status !== 'vendido')}
                  value={selectedStockAparelhoId}
                  onChange={(selectedId) => {
                    setSelectedStockAparelhoId(selectedId);
                    if (selectedId) {
                      const ap = aparelhos.find(a => a.id === selectedId);
                      if (ap) {
                        setDadosFaltantesForm(prev => ({
                          ...prev,
                          marca: ap.marca,
                          modelo: ap.modelo,
                          capacidade: ap.capacidade || '128GB',
                          cor: ap.cor || '',
                          imei: ap.imei || ap.numeroSerie || '',
                          preco: String(ap.preco),
                          custo: String((ap as any).custo || 0)
                        }));
                      }
                    }
                  }}
                />
              </div>

              {/* Formulário de Preenchimento Manual Rápido */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-300">Nome do Cliente</label>
                  <input
                    type="text"
                    className="input-glass mt-1"
                    placeholder="Ex: Carlos Silva"
                    value={dadosFaltantesForm.clienteNome}
                    onChange={e => setDadosFaltantesForm({...dadosFaltantesForm, clienteNome: e.target.value})}
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300">Telefone Cliente</label>
                  <input
                    type="tel"
                    className="input-glass mt-1"
                    placeholder="Ex: 31999998888"
                    value={dadosFaltantesForm.clienteTelefone}
                    onChange={e => setDadosFaltantesForm({...dadosFaltantesForm, clienteTelefone: e.target.value})}
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300">E-mail do Cliente (Para envio de recibo)</label>
                  <input
                    type="email"
                    className="input-glass mt-1"
                    placeholder="Ex: cliente@email.com"
                    value={dadosFaltantesForm.clienteEmail}
                    onChange={e => setDadosFaltantesForm({...dadosFaltantesForm, clienteEmail: e.target.value})}
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                    <span>Modelo do Celular <span className="text-red-400">*</span></span>
                    {aiParsedData?.camposFaltantes?.includes('modelo') && (
                      <span className="text-amber-400 text-[10px] font-mono">⚠️ FALTANDO</span>
                    )}
                  </label>
                  <input
                    type="text"
                    required
                    className="input-glass mt-1"
                    placeholder="Ex: iPhone 13 Pro"
                    value={dadosFaltantesForm.modelo}
                    onChange={e => setDadosFaltantesForm({...dadosFaltantesForm, modelo: e.target.value})}
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                    <span>Capacidade GB <span className="text-red-400">*</span></span>
                    {aiParsedData?.camposFaltantes?.includes('capacidade') && (
                      <span className="text-amber-400 text-[10px] font-mono">⚠️ FALTANDO</span>
                    )}
                  </label>
                  <select
                    className="input-glass mt-1"
                    value={dadosFaltantesForm.capacidade}
                    onChange={e => setDadosFaltantesForm({...dadosFaltantesForm, capacidade: e.target.value})}
                  >
                    <option value="64GB">64GB</option>
                    <option value="128GB">128GB</option>
                    <option value="256GB">256GB</option>
                    <option value="512GB">512GB</option>
                    <option value="1TB">1TB</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300">Condição do Aparelho</label>
                  <select
                    className="input-glass mt-1 font-semibold text-emerald-400"
                    value={dadosFaltantesForm.condicao}
                    onChange={e => setDadosFaltantesForm({...dadosFaltantesForm, condicao: e.target.value as 'seminovo' | 'novo'})}
                  >
                    <option value="seminovo">Seminovo</option>
                    <option value="novo">Novo / Lacrado</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300">Cor do Aparelho</label>
                  <input
                    type="text"
                    className="input-glass mt-1"
                    placeholder="Ex: Grafite, Preto, Azul, Dourado..."
                    value={dadosFaltantesForm.cor}
                    onChange={e => setDadosFaltantesForm({...dadosFaltantesForm, cor: e.target.value})}
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300">IMEI / Nº de Série (Opcional)</label>
                  <input
                    type="text"
                    className="input-glass mt-1 font-mono"
                    placeholder="Ex: 358921098492041"
                    value={dadosFaltantesForm.imei}
                    onChange={e => setDadosFaltantesForm({...dadosFaltantesForm, imei: e.target.value})}
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                    <span>Valor Total (R$) <span className="text-red-400">*</span></span>
                    {aiParsedData?.camposFaltantes?.includes('valorTotal') && (
                      <span className="text-amber-400 text-[10px] font-mono">⚠️ FALTANDO</span>
                    )}
                  </label>
                  <input
                    type="number"
                    required
                    className="input-glass mt-1 font-bold text-emerald-400"
                    placeholder="Ex: 3500"
                    value={dadosFaltantesForm.preco}
                    onChange={e => setDadosFaltantesForm({...dadosFaltantesForm, preco: e.target.value})}
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                    <span>Forma de Pagamento <span className="text-red-400">*</span></span>
                    {aiParsedData?.camposFaltantes?.includes('formaPagamento') && (
                      <span className="text-amber-400 text-[10px] font-mono">⚠️ FALTANDO</span>
                    )}
                  </label>
                  <select
                    className="input-glass mt-1"
                    value={dadosFaltantesForm.formaPagamento}
                    onChange={e => setDadosFaltantesForm({...dadosFaltantesForm, formaPagamento: e.target.value})}
                  >
                    <option value="pix">Pix</option>
                    <option value="dinheiro">Dinheiro</option>
                    <option value="cartao_credito">Cartão de Crédito</option>
                    <option value="cartao_debito">Cartão de Débito</option>
                    <option value="parcelado">Parcelado</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                    <span>Data da Venda <span className="text-red-400">*</span></span>
                    {aiParsedData?.camposFaltantes?.includes('dataVenda') && (
                      <span className="text-amber-400 text-[10px] font-mono">⚠️ FALTANDO</span>
                    )}
                  </label>
                  <input
                    type="date"
                    required
                    className="input-glass mt-1"
                    value={dadosFaltantesForm.dataVenda}
                    onChange={e => setDadosFaltantesForm({...dadosFaltantesForm, dataVenda: e.target.value})}
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300">Vendedor</label>
                  <select
                    className="input-glass mt-1"
                    value={dadosFaltantesForm.vendedor}
                    onChange={e => setDadosFaltantesForm({...dadosFaltantesForm, vendedor: e.target.value})}
                  >
                    <option value="">Vendedor</option>
                    {tecnicos.map(t => <option key={t.id} value={t.nome}>{t.nome}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex gap-2 pt-3 border-t border-white/10">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setShowDadosFaltantesModal(false)}>
                  Cancelar
                </Button>
                <Button
                  type="button"
                  className="flex-1 bg-green-600 hover:bg-green-700 font-bold shadow-lg shadow-green-500/20"
                  onClick={async () => {
                    if (!dadosFaltantesForm.modelo || !dadosFaltantesForm.preco || !dadosFaltantesForm.dataVenda) {
                      toast.error('Preencha a Data da Venda, modelo e valor do aparelho!');
                      return;
                    }
                    setShowDadosFaltantesModal(false);
                    await aplicarVendaAI({
                      cliente: {
                        nome: dadosFaltantesForm.clienteNome,
                        telefone: dadosFaltantesForm.clienteTelefone,
                        email: dadosFaltantesForm.clienteEmail,
                      },
                      aparelho: {
                        marca: dadosFaltantesForm.marca,
                        modelo: dadosFaltantesForm.modelo,
                        capacidade: dadosFaltantesForm.capacidade,
                        cor: dadosFaltantesForm.cor,
                        condicao: dadosFaltantesForm.condicao,
                        imei: dadosFaltantesForm.imei,
                        preco: Number(dadosFaltantesForm.preco),
                        custo: Number(dadosFaltantesForm.custo),
                      },
                      vendedor: dadosFaltantesForm.vendedor,
                      formaPagamento: dadosFaltantesForm.formaPagamento,
                      valorTotal: Number(dadosFaltantesForm.preco),
                      dataVenda: dadosFaltantesForm.dataVenda,
                      observacoes: dadosFaltantesForm.observacoes,
                    });
                  }}
                >
                  Confirmar e Gerar Venda
                </Button>
              </div>
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
