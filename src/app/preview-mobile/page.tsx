'use client';

import React, { useState, useEffect, useRef } from 'react';
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
} from 'lucide-react';
import { MobileHeader } from '@/components/mobile-preview/MobileHeader';
import { MobileBottomBar } from '@/components/mobile-preview/MobileBottomBar';
import { MobileDeviceRow, MockAparelho } from '@/components/mobile-preview/MobileDeviceRow';
import { MobileFiltersSheet } from '@/components/mobile-preview/MobileFiltersSheet';
import { MobileDeviceDetailsSheet } from '@/components/mobile-preview/MobileDeviceDetailsSheet';
import { MobileNewDeviceSheet } from '@/components/mobile-preview/MobileNewDeviceSheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const MOCK_INICIAL: MockAparelho[] = [
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
  {
    id: '10',
    modelo: 'Xiaomi Redmi Note 13',
    capacidade: '256GB',
    cor: 'Verde',
    bateria: 100,
    preco_venda: 1290,
    preco_atacado: 1100,
    status: 'Em estoque',
    imei: '861920194820177',
    condicao: 'Novo Lacrado',
    categoria: 'Xiaomi',
  },
];

export default function PreviewMobilePage() {
  const [aparelhos, setAparelhos] = useState<MockAparelho[]>(MOCK_INICIAL);
  const [density, setDensity] = useState<'compact' | 'detailed'>('compact');
  const [frameMode, setFrameMode] = useState<boolean>(true);
  const [autoHideHeader, setAutoHideHeader] = useState<boolean>(true);
  const [isHeaderVisible, setIsHeaderVisible] = useState<boolean>(true);

  // Estados de Filtros e Busca
  const [busca, setBusca] = useState('');
  const [categoriaAtiva, setCategoriaAtiva] = useState('Todos');
  const [filtros, setFiltros] = useState({
    categoria: 'Todas',
    capacidade: 'Todas',
    bateriaMin: 'Todas',
    status: 'Todos',
  });

  // Modais / Sheets
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [isNewDeviceOpen, setIsNewDeviceOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<MockAparelho | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // Detecção de Scroll para Auto-Hide do Header
  const lastScrollY = useRef(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (!autoHideHeader) return;
    const currentScrollY = e.currentTarget.scrollTop;
    if (currentScrollY > lastScrollY.current && currentScrollY > 60) {
      // Rolando para baixo -> esconde header
      setIsHeaderVisible(false);
    } else if (currentScrollY < lastScrollY.current) {
      // Rolando para cima -> exibe header
      setIsHeaderVisible(true);
    }
    lastScrollY.current = currentScrollY;
  };

  // Filtragem dos aparelhos
  const aparelhosFiltrados = aparelhos.filter((item) => {
    // 1. Busca textual
    if (busca.trim()) {
      const termo = busca.toLowerCase();
      const match =
        item.modelo.toLowerCase().includes(termo) ||
        item.cor.toLowerCase().includes(termo) ||
        item.capacidade.toLowerCase().includes(termo) ||
        (item.imei && item.imei.includes(termo));
      if (!match) return false;
    }

    // 2. Categoria do header
    if (categoriaAtiva !== 'Todos' && item.categoria !== categoriaAtiva) {
      return false;
    }

    // 3. Filtros avançados do Sheet
    if (filtros.categoria !== 'Todas' && item.categoria !== filtros.categoria) return false;
    if (filtros.capacidade !== 'Todas' && item.capacidade !== filtros.capacidade) return false;
    if (filtros.status !== 'Todos' && item.status !== filtros.status) return false;
    if (filtros.bateriaMin !== 'Todas' && item.bateria) {
      const min = Number(filtros.bateriaMin.replace(/\D/g, ''));
      if (item.bateria < min) return false;
    }

    return true;
  });

  const totalAtivos = [
    filtros.categoria !== 'Todas',
    filtros.capacidade !== 'Todas',
    filtros.bateriaMin !== 'Todas',
    filtros.status !== 'Todos',
  ].filter(Boolean).length;

  const showToast = (msg: string) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center">
      {/* BARRA SUPERIOR DE CONTROLE E TESTE (Invisível no app final, exclusiva para você testar) */}
      <div className="w-full bg-slate-900 border-b border-blue-500/20 px-3 py-2.5 z-50 sticky top-0 shadow-lg">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="bg-blue-600/30 text-blue-300 font-bold px-2 py-0.5 rounded-full border border-blue-500/30 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              Página de Teste do Plano Mobile
            </span>
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
              {density === 'compact' ? 'Modo: Linhas 52px' : 'Modo: Cards 180px'}
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
              Auto-Hide Header: {autoHideHeader ? 'LIGADO' : 'DESLIGADO'}
            </Button>
          </div>
        </div>
      </div>

      {/* ÁREA DE DEMONSTRAÇÃO DOS 5 ITENS DO PLANO */}
      <div className="w-full max-w-4xl px-4 py-3 bg-blue-950/20 border-b border-blue-500/10 text-xs text-slate-300">
        <div className="flex items-center gap-1.5 font-bold text-blue-400 mb-1">
          <Info className="w-4 h-4 shrink-0" />
          Como testar os 5 pontos do plano nesta tela:
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-1.5 text-[11px] text-slate-400">
          <div><strong className="text-white">1. Barra Inferior:</strong> Botões no alcance do polegar na base da tela.</div>
          <div><strong className="text-white">2. Auto-Hide:</strong> Role a lista para baixo para ver o topo recolher e dar mais tela.</div>
          <div><strong className="text-white">3. Linha 52px:</strong> Alterne acima para comparar o espaço de 52px contra 180px.</div>
          <div><strong className="text-white">4. Bottom Sheet:</strong> Toque em qualquer aparelho ou no botão "+ Novo".</div>
          <div><strong className="text-white">5. Gaveta Filtros:</strong> Toque no botão "Filtros" na barra inferior.</div>
        </div>
      </div>

      {/* CONTAINER DO DISPOSITIVO (Moldura móvel ou Tela cheia) */}
      <div className={`w-full flex justify-center py-4 px-2 sm:px-4 ${frameMode ? 'max-w-md' : 'max-w-2xl'}`}>
        <div
          className={`w-full bg-slate-950 flex flex-col relative transition-all shadow-2xl ${
            frameMode
              ? 'h-[780px] rounded-[44px] border-[8px] border-slate-800/90 overflow-hidden ring-1 ring-white/10'
              : 'min-h-[80vh] rounded-3xl border border-slate-800 overflow-hidden'
          }`}
        >
          {/* Entalhe da Câmera / Dynamic Island (Apenas no modo Moldura) */}
          {frameMode && (
            <div className="w-full flex justify-center pt-2 pb-1 bg-slate-950 shrink-0 z-40">
              <div className="w-24 h-4 bg-slate-900 rounded-full border border-slate-800 flex items-center justify-end px-2">
                <div className="w-2 h-2 rounded-full bg-slate-950 border border-slate-800" />
              </div>
            </div>
          )}

          {/* ITEM 2: HEADER INTELIGENTE COM AUTO-HIDE NO SCROLL */}
          <MobileHeader
            nomeLoja="Phone Center"
            categoriaAtiva={categoriaAtiva}
            onSelectCategoria={(cat) => setCategoriaAtiva(cat)}
            isVisible={isHeaderVisible}
          />

          {/* CONTEÚDO ROLÁVEL (LISTA DE APARELHOS) */}
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto px-3.5 pt-3 pb-24 overscroll-contain space-y-2.5"
          >
            {/* Barra de Pesquisa Rápida Integrada */}
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

            {/* Cabeçalho da Lista: Contagem de Estoque e Indicador de Densidade */}
            <div className="flex items-center justify-between text-xs px-1 text-slate-400">
              <span>
                Mostrando <strong className="text-white">{aparelhosFiltrados.length}</strong> de {aparelhos.length} aparelhos
              </span>
              <span className="text-[11px] text-blue-400 font-medium">
                {density === 'compact' ? 'Visualização Rápida (52px)' : 'Visualização Detalhada'}
              </span>
            </div>

            {/* ITEM 3: LISTA DE APARELHOS (LINHA COMPACTA 52PX OU CARD DETALHADO) */}
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
                  Nenhum aparelho encontrado com os filtros selecionados.
                </div>
              )}
            </div>
          </div>

          {/* ITEM 1: BARRA INFERIOR FLUTUANTE */}
          <MobileBottomBar
            onSearchClick={() => {
              // Foca no topo e rola para cima
              if (scrollContainerRef.current) {
                scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
              }
              setIsHeaderVisible(true);
            }}
            onFilterClick={() => setIsFilterSheetOpen(true)}
            onNewDeviceClick={() => setIsNewDeviceOpen(true)}
            onConferirClick={() => showToast('Abrindo modo conferência de estoque rápida!')}
            filtrosAtivosCount={totalAtivos}
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

      {/* ITEM 5: BOTTOM SHEET DE FILTROS */}
      <MobileFiltersSheet
        isOpen={isFilterSheetOpen}
        onClose={() => setIsFilterSheetOpen(false)}
        filtros={filtros}
        setFiltros={setFiltros}
        totalEncontrados={aparelhosFiltrados.length}
      />

      {/* ITEM 4: BOTTOM SHEET DE DETALHES E AÇÕES DO APARELHO */}
      <MobileDeviceDetailsSheet
        aparelho={selectedDevice}
        isOpen={!!selectedDevice}
        onClose={() => setSelectedDevice(null)}
        onVender={(ap) => {
          showToast(`Iniciando venda para: ${ap.modelo} (${ap.capacidade})`);
          setSelectedDevice(null);
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

      {/* ITEM 4: BOTTOM SHEET DE CADASTRO DE NOVO APARELHO */}
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
