'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { cn, checkIsSuperAdmin } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useStoreConfig } from '@/hooks/useStoreConfig';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { ClientesTab } from '@/components/ClientesTab';
import { AparelhosTab } from '@/components/AparelhosTab';
import { PecasTab } from '@/components/PecasTab';
import { OrdensTab } from '@/components/OrdensTab';
import { TecnicosTab } from '@/components/TecnicosTab';
import { DashboardTab } from '@/components/DashboardTab';
import { AgendamentosTab } from '@/components/AgendamentosTab';
import { GarantiasTab } from '@/components/GarantiasTab';
import { VendasTab } from '@/components/VendasTab';
import { WhatsappTab } from '@/components/WhatsappTab';
import { ConfiguracoesTab } from '@/components/ConfiguracoesTab';
import { MobileNav } from '@/components/MobileNav';
import { TaxasMaquininhaTab } from '@/components/TaxasMaquininhaTab';
import { EtiquetasTab } from '@/components/EtiquetasTab';
import { AtacadoTab } from '@/components/AtacadoTab';
import SuperAdminTab from '@/components/SuperAdminTab';
import { LogsTab } from '@/components/LogsTab';
import { UserAccountMenu } from '@/components/UserAccountMenu';
import { MeuPlanoModal } from '@/components/MeuPlanoModal';
import { PlanPaywallModal } from '@/components/PlanPaywallModal';
import { PwaInstallPrompt } from '@/components/PwaInstallPrompt';
import { CommandPaletteModal } from '@/components/CommandPaletteModal';
import { 
  Smartphone, 
  LogOut,
  User,
  Shield,
  CreditCard,
  Search
} from 'lucide-react';

export default function Home() {
  const router = useRouter();
  const pathname = usePathname();
  const { usuario, logout, loading, authReady } = useAuth();
  const { config, atualizarNomeLoja, atualizarLogoLoja, atualizarAssinaturaLoja } = useStoreConfig(usuario?.lojaId);
  
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const headerNomeLoja = config.nomeLoja || 'Phone Center';
  const subtitulo = config.subtituloLoja || 'Sistema de Gestão';
  const headerLogoLoja = config.logoLoja;
  const [showMeuPlanoModal, setShowMeuPlanoModal] = useState(false);

  const normalizeTabFromPath = (path: string) => {
    const segment = path.split('/').filter(Boolean)[0] || 'dashboard';

    if (segment === 'os') return 'orders';

    const allowedTabs = new Set([
      'dashboard',
      'vendas',
      'atacado',
      'taxas-maquininha',
      'clientes',
      'aparelhos',
      'pecas',
      'etiquetas',
      'orders',
      'tecnicos',
      'agendamentos',
      'garantias',
      'logs',
      'whatsapp',
      'configuracoes',
      'superadmin',
    ]);

    return allowedTabs.has(segment) ? segment : 'dashboard';
  };

  const tabToPath = (tabId: string) => {
    if (tabId === 'dashboard') return '/';
    if (tabId === 'orders') return '/os';
    return `/${tabId}`;
  };

  const handleTabChange = (tabId: string) => {
    setCurrentTab(tabId);
    const nextPath = tabToPath(tabId);
    if (typeof window !== 'undefined' && nextPath !== window.location.pathname) {
      window.history.pushState(null, '', nextPath);
    }
  };

  useEffect(() => {
    const handlePopState = () => {
      setCurrentTab(normalizeTabFromPath(window.location.pathname));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    setCurrentTab(normalizeTabFromPath(pathname));
  }, [pathname]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowCommandPalette((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelectTabFromPalette = (tabId: string) => {
    const tabMap: Record<string, string> = {
      'vendas': 'vendas',
      'atacado': 'atacado',
      'aparelhos': 'aparelhos',
      'ordens': 'orders',
      'taxas_maquininha': 'taxas-maquininha',
      'tecnicos': 'tecnicos',
      'pecas': 'pecas',
      'clientes': 'clientes',
      'agendamentos': 'agendamentos',
      'garantias': 'garantias',
      'etiquetas': 'etiquetas',
      'configuracoes': 'configuracoes',
      'superadmin': 'superadmin',
      'logs': 'logs',
      'whatsapp': 'whatsapp',
    };

    const targetTab = tabMap[tabId] || tabId;
    if (targetTab) {
      handleTabChange(targetTab);
    }
  };



  console.debug('Dashboard: render check', { loading, authReady, usuario: usuario?.email });

  if (!authReady || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Validando sessão...</p>
        </div>
      </div>
    );
  }

  if (!usuario) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Redirecionando para o login...</p>
        </div>
      </div>
    );
  }

  // Renderizar conteúdo da aba atual
  const renderCurrentTab = () => {
    switch (currentTab) {
      case 'dashboard':
        return <DashboardTab />;
      case 'clientes':
        return <ClientesTab />;
      case 'aparelhos':
        return <AparelhosTab />;
      case 'atacado':
        return <AtacadoTab />;
      case 'pecas':
        return <PecasTab />;
      case 'etiquetas':
        return <EtiquetasTab />;
      case 'orders':
        return <OrdensTab />;
      case 'tecnicos':
        return <TecnicosTab />;
      case 'agendamentos':
        return <AgendamentosTab />;
      case 'garantias':
        return <GarantiasTab />;
      case 'logs':
        return <LogsTab />;
      case 'vendas':
        return <VendasTab isSidebarCollapsed={isSidebarCollapsed} setSidebarCollapsed={setIsSidebarCollapsed} />;
      case 'taxas-maquininha':
        return <TaxasMaquininhaTab />;
      case 'whatsapp':
        return <WhatsappTab />;
      case 'configuracoes':
        return <ConfiguracoesTab />;
      case 'superadmin':
        return checkIsSuperAdmin(usuario) ? <SuperAdminTab /> : <DashboardTab />;
      default:
        return <DashboardTab />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header - Mobile optimized */}
      <header className={cn(
        "relative z-30 h-20 transition-all duration-300 flex items-center px-3 sm:px-4 md:px-6",
        isSidebarCollapsed ? "md:ml-20" : "md:ml-64"
      )}>
        <div className="app-content-shell">
          <div className="w-full h-14 glass nav-surface rounded-2xl border border-white/20 flex items-center justify-between gap-3 px-3 sm:px-4 shadow-lg">
            <div className="flex min-w-0 items-center gap-3">
              {headerLogoLoja ? (
                <img
                  src={headerLogoLoja}
                  alt={headerNomeLoja || 'Logo da loja'}
                  className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg object-cover flex-shrink-0"
                />
              ) : (
                <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground flex-shrink-0">
                  <Smartphone className="h-5 w-5 sm:h-6 sm:w-6" />
                </div>
              )}
              <div className="flex min-w-0 flex-col items-start">
                <h1 className="text-base sm:text-xl font-bold truncate leading-none max-w-[42vw] sm:max-w-[28rem]">{headerNomeLoja || 'Phone Center'}</h1>
                <p className="text-[10px] sm:text-xs text-muted-foreground truncate leading-none mt-0.5 hidden sm:block">{subtitulo}</p>
              </div>
            </div>

            {/* User Info, Busca Railway, Meu Plano e Dropdown */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Barra de Pesquisa Estilo Railway / Cmd+K */}
              <button
                onClick={() => setShowCommandPalette(true)}
                className="flex items-center gap-2 bg-slate-900/80 hover:bg-slate-950 text-slate-300 hover:text-white px-2.5 sm:px-3.5 py-1.5 rounded-xl border border-white/15 text-xs font-semibold transition-all shadow-inner group shrink-0 cursor-pointer"
                title="Pesquisar todas as funções (Ctrl+K)"
              >
                <Search className="w-3.5 h-3.5 text-cyan-400 group-hover:scale-110 transition-transform" />
                <span className="hidden md:inline text-slate-300">Todas as Funções...</span>
                <kbd className="hidden lg:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-mono font-bold bg-slate-800 text-cyan-300 rounded border border-slate-700 ml-0.5">
                  Ctrl K
                </kbd>
              </button>

              {/* Botão Meu Plano */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowMeuPlanoModal(true)}
                className="gap-2 text-xs sm:text-sm h-9 sm:h-10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 rounded-2xl font-semibold"
              >
                <CreditCard className="w-4 h-4 text-emerald-400" />
                <span className="hidden sm:inline">Meu Plano</span>
              </Button>

              {/* Botão Super Admin */}
              {checkIsSuperAdmin(usuario) && (
                <Button
                  variant={currentTab === 'superadmin' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleTabChange('superadmin')}
                  className="hidden sm:flex gap-2 h-9 sm:h-10 rounded-2xl"
                >
                  <Shield className="w-4 h-4" />
                  <span className="hidden lg:inline">Super Admin</span>
                </Button>
              )}

              {/* Menu de Usuário Expansível */}
              <UserAccountMenu
                onOpenMeuPlano={() => setShowMeuPlanoModal(true)}
                onNavigateSuperAdmin={() => handleTabChange('superadmin')}
                currentTab={currentTab}
              />
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Navigation - acima do conteúdo */}
      <MobileNav 
        currentTab={currentTab} 
        onTabChange={handleTabChange} 
        isCollapsed={isSidebarCollapsed} 
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)} 
      />

      {/* Main Content - flex-1 para ocupar espaço */}
      <main className={cn(
        "flex-1 px-4 py-4 sm:px-6 sm:py-6 pb-[calc(110px+env(safe-area-inset-bottom))] sm:pb-6 transition-all duration-300",
        isSidebarCollapsed ? "md:ml-20" : "md:ml-64"
      )}>
        <div className="app-content-shell">
          <div key={currentTab} className="animate-in fade-in slide-in-from-bottom-2 zoom-in-95 duration-300 will-change-transform">
            {renderCurrentTab()}
          </div>
        </div>
      </main>

      {/* Modais Globais de Plano, PWA, Paywall e Palette Estilo Railway */}
      <MeuPlanoModal isOpen={showMeuPlanoModal} onClose={() => setShowMeuPlanoModal(false)} />
      <PlanPaywallModal />
      <PwaInstallPrompt />
      <CommandPaletteModal
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        onSelectTab={handleSelectTabFromPalette}
      />
    </div>
  );
}
