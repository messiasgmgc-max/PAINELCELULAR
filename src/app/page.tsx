'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useStoreConfig } from '@/hooks/useStoreConfig';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ClientesTab } from '@/components/ClientesTab';
import { AparelhosTab } from '@/components/AparelhosTab';
import { PecasTab } from '@/components/PecasTab';
import { OrdensTab } from '@/components/OrdensTab';
import { TecnicosTab } from '@/components/TecnicosTab';
import { DashboardTab } from '@/components/DashboardTab';
import { AgendamentosTab } from '@/components/AgendamentosTab';
import { GarantiasTab } from '@/components/GarantiasTab';
import { VendasTab } from '@/components/VendasTab';
import { ConfiguracoesTab } from '@/components/ConfiguracoesTab';
import { MobileNav } from '@/components/MobileNav';
import SuperAdminTab from '@/components/SuperAdminTab';
import { 
  Smartphone, 
  AlertCircle,
  Clock,
  CheckCircle2,
  LogOut,
  User,
  Users,
  DollarSign,
  TrendingUp,
  Shield
} from 'lucide-react';
import { storage } from '@/lib/storage';
import type { Customer, Device, Part, ServiceOrder, Employee, Transaction } from '@/lib/storage';

export default function Home() {
  const { usuario, logout, loading } = useAuth();
  const { config, atualizarNomeLoja } = useStoreConfig();
  
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [isInitialized, setIsInitialized] = useState(false);
  const [subtitulo, setSubtitulo] = useState('Sistema de Gestão');

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
    const fetchLoja = async () => {
      if (usuario?.lojaId) {
        const { data } = await supabase.from('lojas').select('nome, subtitulo').eq('id', usuario.lojaId).single();
        if (data) {
          if (data.subtitulo) setSubtitulo(data.subtitulo);
          if (data.nome) atualizarNomeLoja(data.nome);
        }
      }
    };
    fetchLoja();
  }, [usuario?.lojaId, atualizarNomeLoja]);

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
      case 'configuracoes':
        return <ConfiguracoesTab />;
      case 'superadmin':
        return <SuperAdminTab />;
      default:
        return renderDashboardTab();
    }
  };

  const renderDashboardTab = () => (
    <div className="w-full flex justify-center">
      <div className="space-y-4 sm:space-y-6 pb-40 sm:pb-6 w-full max-w-6xl">
        {/* KPI Cards - 1 coluna mobile, 2 tablet, 4 desktop */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Clientes</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl sm:text-3xl font-bold">{stats.totalCustomers}</div>
            <p className="text-xs text-muted-foreground mt-1">Cadastrados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">OS Ativas</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl sm:text-3xl font-bold">{stats.activeOrders}</div>
            <p className="text-xs text-muted-foreground mt-1">Em andamento</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Faturamento</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.totalRevenue)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Total em OS</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Lucro</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.totalProfit)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.totalRevenue > 0 ? ((stats.totalProfit / stats.totalRevenue) * 100).toFixed(1) : 0}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Orders and Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 w-full max-w-6xl">
        {/* Recent Orders */}
        <Card>
          <CardHeader className="pb-3 sm:pb-4">
            <CardTitle className="text-base sm:text-lg">Ordens Recentes</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Últimas OS cadastradas</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {serviceOrders.slice(0, 5).map((order) => {
                const customer = customers.find(c => c.id === order.customerId);
                return (
                  <div key={order.id} className="flex items-start justify-between gap-2 border-b dark:border-slate-800 pb-3 last:border-0">
                    <div className="space-y-1 min-w-0 flex-1">
                      <p className="text-xs sm:text-sm font-medium truncate">{order.orderNumber}</p>
                      <p className="text-xs text-muted-foreground truncate">{customer?.name || 'Cliente'}</p>
                      <p className="text-xs text-muted-foreground truncate">{order.deviceModel}</p>
                    </div>
                    <div className="text-right space-y-1 flex-shrink-0">
                      {getStatusBadge(order.status)}
                      <p className="text-xs sm:text-sm font-medium">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.salePrice)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Alerts */}
        <Card>
          <CardHeader className="pb-3 sm:pb-4">
            <CardTitle className="text-base sm:text-lg">Alertas</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Itens que precisam atenção</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats.lowStockParts > 0 && (
              <div className="flex items-start gap-3 rounded-lg border border-orange-200 bg-orange-50 p-2 sm:p-3 dark:border-orange-900 dark:bg-orange-950">
                <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm font-medium text-orange-900 dark:text-orange-100">
                    Estoque Baixo
                  </p>
                  <p className="text-xs text-orange-700 dark:text-orange-300">
                    {stats.lowStockParts} peça(s) abaixo do mínimo
                  </p>
                </div>
              </div>
            )}

            {stats.completedOrders > 0 && (
              <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-2 sm:p-3 dark:border-green-900 dark:bg-green-950">
                <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm font-medium text-green-900 dark:text-green-100">
                    OS Concluídas
                  </p>
                  <p className="text-xs text-green-700 dark:text-green-300">
                    {stats.completedOrders} aguardando retirada
                  </p>
                </div>
              </div>
            )}

            {stats.lowStockParts === 0 && stats.completedOrders === 0 && (
              <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-2 sm:p-3 dark:border-blue-900 dark:bg-blue-950">
                <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm font-medium text-blue-900 dark:text-blue-100">
                    Tudo em Ordem
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    Não há alertas no momento
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Stock Overview */}
      <Card className="w-full max-w-6xl">
        <CardHeader className="pb-3 sm:pb-4">
          <CardTitle className="text-base sm:text-lg">Estoque de Aparelhos</CardTitle>
          <CardDescription className="text-xs sm:text-sm">Aparelhos disponíveis para venda</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {devices.slice(0, 10).map((device) => (
              <div key={device.id} className="flex items-start justify-between gap-2 border-b dark:border-slate-800 pb-3 last:border-0">
                <div className="space-y-1 min-w-0 flex-1">
                  <p className="text-xs sm:text-sm font-medium truncate">{device.brand} {device.model}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {device.storage} • {device.color}
                  </p>
                </div>
                <div className="text-right space-y-1 flex-shrink-0">
                  <p className="text-xs sm:text-sm font-medium">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(device.salePrice)}
                  </p>
                  <Badge variant={device.stock > 0 ? 'default' : 'destructive'} className="text-xs">
                    {device.stock} un
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header - Mobile optimized */}
      <header className="border-b bg-card sticky top-0 z-30 h-16">
        <div className="px-4 h-full relative flex items-center justify-between">
            {/* Spacer para o botão do menu (esquerda) */}
            <div className="w-10" />

            {/* Logo e Título - Centralizado Absolutamente */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-2">
              {config.logoLoja ? (
                <img
                  src={config.logoLoja}
                  alt={config.nomeLoja}
                  className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg object-cover flex-shrink-0"
                />
              ) : (
                <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground flex-shrink-0">
                  <Smartphone className="h-5 w-5 sm:h-6 sm:w-6" />
                </div>
              )}
              <div className="flex flex-col items-center sm:items-start">
                <h1 className="text-base sm:text-xl font-bold truncate leading-none">{config.nomeLoja}</h1>
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
      <MobileNav currentTab={currentTab} onTabChange={setCurrentTab} />

      {/* Main Content - flex-1 para ocupar espaço */}
      <main className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6 w-full pb-24 sm:pb-6">
        {renderCurrentTab()}
      </main>
    </div>
  );
}
