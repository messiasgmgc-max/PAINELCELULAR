'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  BarChart3, Users, Smartphone, Package, ListTodo, Wrench, Calendar,
  Shield, X, DollarSign, Settings, ChevronRight, Lock, Percent,
  ChevronLeft, Menu, Tag, FileText, Boxes, Layers, Repeat,
  Sparkles, SlidersHorizontal, Home, Search, Plus, CheckSquare, QrCode,
  Download, MessageCircle, RotateCcw, Eye
} from 'lucide-react';
import { cn, checkIsSuperAdmin, checkIsVendedor } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useTabOrder } from '@/hooks/useTabOrder';
import { usePanelMode } from '@/hooks/usePanelMode';
import { toast } from 'sonner';

export const ABAS_MODO_SIMPLES = new Set([
  'dashboard',
  'aparelhos',
  'vendas',
  'orders',
  'clientes',
  'taxas-maquininha',
]);

interface Tab {
  id: string;
  label: string;
  shortLabel?: string;
  icon: React.ReactNode;
}

const TABS: Tab[] = [
  { id: 'dashboard', label: 'Dashboard', shortLabel: 'Início', icon: <BarChart3 className="w-5 h-5" /> },
  { id: 'vendas', label: 'Vendas', shortLabel: 'Vendas', icon: <DollarSign className="w-5 h-5" /> },
  { id: 'atacado', label: 'Atacado', shortLabel: 'Atacado', icon: <Boxes className="w-5 h-5" /> },
  { id: 'taxas-maquininha', label: 'Calculadora de Taxa', shortLabel: 'Taxas', icon: <Percent className="w-5 h-5" /> },
  { id: 'calculadora-upgrade', label: 'Calculadora Upgrade', shortLabel: 'Upgrade', icon: <Repeat className="w-5 h-5" /> },
  { id: 'clientes', label: 'Clientes', shortLabel: 'Clientes', icon: <Users className="w-5 h-5" /> },
  { id: 'aparelhos', label: 'Estoque Geral', shortLabel: 'Estoque', icon: <Package className="w-5 h-5" /> },
  { id: 'pecas', label: 'Peças', shortLabel: 'Peças', icon: <Layers className="w-5 h-5" /> },
  { id: 'etiquetas', label: 'Etiquetas', shortLabel: 'Etiquetas', icon: <Tag className="w-5 h-5" /> },
  { id: 'orders', label: 'OS', shortLabel: 'OS', icon: <ListTodo className="w-5 h-5" /> },
  { id: 'tecnicos', label: 'Equipe', shortLabel: 'Equipe', icon: <Wrench className="w-5 h-5" /> },
  { id: 'agendamentos', label: 'Agenda', shortLabel: 'Agenda', icon: <Calendar className="w-5 h-5" /> },
  { id: 'garantias', label: 'Garantias', shortLabel: 'Garantias', icon: <Shield className="w-5 h-5" /> },
  { id: 'logs', label: 'Logs & Auditoria', shortLabel: 'Logs', icon: <FileText className="w-5 h-5" /> },
  { id: 'configuracoes', label: 'Configurações', shortLabel: 'Config', icon: <Settings className="w-5 h-5" /> },
];

const DOCK_DEFAULT_IDS = ['taxas-maquininha', 'vendas', 'aparelhos', 'dashboard'];

interface MobileNavProps {
  currentTab: string;
  onTabChange: (tabId: string) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function MobileNav({ currentTab, onTabChange, isCollapsed = false, onToggleCollapse }: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hasModalOpen, setHasModalOpen] = useState(false);
  const [telaInicialPref, setTelaInicialPref] = useState('dashboard');
  const { usuario } = useAuth();
  const { tabOrder } = useTabOrder();

  useEffect(() => {
    if (typeof window !== 'undefined' && usuario?.id) {
      const saved = localStorage.getItem(`phonecenter_tela_inicial_${usuario.id}`);
      if (saved) setTelaInicialPref(saved);
    }
  }, [usuario?.id]);

  const handleSalvarTelaInicial = (novaTela: string) => {
    setTelaInicialPref(novaTela);
    if (typeof window !== 'undefined' && usuario?.id) {
      localStorage.setItem(`phonecenter_tela_inicial_${usuario.id}`, novaTela);
      toast.success(`Tela inicial definida para: ${novaTela.toUpperCase()}`);
    }
  };

  useEffect(() => {
    const checkModal = () => {
      const modal = document.querySelector('.modal-overlay, [role="dialog"], [data-radix-popper-content-wrapper], .pos-modal-overlay, .modal-panel');
      setHasModalOpen(!!modal);
    };

    checkModal();
    const observer = new MutationObserver(checkModal);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    return () => observer.disconnect();
  }, []);

  const isSuperAdmin = checkIsSuperAdmin(usuario);
  const { isModoSimples, toggleModoSimples } = usePanelMode();

  const tabsToRender = useMemo(() => {
    const map = new Map(TABS.map((t) => [t.id, t]));
    const list: Tab[] = [];

    tabOrder.forEach((id) => {
      const tab = map.get(id);
      if (tab) list.push(tab);
    });

    TABS.forEach((t) => {
      if (!list.some((it) => it.id === t.id)) {
        list.push(t);
      }
    });

    if (isSuperAdmin) {
      list.push({ id: 'superadmin', label: 'Super Admin', shortLabel: 'Admin', icon: <Lock className="w-5 h-5 text-amber-500" /> });
    }

    let filtered = list;
    if (checkIsVendedor(usuario)) {
      filtered = filtered.filter(t => !['configuracoes', 'tecnicos', 'logs', 'superadmin'].includes(t.id));
    }

    if (isModoSimples) {
      filtered = filtered.filter(t => ABAS_MODO_SIMPLES.has(t.id) || t.id === currentTab);
    }

    return filtered;
  }, [tabOrder, isSuperAdmin, usuario, isModoSimples, currentTab]);

  // Dock com no máximo 5 itens: Menu + 4 slots (garantindo que a aba ativa esteja sempre visível)
  const dockSlots = useMemo(() => {
    const tabMap = new Map(TABS.map((t) => [t.id, t]));
    let slotIds = [...DOCK_DEFAULT_IDS];

    // Se a aba atual não estiver entre as 4 padrões e não for 'menu', inclui ela no 4º slot
    if (currentTab && !slotIds.includes(currentTab) && currentTab !== 'menu') {
      slotIds = [slotIds[0], slotIds[1], slotIds[2], currentTab];
    }

    const items: Tab[] = [];
    slotIds.forEach((id) => {
      const tab = tabMap.get(id);
      if (tab) items.push(tab);
    });

    return items;
  }, [currentTab]);

  const openDrawer = () => setIsOpen(true);

  const triggerPhoneCenterAction = (action: string) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('phonecenter:action', { detail: { action } }));
    }
  };

  return (
    <>
      {/* Sidebar Vertical - Desktop */}
      <aside 
        className={cn(
          "fixed left-0 top-0 h-screen z-40 hidden md:flex flex-col transition-all duration-300 ease-in-out",
          "glass nav-surface border-r border-white/20 shadow-2xl",
          isCollapsed ? "w-20" : "w-64"
        )}
      >
        <div className="p-6 flex items-center justify-between border-b border-white/10">
          {!isCollapsed && (
            <div className="flex flex-col">
              <span className="font-bold text-lg text-cyan-400">Menu</span>
              <span className="text-[10px] uppercase tracking-wider text-gray-500">Navegação</span>
            </div>
          )}
          <button 
            type="button"
            onClick={onToggleCollapse}
            className={cn(
              "p-2 hover:bg-white/10 rounded-xl transition-colors text-gray-400 cursor-pointer",
              isCollapsed && "mx-auto"
            )}
          >
            {isCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto overscroll-contain py-4 px-3 space-y-2 scrollbar-soft">
          {tabsToRender.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "w-full flex items-center gap-3 p-3 rounded-2xl transition-all duration-200 group relative overflow-hidden cursor-pointer",
                currentTab === tab.id
                  ? "bg-cyan-600 text-white shadow-lg shadow-cyan-900/30 backdrop-blur-md border border-cyan-400/30 font-bold"
                  : "text-slate-400 hover:bg-white/10 hover:text-white border border-transparent"
              )}
            >
              <div className={cn(
                "flex-shrink-0 transition-transform duration-200 group-hover:scale-110",
                currentTab === tab.id ? "text-white" : "text-slate-400 group-hover:text-cyan-400"
              )}>
                {tab.icon}
              </div>
              {!isCollapsed && (
                <span className="text-sm whitespace-nowrap">{tab.label}</span>
              )}
              {!isCollapsed && currentTab === tab.id && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-cyan-300" />
              )}
            </button>
          ))}
        </nav>

        {/* Toggle de Modo Simples vs Completo */}
        <div className="px-3 pb-2 pt-1 border-t border-white/10">
          <button
            type="button"
            onClick={toggleModoSimples}
            className={cn(
              "w-full flex items-center justify-between p-2.5 rounded-2xl transition-all duration-200 cursor-pointer",
              isModoSimples
                ? "bg-cyan-950/40 hover:bg-cyan-950/60 border border-cyan-500/30 text-cyan-300"
                : "bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800"
            )}
            title={isModoSimples ? "Ativar todas as ferramentas" : "Focar no essencial"}
          >
            <div className="flex items-center gap-2 min-w-0">
              {isModoSimples ? <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" /> : <SlidersHorizontal className="w-4 h-4 text-slate-400 shrink-0" />}
              {!isCollapsed && (
                <span className="text-xs font-bold truncate">
                  {isModoSimples ? "Ver mais recursos (+8)" : "Modo Simples"}
                </span>
              )}
            </div>
          </button>
        </div>

        {!isCollapsed && (
          <div className="p-4 border-t border-white/10">
            <p className="text-[10px] text-center text-gray-400 font-medium">
              Phone Center &copy; {new Date().getFullYear()}
            </p>
          </div>
        )}
      </aside>

      {/* Dock Mobile: Estritamente 5 botões fixos, SEM scroll horizontal, toque mínimo 44px */}
      {!hasModalOpen && (
        <div className="md:hidden fixed inset-x-0 bottom-0 z-[998] px-2 pb-[calc(env(safe-area-inset-bottom)+8px)] pointer-events-none mobile-nav-dock">
          <div className="pointer-events-auto border shadow-2xl rounded-2xl p-1.5 bg-slate-950/95 border-slate-800 backdrop-blur-xl">
            {/* 1. SE ESTIVER NA ABA DE APARELHOS (ESTOQUE) */}
            {currentTab === 'aparelhos' ? (
              <div className="grid grid-cols-5 gap-1 w-full overflow-hidden items-center">
                {/* 1. Menu Geral */}
                <button
                  type="button"
                  onClick={openDrawer}
                  className="h-12 min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-xl py-1 text-[10px] font-semibold text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer select-none"
                >
                  <Menu className="w-4 h-4" />
                  <span className="truncate">Menu</span>
                </button>

                {/* 2. Buscar */}
                <button
                  type="button"
                  onClick={() => triggerPhoneCenterAction('focar-busca')}
                  className="h-12 min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-xl py-1 text-[10px] font-semibold text-slate-400 hover:text-blue-400 hover:bg-white/10 transition-colors cursor-pointer select-none"
                >
                  <Search className="w-4 h-4" />
                  <span className="truncate">Buscar</span>
                </button>

                {/* 3. + Novo Aparelho (Central FAB) */}
                <button
                  type="button"
                  onClick={() => triggerPhoneCenterAction('novo-aparelho')}
                  className="h-12 min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-xl py-1 text-[10px] font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30 transition-all active:scale-95 cursor-pointer select-none"
                >
                  <Plus className="w-5 h-5 stroke-[2.5]" />
                  <span className="truncate">+ Novo</span>
                </button>

                {/* 4. Conferir Estoque */}
                <button
                  type="button"
                  onClick={() => triggerPhoneCenterAction('conferir-estoque')}
                  className="h-12 min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-xl py-1 text-[10px] font-semibold text-slate-400 hover:text-blue-400 hover:bg-white/10 transition-colors cursor-pointer select-none"
                >
                  <CheckSquare className="w-4 h-4 text-blue-400" />
                  <span className="truncate">Conferir</span>
                </button>

                {/* 5. Scanner */}
                <button
                  type="button"
                  onClick={() => triggerPhoneCenterAction('scanner')}
                  className="h-12 min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-xl py-1 text-[10px] font-semibold text-slate-400 hover:text-blue-400 hover:bg-white/10 transition-colors cursor-pointer select-none"
                >
                  <QrCode className="w-4 h-4" />
                  <span className="truncate">Scanner</span>
                </button>
              </div>
            ) : currentTab === 'vendas' ? (
              /* 2. SE ESTIVER NA ABA DE VENDAS */
              <div className="grid grid-cols-5 gap-1 w-full overflow-hidden items-center">
                {/* 1. Menu Geral */}
                <button
                  type="button"
                  onClick={openDrawer}
                  className="h-12 min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-xl py-1 text-[10px] font-semibold text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer select-none"
                >
                  <Menu className="w-4 h-4" />
                  <span className="truncate">Menu</span>
                </button>

                {/* 2. Importar Pedido c/ IA */}
                <button
                  type="button"
                  onClick={() => triggerPhoneCenterAction('importar-pedido')}
                  className="h-12 min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-xl py-1 text-[10px] font-bold text-cyan-300 hover:text-cyan-200 bg-cyan-950/40 border border-cyan-500/30 transition-all active:scale-95 cursor-pointer select-none"
                  title="Importar Pedido do WhatsApp c/ IA"
                >
                  <Sparkles className="w-4 h-4 text-cyan-400 animate-pulse" />
                  <span className="truncate">Importar</span>
                </button>

                {/* 3. + Nova Venda (Central FAB) */}
                <button
                  type="button"
                  onClick={() => triggerPhoneCenterAction('nova-venda')}
                  className="h-12 min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-xl py-1 text-[10px] font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30 transition-all active:scale-95 cursor-pointer select-none"
                >
                  <Plus className="w-5 h-5 stroke-[2.5]" />
                  <span className="truncate">+ Venda</span>
                </button>

                {/* 4. Vincular Já Vendido */}
                <button
                  type="button"
                  onClick={() => triggerPhoneCenterAction('vincular-vendido')}
                  className="h-12 min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-xl py-1 text-[10px] font-semibold text-slate-400 hover:text-blue-400 hover:bg-white/10 transition-colors cursor-pointer select-none"
                  title="Vincular Aparelho Já Vendido"
                >
                  <Repeat className="w-4 h-4 text-blue-400" />
                  <span className="truncate">Vincular</span>
                </button>

                {/* 5. Buscar */}
                <button
                  type="button"
                  onClick={() => triggerPhoneCenterAction('focar-busca')}
                  className="h-12 min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-xl py-1 text-[10px] font-semibold text-slate-400 hover:text-blue-400 hover:bg-white/10 transition-colors cursor-pointer select-none"
                >
                  <Search className="w-4 h-4" />
                  <span className="truncate">Buscar</span>
                </button>
              </div>
            ) : currentTab === 'taxas-maquininha' ? (
              /* 3. SE ESTIVER NA ABA DE TAXAS DE MAQUININHA */
              <div className="grid grid-cols-5 gap-1 w-full overflow-hidden items-center">
                {/* 1. Menu Geral */}
                <button
                  type="button"
                  onClick={openDrawer}
                  className="h-12 min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-xl py-1 text-[10px] font-semibold text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer select-none"
                >
                  <Menu className="w-4 h-4" />
                  <span className="truncate">Menu</span>
                </button>

                {/* 2. Alternar Modo Cliente / Lojista */}
                <button
                  type="button"
                  onClick={() => triggerPhoneCenterAction('toggle-modo')}
                  className="h-12 min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-xl py-1 text-[10px] font-bold text-amber-300 hover:text-amber-200 bg-amber-950/40 border border-amber-500/30 transition-all active:scale-95 cursor-pointer select-none"
                  title="Alternar Modo Cliente / Lojista"
                >
                  <Eye className="w-4 h-4 text-amber-400" />
                  <span className="truncate">Margens</span>
                </button>

                {/* 3. Copiar WhatsApp (Central FAB) */}
                <button
                  type="button"
                  onClick={() => triggerPhoneCenterAction('copiar-whatsapp')}
                  className="h-12 min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-xl py-1 text-[10px] font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30 transition-all active:scale-95 cursor-pointer select-none"
                  title="Copiar Simulação Formatada para WhatsApp"
                >
                  <MessageCircle className="w-5 h-5 stroke-[2.2]" />
                  <span className="truncate">WhatsApp</span>
                </button>

                {/* 4. Baixar Imagem PNG */}
                <button
                  type="button"
                  onClick={() => triggerPhoneCenterAction('baixar-png')}
                  className="h-12 min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-xl py-1 text-[10px] font-bold text-cyan-300 hover:text-cyan-200 bg-cyan-950/40 border border-cyan-500/30 transition-all active:scale-95 cursor-pointer select-none"
                  title="Baixar Tabela de Parcelamento em Imagem PNG"
                >
                  <Download className="w-4 h-4 text-cyan-400" />
                  <span className="truncate">Baixar PNG</span>
                </button>

                {/* 5. Zerar Valor */}
                <button
                  type="button"
                  onClick={() => triggerPhoneCenterAction('zerar-valor')}
                  className="h-12 min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-xl py-1 text-[10px] font-semibold text-slate-400 hover:text-rose-400 hover:bg-white/10 transition-colors cursor-pointer select-none"
                  title="Limpar Campo de Valor"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span className="truncate">Zerar</span>
                </button>
              </div>
            ) : (
              /* 4. DEMAIS ABAS: DOCK PADRÃO */
              <div className="grid grid-cols-5 gap-1 w-full overflow-hidden">
                <button
                  type="button"
                  onClick={openDrawer}
                  className="h-12 min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-xl py-1 text-[10px] font-semibold text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer select-none"
                >
                  <Menu className="w-4 h-4" />
                  <span className="truncate">Menu</span>
                </button>

                {dockSlots.map((tab) => {
                  const isActive = currentTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => onTabChange(tab.id)}
                      className={cn(
                        "h-12 min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-xl py-1 text-[10px] font-semibold transition-all cursor-pointer select-none",
                        isActive
                          ? "bg-blue-600 text-white shadow-md shadow-blue-900/40 font-bold"
                          : "text-slate-400 hover:text-white hover:bg-white/10"
                      )}
                    >
                      {tab.icon}
                      <span className="truncate">{tab.shortLabel || tab.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Menu Lateral (Drawer) */}
      {isOpen && (
        <div className="fixed inset-0 z-[1000] flex justify-start">
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity animate-in fade-in duration-300"
            onClick={() => setIsOpen(false)}
          />

          <div className="nav-surface relative w-[86%] max-w-[340px] h-full shadow-2xl flex flex-col animate-in slide-in-from-left duration-300 border-r border-slate-800 bg-slate-950 text-white">
            
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-base text-white">Menu Completo</h2>
                <p className="text-[11px] text-slate-400">Navegação e Ferramentas</p>
              </div>
              <button 
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-2 px-2 pb-4 scrollbar-soft space-y-1">
              {tabsToRender.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    onTabChange(tab.id);
                    setIsOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl text-left transition-all cursor-pointer",
                    currentTab === tab.id
                      ? "bg-cyan-600 text-white font-bold shadow-md shadow-cyan-900/30"
                      : "text-slate-400 hover:bg-white/5 hover:text-white"
                  )}
                >
                  <span className={cn(
                    currentTab === tab.id ? "text-white" : "text-slate-400"
                  )}>
                    {tab.icon}
                  </span>
                  <span className="flex-1 text-xs">{tab.label}</span>
                  {currentTab === tab.id && <ChevronRight className="w-4 h-4 opacity-70" />}
                </button>
              ))}
            </div>
            
            {/* Seletor de Tela Inicial e Atalhos PWA */}
            <div className="p-4 border-t border-slate-800 space-y-2.5 bg-slate-900/50">
              {/* Preferência de Tela Inicial */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                  <Home className="w-3.5 h-3.5 text-cyan-400" /> Tela Inicial ao Abrir:
                </label>
                <select
                  value={telaInicialPref}
                  onChange={(e) => handleSalvarTelaInicial(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white outline-none focus:border-cyan-500 cursor-pointer"
                >
                  <option value="dashboard">Dashboard (Início)</option>
                  <option value="taxas-maquininha">Simulador de Taxas</option>
                  <option value="vendas">Vendas / PDV</option>
                  <option value="aparelhos">Estoque de Celulares</option>
                </select>
              </div>

              {/* Botões de Instalação PWA */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    const btn = document.querySelector('button[title="Instalar App"]') as HTMLButtonElement;
                    if (btn) btn.click();
                    else {
                      alert('Para instalar o Painel: no Safari toque em Compartilhar -> "Adicionar à Tela de Início". No Chrome, toque nos 3 pontinhos -> "Instalar Aplicativo".');
                    }
                  }}
                  className="py-2 px-2 bg-white/10 hover:bg-white/15 text-white font-bold text-[10px] rounded-xl border border-white/10 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Smartphone className="w-3.5 h-3.5 text-cyan-400" /> App Completo
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onTabChange('taxas-maquininha');
                    alert('Para instalar o Simulador de Taxas como app próprio: no navegador acesse a rota /taxas-maquininha e toque em Compartilhar -> "Adicionar à Tela de Início" (Safari) ou Menu -> "Instalar" (Chrome).');
                  }}
                  className="py-2 px-2 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 font-bold text-[10px] rounded-xl border border-cyan-500/30 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Percent className="w-3.5 h-3.5 text-cyan-400" /> Só o Simulador
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}