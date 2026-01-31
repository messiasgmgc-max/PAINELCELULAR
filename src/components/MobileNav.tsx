'use client';

import { useState } from 'react';
import {
  BarChart3,
  Users,
  Smartphone,
  Package,
  ListTodo,
  Wrench,
  Calendar,
  Shield,
  Menu,
  X,
  DollarSign,
  Settings,
  ChevronRight,
  Lock,
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
  { id: 'configuracoes', label: 'Configurações', icon: <Settings className="w-5 h-5" /> },
];

interface MobileNavProps {
  currentTab: string;
  onTabChange: (tabId: string) => void;
}

export function MobileNav({ currentTab, onTabChange }: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { usuario } = useAuth();

  const isSuperAdmin = usuario?.email?.toLowerCase() === 'guiguigamer60@gmail.com';
  
  const tabsToRender = isSuperAdmin 
    ? [...TABS, { id: 'superadmin', label: 'Super Admin', icon: <Lock className="w-5 h-5 text-red-500" /> }]
    : TABS;

  return (
    <>
      {/* Botão Menu Hambúrguer - Fixo no canto superior esquerdo */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed top-3.5 left-4 z-50 p-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border border-gray-200 dark:border-slate-800 rounded-full shadow-md hover:bg-gray-100 dark:hover:bg-slate-800 transition-all active:scale-95"
        aria-label="Abrir menu"
      >
        <Menu className="w-5 h-5 text-gray-700 dark:text-gray-300" />
      </button>

      {/* Menu Lateral (Drawer) */}
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex justify-start">
          {/* Fundo Escuro (Backdrop) */}
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
            onClick={() => setIsOpen(false)}
          />

          {/* Conteúdo da Sidebar */}
          <div className="relative w-[80%] max-w-[300px] h-full bg-white/80 dark:bg-black/80 backdrop-blur-xl shadow-2xl flex flex-col animate-in slide-in-from-left duration-300 border-r border-white/20">
            
            {/* Cabeçalho do Menu */}
            <div className="p-5 border-b border-white/10 flex items-center justify-between bg-white/10 dark:bg-white/5">
              <div>
                <h2 className="font-bold text-lg text-gray-900 dark:text-white">Menu</h2>
                <p className="text-xs text-gray-500">Navegação</p>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-gray-200 dark:hover:bg-slate-800 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Lista de Opções */}
            <div className="flex-1 overflow-y-auto py-2">
              {tabsToRender.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    onTabChange(tab.id);
                    setIsOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-4 px-5 py-4 text-left transition-all border-l-4",
                    currentTab === tab.id
                      ? "border-blue-600 bg-blue-50/50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 backdrop-blur-sm"
                      : "border-transparent text-gray-600 hover:bg-white/20 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-gray-200"
                  )}
                >
                  <span className={cn(
                    "transition-colors",
                    currentTab === tab.id ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-500"
                  )}>
                    {tab.icon}
                  </span>
                  <span className="font-medium flex-1 text-sm">{tab.label}</span>
                  {currentTab === tab.id && <ChevronRight className="w-4 h-4 opacity-50" />}
                </button>
              ))}
            </div>
            
            {/* Rodapé do Menu */}
            <div className="p-4 border-t border-white/10 bg-white/5 dark:bg-white/5">
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
