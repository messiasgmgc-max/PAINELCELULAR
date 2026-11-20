'use client';

import { useEffect, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { guardarPreselecaoEtiquetas } from '@/lib/etiquetas/pendentes';
import { usePathname, useRouter } from 'next/navigation';
import { cn, checkIsSuperAdmin, checkIsVendedor, formatarNomeLojaAbreviado } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useStoreConfig } from '@/hooks/useStoreConfig';
import { useStorePlan } from '@/hooks/useStorePlan';
import { Button } from '@/components/ui/button';
import { MobileNav } from '@/components/MobileNav';
import { UserAccountMenu } from '@/components/UserAccountMenu';
import { PwaInstallPrompt } from '@/components/PwaInstallPrompt';
import { SupportFloatingButton } from '@/components/suporte/SupportFloatingButton';
import { useColorTheme } from '@/components/ThemeProvider';
import { 
  Shield,
  CreditCard,
  Search,
  Sun,
  Moon
} from 'lucide-react';

function TabLoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-[45vh]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-primary border-t-transparent" />
        <p className="text-xs text-muted-foreground">Carregando módulo...</p>
      </div>
    </div>
  );
}

const DashboardTab = dynamic(() => import('@/components/DashboardTab').then((m) => m.DashboardTab), { loading: TabLoadingFallback });
const ClientesTab = dynamic(() => import('@/components/ClientesTab').then((m) => m.ClientesTab), { loading: TabLoadingFallback });
const AparelhosTab = dynamic(() => import('@/components/AparelhosTab').then((m) => m.AparelhosTab), { loading: TabLoadingFallback });
const PecasTab = dynamic(() => import('@/components/PecasTab').then((m) => m.PecasTab), { loading: TabLoadingFallback });
const OrdensTab = dynamic(() => import('@/components/OrdensTab').then((m) => m.OrdensTab), { loading: TabLoadingFallback });
const TecnicosTab = dynamic(() => import('@/components/TecnicosTab').then((m) => m.TecnicosTab), { loading: TabLoadingFallback });
const AgendamentosTab = dynamic(() => import('@/components/AgendamentosTab').then((m) => m.AgendamentosTab), { loading: TabLoadingFallback });
const GarantiasTab = dynamic(() => import('@/components/GarantiasTab').then((m) => m.GarantiasTab), { loading: TabLoadingFallback });
const VendasTab = dynamic(() => import('@/components/VendasTab').then((m) => m.VendasTab), { loading: TabLoadingFallback });
const ConfiguracoesTab = dynamic(() => import('@/components/ConfiguracoesTab').then((m) => m.ConfiguracoesTab), { loading: TabLoadingFallback });
const TaxasMaquininhaTab = dynamic(() => import('@/components/TaxasMaquininhaTab').then((m) => m.TaxasMaquininhaTab), { loading: TabLoadingFallback });
const CalculadoraUpgradeTab = dynamic(() => import('@/components/CalculadoraUpgradeTab').then((m) => m.CalculadoraUpgradeTab), { loading: TabLoadingFallback });
const EtiquetasTab = dynamic(() => import('@/components/EtiquetasTab').then((m) => m.EtiquetasTab), { loading: TabLoadingFallback });
const AtacadoTab = dynamic(() => import('@/components/AtacadoTab').then((m) => m.AtacadoTab), { loading: TabLoadingFallback });
const SuperAdminTab = dynamic(() => import('@/components/SuperAdminTab'), { loading: TabLoadingFallback });
const LogsTab = dynamic(() => import('@/components/LogsTab').then((m) => m.LogsTab), { loading: TabLoadingFallback });

const MeuPlanoModal = dynamic(() => import('@/components/MeuPlanoModal').then((m) => m.MeuPlanoModal), { ssr: false });
const PlanPaywallModal = dynamic(() => import('@/components/PlanPaywallModal').then((m) => m.PlanPaywallModal), { ssr: false });
const CommandPaletteModal = dynamic(() => import('@/components/CommandPaletteModal').then((m) => m.CommandPaletteModal), { ssr: false });

export default function Home() {
  const router = useRouter();
  const pathname = usePathname();
  const { usuario, loading, authReady } = useAuth();
  const { config } = useStoreConfig(usuario?.lojaId);
  const { planData, loading: planLoading } = useStorePlan();
  
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const headerNomeLoja = config.nomeLoja || 'Phone Center';
  const nomesLoja = useMemo(() => formatarNomeLojaAbreviado(headerNomeLoja), [headerNomeLoja]);
  const subtitulo = config.subtituloLoja || 'Sistema de Gestão';
  const headerLogoLoja = config.logoLoja;
  const [showMeuPlanoModal, setShowMeuPlanoModal] = useState(false);
  const { colorTheme, setColorTheme } = useColorTheme();

  const normalizeTabFromPath = (path: string) => {
    const segment = path.split('/').filter(Boolean)[0] || 'dashboard';

    if (segment === 'os') return 'orders';

    const allowedTabs = new Set([
      'dashboard',
      'vendas',
      'atacado',
      'taxas-maquininha',
      'calculadora-upgrade',
      'clientes',
      'aparelhos',
      'pecas',
      'etiquetas',
      'orders',
      'tecnicos',
      'agendamentos',
      'garantias',
      'logs',
      'configuracoes',
      'superadmin',
    ]);

    let target = allowedTabs.has(segment) ? segment : 'dashboard';

    // Se o usuário for vendedor, bloqueia acesso a rotas de gestão administrativa
    if (checkIsVendedor(usuario) && ['configuracoes', 'tecnicos', 'logs', 'superadmin'].includes(target)) {
      return 'dashboard';
    }

    return target;
  };

  const tabToPath = (tabId: string) => {
    if (tabId === 'dashboard') return '/';
    if (tabId === 'orders') return '/os';
    return `/${tabId}`;
  };

  const handleTabChange = (tabId: string) => {
    // Vendedor não pode alternar para abas administrativas
    if (checkIsVendedor(usuario) && ['configuracoes', 'tecnicos', 'logs', 'superadmin'].includes(tabId)) {
      return;
    }
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
      'calculadora_upgrade': 'calculadora-upgrade',
      'calculadora-upgrade': 'calculadora-upgrade',
      'tecnicos': 'tecnicos',
      'pecas': 'pecas',
      'clientes': 'clientes',
      'agendamentos': 'agendamentos',
      'garantias': 'garantias',
      'etiquetas': 'etiquetas',
      'configuracoes': 'configuracoes',
      'superadmin': 'superadmin',
      'logs': 'logs',
    };

    const targetTab = tabMap[tabId] || tabId;
    if (targetTab) {
      handleTabChange(targetTab);
    }
  };



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
    // Se for vendedor, bloqueia renderização de abas restritas
    if (checkIsVendedor(usuario) && ['configuracoes', 'tecnicos', 'logs', 'superadmin'].includes(currentTab)) {
      return <DashboardTab />;
    }

    switch (currentTab) {
      case 'dashboard':
        return <DashboardTab />;
      case 'clientes':
        return <ClientesTab />;
      case 'aparelhos':
        return (
          <AparelhosTab
            onGerarEtiquetas={(ids) => {
              guardarPreselecaoEtiquetas(ids);
              handleTabChange('etiquetas');
            }}
          />
        );
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
      case 'calculadora-upgrade':
        return <CalculadoraUpgradeTab />;
      case 'whatsapp':
        return <DashboardTab />;
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
          <div className="w-full h-14 glass nav-surface rounded-2xl border border-white/20 flex items-center justify-between gap-2 sm:gap-3 px-2.5 sm:px-4 shadow-lg overflow-hidden">
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3 overflow-hidden">
              {headerLogoLoja ? (
                <img
                  src={headerLogoLoja}
                  alt={nomesLoja.full}
                  className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg object-cover flex-shrink-0"
                />
              ) : (
                <img
                  src="/logosnome.png"
                  alt="Phone Center"
                  className="h-8 w-8 sm:h-10 sm:w-10 rounded-xl object-contain flex-shrink-0 bg-slate-900/50 p-1 border border-white/10"
                />
              )}
              <div className="flex min-w-0 flex-col items-start overflow-hidden">
                <h1 
                  className="text-sm sm:text-base md:text-xl font-bold truncate leading-none" 
                  title={nomesLoja.full}
                >
                  <span className="hidden md:inline">{nomesLoja.full}</span>
                  <span className="hidden sm:inline md:hidden">{nomesLoja.medio}</span>
                  <span className="inline sm:hidden">{nomesLoja.compact}</span>
                </h1>
                <p className="text-[10px] sm:text-xs text-muted-foreground truncate leading-none mt-0.5 hidden sm:block">{subtitulo}</p>
              </div>
            </div>

            {/* User Info, Busca Railway, Meu Plano e Dropdown */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
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

              {/* Botão Rápido de Alternar Tema White / Dark */}
              <button
                onClick={() => setColorTheme(colorTheme === 'white-clean' ? 'padrao' : 'white-clean')}
                className="flex items-center justify-center h-9 w-9 sm:h-10 sm:w-10 rounded-2xl border border-white/15 bg-white/5 hover:bg-white/10 transition-all text-slate-300 hover:text-white shrink-0 cursor-pointer shadow-sm"
                title={colorTheme === 'white-clean' ? 'Mudar para Modo Dark' : 'Mudar para Modo White Clean'}
              >
                {colorTheme === 'white-clean' ? (
                  <Moon className="w-4 h-4 text-cyan-500" />
                ) : (
                  <Sun className="w-4 h-4 text-amber-400" />
                )}
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

      {/* Modais Globais de Plano, PWA, Paywall, Palette e Botão Flutuante de Suporte */}
      {showMeuPlanoModal && (
        <MeuPlanoModal isOpen={showMeuPlanoModal} onClose={() => setShowMeuPlanoModal(false)} />
      )}
      {!planLoading && usuario && !checkIsSuperAdmin(usuario) && planData.isBloqueado && (
        <PlanPaywallModal />
      )}
      <PwaInstallPrompt />
      {showCommandPalette && (
        <CommandPaletteModal
          isOpen={showCommandPalette}
          onClose={() => setShowCommandPalette(false)}
          onSelectTab={handleSelectTabFromPalette}
        />
      )}
      <SupportFloatingButton />
    </div>
  );
}
