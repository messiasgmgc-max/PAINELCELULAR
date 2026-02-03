'use client';

import { useState, useEffect } from 'react';
import {
  BarChart3, Users, Smartphone, Package, ListTodo, Wrench, Calendar,
  Shield, MessageCircle, X, DollarSign, Settings, ChevronRight, Lock,
  ChevronLeft, LayoutGrid, Menu
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

interface Tab {
  id: string;
  label: string;
  icon: React.ReactNode;
}

const TABS: Tab[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <BarChart3 className="w-5 h-5" /> },
  { id: 'vendas', label: 'Vendas', icon: <DollarSign className="w-5 h-5" /> },
  { id: 'clientes', label: 'Clientes', icon: <Users className="w-5 h-5" /> },
  { id: 'aparelhos', label: 'Aparelhos', icon: <Smartphone className="w-5 h-5" /> },
  { id: 'pecas', label: 'Peças', icon: <Package className="w-5 h-5" /> },
  { id: 'orders', label: 'OS', icon: <ListTodo className="w-5 h-5" /> },
  { id: 'tecnicos', label: 'Técnicos', icon: <Wrench className="w-5 h-5" /> },
  { id: 'agendamentos', label: 'Agenda', icon: <Calendar className="w-5 h-5" /> },
  { id: 'garantias', label: 'Garantias', icon: <Shield className="w-5 h-5" /> },
  { id: 'whatsapp', label: 'WhatsApp', icon: <MessageCircle className="w-5 h-5" /> },
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
  const { usuario } = useAuth();

  useEffect(() => {
    const handleScroll = () => {
      // Ajuste fino: ativa o scroll um pouco antes para suavizar
      setScrolled(window.scrollY > 5);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const isSuperAdmin = usuario?.email?.toLowerCase() === 'guiguigamer60@gmail.com';
  
  const tabsToRender = isSuperAdmin 
    ? [...TABS, { id: 'superadmin', label: 'Super Admin', icon: <Lock className="w-5 h-5 text-red-500" /> }]
    : TABS;

  return (
    <>
      {/* Sidebar Vertical - Desktop (Sempre Aberta) */}
      <aside 
        className={cn(
          "fixed left-0 top-0 h-screen z-40 hidden md:flex flex-col transition-all duration-300 ease-in-out",
          "glass backdrop-blur-2xl border-r border-white/20 shadow-2xl",
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

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-2 no-scrollbar">
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

        {!isCollapsed && (
          <div className="p-6 border-t border-white/10">
            <p className="text-[10px] text-center text-gray-400 font-medium">
              Phone Center &copy; {new Date().getFullYear()}
            </p>
          </div>
        )}
      </aside>

      {/* BOTÃO MENU MOBILE ANIMADO 
         z-[999] garante que fique acima do Header (z-30)
      */}
      <div 
        className={cn(
          "md:hidden fixed z-[999] transition-all duration-500 cubic-bezier(0.34, 1.56, 0.64, 1) pointer-events-auto",
          scrolled 
            ? "top-4 left-4 scale-95" 
            : "top-[12px] left-4 scale-100" 
        )}
      >
        <button
          onClick={() => setIsOpen(true)}
          className={cn(
            "flex items-center justify-center border transition-all duration-500 cursor-pointer",
            // Estado Normal (Encaixado) - Bg transparente para mesclar com o header, mas com borda suave
            !scrolled && "h-14 w-14 rounded-2xl border-white/10 bg-transparent text-blue-600 hover:bg-white/5",
            // Estado Scrollado (Flutuante)
            scrolled && "h-12 px-4 rounded-full bg-blue-600 text-white shadow-xl shadow-blue-500/30 border-blue-400/30 backdrop-blur-xl"
          )}
        >
          {scrolled ? (
             // Ícone quando rola (Modo Botão)
             <div className="flex items-center gap-2">
               <Menu className="w-5 h-5 animate-in fade-in zoom-in duration-300" />
               <span className="text-xs font-bold tracking-widest uppercase">Menu</span>
             </div>
          ) : (
             // Ícone quando no topo (Modo Encaixado)
             <LayoutGrid className="w-7 h-7 animate-in spin-in-90 duration-300 drop-shadow-sm" />
          )}
        </button>
      </div>

      {/* Menu Lateral (Drawer) */}
      {isOpen && (
        <div className="fixed inset-0 z-[1000] flex justify-start">
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity animate-in fade-in duration-300"
            onClick={() => setIsOpen(false)}
          />

          <div className="relative w-[80%] max-w-[300px] h-full bg-white/90 dark:bg-slate-900/95 backdrop-blur-xl shadow-2xl flex flex-col animate-in slide-in-from-left duration-300 border-r border-white/20">
            
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

            <div className="flex-1 overflow-y-auto py-2 px-2">
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
            
            <div className="p-4 border-t border-white/10">
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