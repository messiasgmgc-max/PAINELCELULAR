'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { DollarSign, TrendingUp, TrendingDown, Calendar, Plus, Search, X, Printer, ShoppingCart, User, Truck, CreditCard, Trash2, Save, Ban, MessageCircle, FileText, Download, Upload, Mail, XCircle, MoreVertical, FileInput, Repeat, ChevronDown, Filter, RotateCcw, Edit, AlertCircle, Loader2, Sparkles, Camera, Smartphone, ShieldCheck, Undo2, PackageCheck, FileSpreadsheet } from 'lucide-react';
import { BarcodeScannerModal } from '@/components/BarcodeScannerModal';
import { NovoAparelhoRapidoModal } from '@/components/vendas/components/NovoAparelhoRapidoModal';
import { desfazerCadastroRapido, type PayloadCadastroRapido } from '@/lib/pdv/cadastroRapido';
import { registrarVendaAtomica } from '@/lib/vendas/vendaAtomica';
import { ModalPortal } from '@/components/ModalPortal';
import { EditarVendaRegistroModal, VendaEditavelData } from '@/components/EditarVendaRegistroModal';
import { VincularVendidoModal } from '@/components/VincularVendidoModal';
import { useClientes } from '@/hooks/useClientes';
import { useAparelhos } from '@/hooks/useAparelhos';
import { useTecnicos } from '@/hooks/useTecnicos';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/hooks/useAuth';
import { useStoreConfig } from '@/hooks/useStoreConfig';
import { Aparelho, Cliente, Venda, VendaItem } from '@/lib/db/types';
import { cn, canViewFinancials, getAparelhoCodigo, obterDataHoraVenda, getVendaDataExibicao, extrairAparelhoEImeiDaVenda } from '@/lib/utils';
import { condicaoAoDevolver, limparObservacoesDeVenda } from '@/lib/vendasDevolucao';
import { estaNoEstoque, patchRestauracao, patchSaida, type EstadoCicloAparelho } from '@/lib/estoque/ciclo';
import { aplicarMudancaEstoque, gerarLoteId, registrarEntradaEstoque } from '@/lib/estoque/movimentacoes';
import { toast } from 'sonner';
import { registrarLog } from '@/lib/logger';
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

/**
 * O aparelho conta como estoque disponível? (`Aparelho` é interface sem index
 * signature, por isso a conversão para o tipo do helper do ciclo.)
 */
const aparelhoNoEstoque = (a: Aparelho): boolean => estaNoEstoque(a as unknown as EstadoCicloAparelho);

/** A mudança no estoque já foi aplicada; só avisa que a trilha de auditoria ficou incompleta. */
function avisarAuditoriaPendente(
  resultado: { auditoriaRegistrada: boolean; erroAuditoria?: string },
  acao: string
) {
  if (resultado.auditoriaRegistrada) return;
  toast.warning(`${acao}, mas a auditoria do estoque não foi gravada inteira. Avise o suporte.`, {
    description: resultado.erroAuditoria,
  });
}

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
  onCadastrarNovo,
}: {
  aparelhos: Aparelho[];
  value: string;
  onChange: (aparelhoId: string) => void;
  onCadastrarNovo?: (termo: string) => void;
}) {
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
  const selecionado = aparelhos.find(a => a.id === value);

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
              <span>🔗 Buscar também aparelhos já baixados/vendidos sem cliente vinculado</span>
            </label>
          </div>

          <div className="overflow-y-auto divide-y divide-white/5 text-xs font-mono flex-1 max-h-64">
            {filtrados.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground text-xs font-sans space-y-2">
                <p>Nenhum aparelho encontrado com "{searchTerm}".</p>
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
                    <Plus className="h-3.5 w-3.5" /> Cadastrar "{searchTerm.trim()}"
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

const ComboboxAparelhos = ProdutoCombobox;

export function VendasTab({ isSidebarCollapsed = false, setSidebarCollapsed }: VendasTabProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isVendasRoute = pathname === '/vendas';
  const { usuario } = useAuth();
  const { config } = useStoreConfig();
  const { clientes, fetchClientes, criarCliente } = useClientes();
  const { aparelhos, fetchAparelhos, criarAparelho } = useAparelhos();
  const { tecnicos, fetchTecnicos } = useTecnicos();

  const [vendas, setVendas] = useState<Venda[]>([]);
  const [filtroCanal, setFiltroCanal] = useState<'varejo' | 'pendentes' | 'atacado' | 'todos'>('varejo');
  const [showVincularVendidoModal, setShowVincularVendidoModal] = useState(false);
  const [filtroBusca, setFiltroBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<string>('');
  const [filtroMetodo, setFiltroMetodo] = useState<string>('');
  const [filtroVendedor, setFiltroVendedor] = useState<string>('');
  // Abre filtrando só o mês corrente: com milhares de vendas, carregar tudo de
  // cara deixa a tabela pesada e enterra o que o lojista precisa ver no dia a dia.
  const [filtroPeriodo, setFiltroPeriodo] = useState<'mes' | 'todos'>('mes');
  const [filtroDataInicio, setFiltroDataInicio] = useState('');
  const [filtroDataFim, setFiltroDataFim] = useState('');
  const [ordenarPor, setOrdenarPor] = useState<'data' | 'cliente' | 'valor' | 'lucro' | 'status' | 'metodo'>('data');
  const [direcaoOrdenacao, setDirecaoOrdenacao] = useState<'asc' | 'desc'>('desc');
  const [mostrarFiltrosAvancados, setMostrarFiltrosAvancados] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showPOS, setShowPOS] = useState(false);
  const [closingPOS, setClosingPOS] = useState(false);
  const [showSaleCelebration, setShowSaleCelebration] = useState(false);
  const [savingVenda, setSavingVenda] = useState(false);
  const [showNovoCliente, setShowNovoCliente] = useState(false);
  const [showNovoAparelho, setShowNovoAparelho] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  // A câmera do PDV é uma instância só (o leitor usa um id fixo): o alvo diz para onde vai a leitura.
  const [scannerAlvo, setScannerAlvo] = useState<'item' | 'novoAparelho'>('item');
  const [codigoParaCadastro, setCodigoParaCadastro] = useState<{ valor: string; seq: number } | null>(null);
  const [cadastroRapidoInicial, setCadastroRapidoInicial] = useState<{ identificador?: string; modelo?: string } | null>(null);

  // Estados de Trade-In / Aparelho na Troca
  interface TradeInVendaInfo {
    avaliacaoId?: string;
    modelo: string;
    capacidade: string;
    valor: number;
    cor?: string;
    imei?: string;
    bateria?: number;
  }
  const [tradeInVenda, setTradeInVenda] = useState<TradeInVendaInfo | null>(null);
  const [showTradeInModal, setShowTradeInModal] = useState(false);
  const [avaliacoesUpgradeDisponiveis, setAvaliacoesUpgradeDisponiveis] = useState<any[]>([]);
  const [carregandoAvaliacoesTradeIn, setCarregandoAvaliacoesTradeIn] = useState(false);
  const [abaModalTradeIn, setAbaModalTradeIn] = useState<'avaliacoes' | 'manual'>('avaliacoes');

  // Formulário manual de Trade-In
  const [modeloTradeInManual, setModeloTradeInManual] = useState('iPhone 12');
  const [capacidadeTradeInManual, setCapacidadeTradeInManual] = useState('128GB');
  const [valorTradeInManual, setValorTradeInManual] = useState<number>(1500);
  const [imeiTradeInManual, setImeiTradeInManual] = useState('');
  const [bateriaTradeInManual, setBateriaTradeInManual] = useState<number>(85);

  const carregarAvaliacoesParaTradeIn = async () => {
    try {
      setCarregandoAvaliacoesTradeIn(true);
      const targetLojaId = usuario?.lojaId || (usuario as any)?.loja_id;
      let q = supabase
        .from('avaliacoes_upgrade')
        .select('*')
        .in('status', ['pendente', 'em_negociacao', 'aprovado'])
        .order('created_at', { ascending: false });

      if (targetLojaId) {
        q = q.or(`loja_id.eq.${targetLojaId},loja_id.is.null`);
      }

      const { data, error } = await q;
      if (!error && data) {
        setAvaliacoesUpgradeDisponiveis(data);
      }
    } catch (e) {
      console.warn('Erro ao carregar avaliações para trade-in:', e);
    } finally {
      setCarregandoAvaliacoesTradeIn(false);
    }
  };

  const handleAbrirModalTradeIn = () => {
    carregarAvaliacoesParaTradeIn();
    setShowTradeInModal(true);
  };

  const aplicarTradeInNaVenda = (info: TradeInVendaInfo) => {
    setTradeInVenda(info);

    setPosPagamento((prev) => {
      const temTradeIn = prev.pagamentos.some((p) => p.metodo === ('trade_in' as any));
      if (temTradeIn) {
        return {
          ...prev,
          pagamentos: prev.pagamentos.map((p) =>
            p.metodo === ('trade_in' as any) ? { ...p, valor: info.valor } : p
          ),
        };
      } else {
        return {
          ...prev,
          pagamentos: [
            ...prev.pagamentos,
            createPagamentoItem({ metodo: 'trade_in' as any, valor: info.valor, parcelas: 1 }),
          ],
        };
      }
    });

    setShowTradeInModal(false);
    toast.success(`Aparelho na troca (${info.modelo} ${info.capacidade}) aplicado! Entrada: R$ ${info.valor.toFixed(2)}`);
  };

  const selecionarAparelhoPorCodigo = (codeScanned: string) => {
    const codeClean = codeScanned.trim().toLowerCase();
    const aparelhoEncontrado = aparelhos.find(a => {
      const c1 = (a.codigo || '').trim().toLowerCase();
      const c2 = (a.imei || '').trim().toLowerCase();
      const c3 = (a.numeroSerie || '').trim().toLowerCase();
      const c4 = (a.id || '').trim().toLowerCase();
      const c5 = (getAparelhoCodigo(a) || '').trim().toLowerCase();
      return c1 === codeClean || c2 === codeClean || c3 === codeClean || c4 === codeClean || c5 === codeClean;
    });

    if (aparelhoEncontrado) {
      const custo = resolveAparelhoCusto(aparelhoEncontrado);
      setPosItem(prev => ({
        ...prev,
        aparelhoId: aparelhoEncontrado.id,
        descricao: `${aparelhoEncontrado.marca} ${aparelhoEncontrado.modelo}`,
        valorExibir: aparelhoEncontrado.preco || 0,
        valorInterno: custo
      }));
      toast.success(`📱 ${aparelhoEncontrado.modelo} selecionado para a venda!`);
    } else {
      toast.error(`Código "${codeScanned}" não encontrado no estoque.`, {
        duration: 8000,
        action: { label: 'Cadastrar agora', onClick: () => abrirCadastroRapido({ identificador: codeScanned.trim() }) },
      });
    }
  };
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
  const [vendaEditadaNotinha, setVendaEditadaNotinha] = useState<Venda | null>(null);
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
  const [vendaRegistroParaEditar, setVendaRegistroParaEditar] = useState<VendaEditavelData | null>(null);
  const [vendaParaDesfazer, setVendaParaDesfazer] = useState<Venda | null>(null);
  const [desfazendoVenda, setDesfazendoVenda] = useState(false);

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

  // Atalhos do PDV. O handler é refeito a cada render (via ref) para nunca usar carrinho,
  // cliente e pagamentos de um render antigo. Esc fecha só o que está por cima e Enter
  // com um popup aberto nunca finaliza a venda.
  const atalhosPdvRef = useRef<(event: KeyboardEvent) => void>(() => undefined);
  const ultimaTeclaPdvRef = useRef(0);
  const enterLiberadoApartirDeRef = useRef(0);
  atalhosPdvRef.current = (event: KeyboardEvent) => {
    if (!showPOS && !showNovoCliente && !showNovoAparelho && !showImportarPedidoModal) return;
    const subModalAberto = showNovoCliente || showNovoAparelho || showImportarPedidoModal || showBarcodeScanner;

    if (event.key === 'Escape') {
      if (showBarcodeScanner) {
        event.preventDefault();
        setShowBarcodeScanner(false);
        setScannerAlvo('item');
        return;
      }
      // O cadastro rápido trata o próprio Esc (pede confirmação se houver dados).
      if (showNovoAparelho) return;
      event.preventDefault();
      if (showImportarPedidoModal) {
        setShowImportarPedidoModal(false);
        return;
      }
      if (showNovoCliente) {
        setShowNovoCliente(false);
        return;
      }
      if (showPOS) closePOSModal();
      return;
    }

    if (event.key === 'F4' && showPOS && !subModalAberto) {
      event.preventDefault();
      abrirCadastroRapido();
      return;
    }

    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      ultimaTeclaPdvRef.current = Date.now();
      return;
    }

    // Enter só finaliza quando é intencional: sem modificador nem repetição, fora de campos e
    // botões, e não colado em outras teclas (o leitor USB digita o código e manda Enter) nem
    // logo depois de fechar um popup (o foco cai no body).
    const alvoInterativo =
      event.target instanceof Element && Boolean(event.target.closest('button, a, [role="button"], [role="dialog"]'));
    const agora = Date.now();
    if (
      showPOS &&
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !event.repeat &&
      !subModalAberto &&
      !isTypingField(event.target) &&
      !alvoInterativo &&
      agora - ultimaTeclaPdvRef.current > 300 &&
      agora > enterLiberadoApartirDeRef.current
    ) {
      event.preventDefault();
      handleShortcutFinalize();
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => atalhosPdvRef.current(event);
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

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
    carregarVendas();
    fetchClientes();
    fetchAparelhos();
    fetchTecnicos();
  }, [usuario?.lojaId, (usuario as any)?.loja_id]);

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

    const currentQuery = searchParams.toString();
    let actionParam: string | null = null;

    if (showPOS) {
      actionParam = 'pdv';
    } else if (showNovoCliente) {
      actionParam = 'novo-cliente';
    } else if (showNovoAparelho) {
      actionParam = 'novo-aparelho';
    } else if (showBarcodeScanner) {
      actionParam = 'barcode-scanner';
    } else if (showImportarPedidoModal) {
      actionParam = 'importar-pedido';
    } else if (showDeleteAllModal) {
      actionParam = 'excluir-todas-vendas';
    } else if (editingId) {
      actionParam = 'editar-venda';
    }

    if (mostrarFiltrosAvancados) {
      panelParam = 'filtros-avancados';
    }

    if (panelParam) {
      nextParams.set('painel', panelParam);
    } else {
      nextParams.delete('painel');
    }

    if (actionParam) {
      nextParams.set('acao', actionParam);
    } else {
      nextParams.delete('acao');
    }

    const currentUrl = `${pathname}?${searchParams.toString()}`;
    const nextQuery = nextParams.toString();
    const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;

    if (currentUrl !== nextUrl && typeof window !== 'undefined') {
      window.history.replaceState(window.history.state, '', nextUrl);
    }
  }, [
    isClient,
    isVendasRoute,
    pathname,
    searchParams,
    editingId,
    mostrarFiltrosAvancados,
    showBarcodeScanner,
    showDeleteAllModal,
    showNovoAparelho,
    showNovoCliente,
    showPOS,
    showImportarPedidoModal,
  ]);

  // O PostgREST devolve no máximo 1000 linhas por requisição. Sem paginar, uma
  // loja com mais de 1000 vendas simplesmente não via as excedentes.
  const TAMANHO_PAGINA_VENDAS = 1000;

  const buscarTodasVendasPaginado = async (aplicarFiltroLoja: boolean, targetLojaId?: string) => {
    const todas: Venda[] = [];

    for (let pagina = 0; ; pagina += 1) {
      let query = supabase
        .from('vendas')
        .select('*')
        .order('dataPagamento', { ascending: false })
        .range(pagina * TAMANHO_PAGINA_VENDAS, (pagina + 1) * TAMANHO_PAGINA_VENDAS - 1);

      if (aplicarFiltroLoja && targetLojaId) {
        query = query.or(`loja_id.eq.${targetLojaId},loja_id.is.null`);
      }

      const { data, error } = await query;
      if (error) throw error;

      const lote = data || [];
      todas.push(...lote);

      if (lote.length < TAMANHO_PAGINA_VENDAS) break;
    }

    return todas;
  };

  const carregarVendas = async () => {
    const targetLojaId = usuario?.lojaId || (usuario as any)?.loja_id;
    try {
      setLoading(true);
      try {
        setVendas(await buscarTodasVendasPaginado(true, targetLojaId));
      } catch (error) {
        console.warn('Filtro por loja_id falhou em vendas, buscando sem filtro:', error);
        setVendas(await buscarTodasVendasPaginado(false));
      }
    } catch (error) {
      console.error('Erro ao carregar vendas:', error);
    } finally {
      setLoading(false);
    }
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
        const disponiveis = aparelhos.filter(aparelhoNoEstoque);
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
          status: 'disponivel',
          loja_id: usuario?.lojaId || null
        };

        const { data: novoAp, error: errAp } = await supabase
          .from('aparelhos') // estoque-guard: auditado
          .insert([apPayload])
          .select()
          .maybeSingle();

        let aparelhoCriado: Aparelho | null = null;
        if (errAp) {
          delete apPayload.saude_bateria;
          delete apPayload.codigo;
          const { data: retryAp } = await supabase
            .from('aparelhos') // estoque-guard: auditado
            .insert([apPayload])
            .select()
            .maybeSingle();
          if (retryAp) aparelhoCriado = retryAp as Aparelho;
        } else if (novoAp) {
          aparelhoCriado = novoAp as Aparelho;
        }

        if (aparelhoCriado) {
          aparelhoFinal = aparelhoCriado;
          // Entrada registrada antes da baixa, para a trilha mostrar cadastro -> venda.
          const entrada = await registrarEntradaEstoque(supabase, {
            aparelhos: [aparelhoCriado as unknown as EstadoCicloAparelho],
            origem: 'venda',
            lojaId: usuario?.lojaId || null,
            usuarioId: usuario?.id || null,
            usuarioNome: usuario?.nome || null,
            observacao: 'Cadastrado automaticamente pela venda gerada por IA.',
          });
          avisarAuditoriaPendente(entrada, 'Aparelho cadastrado');
          await fetchAparelhos();
        }
      }

      const valorVenda = Number(parsedData.valorTotal || parsedData.aparelho?.preco || 0);
      const custoVenda = Number(parsedData.aparelho?.custo || aparelhoFinal?.custo || 0);
      const METODOS_VENDA: Venda['metodo'][] = ['dinheiro', 'cartao_credito', 'cartao_debito', 'pix', 'boleto', 'fiado', 'trade_in'];
      const metodoPgto: Venda['metodo'] = METODOS_VENDA.includes(parsedData.formaPagamento as Venda['metodo'])
        ? (parsedData.formaPagamento as Venda['metodo'])
        : 'dinheiro';

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

      const dataPagamentoIso = obterDataHoraVenda(parsedData.dataVenda);

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

      // 4. Venda e baixa do aparelho numa transação só.
      const aparelhoJaForaDoEstoque =
        aparelhoFinal?.id && !estaNoEstoque(aparelhoFinal as unknown as EstadoCicloAparelho) ? [aparelhoFinal.id] : [];
      const resultadoVendaIA = await registrarVendaAtomica(supabase, {
        venda: vendaPayload,
        aparelhoIds: aparelhoFinal?.id ? [aparelhoFinal.id] : [],
        permitirForaDoEstoque: aparelhoJaForaDoEstoque,
        origem: 'venda',
        usuarioId: usuario?.id || null,
        usuarioNome: usuario?.nome || null,
        observacao: 'Venda gerada por IA',
      });
      const vendaCriada: any = resultadoVendaIA.venda;
      if (aparelhoFinal?.id) await fetchAparelhos();

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
      const disponiveis = aparelhos.filter(aparelhoNoEstoque);
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

      const dataPagamentoFinalIso = obterDataHoraVenda(posDados.dataVenda);

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

      const aparelhosIds = carrinho
        .map((item) => item.aparelhoId)
        .filter((id): id is string => Boolean(id));

      // Quem já estava fora do estoque nesta tela foi escolhido de propósito (vincular venda
      // antiga). Quem estava no estoque aqui e saiu no banco (outro terminal) recusa a venda.
      const permitirForaDoEstoque = aparelhosIds.filter(
        (id) => !estaNoEstoque(aparelhos.find((a) => a.id === id) as unknown as EstadoCicloAparelho | undefined)
      );

      // A troca só entra numa venda nova: salvar de novo uma venda editada duplicava o aparelho.
      const temPagamentoTradeIn = posPagamento.pagamentos.some((p) => p.metodo === ('trade_in' as any));
      const tradeIn =
        !editingId && temPagamentoTradeIn && tradeInVenda && tradeInVenda.valor > 0
          ? {
              marca: /iphone|ipad|apple/i.test(tradeInVenda.modelo) ? 'Apple' : null,
              modelo: tradeInVenda.modelo,
              capacidade: tradeInVenda.capacidade || null,
              cor: tradeInVenda.cor || null,
              imei: tradeInVenda.imei || null,
              saude_bateria: tradeInVenda.bateria ? `${tradeInVenda.bateria}%` : null,
              condicao: 'seminovo',
              custo: tradeInVenda.valor,
              preco: Math.round(tradeInVenda.valor * 1.3),
              precoAtacado: Math.round(tradeInVenda.valor * 1.15),
              preco_atacado: Math.round(tradeInVenda.valor * 1.15),
              observacoes: `Recebido como troca (trade-in) no PDV de ${posDados.clienteNome || 'cliente'}`,
            }
          : null;

      // Venda, baixa do estoque e aparelho da troca numa transação só: se um aparelho já
      // saiu do estoque ou algo falhar no meio, nada é gravado.
      const resultadoVenda = await registrarVendaAtomica(supabase, {
        venda: vendaDados,
        vendaId: editingId || null,
        aparelhoIds: aparelhosIds,
        permitirForaDoEstoque,
        tradeIn,
        avaliacaoId: tradeIn ? tradeInVenda?.avaliacaoId || null : null,
        origem: 'venda',
        usuarioId: usuario?.id || null,
        usuarioNome: usuario?.nome || null,
        observacao: editingId ? 'Venda PDV editada' : 'Venda PDV',
      });
      const vendaSalva: any = resultadoVenda.venda;

      if (aparelhosIds.length > 0 || resultadoVenda.tradeInId) await fetchAparelhos();
      if (resultadoVenda.tradeInId && tradeInVenda) {
        toast.success(`Aparelho da troca (${tradeInVenda.modelo}) entrou no estoque.`);
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

      // Disparo em background da emissão fiscal NFC-e (não bloqueia venda nem PDV)
      if (vendaSalva?.id && !foiEdicao) {
        fetch('/api/fiscal/emitir', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vendaId: vendaSalva.id,
            tipo: 'nfce',
            lojaId: usuario?.lojaId || (vendaSalva as any).loja_id,
            destinatario: clienteVenda ? {
              nome: clienteVenda.nome,
              cpfCnpj: (clienteVenda as any).cpf || (clienteVenda as any).cnpj || '',
              email: clienteVenda.email !== 'sem@email.com' ? clienteVenda.email : undefined
            } : undefined
          })
        })
          .then(r => r.json())
          .then(resFiscal => {
            if (resFiscal?.sucesso && resFiscal?.status === 'autorizada') {
              toast.success('NFC-e autorizada pela SEFAZ!', {
                action: resFiscal?.urlDanfe ? {
                  label: 'Ver DANFE',
                  onClick: () => window.open(resFiscal.urlDanfe, '_blank')
                } : undefined
              });
            } else if (resFiscal?.configurado && resFiscal?.status === 'processando') {
              toast.info('NFC-e enviada para a SEFAZ (processando)');
            }
          })
          .catch(eF => console.warn('Aviso emissão fiscal PDV:', eF));
      }

      // Se for venda de atacado realizada no PDV, notifica o lojista automaticamente no WhatsApp
      const isAtacadoPDV = 
        posDados.tipoEntrega?.toLowerCase().includes('atacado') || 
        posDados.tipoVenda?.toLowerCase().includes('atacado');

      if (isAtacadoPDV && vendaSalva?.id && !foiEdicao) {
        try {
          fetch('/api/atacado/notificar-venda', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              lojaId: usuario?.lojaId || (vendaSalva as any).loja_id,
              compradorNome: posDados.clienteNome,
              compradorTelefone: clienteVenda?.telefone || undefined,
              itens: carrinho.map((item) => ({
                modelo: item.descricao,
                valor: item.total || item.valorExibir,
              })),
              valorTotal: valorFinal,
              formaPagamento: metodoPrincipal,
            }),
          })
            .then(async (r) => {
              const j = await r.json();
              if (j.enviado) {
                toast.success(`📲 Comprovante e saldo devedor enviados no WhatsApp de ${posDados.clienteNome}!`, { duration: 6000 });
              }
            })
            .catch((eW) => console.warn('Aviso notificação WhatsApp atacado PDV:', eW));
        } catch (eW) {
          console.warn('Erro ao disparar notificação WhatsApp atacado PDV:', eW);
        }
      }

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
      toast.error('Nao foi possivel salvar a venda.', { description: (error as { message?: string })?.message });
    } finally {
      setSavingVenda(false);
    }
  };

  const resetPOS = () => {
    setPosDados({ tipoVenda: 'Venda', clienteId: '', clienteNome: '', vendedor: '', tipoEntrega: 'Retirada', dataVenda: formatForDatetimeLocal() });
    setCart([]);
    setPosItem({ quantidade: 1, valorInterno: 0, valorExibir: 0, desconto: 0, tipoDesconto: 'R$', observacao: '' });
    setPosPagamento(createInitialPosPagamento());
    setTradeInVenda(null);
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

  /**
   * Desfaz a venda: devolve os aparelhos ao estoque e remove o registro.
   * Usada tanto pelo botão da linha quanto pelo menu de ações.
   */
  const desfazerVenda = async (venda: Venda) => {
    setDesfazendoVenda(true);
    try {
      const { data: vendaBanco, error: erroBusca } = await supabase
        .from('vendas')
        .select('*, itens')
        .eq('id', venda.id)
        .single();
      if (erroBusca) throw erroBusca;

      const itens = Array.isArray(vendaBanco?.itens) ? vendaBanco.itens : [];
      const itensComAparelho = itens.filter((i: any) => i?.aparelhoId);

      // Devolve cada aparelho ao estoque limpando as marcas que a venda deixou
      // nas observações. Quem já está no estoque (ou em manutenção) fica como está.
      let devolvidos = 0;
      let jaNoEstoque = 0;
      let falhasDevolucao = 0;
      let erroAuditoriaDevolucao: string | undefined;
      const loteDevolucao = gerarLoteId();
      if (itensComAparelho.length > 0) {
        const ids = itensComAparelho.map((i: any) => i.aparelhoId);
        const { data: aparelhosVenda } = await supabase
          .from('aparelhos')
          .select('id, observacoes, condicao')
          .in('id', ids);

        const atuaisPorId = new Map((aparelhosVenda || []).map((a) => [a.id, a]));

        for (const item of itensComAparelho) {
          const atual = atuaisPorId.get(item.aparelhoId);
          if (!atual) continue;

          const obsLimpa = limparObservacoesDeVenda(atual.observacoes);
          // Baixas antigas gravavam 'vendido' em `condicao`: só nesses casos a
          // condição física precisa ser recuperada do que a venda registrou.
          const condicaoReparada = condicaoAoDevolver(atual.condicao, item);

          try {
            const resultado = await aplicarMudancaEstoque(supabase, {
              ids: [item.aparelhoId],
              patch: {
                cliente: null,
                clienteId: null,
                observacoes: obsLimpa,
                ...(condicaoReparada ? { condicao: condicaoReparada } : {}),
                ...patchRestauracao(),
              },
              tipo: 'restauracao',
              origem: 'devolucao',
              loteId: loteDevolucao,
              lojaId: usuario?.lojaId || null,
              usuarioId: usuario?.id || null,
              usuarioNome: usuario?.nome || null,
              observacao: `Venda #${venda.id.slice(-6).toUpperCase()} desfeita.`,
              filtroElegivel: (estado) => !estaNoEstoque(estado),
            });
            if (resultado.afetados > 0) devolvidos += 1;
            else jaNoEstoque += 1;
            if (!resultado.auditoriaRegistrada) {
              erroAuditoriaDevolucao = resultado.erroAuditoria || 'Falha ao gravar a movimentação.';
            }
          } catch (erroDevolucao) {
            console.error('Erro ao devolver aparelho ao estoque:', erroDevolucao);
            falhasDevolucao += 1;
          }
        }
      }

      // Com aparelho que não voltou, apagar a venda o deixaria vendido sem venda nenhuma.
      if (falhasDevolucao > 0) {
        throw new Error(
          `${falhasDevolucao} aparelho(s) não puderam voltar ao estoque. A venda foi mantida: tente desfazer de novo.`
        );
      }

      const { error: erroDelete } = await supabase.from('vendas').delete().eq('id', venda.id);
      if (erroDelete) throw erroDelete;

      await registrarLog({
        loja_id: usuario?.lojaId || (usuario as any)?.loja_id,
        tipo_evento: 'venda',
        acao: 'Venda Desfeita',
        detalhes:
          `Venda #${venda.id.slice(-6).toUpperCase()} (${vendaBanco?.clienteNome || 'Cliente'}) ` +
          `no valor de R$ ${vendaBanco?.valor || 0} desfeita. ` +
          `${devolvidos} aparelho(s) devolvido(s) ao estoque.`,
      });

      const semAparelho = itensComAparelho.length - devolvidos - jaNoEstoque;
      const avisosDevolucao = [
        semAparelho > 0 ? `${semAparelho} item(ns) não estavam mais no estoque e foram ignorados.` : '',
        jaNoEstoque > 0 ? `${jaNoEstoque} aparelho(s) já estavam no estoque.` : '',
      ].filter(Boolean);
      toast.success(
        devolvidos > 0
          ? `Venda desfeita. ${devolvidos} aparelho(s) de volta ao estoque.`
          : 'Venda desfeita.',
        avisosDevolucao.length > 0
          ? { description: avisosDevolucao.join(' ') }
          : undefined
      );
      if (erroAuditoriaDevolucao) {
        avisarAuditoriaPendente(
          { auditoriaRegistrada: false, erroAuditoria: erroAuditoriaDevolucao },
          'Aparelhos devolvidos ao estoque'
        );
      }

      setVendaParaDesfazer(null);
      await carregarVendas();
      await fetchAparelhos();
    } catch (error: any) {
      console.error('Erro ao desfazer venda:', error);
      toast.error('Erro ao desfazer venda: ' + (error?.message || 'Falha no servidor'));
    } finally {
      setDesfazendoVenda(false);
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

  // Cancelar e desfazer são a mesma operação; abre a confirmação detalhada.
  const handleCancelarVenda = (venda: Venda) => {
    setVendaParaDesfazer(venda);
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

  // Helper robusto para identificar se a venda é do canal Atacado / Lojista
  const isAtacadoVenda = (venda: any): boolean => {
    if (!venda) return false;
    const tipoEntrega = String(venda.tipoEntrega || '').toLowerCase();
    const desc = String(venda.descricao || '').toLowerCase();
    const canal = String(venda.canal || venda.tipo_venda || venda.tipoVenda || '').toLowerCase();
    return tipoEntrega.includes('atacado') || desc.includes('atacado') || canal.includes('atacado');
  };

  // Helper robusto para identificar vendas com dados de cliente pendentes ou genéricos ("Comum", "Consumidor", etc.)
  const verificarVendaDadosPendentes = (venda: Venda, listaClientes?: Cliente[]): boolean => {
    // Se for uma venda de atacado, NUNCA entra na aba de dados pendentes do varejo!
    if (isAtacadoVenda(venda)) return false;

    // 1. Se foi explicitamente marcada como pendente
    if ((venda as any).dados_cliente_pendente === true) return true;

    const nome = (venda.clienteNome || '').trim();
    if (!nome) return true;

    // 3. Nomes genéricos de clientes/balcão que foram vendidos sem dados reais completos
    const padraoGenerico = /^(comum|cliente comum|consumidor|cliente consumidor|final|cliente final|balc[aã]o|cliente balc[aã]o|pendente|n[aã]o informado|sem nome|desconhecido|an[oô]nimo)$/i;
    if (padraoGenerico.test(nome) || /(comum|balc[aã]o|pendente|consumidor)/i.test(nome)) {
      return true;
    }

    // 4. Se não tem clienteId vinculado, precisa de cadastro real
    if (!venda.clienteId) {
      return true;
    }

    // 5. Se tem cliente vinculado, verificar se o cadastro do cliente tem dados reais ou se é apenas um placeholder
    if (listaClientes && listaClientes.length > 0) {
      const cli = listaClientes.find((c) => c.id === venda.clienteId || c.nome?.toLowerCase() === nome.toLowerCase());
      if (cli) {
        if (padraoGenerico.test((cli.nome || '').trim()) || /(comum|balc[aã]o|pendente|consumidor)/i.test(cli.nome || '')) {
          return true;
        }
        const tel = (cli.telefone || '').replace(/\D/g, '');
        if (!tel || tel.length < 8) {
          return true;
        }
      }
    }

    return false;
  };

  // Um intervalo de datas explícito nos Filtros Avançados tem precedência sobre
  // o seletor de período, para os dois não brigarem entre si.
  const inicioDoMesAtual = useMemo(() => {
    const agora = new Date();
    return new Date(agora.getFullYear(), agora.getMonth(), 1, 0, 0, 0, 0);
  }, []);

  const dentroDoPeriodo = useCallback(
    (venda: Venda) => {
      if (filtroPeriodo === 'todos') return true;
      if (filtroDataInicio || filtroDataFim) return true;
      const data = getVendaDataExibicao(venda);
      return data.getTime() >= inicioDoMesAtual.getTime();
    },
    [filtroPeriodo, filtroDataInicio, filtroDataFim, inicioDoMesAtual]
  );

  const vendasFiltradas = useMemo(() => {
    const vendasBase = vendas.filter((venda) => {
      if (!dentroDoPeriodo(venda)) return false;

      // Filtro por Canal de Venda (Varejo x Dados Pendentes x Atacado x Todos)
      const isAtacado = isAtacadoVenda(venda);
      const isPendente = !isAtacado && verificarVendaDadosPendentes(venda, clientes);

      if (filtroCanal === 'varejo' && (isAtacado || isPendente)) return false;
      if (filtroCanal === 'pendentes' && !isPendente) return false;
      if (filtroCanal === 'atacado' && !isAtacado) return false;

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
      parcial: 1,
      pendente: 2,
      cancelado: 3
    };

    const sorted = [...vendasBase].sort((a, b) => {
      let comparison = 0;

      if (ordenarPor === 'data') {
        const timeA = getVendaDataExibicao(a).getTime();
        const timeB = getVendaDataExibicao(b).getTime();
        comparison = timeA - timeB;
      } else if (ordenarPor === 'cliente') {
        comparison = (a.clienteNome || '').localeCompare(b.clienteNome || '', 'pt-BR');
      } else if (ordenarPor === 'valor') {
        comparison = a.valor - b.valor;
      } else if (ordenarPor === 'lucro') {
        comparison = a.lucro - b.lucro;
      } else if (ordenarPor === 'status') {
        comparison = statusRank[a.status] - statusRank[b.status];
      } else if (ordenarPor === 'metodo') {
        comparison = (metodoLabel(a.metodo) || '').localeCompare(metodoLabel(b.metodo) || '', 'pt-BR');
      }

      return direcaoOrdenacao === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }, [vendas, filtroCanal, filtroBusca, filtroStatus, filtroMetodo, filtroVendedor, filtroDataInicio, filtroDataFim, ordenarPor, direcaoOrdenacao, clientes, aparelhos, dentroDoPeriodo]);

  const contagemCanais = useMemo(() => {
    let varejo = 0;
    let pendentes = 0;
    let atacado = 0;
    let total = 0;
    vendas.forEach((v) => {
      if (!dentroDoPeriodo(v)) return;
      total++;
      const isAtacado = isAtacadoVenda(v);
      const isPendente = !isAtacado && verificarVendaDadosPendentes(v, clientes);
      if (isPendente) pendentes++;
      else if (isAtacado) atacado++;
      else varejo++;
    });
    return { varejo, pendentes, atacado, total };
  }, [vendas, clientes, dentroDoPeriodo]);

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

  const focoAntesDoCadastroRef = useRef<HTMLElement | null>(null);

  const abrirCadastroRapido = (inicial?: { identificador?: string; modelo?: string } | null) => {
    focoAntesDoCadastroRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setCadastroRapidoInicial(inicial || null);
    setShowNovoAparelho(true);
  };

  const fecharCadastroRapido = () => {
    setShowNovoAparelho(false);
    setCadastroRapidoInicial(null);
    // O foco cairia no body e o próximo Enter (ou bip do leitor) finalizaria a venda.
    enterLiberadoApartirDeRef.current = Date.now() + 800;
    const anterior = focoAntesDoCadastroRef.current;
    window.setTimeout(() => {
      if (anterior && document.body.contains(anterior)) anterior.focus();
    }, 0);
  };

  /** O cadastro rápido registra a própria entrada no estoque e precisa da mensagem real do banco. */
  const criarAparelhoParaCadastroRapido = async (payload: PayloadCadastroRapido): Promise<Aparelho> => {
    const criado = await criarAparelho(payload as unknown as Parameters<typeof criarAparelho>[0], {
      registrarEntrada: false,
      lancarErro: true,
    });
    if (!criado) throw new Error('Não foi possível cadastrar o aparelho.');
    return criado;
  };

  const adicionarAparelhoAoCarrinho = (aparelho: Aparelho): boolean => {
    if (carrinho.some((item) => item.aparelhoId === aparelho.id)) {
      toast.error('Este aparelho já está no carrinho.');
      return false;
    }
    const preco = aparelho.preco || 0;
    const novoItem: VendaItem = {
      id: `${Date.now()}`,
      aparelhoId: aparelho.id,
      descricao: [aparelho.marca, aparelho.modelo, aparelho.capacidade, aparelho.cor]
        .filter((parte) => parte && parte !== 'N/A')
        .join(' '),
      quantidade: 1,
      valorInterno: resolveAparelhoCusto(aparelho) || 0,
      valorExibir: preco,
      desconto: 0,
      tipoDesconto: 'R$',
      total: preco,
      observacao: '',
      imei: aparelho.imei || aparelho.numeroSerie || '',
    };
    setCart((atual) => [...atual, novoItem]);
    return true;
  };

  /** Lançado por engano: sai do carrinho e do estoque como baixa auditada. */
  const desfazerCadastroNoPdv = async (aparelho: Aparelho) => {
    setCart((atual) => atual.filter((item) => item.aparelhoId !== aparelho.id));
    setPosItem((atual) =>
      atual.aparelhoId === aparelho.id ? { ...atual, aparelhoId: '', descricao: '', valorExibir: 0, valorInterno: 0 } : atual
    );
    if (!usuario?.lojaId) return;
    try {
      const resultado = await desfazerCadastroRapido(supabase, aparelho, {
        lojaId: usuario.lojaId,
        usuarioId: usuario.id,
        usuarioNome: usuario.nome,
      });
      toast.message(
        resultado.afetados > 0
          ? 'Cadastro desfeito: o aparelho saiu do estoque.'
          : 'O aparelho já não estava no estoque; nada foi alterado.'
      );
      await fetchAparelhos();
    } catch (erro: any) {
      toast.error('Não foi possível desfazer o cadastro.', { description: erro?.message });
    }
  };

  const concluirCadastroRapido = (aparelho: Aparelho, modo: 'adicionar' | 'cadastrar') => {
    fecharCadastroRapido();
    const nome = [aparelho.modelo, aparelho.capacidade].filter(Boolean).join(' ');
    const desfazer = { label: 'Desfazer', onClick: () => void desfazerCadastroNoPdv(aparelho) };

    if (modo === 'adicionar' && adicionarAparelhoAoCarrinho(aparelho)) {
      const custo = resolveAparelhoCusto(aparelho) || 0;
      const lucro = (aparelho.preco || 0) - custo;
      toast.success(`${nome} adicionado à venda`, {
        description:
          canViewFinancials(usuario) && custo > 0
            ? `Lucro ${lucro.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
            : undefined,
        duration: 6000,
        action: desfazer,
      });
      return;
    }

    // Só cadastrar: pré-seleciona na linha de item, como o popup antigo fazia.
    setPosItem((atual) => ({
      ...atual,
      aparelhoId: aparelho.id,
      descricao: `${aparelho.marca} ${aparelho.modelo}`,
      valorExibir: aparelho.preco || 0,
      valorInterno: resolveAparelhoCusto(aparelho) || 0,
    }));
    toast.success(`${nome} cadastrado no estoque`, { duration: 6000, action: desfazer });
  };

  const handleAddItem = () => {
    if (!posItem.aparelhoId && !posItem.descricao) {
      alert('Selecione um aparelho ou descreva o item.');
      return;
    }
    if (posItem.aparelhoId && carrinho.some((item) => item.aparelhoId === posItem.aparelhoId)) {
      toast.error('Este aparelho já está no carrinho.');
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

    const apEncontrado = posItem.aparelhoId ? aparelhos.find((a) => a.id === posItem.aparelhoId) : null;
    const imeiEncontrado = apEncontrado ? (apEncontrado.imei || apEncontrado.numeroSerie || (apEncontrado as any).codigo) : '';

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
      observacao: posItem.observacao || '',
      imei: imeiEncontrado || (posItem as any).imei || ''
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

  const REGEX_DATA_BARRA = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

  /**
   * Descobre se um arquivo com datas "a/b/aaaa" está em DD/MM (brasileiro) ou
   * MM/DD (americano), olhando o conjunto inteiro em vez de cada linha isolada.
   *
   * Existe porque um arquivo em MM/DD foi importado como DD/MM e trocou o dia
   * pelo mês em ~850 vendas. Quando os dois componentes são <= 12 a linha
   * sozinha é ambígua e o erro passa silencioso: 08/05 vira 05/08 sem nada
   * parecer errado. Basta uma linha com componente > 12 para desfazer o empate.
   */
  const detectarOrdemDataArquivo = (valores: string[]): 'dia-mes' | 'mes-dia' | 'ambiguo' => {
    let primeiroMaiorQue12 = 0;
    let segundoMaiorQue12 = 0;

    for (const bruto of valores) {
      const m = String(bruto || '').trim().match(REGEX_DATA_BARRA);
      if (!m) continue;
      const a = Number(m[1]);
      const b = Number(m[2]);
      if (a > 12 && b <= 12) primeiroMaiorQue12 += 1;
      if (b > 12 && a <= 12) segundoMaiorQue12 += 1;
    }

    if (primeiroMaiorQue12 > 0 && segundoMaiorQue12 === 0) return 'dia-mes';
    if (segundoMaiorQue12 > 0 && primeiroMaiorQue12 === 0) return 'mes-dia';
    return 'ambiguo';
  };

  const parseImportedDate = (rawValue: string, ordem: 'dia-mes' | 'mes-dia' | 'ambiguo' = 'dia-mes'): string => {
    const value = String(rawValue || '').trim();
    if (!value) return new Date().toISOString();

    // Se já estiver em formato ISO ou YYYY-MM-DD HH:mm:ss
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      const isoLike = value.replace(' ', 'T');
      const d = new Date(isoLike);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }

    const matchBarra = value.match(REGEX_DATA_BARRA);
    if (matchBarra) {
      const [, a, b, anoBruto, hh = '12', min = '00', ss = '00'] = matchBarra;
      const yyyy = anoBruto.length === 2 ? `20${anoBruto}` : anoBruto;

      // Um componente > 12 só pode ser o dia: decide a linha sozinha, mesmo que
      // o arquivo inteiro seja ambíguo.
      let dd = a;
      let mm = b;
      if (Number(b) > 12 && Number(a) <= 12) {
        dd = b;
        mm = a;
      } else if (Number(a) <= 12 && Number(b) <= 12 && ordem === 'mes-dia') {
        dd = b;
        mm = a;
      }

      const parsed = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min), Number(ss));
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    }

    const nativeDate = new Date(value);
    if (!Number.isNaN(nativeDate.getTime())) {
      return nativeDate.toISOString();
    }

    return new Date().toISOString();
  };

  const mapImportedStatus = (rawStatus: string): 'pendente' | 'pago' | 'cancelado' => {
    const status = String(rawStatus || '').toLowerCase();
    if (status.includes('cancel')) return 'cancelado';
    if (status.includes('pend')) return 'pendente';
    return 'pago';
  };

  const mapImportedMetodo = (rawMetodo: string): Venda['metodo'] => {
    const metodo = String(rawMetodo || '').toLowerCase();
    if (metodo.includes('credito') || metodo.includes('crédito')) return 'cartao_credito';
    if (metodo.includes('debito') || metodo.includes('débito')) return 'cartao_debito';
    if (metodo.includes('boleto')) return 'boleto';
    if (metodo.includes('dinheiro') || metodo.includes('especie') || metodo.includes('espécie')) return 'dinheiro';
    if (metodo.includes('fiado') || metodo.includes('promissoria') || metodo.includes('promissória')) return 'fiado';
    if (metodo.includes('trade') || metodo.includes('troca')) return 'trade_in';
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
      alert('Sessão sem loja ativa para importar vendas.');
      return;
    }

    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const importedRows = await parseImportFile(file);

      if (importedRows.length === 0) {
        alert('Arquivo sem dados válidos para importação.');
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
          const ref =
            /Referencia\s+(\S+)/i.exec(String(item.descricao || ''))?.[1] ||
            /#(\S+)/i.exec(String(item.descricao || ''))?.[1] ||
            '';
          return `${ref}|${cliente}|${data}|${valor}`;
        })
      );

      // Agrupa itens por Venda (suporta vendas multi-itens do MercadoPhone e linhas individuais)
      const salesMap = new Map<string, {
        clienteNome: string;
        vendedor: string;
        tipoEntrega: string;
        itens: Array<{
          id: string;
          descricao: string;
          modelo: string;
          imei: string;
          condicao: string;
          bateria: string;
          quantidade: number;
          valorInterno: number;
          valorExibir: number;
          precoUnitario: number;
          custoUnitario: number;
          desconto: number;
          tipoDesconto: 'R$';
          total: number;
          observacao: string;
        }>;
        valor: number;
        custo: number;
        dataPagamento: string;
        status: 'pago' | 'pendente' | 'cancelado';
        metodo: Venda['metodo'];
        idOrigem: string;
        origem: string;
      }>();

      // Decide DD/MM vs MM/DD olhando o arquivo inteiro, antes de converter
      // linha a linha: sozinha, "08/05" não diz qual é o dia.
      const ordemDataArquivo = detectarOrdemDataArquivo(
        importedRows.map((row) =>
          findByAliases(row, ['datapagamento', 'data', 'datavenda', 'created_at', '_col3', '_col4'])
        )
      );

      if (ordemDataArquivo === 'mes-dia') {
        toast.info('Datas do arquivo estão no formato americano (MM/DD). Convertendo para DD/MM.');
      } else if (ordemDataArquivo === 'ambiguo') {
        console.warn('[Importação] Não foi possível determinar a ordem das datas; assumindo DD/MM.');
      }

      importedRows.forEach((row, idx) => {
        const idOrigem = findByAliases(row, ['id', 'numero', 'codigo', 'idorigem', '_col1']);
        const clienteNome = findByAliases(row, ['cliente', 'clientenome', 'nomecliente', 'comprador', 'nome', '_col2']);
        const dataPagamentoRaw = findByAliases(row, ['datapagamento', 'data', 'datavenda', 'created_at', '_col3', '_col4']);
        const statusRaw = findByAliases(row, ['status', 'situacao', 'estado', '_col5', '_col7']);
        const modelo = findByAliases(row, ['modelo', 'aparelho', 'descricao', 'produto', 'item', '_col7', '_col6']);
        const imei = findByAliases(row, ['imei', 'serial', 'numeroserie', 'sn', '_col8']);
        const condicao = findByAliases(row, ['condicao', 'estado_aparelho', '_col9']);
        const origem = findByAliases(row, ['origem', 'canal', 'metodo', 'formapagamento', 'pagamento', '_col10', '_col5']);
        const valor = parseCurrencyLike(findByAliases(row, ['valor', 'total', 'valorfinal', 'valortotal', 'preco', '_col11', '_col6']));
        const custo = parseCurrencyLike(findByAliases(row, ['custo', 'desconto', '_col12']));
        const vendedor = findByAliases(row, ['vendedor', 'tecnico', 'atendente', '_col13', '_col3']) || 'Padrão';
        const bateria = findByAliases(row, ['bateria', 'saudebateria', '_col16']);

        if (!clienteNome && !modelo) return;

        const groupKey = idOrigem
          ? `ID_${idOrigem}`
          : `ROW_${idx}_${clienteNome.trim().toLowerCase()}_${dataPagamentoRaw}`;

        const itemObj = {
          id: `item-${Date.now()}-${idx + 1}`,
          descricao: imei ? `${modelo || 'Aparelho'} (IMEI: ${imei})` : (modelo || 'Aparelho'),
          modelo: modelo || '',
          imei: imei || '',
          condicao: condicao || '',
          bateria: bateria ? `${bateria}%` : '',
          quantidade: 1,
          valorInterno: valor,
          valorExibir: valor,
          precoUnitario: valor,
          custoUnitario: custo,
          desconto: 0,
          tipoDesconto: 'R$' as const,
          total: valor,
          observacao: [condicao, bateria ? `Bateria: ${bateria}%` : ''].filter(Boolean).join(' • '),
        };

        if (!salesMap.has(groupKey)) {
          const dataPagamento = parseImportedDate(dataPagamentoRaw, ordemDataArquivo);
          const status = mapImportedStatus(statusRaw);
          const metodo = mapImportedMetodo(origem);

          salesMap.set(groupKey, {
            clienteNome: clienteNome || 'Cliente Não Informado',
            vendedor,
            tipoEntrega: 'Retirada',
            itens: [itemObj],
            valor,
            custo,
            dataPagamento,
            status,
            metodo,
            idOrigem,
            origem,
          });
        } else {
          const existing = salesMap.get(groupKey)!;
          existing.itens.push(itemObj);
        }
      });

      const chavesNoLote = new Set<string>();
      const payload: any[] = [];

      for (const sale of salesMap.values()) {
        const idOrigem = sale.idOrigem;
        const clienteNome = sale.clienteNome;
        const dataPagamento = sale.dataPagamento;
        const valor = sale.valor;
        const custo = sale.custo;
        const lucro = valor - custo;
        const percentualLucro = valor > 0 ? Math.round(((valor - custo) / valor) * 100) : 0;

        const chave = `${idOrigem}|${clienteNome.trim().toLowerCase()}|${dataPagamento.slice(0, 10)}|${Number(valor || 0).toFixed(2)}`;
        if (!clienteNome || chavesExistentes.has(chave) || chavesNoLote.has(chave)) {
          continue;
        }

        chavesNoLote.add(chave);

        const resumoItens = sale.itens
          .map((i) => (i.imei ? `${i.modelo} (IMEI: ${i.imei})` : i.modelo || 'Item'))
          .join(', ');

        const descricao = idOrigem
          ? `Importado MercadoPhone #${idOrigem} - ${resumoItens}`
          : `Importado - ${resumoItens}`;

        payload.push({
          clienteNome,
          vendedor: sale.vendedor,
          tipoEntrega: sale.tipoEntrega,
          itens: sale.itens,
          valor,
          custo,
          lucro,
          percentualLucro,
          dataPagamento,
          status: sale.status,
          metodo: sale.metodo,
          descricao,
          garantia: '90 dias',
          descontoTotal: 0,
          loja_id: usuario.lojaId,
        });
      }

      if (payload.length === 0) {
        alert('Nenhuma venda nova para importar. Todas já estavam cadastradas no sistema.');
        return;
      }

      // Inserção em lotes de 100 para evitar sobrecarga de payload
      const BATCH_SIZE = 100;
      for (let i = 0; i < payload.length; i += BATCH_SIZE) {
        const chunk = payload.slice(i, i + BATCH_SIZE);
        const { error: insertError } = await supabase.from('vendas').insert(chunk);
        if (insertError) throw insertError;
      }

      await carregarVendas();
      toast.success(`Importação concluída com sucesso: ${payload.length} vendas importadas!`);
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

  const handleEmitirFiscalManual = async (venda: Venda, tipo: 'nfce' | 'nfe' = 'nfce') => {
    try {
      toast.info(`Enviando ${tipo.toUpperCase()} para a SEFAZ...`);
      const clienteVenda = clientes.find(c => c.id === venda.clienteId);
      const res = await fetch('/api/fiscal/emitir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendaId: venda.id,
          tipo,
          lojaId: (venda as any).loja_id || usuario?.lojaId,
          destinatario: clienteVenda ? {
            nome: clienteVenda.nome,
            cpfCnpj: (clienteVenda as any).cpf || (clienteVenda as any).cnpj || '',
            email: clienteVenda.email !== 'sem@email.com' ? clienteVenda.email : undefined
          } : undefined
        })
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.mensagem || 'Falha na emissão fiscal');
      }

      if (json.sucesso && json.status === 'autorizada') {
        toast.success(`${tipo.toUpperCase()} autorizada com sucesso!`);
        if (json.urlDanfe) {
          window.open(json.urlDanfe, '_blank');
        }
      } else if (json.configurado === false) {
        toast.warning('Configure os dados fiscais da loja em Configurações > Fiscal antes de emitir.');
      } else if (json.status === 'processando') {
        toast.info(`${tipo.toUpperCase()} enviada e em processamento na SEFAZ.`);
      } else {
        toast.error(json.mensagem || 'Erro na autorização da SEFAZ.');
      }
    } catch (err: any) {
      console.error('Erro ao emitir nota fiscal:', err);
      toast.error(err?.message || 'Erro ao emitir nota fiscal.');
    }
  };

  const handleConsultarFiscalManual = async (venda: Venda) => {
    try {
      toast.info('Consultando status fiscal na SEFAZ...');
      const res = await fetch(`/api/fiscal/status/${venda.id}`);
      const json = await res.json();

      if (!res.ok) {
        toast.warning(json.mensagem || 'Nenhuma nota fiscal encontrada para esta venda.');
        return;
      }

      if (json.status === 'autorizada') {
        toast.success(`Nota Autorizada! Chave: ${json.chaveAcesso ? json.chaveAcesso.slice(-8) : ''}`);
        if (json.urlDanfe) {
          window.open(json.urlDanfe, '_blank');
        }
      } else if (json.status === 'processando') {
        toast.info('Nota em processamento na SEFAZ. Aguarde alguns instantes.');
      } else if (json.status === 'erro_autorizacao') {
        toast.error(`Erro SEFAZ: ${json.mensagem || 'Rejeição na autorização'}`);
      } else {
        toast.info(`Status atual: ${json.status || 'Pendente'}`);
      }
    } catch (err: any) {
      console.error('Erro ao consultar nota:', err);
      toast.error('Erro ao consultar status da nota fiscal.');
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
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-4 mb-2">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-white drop-shadow-sm">Vendas</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">Controle de vendas e faturamento</p>
          </div>

          {/* Fica FORA do dropdown de propósito: dentro dele o Radix desmonta o
              input ao fechar o menu, e importInputRef.current?.click() vira no-op. */}
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,.xls,.xlsx"
            onChange={handleImportVendas}
            className="hidden"
          />

          {/* Antes eram 6 botões numa fileira que não quebrava linha: estourava a
              largura e só dava para alcançar os últimos rolando de lado. As ações
              secundárias foram para um menu, como nas outras abas. */}
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:justify-end">
            <Button
              onClick={() => {
                openPOSModal();
                if (editingId) setEditingId(null);
              }}
              className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold rounded-xl px-4 h-9 text-xs sm:text-sm shadow-md shadow-cyan-950/30 flex items-center gap-2 border border-cyan-400/30 transition-all hover:scale-[1.02] active:scale-[0.98] whitespace-nowrap cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Nova Venda
            </Button>

            <Button
              variant="outline"
              onClick={() => setShowVincularVendidoModal(true)}
              className="h-9 text-xs sm:text-sm whitespace-nowrap border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 font-bold gap-1.5 cursor-pointer"
              title="Vincular aparelho já baixado do estoque a um cliente para gerar notinha"
            >
              <Repeat className="h-4 w-4 text-amber-400" />
              Vincular Já Vendido
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-9 text-xs sm:text-sm whitespace-nowrap gap-1.5 cursor-pointer">
                  <FileSpreadsheet className="h-4 w-4" />
                  Importar / Exportar
                  <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={handleExportVendas}>
                  <Download className="mr-2 h-4 w-4" />
                  Exportar vendas
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleOpenImportVendas}>
                  <Upload className="mr-2 h-4 w-4" />
                  Importar CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowImportarPedidoModal(true)}>
                  <FileInput className="mr-2 h-4 w-4" />
                  Importar pedido
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleOpenDeleteAllModal}
                  disabled={vendas.length === 0}
                  className="text-red-600 focus:bg-red-500/10 focus:text-red-600"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Apagar todas
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
                        ['--emoji-x' as const]: `${12 + index * 14}`,
                        ['--emoji-delay' as const]: `${index * 70}`,
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
                        ['--confetti-x' as const]: `${6 + index * 5}`,
                        ['--confetti-delay' as const]: `${index * 32}`,
                        ['--confetti-rotate' as const]: `${(index % 6) * 24}`,
                        ['--confetti-drift' as const]: `${(index % 2 === 0 ? 1 : -1) * (28 + index * 3)}`,
                        ['--confetti-hue' as const]: `${200 + (index % 5) * 22}`,
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
                          value={posItem.aparelhoId || ''}
                          onCadastrarNovo={(termo) =>
                            abrirCadastroRapido(/^[\d\s-]+$/.test(termo) ? { identificador: termo } : { modelo: termo })
                          }
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
                        <Button type="button" size="icon" variant="outline" onClick={() => setShowBarcodeScanner(true)} title="Escanear Código de Barras / Câmera" className="h-11 w-11 shrink-0 bg-cyan-500/20 text-cyan-400 border-cyan-500/40 hover:bg-cyan-500/30 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg">
                          <Camera className="h-5 w-5" />
                        </Button>
                        <Button type="button" size="icon" variant="outline" onClick={() => abrirCadastroRapido()} title="Cadastrar aparelho (F4)" className="h-11 w-11 shrink-0 bg-white/50 backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg">
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
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <label className="text-xs text-gray-500 ml-1">Formas de Pagamento</label>
                      <div className="flex items-center gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleAbrirModalTradeIn}
                          className="h-8 gap-1.5 border-emerald-500/40 text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 font-bold text-xs rounded-xl cursor-pointer"
                        >
                          <Repeat className="h-3.5 w-3.5" /> + Aparelho na Troca
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={handleAddPagamento} className="h-8 gap-1.5">
                          <Plus className="h-4 w-4" /> Adicionar forma
                        </Button>
                      </div>
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
                              <option value="trade_in">🔁 Aparelho na Troca (Upgrade)</option>
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

                          {pagamento.metodo === ('trade_in' as any) && (
                            <div className="col-span-full pt-1">
                              <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 flex items-center justify-between gap-2 text-xs">
                                <div className="flex items-center gap-2 min-w-0">
                                  <Repeat className="w-4 h-4 text-emerald-400 shrink-0" />
                                  <span className="text-emerald-300 font-bold truncate">
                                    {tradeInVenda
                                      ? `📱 ${tradeInVenda.modelo} ${tradeInVenda.capacidade} (Entrada: R$ ${tradeInVenda.valor.toFixed(2)})`
                                      : 'Nenhum aparelho configurado para a troca'}
                                  </span>
                                </div>
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={handleAbrirModalTradeIn}
                                  className="h-7 px-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[11px] rounded-lg shrink-0 cursor-pointer"
                                >
                                  {tradeInVenda ? 'Alterar' : 'Configurar Troca'}
                                </Button>
                              </div>
                            </div>
                          )}
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

            {/* MODAL DE TRADE-IN / UPGRADE NA VENDA */}
            {showTradeInModal && (
              <div className="fixed inset-0 z-[80] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 max-w-lg w-full space-y-4 shadow-2xl animate-in zoom-in-95">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
                        <Repeat className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-base font-extrabold text-white">Inserir Aparelho na Troca (Trade-In)</h3>
                        <p className="text-xs text-slate-400">Abater valor de aparelho usado como entrada nesta venda</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowTradeInModal(false)}
                      className="text-slate-400 hover:text-white p-1 rounded-lg text-lg cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Sub-abas do Modal */}
                  <div className="flex items-center gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setAbaModalTradeIn('avaliacoes')}
                      className={cn(
                        "flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer",
                        abaModalTradeIn === 'avaliacoes' ? "bg-cyan-500 text-slate-950 font-black" : "text-slate-400 hover:text-white"
                      )}
                    >
                      Propostas Salvas ({avaliacoesUpgradeDisponiveis.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setAbaModalTradeIn('manual')}
                      className={cn(
                        "flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer",
                        abaModalTradeIn === 'manual' ? "bg-cyan-500 text-slate-950 font-black" : "text-slate-400 hover:text-white"
                      )}
                    >
                      Informar na Hora (Manual)
                    </button>
                  </div>

                  {/* ABA 1: Propostas Salvas */}
                  {abaModalTradeIn === 'avaliacoes' && (
                    <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
                      {carregandoAvaliacoesTradeIn ? (
                        <div className="p-8 text-center text-xs text-slate-400">Carregando avaliações...</div>
                      ) : avaliacoesUpgradeDisponiveis.length === 0 ? (
                        <div className="p-8 text-center bg-slate-950/60 border border-slate-800 rounded-2xl space-y-1">
                          <p className="text-xs font-bold text-slate-300">Nenhuma proposta de upgrade pendente</p>
                          <p className="text-[11px] text-slate-500">Alterne para a aba "Informar na Hora" para cadastrar o aparelho trazido pelo cliente.</p>
                        </div>
                      ) : (
                        avaliacoesUpgradeDisponiveis.map((av) => (
                          <div
                            key={av.id}
                            className="p-3 bg-slate-950 border border-slate-800 rounded-2xl flex items-center justify-between gap-3 hover:border-slate-700 transition-colors"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-extrabold text-xs text-white truncate">{av.cliente_nome}</span>
                                <span className="text-[10px] font-mono text-cyan-400 font-bold">{av.protocolo}</span>
                              </div>
                              <p className="text-xs font-bold text-slate-300">{av.modelo} {av.capacidade}</p>
                              <span className="text-[11px] text-emerald-400 font-extrabold">
                                Valor: R$ {(av.valor_aprovado || av.valor_avaliado || 0).toFixed(2)}
                              </span>
                            </div>

                            <Button
                              type="button"
                              size="sm"
                              onClick={() => aplicarTradeInNaVenda({
                                avaliacaoId: av.id,
                                modelo: av.modelo,
                                capacidade: av.capacidade,
                                valor: av.valor_aprovado || av.valor_avaliado || 0,
                                bateria: av.bateria_saude || 85,
                                cor: av.cor || 'Preto',
                              })}
                              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-xl h-8 px-3 shrink-0 cursor-pointer"
                            >
                              Usar na Troca ➔
                            </Button>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* ABA 2: Manual */}
                  {abaModalTradeIn === 'manual' && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] font-bold text-slate-400 block mb-1">Modelo do Aparelho</label>
                          <input
                            type="text"
                            placeholder="Ex: iPhone 12 Pro"
                            value={modeloTradeInManual}
                            onChange={(e) => setModeloTradeInManual(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-slate-400 block mb-1">Capacidade</label>
                          <input
                            type="text"
                            placeholder="Ex: 128GB"
                            value={capacidadeTradeInManual}
                            onChange={(e) => setCapacidadeTradeInManual(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2">
                          <label className="text-[11px] font-bold text-slate-400 block mb-1">Valor de Entrada / Troca (R$)</label>
                          <input
                            type="number"
                            placeholder="0.00"
                            value={valorTradeInManual}
                            onChange={(e) => setValorTradeInManual(parseFloat(e.target.value) || 0)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-emerald-400 font-extrabold outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-slate-400 block mb-1">Bateria (%)</label>
                          <input
                            type="number"
                            value={bateriaTradeInManual}
                            onChange={(e) => setBateriaTradeInManual(parseInt(e.target.value) || 85)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-slate-400 block mb-1">IMEI ou Número de Série (Opcional)</label>
                        <input
                          type="text"
                          placeholder="Para já cadastrar no estoque..."
                          value={imeiTradeInManual}
                          onChange={(e) => setImeiTradeInManual(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none"
                        />
                      </div>

                      <Button
                        type="button"
                        onClick={() => {
                          if (!modeloTradeInManual.trim() || valorTradeInManual <= 0) {
                            toast.error('Informe o modelo e um valor válido de troca.');
                            return;
                          }
                          aplicarTradeInNaVenda({
                            modelo: modeloTradeInManual.trim(),
                            capacidade: capacidadeTradeInManual.trim(),
                            valor: valorTradeInManual,
                            bateria: bateriaTradeInManual,
                            imei: imeiTradeInManual.trim(),
                          });
                        }}
                        className="w-full bg-gradient-to-r from-emerald-500 to-cyan-500 text-slate-950 font-black text-xs py-2.5 rounded-xl cursor-pointer"
                      >
                        Confirmar Aparelho de Entrada (R$ {valorTradeInManual.toFixed(2)}) ➔
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>,
          document.body
        )}

        {/* Tabela de Vendas e Filtros Integrados */}
        <GlassCard className="rounded-3xl p-4 sm:p-6 space-y-4">
          {/* Cabeçalho + Barra de Filtros Resumida */}
          <div className="flex flex-col gap-3 pb-4 border-b border-white/10">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base sm:text-lg font-bold">Vendas Registradas</h3>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {vendasFiltradas.length} de {contagemCanais.total} vendas
                  {filtroPeriodo === 'mes' ? ' neste mês' : ' registradas'}
                  {filtroPeriodo === 'mes' && vendas.length > contagemCanais.total && (
                    <span className="text-slate-500"> · {vendas.length} no total</span>
                  )}
                </p>
              </div>

              {/* Ações Rápidas de Filtro */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 p-1 bg-slate-900/90 border border-slate-800 rounded-xl">
                  {[
                    { id: 'mes' as const, label: 'Este mês' },
                    { id: 'todos' as const, label: 'Todo o período' },
                  ].map((opcao) => (
                    <button
                      key={opcao.id}
                      type="button"
                      onClick={() => setFiltroPeriodo(opcao.id)}
                      className={cn(
                        'px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer',
                        filtroPeriodo === opcao.id
                          ? 'bg-cyan-500 text-slate-950'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                      )}
                    >
                      {opcao.label}
                    </button>
                  ))}
                </div>
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

            {/* SUB-ABAS DE CANAIS DE VENDA */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-900/90 border border-slate-800 rounded-2xl w-full sm:w-fit overflow-x-auto no-scrollbar sm:flex-wrap">
              {[
                { id: 'varejo', label: '📱 Varejo', count: contagemCanais.varejo, color: 'text-emerald-400' },
                { id: 'pendentes', label: '⚠️ Dados Pendentes', count: contagemCanais.pendentes, color: 'text-amber-400', isAlert: true },
                { id: 'atacado', label: '📦 Atacado (Lojistas)', count: contagemCanais.atacado, color: 'text-cyan-400' },
                { id: 'todos', label: '📋 Todas as Vendas', count: contagemCanais.total, color: 'text-slate-300' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFiltroCanal(tab.id as any)}
                  className={cn(
                    "shrink-0 whitespace-nowrap px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer",
                    filtroCanal === tab.id
                      ? "bg-cyan-500 text-slate-950 font-black shadow-md shadow-cyan-950/40"
                      : "text-slate-400 hover:text-white hover:bg-slate-800/60"
                  )}
                >
                  <span>{tab.label}</span>
                  <span className={cn(
                    "px-1.5 py-0.5 rounded-full text-[10px] font-black",
                    filtroCanal === tab.id
                      ? "bg-slate-950/20 text-slate-950"
                      : tab.isAlert && tab.count > 0 ? "bg-amber-500/20 text-amber-300 animate-pulse" : "bg-slate-800 text-slate-400"
                  )}>
                    {tab.count}
                  </span>
                </button>
              ))}
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
                    <th className="py-3 px-2">Canal</th>
                    <th className="py-3 px-2">Cliente / Lojista</th>
                    <th className="text-left py-3 px-2 hidden sm:table-cell">Aparelho</th>
                    <th className="text-right py-3 px-2">Valor</th>
                    <th className="text-right py-3 px-2 hidden sm:table-cell">Lucro</th>
                    <th className="py-3 px-2 hidden sm:table-cell">Método</th>
                    <th className="py-3 px-2">Status</th>
                    <th className="text-right py-3 px-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {vendasFiltradas.map((venda) => {
                    const isAtacado = isAtacadoVenda(venda);
                    const isPendente = !isAtacado && verificarVendaDadosPendentes(venda, clientes);

                    return (
                    <tr key={venda.id} className={cn("border-b border-white/10 last:border-0 text-xs sm:text-sm hover:bg-white/5 transition-colors", isPendente && "bg-amber-500/5")}>
                      <td className="py-3 px-2 font-mono text-xs text-blue-400 font-bold">#{venda.id ? venda.id.slice(-6).toUpperCase() : 'N/A'}</td>
                      <td className="py-3 px-2 hidden md:table-cell text-xs text-muted-foreground whitespace-nowrap">
                        {getVendaDataExibicao(venda).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-1">
                          {isAtacado ? (
                            <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-[10px] font-bold">
                              Atacado
                            </Badge>
                          ) : (
                            <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[10px] font-bold">
                              Varejo
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-2 font-medium">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={isPendente ? "text-amber-300 font-bold" : ""}>{venda.clienteNome}</span>
                          {isPendente && (
                            <button
                              type="button"
                              onClick={() => {
                                const itemPrincipal = venda.itens?.[0];
                                setVendaRegistroParaEditar({
                                  id: venda.id,
                                  vendaId: venda.id,
                                  aparelhoId: itemPrincipal?.aparelhoId,
                                  data: venda.dataPagamento || (venda as any).data || new Date().toISOString(),
                                  comprador: venda.clienteNome || '',
                                  modelo: itemPrincipal?.descricao || venda.descricao || 'Item Venda',
                                  valorVenda: venda.valor || 0,
                                  custo: venda.custo || 0,
                                  metodoPgto: venda.metodo || 'pix',
                                  tipoVenda: (venda as any).tipoEntrega || 'Varejo',
                                  observacoes: venda.descricao || '',
                                  itens: venda.itens,
                                  raw: venda,
                                });
                              }}
                              className="text-[10px] font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 px-2 py-0.5 rounded-md border border-amber-500/40 cursor-pointer flex items-center gap-1 shadow-sm"
                              title="Completar dados do cliente para emitir a notinha"
                            >
                              <Edit className="w-3 h-3" /> Completar Notinha
                            </button>
                          )}
                        </div>
                        {/* Exibição compacta do aparelho e IMEI em telas móveis */}
                        <div className="sm:hidden mt-1 flex flex-col gap-0.5 text-[11px]">
                          {(() => {
                            const apInfo = extrairAparelhoEImeiDaVenda(venda, aparelhos);
                            return (
                              <>
                                <span className="truncate max-w-[170px] font-semibold text-slate-300" title={apInfo.nomeAparelho}>
                                  {apInfo.nomeAparelho}
                                </span>
                                {apInfo.imei && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-cyan-400">
                                    <Smartphone className="w-2.5 h-2.5" /> IMEI: {apInfo.imei.length > 8 ? `...${apInfo.imei.slice(-6)}` : apInfo.imei}
                                  </span>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </td>
                      <td className="py-3 px-2 hidden sm:table-cell">
                        {(() => {
                          const apInfo = extrairAparelhoEImeiDaVenda(venda, aparelhos);
                          return (
                            <div className="flex flex-col gap-1 max-w-[280px]">
                              <span className="font-semibold text-slate-200 text-xs truncate leading-snug" title={apInfo.nomeAparelho}>
                                {apInfo.nomeAparelho}
                              </span>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {apInfo.imei ? (
                                  <span
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-xs"
                                    title={`IMEI Completo: ${apInfo.imei}`}
                                  >
                                    <Smartphone className="w-2.5 h-2.5 shrink-0 text-cyan-400" />
                                    <span>IMEI: {apInfo.imei.length > 8 ? `...${apInfo.imei.slice(-6)}` : apInfo.imei}</span>
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-slate-500 italic">
                                    Sem IMEI
                                  </span>
                                )}
                                {apInfo.outrosItensCount > 0 && (
                                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-slate-800 text-slate-400 border-slate-700">
                                    +{apInfo.outrosItensCount} {apInfo.outrosItensCount === 1 ? 'outro' : 'outros'}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="py-3 px-2 text-right font-bold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(venda.valor)}</td>
                      <td className="py-3 px-2 text-right hidden sm:table-cell text-green-600 font-medium">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(venda.lucro)}</td>
                      <td className="py-3 px-2 hidden sm:table-cell text-xs">{metodoLabel(venda.metodo)}</td>
                      <td className="py-3 px-2">
                        <Badge variant={venda.status === 'pago' ? 'default' : venda.status === 'pendente' ? 'secondary' : 'outline'} className="text-xs">
                          {venda.status === 'pago' ? 'Pago' : venda.status === 'pendente' ? 'Pendente' : 'Cancelado'}
                        </Badge>
                      </td>
                      <td className="py-3 px-2 text-right">
                        <div className="flex gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Desfazer venda e devolver ao estoque"
                            onClick={() => setVendaParaDesfazer(venda)}
                            className="h-8 w-8 p-0 text-amber-500 hover:text-amber-400 hover:bg-amber-500/10"
                          >
                            <Undo2 className="h-4 w-4" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              <DropdownMenuItem
                                onClick={() => {
                                  const itemPrincipal = venda.itens?.[0];
                                  setVendaRegistroParaEditar({
                                    id: venda.id,
                                    vendaId: venda.id,
                                    aparelhoId: itemPrincipal?.aparelhoId,
                                    data: venda.dataPagamento || (venda as any).data || new Date().toISOString(),
                                    comprador: venda.clienteNome || '',
                                    modelo: itemPrincipal?.descricao || venda.descricao || 'Item Venda',
                                    valorVenda: venda.valor || 0,
                                    custo: venda.custo || 0,
                                    metodoPgto: venda.metodo || 'pix',
                                    tipoVenda: (venda as any).tipoEntrega || 'Varejo',
                                    observacoes: venda.descricao || '',
                                    itens: venda.itens,
                                    raw: venda,
                                  });
                                }}
                              >
                                <Edit className="mr-2 h-4 w-4 text-amber-400" />
                                Editar Custos / Dados
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleEdit(venda)}>
                                <Repeat className="mr-2 h-4 w-4 text-blue-400" />
                                Reabrir no PDV
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
                              <DropdownMenuItem onClick={() => handleEmitirFiscalManual(venda, 'nfce')}>
                                <FileText className="mr-2 h-4 w-4 text-blue-400" />
                                Emitir NFC-e (Fiscal)
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleConsultarFiscalManual(venda)}>
                                <ShieldCheck className="mr-2 h-4 w-4 text-emerald-400" />
                                Ver / Consultar DANFE
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
                                <Undo2 className="mr-2 h-4 w-4" />
                                Desfazer Venda
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  );
                })}
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

      {/* Modal de Confirmação — Desfazer Venda */}
      {isClient && vendaParaDesfazer && createPortal(
        <div className="modal-overlay modal-overlay-fit z-[80]">
          <GlassCard className="modal-panel modal-panel-fit modal-panel-md w-full my-4">
            <div className="modal-header">
              <h3 className="modal-title flex items-center gap-2 text-amber-400 font-bold">
                <Undo2 className="w-5 h-5" /> Desfazer Venda
              </h3>
              <button
                type="button"
                onClick={() => setVendaParaDesfazer(null)}
                disabled={desfazendoVenda}
                className="text-slate-400 hover:text-white disabled:opacity-40"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="modal-body space-y-4">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-1">
                <p className="text-sm font-bold text-white">
                  Venda #{vendaParaDesfazer.id.slice(-6).toUpperCase()}
                </p>
                <p className="text-xs text-slate-400">
                  {vendaParaDesfazer.clienteNome} ·{' '}
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(vendaParaDesfazer.valor)}
                  {' · '}
                  {getVendaDataExibicao(vendaParaDesfazer).toLocaleDateString('pt-BR')}
                </p>
              </div>

              {(() => {
                const itensComAparelho = (vendaParaDesfazer.itens || []).filter((i) => i.aparelhoId);
                if (itensComAparelho.length === 0) {
                  return (
                    <p className="text-xs text-slate-400">
                      Esta venda não tem aparelho vinculado ao estoque; nada será devolvido.
                    </p>
                  );
                }
                return (
                  <div className="space-y-1.5">
                    <p className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                      <PackageCheck className="w-3.5 h-3.5" />
                      Volta{itensComAparelho.length > 1 ? 'm' : ''} ao estoque:
                    </p>
                    <ul className="space-y-1">
                      {itensComAparelho.map((item) => (
                        <li key={item.id} className="text-xs text-slate-300 pl-5">
                          • {item.descricao}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })()}

              <p className="text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5">
                O registro desta venda será removido do histórico e deixará de contar no
                faturamento. Esta ação não pode ser desfeita.
              </p>
            </div>

            <div className="flex gap-2 justify-end p-4 border-t border-white/10">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setVendaParaDesfazer(null)}
                disabled={desfazendoVenda}
              >
                Voltar
              </Button>
              <Button
                type="button"
                onClick={() => desfazerVenda(vendaParaDesfazer)}
                disabled={desfazendoVenda}
                className="bg-amber-600 hover:bg-amber-500 text-white font-bold"
              >
                {desfazendoVenda ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Desfazendo...
                  </>
                ) : (
                  <>
                    <Undo2 className="mr-2 h-4 w-4" /> Desfazer e devolver ao estoque
                  </>
                )}
              </Button>
            </div>
          </GlassCard>
        </div>,
        document.body
      )}

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

      {/* Cadastro rápido de aparelho no PDV */}
      <NovoAparelhoRapidoModal
        aberto={isClient && showNovoAparelho}
        onFechar={fecharCadastroRapido}
        aparelhos={aparelhos}
        carrinhoAparelhoIds={carrinho.map((item) => item.aparelhoId || '').filter(Boolean)}
        podeVerFinanceiro={canViewFinancials(usuario)}
        usuario={usuario}
        valoresIniciais={cadastroRapidoInicial}
        codigoEscaneado={codigoParaCadastro}
        scannerAberto={showBarcodeScanner}
        onAbrirScanner={() => {
          setScannerAlvo('novoAparelho');
          setShowBarcodeScanner(true);
        }}
        criarAparelho={criarAparelhoParaCadastroRapido}
        onUsarExistente={(aparelho) => {
          fecharCadastroRapido();
          if (adicionarAparelhoAoCarrinho(aparelho)) toast.success(`${aparelho.modelo} adicionado à venda`);
        }}
        onConcluido={concluirCadastroRapido}
      />

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
                  aparelhos={aparelhos.filter(aparelhoNoEstoque)}
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

      {/* Barcode Scanner Modal for POS Vendas */}
      <ModalPortal>
        <BarcodeScannerModal
          isOpen={showBarcodeScanner}
          onClose={() => {
            setShowBarcodeScanner(false);
            setScannerAlvo('item');
          }}
          onScan={(barcode) => {
            if (scannerAlvo === 'novoAparelho') {
              setCodigoParaCadastro({ valor: barcode, seq: Date.now() });
              setShowBarcodeScanner(false);
              setScannerAlvo('item');
              return;
            }
            selecionarAparelhoPorCodigo(barcode);
          }}
          title={scannerAlvo === 'novoAparelho' ? 'Ler IMEI do aparelho novo' : 'Scanner de Código de Barras PDV'}
          subtitle="Aponte a câmera ou bipe o código do aparelho com o leitor USB"
        />
      </ModalPortal>

      {/* Modal de Edição de Custos / Dados de Venda Retroativa */}
      <ModalPortal>
        <EditarVendaRegistroModal
          isOpen={!!vendaRegistroParaEditar}
          onClose={() => setVendaRegistroParaEditar(null)}
          venda={vendaRegistroParaEditar}
          lojaId={usuario?.lojaId || null}
          onSuccess={async () => {
            await carregarVendas();
            await fetchAparelhos();
          }}
        />
      </ModalPortal>

      {/* Modal de Vincular Aparelho Já Vendido */}
      <ModalPortal>
        <VincularVendidoModal
          isOpen={showVincularVendidoModal}
          onClose={() => setShowVincularVendidoModal(false)}
          aparelhos={aparelhos}
          clientes={clientes}
          lojaId={usuario?.lojaId || null}
          onSuccess={async () => {
            await carregarVendas();
            await fetchAparelhos();
          }}
          onEmitirNotinha={(venda) => {
            handleGerarReciboA4(venda);
          }}
        />
      </ModalPortal>
    </div>
  );
}
