'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  BarChart3, Users, Smartphone, Package, ListTodo, Wrench, Calendar,
  Shield, MessageCircle, X, DollarSign, Settings, ChevronRight, Lock, Percent,
  ChevronLeft, LayoutGrid, Menu, Tag, FileText, Boxes, Layers, Repeat,
  Sparkles, SlidersHorizontal
} from 'lucide-react';
import { cn, checkIsSuperAdmin, checkIsVendedor } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useTabOrder } from '@/hooks/useTabOrder';
import { usePanelMode } from '@/hooks/usePanelMode';

export const ABAS_MODO_SIMPLES = new Set([
  'dashboard',
  'aparelhos',
  'vendas',
  'orders',
  'clientes',
]);

interface Tab {
  id: string;
  label: string;
  icon: React.ReactNode;
}

const TABS: Tab[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <BarChart3 className="w-5 h-5" /> },
  { id: 'vendas', label: 'Vendas', icon: <DollarSign className="w-5 h-5" /> },
  { id: 'atacado', label: 'Atacado', icon: <Boxes className="w-5 h-5" /> },
  { id: 'taxas-maquininha', label: 'Calculadora de Taxa', icon: <Percent className="w-5 h-5" /> },
  { id: 'calculadora-upgrade', label: 'Calculadora Upgrade', icon: <Repeat className="w-5 h-5" /> },
  { id: 'clientes', label: 'Clientes', icon: <Users className="w-5 h-5" /> },
  { id: 'aparelhos', label: 'Estoque Geral', icon: <Package className="w-5 h-5" /> },
  { id: 'pecas', label: 'Peças', icon: <Layers className="w-5 h-5" /> },
  { id: 'etiquetas', label: 'Etiquetas', icon: <Tag className="w-5 h-5" /> },
  { id: 'orders', label: 'OS', icon: <ListTodo className="w-5 h-5" /> },
  { id: 'tecnicos', label: 'Equipe', icon: <Wrench className="w-5 h-5" /> },
  { id: 'agendamentos', label: 'Agenda', icon: <Calendar className="w-5 h-5" /> },
  { id: 'garantias', label: 'Garantias', icon: <Shield className="w-5 h-5" /> },
  { id: 'logs', label: 'Logs & Auditoria', icon: <FileText className="w-5 h-5" /> },
  { id: 'configuracoes', label: 'Configurações', icon: <Settings className="w-5 h-5" /> },
];

interface MobileNavProps {
  currentTab: string;
  onTabChange: (tabId: string) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function MobileNav({ currentTab, onTabChange, isCollapsed = false, onToggleCollapse }: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [hasModalOpen, setHasModalOpen] = useState(false);
  const { usuario } = useAuth();
  const { tabOrder } = useTabOrder();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 5);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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

    // Garante que qualquer aba definida seja incluída se não estiver em tabOrder
    TABS.forEach((t) => {
      if (!list.some((it) => it.id === t.id)) {
        list.push(t);
      }
    });

    if (isSuperAdmin) {
      list.push({ id: 'superadmin', label: 'Super Admin', icon: <Lock className="w-5 h-5 text-red-500" /> });
    }

    // Se for vendedor/operador, oculta abas de gestão administrativa
    let filtered = list;
    if (checkIsVendedor(usuario)) {
      filtered = filtered.filter(t => !['configuracoes', 'tecnicos', 'logs', 'superadmin'].includes(t.id));
    }

    // "Modo Simples" como padrão: foca nas telas essenciais do dia a dia (Estoque, Vendas/PDV, OS, Clientes, Dashboard)
    if (isModoSimples) {
      filtered = filtered.filter(t => ABAS_MODO_SIMPLES.has(t.id) || t.id === currentTab);
    }

    return filtered;
  }, [tabOrder, isSuperAdmin, usuario, isModoSimples, currentTab]);

  const mobileDockTabs: Tab[] = [{ id: 'menu', label: 'Menu', icon: <Menu className="w-5 h-5" /> }, ...tabsToRender];

  const openDrawer = () => setIsOpen(true);

  return (
    <>
      {/* Sidebar Vertical - Desktop (Sempre Aberta) */}
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
              <span className="font-bold text-lg text-blue-600">Menu</span>
              <span className="text-[10px] uppercase tracking-wider text-gray-500">Navegação</span>
            </div>
          )}
          <button 
            onClick={onToggleCollapse}
            className={cn(
              "p-2 hover:bg-white/10 rounded-xl transition-colors text-gray-500",
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
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "w-full flex items-center gap-3 p-3 rounded-2xl transition-all duration-300 group relative overflow-hidden",
                currentTab === tab.id
                  ? "bg-blue-600/90 text-white shadow-lg shadow-blue-500/40 backdrop-blur-md border border-white/20"
                  : "text-gray-500 hover:bg-white/20 hover:text-gray-900 dark:hover:text-gray-200 border border-transparent hover:border-white/10"
              )}
            >
              <div className={cn(
                "flex-shrink-0 transition-transform duration-200 group-hover:scale-110",
                currentTab === tab.id ? "text-white" : "text-gray-400 group-hover:text-blue-500"
              )}>
                {tab.icon}
              </div>
              {!isCollapsed && (
                <span className="font-bold text-sm whitespace-nowrap">{tab.label}</span>
              )}
              {!isCollapsed && currentTab === tab.id && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white" />
              )}
            </button>
          ))}
        </nav>

        {/* Toggle de Modo Simples vs Modo Completo */}
        <div className="px-3 pb-2 pt-1 border-t border-white/10">
          {isModoSimples ? (
            <button
              onClick={toggleModoSimples}
              className={cn(
                "w-full flex items-center justify-between p-2.5 rounded-2xl transition-all duration-300",
                "bg-gradient-to-r from-blue-600/15 via-indigo-600/15 to-purple-600/15 hover:from-blue-600/25 hover:to-purple-600/25",
                "border border-blue-500/30 text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 shadow-sm group cursor-pointer"
              )}
              title="Ativar modo completo com todas as ferramentas"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Sparkles className="w-4 h-4 text-amber-500 flex-shrink-0 group-hover:rotate-12 transition-transform" />
                {!isCollapsed && (
                  <span className="text-xs font-bold truncate">Ver mais recursos</span>
                )}
              </div>
              {!isCollapsed && (
                <span className="text-[10px] bg-blue-500/20 text-blue-600 dark:text-blue-300 font-extrabold px-2 py-0.5 rounded-full">
                  +10
                </span>
              )}
            </button>
          ) : (
            <button
              onClick={toggleModoSimples}
              className={cn(
                "w-full flex items-center justify-center gap-2 p-2 rounded-xl transition-all cursor-pointer",
                "bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10",
                "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-xs font-medium border border-transparent hover:border-white/10"
              )}
              title="Voltar para o Modo Simples (focar no essencial)"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 flex-shrink-0 text-slate-500" />
              {!isCollapsed && <span>Modo Simples</span>}
            </button>
          )}
        </div>

        {!isCollapsed && (
          <div className="p-4 border-t border-white/10">
            <p className="text-[10px] text-center text-gray-400 font-medium">
              Phone Center &copy; {new Date().getFullYear()}
            </p>
          </div>
        )}
      </aside>

      {/* Dock Mobile (Ocultado automaticamente quando qualquer modal/popup estiver aberto) */}
      {!hasModalOpen && (
        <div className="md:hidden fixed inset-x-0 bottom-0 z-[998] px-3 pb-[calc(env(safe-area-inset-bottom)+10px)] pointer-events-none mobile-nav-dock transition-all duration-300">
          <div className={cn(
            "pointer-events-auto border shadow-2xl rounded-[1.75rem] p-2 transition-all duration-300",
            "bg-white/95 dark:bg-slate-950/98 border-slate-200/80 dark:border-slate-700/70",
            "backdrop-filter backdrop-blur-xl",
            scrolled ? "translate-y-0 opacity-100" : "translate-y-0 opacity-100"
          )}>
            <div className="flex gap-1 overflow-x-auto scrollbar-soft snap-x snap-mandatory">
              {mobileDockTabs.map((tab) => {
                if (tab.id === 'menu') {
                  return (
                    <button
                      key={tab.id}
                      onClick={openDrawer}
                      className="snap-start min-w-[72px] flex flex-col items-center justify-center gap-1 rounded-2xl py-2.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-white hover:bg-blue-500/10 dark:hover:bg-white/10 transition-all"
                    >
                      <Menu className="w-5 h-5" />
                      <span>Menu</span>
                    </button>
                  );
                }

                return (
                  <button
                    key={tab.id}
                    onClick={() => onTabChange(tab.id)}
                    className={cn(
                      "snap-start min-w-[72px] flex flex-col items-center justify-center gap-1 rounded-2xl py-2.5 text-[10px] font-semibold transition-all",
                      currentTab === tab.id
                        ? "bg-blue-600 text-white shadow-lg shadow-blue-500/40"
                        : "text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-white hover:bg-blue-500/10 dark:hover:bg-white/10"
                    )}
                  >
                    {tab.icon}
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
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

          <div className="nav-surface relative w-[86%] max-w-[340px] h-full shadow-2xl flex flex-col animate-in slide-in-from-left duration-300 border-r border-white/20">
            
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-lg text-gray-900 dark:text-white">Menu</h2>
                <p className="text-xs text-gray-500">Navegação</p>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-2 px-2 pb-[calc(env(safe-area-inset-bottom)+16px)] scrollbar-soft">
              {tabsToRender.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    onTabChange(tab.id);
                    setIsOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-4 px-4 py-3.5 mb-1 rounded-xl text-left transition-all",
                    currentTab === tab.id
                      ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                      : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200"
                  )}
                >
                  <span className={cn(
                    "transition-colors",
                    currentTab === tab.id ? "text-white" : "text-gray-500 dark:text-gray-400 group-hover:text-blue-500"
                  )}>
                    {tab.icon}
                  </span>
                  <span className="font-medium flex-1 text-sm">{tab.label}</span>
                  {currentTab === tab.id && <ChevronRight className="w-4 h-4 opacity-50" />}
                </button>
              ))}
            </div>
            
            <div className="p-4 border-t border-white/10 space-y-2">
              <button
                onClick={() => {
                  toggleModoSimples();
                  setIsOpen(false);
                }}
                className={cn(
                  "w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer",
                  isModoSimples
                    ? "bg-blue-600/20 border-blue-500/30 text-blue-400 hover:bg-blue-600/30"
                    : "bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800"
                )}
              >
                {isModoSimples ? (
                  <>
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span>Ver mais recursos (+10)</span>
                  </>
                ) : (
                  <>
                    <SlidersHorizontal className="w-4 h-4 text-slate-400" />
                    <span>Ativar Modo Simples</span>
                  </>
                )}
              </button>
              <button
                onClick={() => {
                  setIsOpen(false);
                  const btn = document.querySelector('button[title="Instalar App"]') as HTMLButtonElement;
                  if (btn) btn.click();
                  else {
                    alert('Para instalar o app no celular: no Safari toque em Compartilhar -> "Adicionar à Tela de Início". No Chrome, toque no menu (...) -> "Instalar Aplicativo"!');
                  }
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-3 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 dark:text-indigo-300 font-bold text-xs rounded-xl border border-indigo-500/30 transition-colors"
              >
                <Smartphone className="w-4 h-4" /> Instalar App Web no Celular
              </button>
              <p className="text-xs text-center text-gray-400">
                Phone Center &copy; {new Date().getFullYear()}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}