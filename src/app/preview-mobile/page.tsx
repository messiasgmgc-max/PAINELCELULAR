'use client';

import React, { useState, useRef } from 'react';
import {
  Smartphone,
  SlidersHorizontal,
  Plus,
  Search,
  Filter,
  Layers,
  Sparkles,
  Maximize2,
  Minimize2,
  CheckCircle2,
  Eye,
  Info,
  X,
  TrendingUp,
  DollarSign,
  Package,
  ShoppingBag,
  Calendar,
  Share2,
  CreditCard,
} from 'lucide-react';
import { MobileHeader } from '@/components/mobile-preview/MobileHeader';
import { MobileBottomBar } from '@/components/mobile-preview/MobileBottomBar';
import { MobileDeviceRow, MockAparelho } from '@/components/mobile-preview/MobileDeviceRow';
import { MobileFiltersSheet } from '@/components/mobile-preview/MobileFiltersSheet';
import { MobileDeviceDetailsSheet } from '@/components/mobile-preview/MobileDeviceDetailsSheet';
import { MobileNewDeviceSheet } from '@/components/mobile-preview/MobileNewDeviceSheet';
import { MobileSaleRow, MockVenda } from '@/components/mobile-preview/MobileSaleRow';
import { MobileSaleDetailsSheet } from '@/components/mobile-preview/MobileSaleDetailsSheet';
import { MobileNewSaleSheet } from '@/components/mobile-preview/MobileNewSaleSheet';
import { MobileImportSaleSheet } from '@/components/mobile-preview/MobileImportSaleSheet';
import { MobileTaxasView } from '@/components/mobile-preview/MobileTaxasView';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const MOCK_APARELHOS: MockAparelho[] = [
  {
    id: '1',
    modelo: 'iPhone 11',
    capacidade: '64GB',
    cor: 'Preto',
    bateria: 83,
    preco_venda: 1650,
    preco_atacado: 1450,
    status: 'Em estoque',
    imei: '354920194820192',
    condicao: 'Seminovo Muito Bom (Grade B)',
    categoria: 'Seminovos',
  },
  {
    id: '2',
    modelo: 'iPhone 11',
    capacidade: '128GB',
    cor: 'Branco',
    bateria: 87,
    preco_venda: 1850,
    preco_atacado: 1650,
    status: 'Em estoque',
    imei: '358920194820145',
    condicao: 'Seminovo Impecável (Grade A)',
    categoria: 'Seminovos',
  },
  {
    id: '3',
    modelo: 'iPhone 12',
    capacidade: '128GB',
    cor: 'Azul',
    bateria: 89,
    preco_venda: 2250,
    preco_atacado: 2050,
    status: 'Em estoque',
    imei: '357920194820188',
    condicao: 'Seminovo Impecável (Grade A)',
    categoria: 'Seminovos',
  },
  {
    id: '4',
    modelo: 'iPhone 13',
    capacidade: '128GB',
    cor: 'Meia-Noite',
    bateria: 92,
    preco_venda: 2790,
    preco_atacado: 2550,
    status: 'Em estoque',
    imei: '351920194820101',
    condicao: 'Seminovo Impecável (Grade A)',
    categoria: 'Seminovos',
  },
  {
    id: '5',
    modelo: 'iPhone 13 Pro',
    capacidade: '256GB',
    cor: 'Azul Sierra',
    bateria: 86,
    preco_venda: 3490,
    preco_atacado: 3200,
    status: 'Reservado',
    imei: '352920194820122',
    condicao: 'Seminovo Impecável (Grade A)',
    categoria: 'Seminovos',
  },
  {
    id: '6',
    modelo: 'iPhone 14',
    capacidade: '128GB',
    cor: 'Estelar',
    bateria: 96,
    preco_venda: 3390,
    preco_atacado: 3100,
    status: 'Em estoque',
    imei: '353920194820133',
    condicao: 'Seminovo Bateria 96%',
    categoria: 'Seminovos',
  },
  {
    id: '7',
    modelo: 'iPhone 14 Pro Max',
    capacidade: '256GB',
    cor: 'Roxo-Profundo',
    bateria: 91,
    preco_venda: 4590,
    preco_atacado: 4250,
    status: 'Em estoque',
    imei: '354920194820144',
    condicao: 'Seminovo Impecável',
    categoria: 'Seminovos',
  },
  {
    id: '8',
    modelo: 'iPhone 15',
    capacidade: '128GB',
    cor: 'Rosa',
    bateria: 100,
    preco_venda: 4390,
    preco_atacado: 4050,
    status: 'Em estoque',
    imei: '355920194820155',
    condicao: 'Lacrado 1 Ano Apple',
    categoria: 'iPhones Novos',
  },
  {
    id: '9',
    modelo: 'iPhone 15 Pro Max',
    capacidade: '256GB',
    cor: 'Titânio Natural',
    bateria: 100,
    preco_venda: 5890,
    preco_atacado: 5500,
    status: 'Em estoque',
    imei: '356920194820166',
    condicao: 'Lacrado 1 Ano Apple',
    categoria: 'iPhones Novos',
  },
];

const MOCK_VENDAS_INICIAL: MockVenda[] = [
  {
    id: '5012',
    cliente_nome: 'Marcos Vinicius Pereira',
    cliente_telefone: '(31) 98765-4321',
    cliente_cpf: '123.456.789-00',
    aparelho_modelo: 'iPhone 13',
    aparelho_capacidade: '128GB',
    aparelho_imei: '354920194820192',
    valor_total: 2850,
    lucro: 520,
    forma_pagamento: 'PIX',
    tipo_venda: 'Varejo',
    vendedor: 'Jean Junio',
    created_at: 'Hoje, 15:20',
    garantia_dias: 90,
  },
  {
    id: '5011',
    cliente_nome: 'Fernanda Caroline Silva',
    cliente_telefone: '(31) 99123-9988',
    aparelho_modelo: 'iPhone 14 Pro Max',
    aparelho_capacidade: '256GB',
    aparelho_imei: '358920194820145',
    valor_total: 4690,
    lucro: 680,
    forma_pagamento: 'Cartão',
    tipo_venda: 'Varejo',
    vendedor: 'Lucas Oliveira',
    created_at: 'Hoje, 14:05',
    garantia_dias: 90,
  },
  {
    id: '5010',
    cliente_nome: 'Rodrigo Celulares (Lojista BH)',
    cliente_telefone: '(31) 97654-3210',
    aparelho_modelo: 'iPhone 12',
    aparelho_capacidade: '128GB',
    aparelho_imei: '357920194820188',
    valor_total: 2050,
    lucro: 250,
    forma_pagamento: 'PIX',
    tipo_venda: 'Atacado',
    vendedor: 'Lucas Oliveira',
    created_at: 'Hoje, 11:30',
    garantia_dias: 30,
  },
  {
    id: '5009',
    cliente_nome: 'Camila Eduarda Santos',
    cliente_telefone: '(31) 98877-6655',
    aparelho_modelo: 'iPhone 11',
    aparelho_capacidade: '128GB',
    aparelho_imei: '351920194820101',
    valor_total: 1850,
    lucro: 350,
    forma_pagamento: 'Dinheiro',
    tipo_venda: 'Varejo',
    vendedor: 'Jean Junio',
    created_at: 'Hoje, 10:15',
    garantia_dias: 90,
  },
  {
    id: '5008',
    cliente_nome: 'Gabriel Antunes Rezende',
    cliente_telefone: '(31) 99345-6789',
    aparelho_modelo: 'iPhone 15',
    aparelho_capacidade: '128GB',
    aparelho_imei: '355920194820155',
    valor_total: 4390,
    lucro: 550,
    forma_pagamento: 'Cartão',
    tipo_venda: 'Varejo',
    vendedor: 'Lucas Oliveira',
    created_at: 'Ontem, 17:40',
    garantia_dias: 365,
  },
];

export default function PreviewMobilePage() {
  // Aba Ativa: Taxas, Estoque ou Vendas
  const [activeTab, setActiveTab] = useState<'estoque' | 'vendas' | 'taxas'>('taxas');

  // Estados de Estoque
  const [aparelhos, setAparelhos] = useState<MockAparelho[]>(MOCK_APARELHOS);
  const [selectedDevice, setSelectedDevice] = useState<MockAparelho | null>(null);
  const [isNewDeviceOpen, setIsNewDeviceOpen] = useState(false);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [categoriaAtiva, setCategoriaAtiva] = useState('Todos');
  const [filtros, setFiltros] = useState({
    categoria: 'Todas',
    capacidade: 'Todas',
    bateriaMin: 'Todas',
    status: 'Todos',
  });

  // Estados de Vendas
  const [vendas, setVendas] = useState<MockVenda[]>(MOCK_VENDAS_INICIAL);
  const [selectedVenda, setSelectedVenda] = useState<MockVenda | null>(null);
  const [isNewSaleOpen, setIsNewSaleOpen] = useState(false);
  const [isImportSaleOpen, setIsImportSaleOpen] = useState(false);
  const [filtroTipoVenda, setFiltroTipoVenda] = useState<'Todas' | 'Varejo' | 'Atacado'>('Todas');

  // Configurações da Página de Teste
  const [density, setDensity] = useState<'compact' | 'detailed'>('compact');
  const [frameMode, setFrameMode] = useState<boolean>(true);
  const [autoHideHeader, setAutoHideHeader] = useState<boolean>(true);
  const [isHeaderVisible, setIsHeaderVisible] = useState<boolean>(true);
  const [busca, setBusca] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // Detecção de Scroll para Auto-Hide do Header
  const lastScrollY = useRef(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (!autoHideHeader) return;
    const currentScrollY = e.currentTarget.scrollTop;
    if (currentScrollY > lastScrollY.current && currentScrollY > 60) {
      setIsHeaderVisible(false);
    } else if (currentScrollY < lastScrollY.current) {
      setIsHeaderVisible(true);
    }
    lastScrollY.current = currentScrollY;
  };

  // Filtragem de Aparelhos
  const aparelhosFiltrados = aparelhos.filter((item) => {
    if (busca.trim()) {
      const termo = busca.toLowerCase();
      const match =
        item.modelo.toLowerCase().includes(termo) ||
        item.cor.toLowerCase().includes(termo) ||
        item.capacidade.toLowerCase().includes(termo) ||
        (item.imei && item.imei.includes(termo));
      if (!match) return false;
    }
    if (categoriaAtiva !== 'Todos' && item.categoria !== categoriaAtiva) return false;
    if (filtros.categoria !== 'Todas' && item.categoria !== filtros.categoria) return false;
    if (filtros.capacidade !== 'Todas' && item.capacidade !== filtros.capacidade) return false;
    if (filtros.status !== 'Todos' && item.status !== filtros.status) return false;
    if (filtros.bateriaMin !== 'Todas' && item.bateria) {
      const min = Number(filtros.bateriaMin.replace(/\D/g, ''));
      if (item.bateria < min) return false;
    }
    return true;
  });

  // Filtragem de Vendas
  const vendasFiltradas = vendas.filter((v) => {
    if (busca.trim()) {
      const termo = busca.toLowerCase();
      const match =
        v.cliente_nome.toLowerCase().includes(termo) ||
        v.aparelho_modelo.toLowerCase().includes(termo) ||
        (v.cliente_telefone && v.cliente_telefone.includes(termo)) ||
        (v.aparelho_imei && v.aparelho_imei.includes(termo));
      if (!match) return false;
    }
    if (filtroTipoVenda !== 'Todas' && v.tipo_venda !== filtroTipoVenda) return false;
    return true;
  });

  // Métricas do Topo de Vendas
  const totalFaturamento = vendasFiltradas.reduce((acc, curr) => acc + curr.valor_total, 0);
  const totalLucro = vendasFiltradas.reduce((acc, curr) => acc + (curr.lucro || curr.valor_total * 0.18), 0);

  const showToast = (msg: string) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center">
      {/* BARRA SUPERIOR DE CONTROLE E TESTE (Exclusiva para você testar) */}
      <div className="w-full bg-slate-900 border-b border-blue-500/20 px-3 py-2.5 z-50 sticky top-0 shadow-lg">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Seletor de Aba: Taxas vs Estoque vs Vendas */}
          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => {
                setActiveTab('taxas');
                setBusca('');
              }}
              className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'taxas'
                  ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5" />
              Aba Taxas
            </button>
            <button
              onClick={() => {
                setActiveTab('vendas');
                setBusca('');
              }}
              className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'vendas'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              Aba Vendas
            </button>
            <button
              onClick={() => {
                setActiveTab('estoque');
                setBusca('');
              }}
              className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'estoque'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              Aba Estoque
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Alternar Moldura */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setFrameMode(!frameMode)}
              className="h-8 text-xs border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
            >
              {frameMode ? <Maximize2 className="w-3.5 h-3.5 mr-1" /> : <Minimize2 className="w-3.5 h-3.5 mr-1" />}
              {frameMode ? 'Tela Aberta' : 'Moldura iPhone'}
            </Button>

            {/* Alternar Densidade */}
            <Button
              size="sm"
              onClick={() => setDensity(density === 'compact' ? 'detailed' : 'compact')}
              className={`h-8 text-xs font-bold cursor-pointer transition-all ${
                density === 'compact'
                  ? 'bg-blue-600 hover:bg-blue-500 text-white'
                  : 'bg-slate-800 text-slate-300 border border-slate-700'
              }`}
            >
              <Layers className="w-3.5 h-3.5 mr-1" />
              {density === 'compact' ? 'Modo: Linhas 54px' : 'Modo: Cards 180px'}
            </Button>

            {/* Alternar Auto-Hide Header */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setAutoHideHeader(!autoHideHeader);
                setIsHeaderVisible(true);
              }}
              className={`h-8 text-xs border-slate-700 cursor-pointer ${
                autoHideHeader ? 'text-blue-400 bg-blue-950/30 border-blue-500/30' : 'text-slate-400 bg-slate-800'
              }`}
            >
              Auto-Hide: {autoHideHeader ? 'LIGADO' : 'DESLIGADO'}
            </Button>
          </div>
        </div>
      </div>

      {/* GUIA DE RECURSOS PARA TAXAS, VENDAS E ESTOQUE */}
      <div className="w-full max-w-4xl px-4 py-2.5 bg-blue-950/20 border-b border-blue-500/10 text-xs text-slate-300">
        <div className="flex items-center gap-1.5 font-bold text-cyan-400">
          <Info className="w-4 h-4 shrink-0" />
          {activeTab === 'taxas' ? (
            <span>
              <strong>Calculadora de Taxas no Mobile:</strong> Input gigante com botões +100/+500/+1000, alternador instantâneo Modo Cliente (oculta lucros) / Modo Lojista (mostra lucros), linhas de 52px de 1x a 18x e cópia formatada para o WhatsApp em 1 clique!
            </span>
          ) : activeTab === 'vendas' ? (
            <span>
              <strong>Como funciona a Aba de Vendas no Mobile:</strong> Resumo financeiro compacto no topo, linhas de 54px (cliente + aparelho + valor), toque na venda abre comprovante instantâneo para enviar no WhatsApp ou gerar PDF, e botão central <strong>"+ Nova Venda"</strong> no polegar!
            </span>
          ) : (
            <span>
              <strong>Aba de Estoque no Mobile:</strong> Linha de 52px com modelo, GB, cor, bateria e status. Toque no item para abrir o Bottom Sheet de detalhes, edição, venda e baixa rápida.
            </span>
          )}
        </div>
      </div>

      {/* CONTAINER DO DISPOSITIVO (Moldura móvel ou Tela cheia) */}
      <div className={`w-full flex justify-center py-4 px-2 sm:px-4 ${frameMode ? 'max-w-md' : 'max-w-2xl'}`}>
        <div
          className={`w-full bg-slate-950 flex flex-col relative transition-all shadow-2xl ${
            frameMode
              ? 'h-[800px] rounded-[44px] border-[8px] border-slate-800/90 overflow-hidden ring-1 ring-white/10'
              : 'min-h-[85vh] rounded-3xl border border-slate-800 overflow-hidden'
          }`}
        >
          {/* Entalhe / Dynamic Island */}
          {frameMode && (
            <div className="w-full flex justify-center pt-2 pb-1 bg-slate-950 shrink-0 z-40">
              <div className="w-24 h-4 bg-slate-900 rounded-full border border-slate-800 flex items-center justify-end px-2">
                <div className="w-2 h-2 rounded-full bg-slate-950 border border-slate-800" />
              </div>
            </div>
          )}

          {/* HEADER INTELIGENTE COM AUTO-HIDE */}
          <MobileHeader
            nomeLoja="Phone Center"
            categoriaAtiva={categoriaAtiva}
            onSelectCategoria={(cat) => setCategoriaAtiva(cat)}
            isVisible={isHeaderVisible}
          />

          {/* CONTEÚDO ROLÁVEL PRINCIPAL */}
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto px-3.5 pt-3 pb-24 overscroll-contain space-y-3"
          >
            {/* ======================================= */}
            {/* SE ESTIVER NA ABA DE VENDAS             */}
            {/* ======================================= */}
            {activeTab === 'vendas' && (
              <>
                {/* 1. Resumo Financeiro Compacto (Estilo Fintech) */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 bg-gradient-to-br from-emerald-950/40 to-slate-900 border border-emerald-500/30 rounded-2xl">
                    <div className="flex items-center justify-between text-slate-400 text-[10.5px]">
                      <span>Faturamento</span>
                      <span className="text-emerald-400 font-bold">{vendasFiltradas.length} vendas</span>
                    </div>
                    <div className="text-lg font-black text-emerald-400 mt-1">
                      R$ {totalFaturamento.toLocaleString('pt-BR')}
                    </div>
                  </div>

                  <div className="p-3 bg-gradient-to-br from-cyan-950/40 to-slate-900 border border-cyan-500/30 rounded-2xl">
                    <div className="flex items-center justify-between text-slate-400 text-[10.5px]">
                      <span>Lucro Estimado</span>
                      <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
                    </div>
                    <div className="text-lg font-black text-cyan-300 mt-1">
                      R$ {totalLucro.toLocaleString('pt-BR')}
                    </div>
                  </div>
                </div>

                {/* 2. Filtros Rápidos de Venda (Todas / Varejo / Atacado) */}
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                  {(['Todas', 'Varejo', 'Atacado'] as const).map((tipo) => (
                    <button
                      key={tipo}
                      onClick={() => setFiltroTipoVenda(tipo)}
                      className={`text-xs px-3 py-1 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer ${
                        filtroTipoVenda === tipo
                          ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                          : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {tipo}
                    </button>
                  ))}
                </div>

                {/* 3. Campo de Busca de Vendas */}
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <Input
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar por cliente, aparelho ou telefone..."
                    className="h-10 pl-9 pr-8 bg-slate-900/80 border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:border-emerald-500"
                  />
                  {busca && (
                    <button
                      onClick={() => setBusca('')}
                      className="absolute right-2.5 top-2.5 p-0.5 rounded text-slate-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* 4. Lista de Vendas */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs px-1 text-slate-400">
                    <span>
                      Mostrando <strong className="text-white">{vendasFiltradas.length}</strong> vendas
                    </span>
                    <span className="text-[11px] text-emerald-400 font-medium">
                      {density === 'compact' ? 'Linhas 54px' : 'Cards 180px'}
                    </span>
                  </div>

                  {vendasFiltradas.map((venda) => (
                    <MobileSaleRow
                      key={venda.id}
                      venda={venda}
                      density={density}
                      onClick={() => setSelectedVenda(venda)}
                    />
                  ))}

                  {vendasFiltradas.length === 0 && (
                    <div className="py-12 text-center text-slate-500 text-xs">
                      Nenhuma venda encontrada com estes filtros.
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ======================================= */}
            {/* SE ESTIVER NA ABA DE ESTOQUE            */}
            {/* ======================================= */}
            {activeTab === 'estoque' && (
              <>
                {/* Campo de Busca de Estoque */}
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <Input
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar modelo, cor ou IMEI..."
                    className="h-10 pl-9 pr-8 bg-slate-900/80 border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:border-blue-500"
                  />
                  {busca && (
                    <button
                      onClick={() => setBusca('')}
                      className="absolute right-2.5 top-2.5 p-0.5 rounded text-slate-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Contadores de Estoque */}
                <div className="flex items-center justify-between text-xs px-1 text-slate-400">
                  <span>
                    Mostrando <strong className="text-white">{aparelhosFiltrados.length}</strong> de {aparelhos.length} aparelhos
                  </span>
                  <span className="text-[11px] text-blue-400 font-medium">
                    {density === 'compact' ? 'Linhas 52px' : 'Cards 180px'}
                  </span>
                </div>

                {/* Lista de Aparelhos */}
                <div className="space-y-1.5">
                  {aparelhosFiltrados.map((item) => (
                    <MobileDeviceRow
                      key={item.id}
                      aparelho={item}
                      density={density}
                      onClick={() => setSelectedDevice(item)}
                    />
                  ))}

                  {aparelhosFiltrados.length === 0 && (
                    <div className="py-12 text-center text-slate-500 text-xs">
                      Nenhum aparelho encontrado com estes filtros.
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ======================================= */}
            {/* SE ESTIVER NA ABA DE TAXAS              */}
            {/* ======================================= */}
            {activeTab === 'taxas' && (
              <MobileTaxasView
                density={density}
                onToast={showToast}
              />
            )}
          </div>

          {/* BARRA INFERIOR FLUTUANTE ADAPTADA */}
          <MobileBottomBar
            activeTab={activeTab}
            onSearchClick={() => {
              if (scrollContainerRef.current) {
                scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
              }
              setIsHeaderVisible(true);
            }}
            onFilterClick={() => {
              if (activeTab === 'taxas') {
                window.dispatchEvent(new CustomEvent('phonecenter:taxas-action', { detail: { action: 'trocar-maquina' } }));
              } else {
                setIsFilterSheetOpen(true);
              }
            }}
            onNewDeviceClick={() => {
              if (activeTab === 'vendas') {
                setIsNewSaleOpen(true);
              } else if (activeTab === 'estoque') {
                setIsNewDeviceOpen(true);
              }
            }}
            onConferirClick={() => {
              if (activeTab === 'vendas') {
                showToast('Relatório de fechamento de caixa do dia gerado!');
              } else {
                showToast('Abrindo modo conferência de estoque!');
              }
            }}
            onImportarPedidoClick={() => setIsImportSaleOpen(true)}
            onVincularVendidoClick={() => showToast('Abrindo vinculação de aparelho já baixado do estoque!')}
            onTaxasWhatsappClick={() => {
              window.dispatchEvent(new CustomEvent('phonecenter:taxas-action', { detail: { action: 'copy-whatsapp' } }));
            }}
            onTaxasToggleModoClick={() => {
              window.dispatchEvent(new CustomEvent('phonecenter:taxas-action', { detail: { action: 'toggle-modo' } }));
            }}
            onTaxasResetClick={() => {
              window.dispatchEvent(new CustomEvent('phonecenter:taxas-action', { detail: { action: 'zerar' } }));
            }}
            filtrosAtivosCount={
              activeTab === 'vendas'
                ? filtroTipoVenda !== 'Todas' ? 1 : 0
                : activeTab === 'taxas'
                ? 0
                : [
                    filtros.categoria !== 'Todas',
                    filtros.capacidade !== 'Todas',
                    filtros.bateriaMin !== 'Todas',
                    filtros.status !== 'Todos',
                  ].filter(Boolean).length
            }
          />
        </div>
      </div>

      {/* FEEDBACK TOAST / AVISO */}
      {feedbackMsg && (
        <div className="fixed top-16 z-50 bg-blue-600 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-xl border border-blue-400 flex items-center gap-2 animate-in fade-in slide-in-from-top">
          <CheckCircle2 className="w-4 h-4" />
          {feedbackMsg}
        </div>
      )}

      {/* BOTTOM SHEETS DE VENDAS */}
      <MobileImportSaleSheet
        isOpen={isImportSaleOpen}
        onClose={() => setIsImportSaleOpen(false)}
        onVendaCriada={(nova) => {
          setVendas((prev) => [nova, ...prev]);
          showToast(`Venda importada com IA: ${nova.aparelho_modelo} (${nova.cliente_nome})!`);
        }}
      />

      <MobileSaleDetailsSheet
        venda={selectedVenda}
        isOpen={!!selectedVenda}
        onClose={() => setSelectedVenda(null)}
        onGerarPdf={(v) => {
          showToast(`Gerando comprovante PDF de ${v.cliente_nome}...`);
        }}
        onEnviarWhatsapp={(v) => {
          showToast(`Abrindo WhatsApp para enviar notinha para ${v.cliente_telefone}!`);
        }}
        onEnviarEmail={(v) => {
          showToast(`Recibo enviado por e-mail com sucesso!`);
        }}
        onEditar={(v) => {
          showToast(`Abrindo edição da venda #${v.id}`);
          setSelectedVenda(null);
        }}
        onCancelar={(v) => {
          showToast(`Venda #${v.id} estornada e aparelho retornado ao estoque!`);
          setSelectedVenda(null);
        }}
      />

      <MobileNewSaleSheet
        isOpen={isNewSaleOpen}
        onClose={() => setIsNewSaleOpen(false)}
        onSalvar={(nova) => {
          setVendas((prev) => [nova, ...prev]);
          showToast(`Venda de R$ ${nova.valor_total} cadastrada com sucesso!`);
        }}
      />

      {/* BOTTOM SHEETS DE ESTOQUE */}
      <MobileFiltersSheet
        isOpen={isFilterSheetOpen}
        onClose={() => setIsFilterSheetOpen(false)}
        filtros={filtros}
        setFiltros={setFiltros}
        totalEncontrados={aparelhosFiltrados.length}
      />

      <MobileDeviceDetailsSheet
        aparelho={selectedDevice}
        isOpen={!!selectedDevice}
        onClose={() => setSelectedDevice(null)}
        onVender={(ap) => {
          showToast(`Iniciando venda para: ${ap.modelo}`);
          setSelectedDevice(null);
          setActiveTab('vendas');
          setIsNewSaleOpen(true);
        }}
        onEditar={(ap) => {
          showToast(`Abrindo edição rápida de ${ap.modelo}`);
          setSelectedDevice(null);
        }}
        onBaixar={(ap) => {
          showToast(`Baixa efetuada com sucesso: ${ap.modelo}`);
          setSelectedDevice(null);
        }}
      />

      <MobileNewDeviceSheet
        isOpen={isNewDeviceOpen}
        onClose={() => setIsNewDeviceOpen(false)}
        onSalvar={(novo) => {
          setAparelhos((prev) => [novo, ...prev]);
          showToast(`Aparelho cadastrado: ${novo.modelo} (${novo.capacidade})!`);
        }}
      />
    </div>
  );
}
