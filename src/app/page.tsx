'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
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
import SuperAdminTab from '@/components/SuperAdminTab';
import { 
  Smartphone, 
  LogOut,
  User,
  Shield
} from 'lucide-react';

export default function Home() {
  const router = useRouter();
  const pathname = usePathname();
  const { usuario, logout, loading, authReady } = useAuth();
  const { config, atualizarNomeLoja, atualizarLogoLoja, atualizarAssinaturaLoja } = useStoreConfig();
  
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [subtitulo, setSubtitulo] = useState('Sistema de Gestão');
  const [headerNomeLoja, setHeaderNomeLoja] = useState('');
  const [headerLogoLoja, setHeaderLogoLoja] = useState<string | null>(null);

  const normalizeTabFromPath = (path: string) => {
    const segment = path.split('/').filter(Boolean)[0] || 'dashboard';

    if (segment === 'os') return 'orders';

    const allowedTabs = new Set([
      'dashboard',
      'vendas',
      'taxas-maquininha',
      'clientes',
      'aparelhos',
      'pecas',
      'etiquetas',
      'orders',
      'tecnicos',
      'agendamentos',
      'garantias',
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
    const nextPath = tabToPath(tabId);
    if (nextPath !== pathname) {
      router.push(nextPath);
    }
  };

  useEffect(() => {
    setCurrentTab(normalizeTabFromPath(pathname));
  }, [pathname]);

  useEffect(() => {
    if (currentTab === 'superadmin' && usuario?.role !== 'super_admin') {
      router.replace('/');
    }
  }, [currentTab, usuario?.role, router]);

  useEffect(() => {
    // Atualiza via store (configuracoes) caso seja alterado em tempo real na aba Configurações
    if (config.nomeLoja) setHeaderNomeLoja(config.nomeLoja);
    if (config.logoLoja !== undefined) setHeaderLogoLoja(config.logoLoja);
  }, [config.nomeLoja, config.logoLoja]);

  useEffect(() => {
    const fetchLoja = async () => {
      if (usuario?.lojaId) {
        const { data } = await supabase.from('lojas').select('nome, subtitulo, logo_url, assinatura_url').eq('id', usuario.lojaId).single();
        if (data) {
          if (data.subtitulo) setSubtitulo(data.subtitulo);
          if (data.nome) {
            setHeaderNomeLoja(data.nome); // Força visualização real time do BD
            atualizarNomeLoja(data.nome);
          }
          if (data.logo_url) {
            setHeaderLogoLoja(data.logo_url);
            atualizarLogoLoja(data.logo_url);
          }
          atualizarAssinaturaLoja(data.assinatura_url || null);
        }
      }
    };
    fetchLoja();
  }, [usuario?.lojaId]); // Dependências limpas para não dar loop com o cache

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
      case 'vendas':
        return <VendasTab isSidebarCollapsed={isSidebarCollapsed} setSidebarCollapsed={setIsSidebarCollapsed} />;
      case 'taxas-maquininha':
        return <TaxasMaquininhaTab />;
      case 'whatsapp':
        return <WhatsappTab />;
      case 'configuracoes':
        return <ConfiguracoesTab />;
      case 'superadmin':
        return usuario?.role === 'super_admin' ? <SuperAdminTab /> : <DashboardTab />;
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

            {/* User Info e Logout */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Botão Super Admin */}
              {usuario?.role === 'super_admin' && (
                <Button
                  variant={currentTab === 'superadmin' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleTabChange('superadmin')}
                  className="hidden sm:flex gap-2 h-9 sm:h-10"
                >
                  <Shield className="w-4 h-4" />
                  <span className="hidden lg:inline">Admin</span>
                </Button>
              )}

              {usuario && (
                <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 sm:py-2 bg-gray-100/80 dark:bg-slate-800/80 rounded-xl border border-white/10">
                  <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-500 flex-shrink-0" />
                  <div className="flex flex-col text-left">
                    <span className="text-xs sm:text-sm font-medium text-gray-900 dark:text-gray-200 max-w-[80px] sm:max-w-[160px] truncate">{usuario.nome}</span>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 capitalize leading-none hidden sm:block">{usuario.role}</span>
                  </div>
                </div>
              )}
              {usuario && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={logout}
                  className="gap-2 text-xs sm:text-sm h-9 sm:h-10"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">Sair</span>
                </Button>
              )}
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
    </div>
  );
}
