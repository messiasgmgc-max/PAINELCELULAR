'use client';

import { useEffect, useState } from 'react';
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
import SuperAdminTab from '@/components/SuperAdminTab';
import { 
  Smartphone, 
  LogOut,
  User,
  Shield
} from 'lucide-react';

export default function Home() {
  const { usuario, logout, loading } = useAuth();
  const { config, atualizarNomeLoja, atualizarLogoLoja } = useStoreConfig();
  
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [subtitulo, setSubtitulo] = useState('Sistema de Gestão');
  const [headerNomeLoja, setHeaderNomeLoja] = useState('');
  const [headerLogoLoja, setHeaderLogoLoja] = useState<string | null>(null);

  // Persistir a aba atual para não voltar ao dashboard ao recarregar
  useEffect(() => {
    const savedTab = localStorage.getItem('last_tab');
    if (savedTab) setCurrentTab(savedTab);
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    if (isInitialized) localStorage.setItem('last_tab', currentTab);
  }, [currentTab, isInitialized]);

  useEffect(() => {
    // Atualiza via store (configuracoes) caso seja alterado em tempo real na aba Configurações
    if (config.nomeLoja) setHeaderNomeLoja(config.nomeLoja);
    if (config.logoLoja !== undefined) setHeaderLogoLoja(config.logoLoja);
  }, [config.nomeLoja, config.logoLoja]);

  useEffect(() => {
    const fetchLoja = async () => {
      if (usuario?.lojaId) {
        const { data } = await supabase.from('lojas').select('nome, subtitulo, logo_url').eq('id', usuario.lojaId).single();
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
        }
      }
    };
    fetchLoja();
  }, [usuario?.lojaId]); // Dependências limpas para não dar loop com o cache

  console.debug('Dashboard: render check', { loading, usuario: usuario?.email });

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
      case 'orders':
        return <OrdensTab />;
      case 'tecnicos':
        return <TecnicosTab />;
      case 'agendamentos':
        return <AgendamentosTab />;
      case 'garantias':
        return <GarantiasTab />;
      case 'vendas':
        return <VendasTab />;
      case 'whatsapp':
        return <WhatsappTab />;
      case 'configuracoes':
        return <ConfiguracoesTab />;
      case 'superadmin':
        return <SuperAdminTab />;
      default:
        return <DashboardTab />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header - Mobile optimized */}
      <header className={cn(
        "relative z-30 h-20 transition-all duration-300 flex items-center px-4",
        isSidebarCollapsed ? "md:ml-20" : "md:ml-64"
      )}>
        <div className="w-full h-14 glass backdrop-blur-md rounded-2xl border border-white/20 flex items-center justify-between px-4 shadow-lg relative">
            {/* Spacer para o botão do menu (esquerda) */}
            <div className="w-10" />

            {/* Logo e Título - Centralizado Absolutamente */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-2">
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
              <div className="flex flex-col items-center sm:items-start">
                <h1 className="text-base sm:text-xl font-bold truncate leading-none">{headerNomeLoja || 'Phone Center'}</h1>
                <p className="text-[10px] sm:text-xs text-muted-foreground truncate leading-none mt-0.5 hidden sm:block">{subtitulo}</p>
              </div>
            </div>

            {/* User Info e Logout */}
            <div className="flex items-center gap-2 z-10">
              {/* Botão Super Admin */}
              {(usuario?.role === 'admin' || usuario?.role === 'super_admin') && (
                <Button
                  variant={currentTab === 'superadmin' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setCurrentTab('superadmin')}
                  className="hidden sm:flex gap-2 h-9 sm:h-10"
                >
                  <Shield className="w-4 h-4" />
                  <span className="hidden lg:inline">Admin</span>
                </Button>
              )}

              {usuario && (
                <div className="hidden sm:flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-slate-800 rounded-lg">
                  <User className="w-4 h-4 text-gray-600 dark:text-gray-400 flex-shrink-0" />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-200">{usuario.nome}</span>
                    <span className="text-xs text-gray-600 dark:text-gray-400">{usuario.role}</span>
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
      </header>

      {/* Mobile Navigation - acima do conteúdo */}
      <MobileNav 
        currentTab={currentTab} 
        onTabChange={setCurrentTab} 
        isCollapsed={isSidebarCollapsed} 
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)} 
      />

      {/* Main Content - flex-1 para ocupar espaço */}
      <main className={cn(
        "flex-1 px-4 py-4 sm:px-6 sm:py-6 pb-24 sm:pb-6 transition-all duration-300",
        isSidebarCollapsed ? "md:ml-20" : "md:ml-64"
      )}>
        {renderCurrentTab()}
      </main>
    </div>
  );
}
