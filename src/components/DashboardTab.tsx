'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useOrdensServico } from '@/hooks/useOrdensServico';
import { usePecas } from '@/hooks/usePecas';
import { useTecnicos } from '@/hooks/useTecnicos';
import { GlassCard } from '@/components/GlassCard';
import { Badge } from '@/components/ui/badge';
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, Users, Zap, DollarSign, Target, Calendar, ShoppingBag, Wrench, AlertTriangle, PackageSearch, CreditCard, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/hooks/useAuth';
import { canViewFinancials } from '@/lib/utils';
import {
  filtrarOsDoPeriodo,
  formatarReais,
  mensagemErroResumo,
  montarGraficoDiario,
  normalizarResumoDashboard,
  resumoVazio,
  somarOsPorDia,
  type ResumoDashboard,
} from '@/lib/dashboard/resumo';

export function DashboardTab() {
  const { usuario } = useAuth();
  const { ordensServico, fetchOrdensServico } = useOrdensServico();
  const { pecas, fetchPecas } = usePecas();
  const { tecnicos, fetchTecnicos } = useTecnicos();
  const veFinanceiro = canViewFinancials(usuario);

  const [isMounted, setIsMounted] = useState(false);
  const [resumo, setResumo] = useState<ResumoDashboard>(resumoVazio);
  const [carregandoResumo, setCarregandoResumo] = useState(true);
  const [erroResumo, setErroResumo] = useState<string | null>(null);
  const [mostrarTodoCapital, setMostrarTodoCapital] = useState(false);

  // Função auxiliar para pegar data local YYYY-MM-DD
  const getLocalDate = (date: Date) => {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().split('T')[0];
  };

  const [dateRange, setDateRange] = useState(() => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    return {
      start: getLocalDate(firstDay),
      end: getLocalDate(today)
    };
  });

  useEffect(() => {
    setIsMounted(true);
    fetchOrdensServico();
    fetchPecas();
    fetchTecnicos();
  }, []);

  // Vendas agregadas no banco (RPC dashboard_resumo, respeita a RLS da loja).
  // Antes baixava todas as vendas e somava no navegador: venda sem data virava "hoje".
  const carregarResumo = useCallback(async () => {
    if (!usuario?.lojaId || !dateRange.start || !dateRange.end) return;
    setCarregandoResumo(true);
    setErroResumo(null);
    try {
      const { data, error } = await supabase.rpc('dashboard_resumo', {
        p_inicio: dateRange.start,
        p_fim: dateRange.end,
        p_loja_id: usuario.lojaId,
      });
      if (error) throw error;
      setResumo(normalizarResumoDashboard(data));
    } catch (err) {
      console.error('Erro ao carregar resumo do dashboard:', err);
      setResumo(resumoVazio());
      setErroResumo(mensagemErroResumo(err));
    } finally {
      setCarregandoResumo(false);
    }
  }, [usuario?.lojaId, dateRange.start, dateRange.end]);

  useEffect(() => {
    carregarResumo();
  }, [carregarResumo]);

  // OS do período pela data de entrada (sem data não entra)
  const osDoPeriodo = useMemo(
    () => filtrarOsDoPeriodo(ordensServico, dateRange.start, dateRange.end),
    [ordensServico, dateRange]
  );

  // Calcula KPIs
  const kpis = useMemo(() => {
    // OS (Considerar apenas ENTREGUE para financeiro)
    const osEntregues = osDoPeriodo.filter(item => item.status === 'entregue');
    const osReceita = osEntregues.reduce((sum, item) => sum + (item.precoVenda || 0), 0);
    const osLucro = osEntregues.reduce((sum, item) => sum + (item.lucro || 0), 0);
    const osCount = osDoPeriodo.length;
    const osEntregueCount = osEntregues.length;

    const vendasReceita = resumo.totais.faturamento;
    const vendasLucro = resumo.totais.lucroLiquido;
    const vendasCount = resumo.totais.quantidade;

    // Totais
    const totalReceita = osReceita + vendasReceita;
    const totalLucro = osLucro + vendasLucro;

    const somaEstoque = pecas.reduce((sum, p) => sum + p.estoque, 0);

    return {
      totalReceita,
      totalLucro,
      margemLucro: totalReceita > 0 ? ((totalLucro / totalReceita) * 100).toFixed(1) : '0',
      osReceita,
      osLucro,
      osCount,
      osEntregue: osEntregueCount,
      vendasReceita,
      vendasLucro,
      vendasCount,
      taxaConversaoOS: osCount > 0 ? ((osEntregueCount / osCount) * 100).toFixed(1) : '0',
      somaEstoque,
      techCount: tecnicos.length
    };
  }, [osDoPeriodo, resumo, pecas, tecnicos]);

  // Série diária: vendas do banco + OS, todos os dias do período em ordem de data
  const chartData = useMemo(
    () => montarGraficoDiario(dateRange.start, dateRange.end, resumo.porDia, somarOsPorDia(osDoPeriodo)),
    [dateRange, resumo.porDia, osDoPeriodo]
  );

  // Top 5 técnicos por número de OS
  const topTecnicos = useMemo(() => {
    const tecMap: Record<string, { nome: string; count: number; lucro: number }> = {};

    ordensServico
      .filter(os => os.tecnicoId && os.status === 'entregue')
      .forEach(os => {
        const tecId = os.tecnicoId || 'unknown';
        if (!tecMap[tecId]) {
          tecMap[tecId] = { nome: os.tecnicoNome || 'Desconhecido', count: 0, lucro: 0 };
        }
        tecMap[tecId].count += 1;
        tecMap[tecId].lucro += os.lucro;
      });

    return Object.values(tecMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [ordensServico]);

  // Top 5 peças mais usadas
  const topPecas = useMemo(() => {
    const pecMap: Record<string, { nome: string; quantidade: number; receita: number }> = {};

    ordensServico.forEach(os => {
      os.pecasUtilizadas.forEach(pu => {
        if (!pecMap[pu.pecaId]) {
          pecMap[pu.pecaId] = { nome: pu.pecaNome, quantidade: 0, receita: 0 };
        }
        pecMap[pu.pecaId].quantidade += pu.quantidade;
        pecMap[pu.pecaId].receita += pu.valorTotal;
      });
    });

    return Object.values(pecMap)
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 5);
  }, [ordensServico]);

  // Status das OS
  const statusOrdensData = useMemo(() => {
    const statusMap: Record<string, number> = {
      'Aguardando Peças': ordensServico.filter(os => os.status === 'aguardando_pecas').length,
      'Em Andamento': ordensServico.filter(os => os.status === 'em_andamento').length,
      'Concluído': ordensServico.filter(os => os.status === 'concluido').length,
      'Aguardando Retirada': ordensServico.filter(os => os.status === 'aguardando_retirada').length,
      'Entregue': ordensServico.filter(os => os.status === 'entregue').length,
    };

    return Object.entries(statusMap).map(([name, value]) => ({ name, value }));
  }, [ordensServico]);

  const colors = ['#EF4444', '#F97316', '#EAB308', '#3B82F6', '#10B981'];
  const capital = resumo.capitalParado;
  const gruposCapital = mostrarTodoCapital ? capital.grupos : capital.grupos.slice(0, 8);

  if (!isMounted) return null;

  return (
    <div className="panel-shell space-y-6">
      {/* Filtro de Data */}
      <GlassCard className="flex flex-col sm:flex-row gap-4 items-end sm:items-center">
        <div className="flex items-center gap-2 text-blue-600 font-medium">
          <Calendar className="w-5 h-5" />
          <span>Período:</span>
        </div>
        <div className="grid grid-cols-2 gap-4 w-full sm:w-auto">
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Data Inicial</label>
            <input
              type="date"
              value={dateRange.start}
              onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
              className="w-full border rounded p-2 text-sm bg-background"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Data Final</label>
            <input
              type="date"
              value={dateRange.end}
              onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
              className="w-full border rounded p-2 text-sm bg-background"
            />
          </div>
        </div>
        <div className="sm:ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          {carregandoResumo && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
          <span>{carregandoResumo ? 'Calculando no banco...' : 'Vendas canceladas não entram. Dia no fuso de Brasília.'}</span>
        </div>
      </GlassCard>

      {erroResumo && (
        <GlassCard className="border border-amber-400/40 text-amber-700 dark:text-amber-300 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {erroResumo}
        </GlassCard>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Faturamento Geral */}
        <GlassCard className="space-y-2" hoverEffect={true}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">Faturamento Geral</p>
            <DollarSign className="w-5 h-5 text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{formatarReais(kpis.totalReceita)}</p>
          <p className="text-xs text-muted-foreground">OS + Vendas</p>
        </GlassCard>

        {/* Lucro Geral (Apenas Administradores) ou Metas (Vendedores) */}
        {veFinanceiro ? (
          <GlassCard className="space-y-2" hoverEffect={true}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Lucro Líquido</p>
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{formatarReais(kpis.totalLucro)}</p>
            <p className="text-xs text-muted-foreground">
              Margem Global: {kpis.margemLucro}%{resumo.totais.taxas > 0 ? ` · taxas de cartão ${formatarReais(resumo.totais.taxas)} já descontadas` : ''}
            </p>
          </GlassCard>
        ) : (
          <GlassCard className="space-y-2" hoverEffect={true}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Volume de Vendas</p>
              <Target className="w-5 h-5 text-emerald-500" />
            </div>
            <p className="text-2xl font-bold text-emerald-400">{kpis.vendasCount} vendas</p>
            <p className="text-xs text-muted-foreground">Ticket médio {formatarReais(resumo.totais.ticketMedio)}</p>
          </GlassCard>
        )}

        {/* Serviços (OS) */}
        <GlassCard className="space-y-2" hoverEffect={true}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">Serviços (OS)</p>
            <Wrench className="w-5 h-5 text-purple-600" />
          </div>
          <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{formatarReais(kpis.osReceita)}</p>
          <div className="flex justify-between text-xs text-muted-foreground font-medium">
            {veFinanceiro ? (
              <span>Lucro: {formatarReais(kpis.osLucro)}</span>
            ) : (
              <span>{kpis.osCount} OS no total</span>
            )}
            <span>{kpis.osEntregue} / {kpis.osCount} Entregues</span>
          </div>
        </GlassCard>

        {/* Vendas */}
        <GlassCard className="space-y-2" hoverEffect={true}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">Vendas Diretas</p>
            <ShoppingBag className="w-5 h-5 text-amber-600" />
          </div>
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{formatarReais(kpis.vendasReceita)}</p>
          <div className="flex justify-between text-xs text-muted-foreground">
            {veFinanceiro ? (
              <span>Lucro líquido: {formatarReais(kpis.vendasLucro)}</span>
            ) : (
              <span>Ticket médio {formatarReais(resumo.totais.ticketMedio)}</span>
            )}
            <span>{kpis.vendasCount} Vendas</span>
          </div>
        </GlassCard>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Comparativo OS vs Vendas */}
        <GlassCard className="lg:col-span-2">
          <h3 className="text-sm font-semibold mb-4">Desempenho Financeiro (OS vs Vendas)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="rotulo" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value: number) => formatarReais(value)} />
              <Legend />
              <Line
                type="monotone"
                dataKey="receitaOS"
                stroke="#3B82F6"
                name="Receita OS"
                dot={false}
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="receitaVendas"
                stroke="#F59E0B"
                name="Receita Vendas"
                dot={false}
                strokeWidth={2}
              />
              {veFinanceiro && (
                <>
                  <Line
                    type="monotone"
                    dataKey="lucroOS"
                    stroke="#10B981"
                    name="Lucro OS"
                    dot={false}
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="lucroVendas"
                    stroke="#8B5CF6"
                    name="Lucro Vendas"
                    dot={false}
                    strokeWidth={2}
                  />
                </>
              )}
            </LineChart>
          </ResponsiveContainer>
        </GlassCard>

        {/* Status das OS - Gráfico de Pizza */}
        <GlassCard>
          <h3 className="text-sm font-semibold mb-4">Status das OS</h3>
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="w-full sm:w-1/2 h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusOrdensData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {statusOrdensData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-full sm:w-1/2 space-y-3">
              {statusOrdensData.map((entry, index) => (
                <div key={index} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
                    <span className="text-gray-600 dark:text-gray-300">{entry.name}</span>
                  </div>
                  <span className="font-bold">{entry.value}</span>
                </div>
              ))}
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Formas de pagamento e capital parado */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <GlassCard className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-blue-600" />
            Vendas por forma de pagamento
          </h3>
          {resumo.porFormaPagamento.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhuma venda no período.</p>
          ) : (
            <div className="space-y-2">
              {resumo.porFormaPagamento.map((f) => {
                const pct = resumo.totais.faturamento > 0 ? (f.valor / resumo.totais.faturamento) * 100 : 0;
                return (
                  <div key={f.forma} className="text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium">{f.rotulo}</span>
                      <span className="text-gray-600 dark:text-gray-300">{formatarReais(f.valor)} <span className="text-xs text-gray-500">({f.quantidade})</span></span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-200 dark:bg-slate-800 mt-1 overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </GlassCard>

        <GlassCard className="lg:col-span-2 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <PackageSearch className="w-4 h-4 text-amber-600" />
              Capital parado no estoque
            </h3>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{capital.quantidade} aparelho(s)</span>
              {veFinanceiro && <span className="font-semibold text-amber-600 dark:text-amber-400">{formatarReais(capital.custoParado)} em custo</span>}
              {capital.acimaLimite > 0 && (
                <Badge variant="secondary" className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 gap-1">
                  <AlertTriangle className="w-3 h-3" /> {capital.acimaLimite} há mais de {capital.limiteDias} dias
                </Badge>
              )}
            </div>
          </div>
          {capital.grupos.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhum aparelho disponível no estoque.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-200 dark:border-slate-800">
                    <th className="py-2 pr-3 font-medium">Modelo</th>
                    <th className="py-2 pr-3 font-medium text-right">Qtd</th>
                    {veFinanceiro && <th className="py-2 pr-3 font-medium text-right">Custo parado</th>}
                    <th className="py-2 pr-3 font-medium text-right">Dias (médio / maior)</th>
                    <th className="py-2 font-medium text-right">Alerta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                  {gruposCapital.map((g) => (
                    <tr key={`${g.modelo}|${g.capacidade}`} className={g.alerta ? 'bg-red-50/60 dark:bg-red-950/30' : ''}>
                      <td className="py-2 pr-3">
                        <span className="font-medium">{g.modelo}</span>
                        {g.capacidade && <span className="text-gray-500"> {g.capacidade}</span>}
                      </td>
                      <td className="py-2 pr-3 text-right">{g.quantidade}</td>
                      {veFinanceiro && (
                        <td className="py-2 pr-3 text-right">
                          {formatarReais(g.custoParado)}
                          {g.semCusto > 0 && <span className="block text-[10px] text-gray-500">{g.semCusto} sem custo cadastrado</span>}
                        </td>
                      )}
                      <td className="py-2 pr-3 text-right text-gray-600 dark:text-gray-300">
                        {g.diasMedio ?? '—'} / {g.diasMaisAntigo ?? '—'}
                      </td>
                      <td className="py-2 text-right">
                        {g.alerta ? (
                          <Badge variant="secondary" className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                            {g.acimaLimite} parado(s)
                          </Badge>
                        ) : (
                          <span className="text-xs text-gray-400">ok</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {capital.grupos.length > 8 && (
                <button
                  type="button"
                  onClick={() => setMostrarTodoCapital((v) => !v)}
                  className="mt-2 text-xs text-blue-600 hover:underline"
                >
                  {mostrarTodoCapital ? 'Mostrar menos' : `Ver todos os ${capital.grupos.length} modelos`}
                </button>
              )}
            </div>
          )}
        </GlassCard>
      </div>

      {/* Top Técnicos e Peças */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Técnicos */}
        <GlassCard className="space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-600" />
            Top 5 Técnicos
          </h3>
          <div className="space-y-3">
            {topTecnicos.length > 0 ? (
              topTecnicos.map((tec, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-950 rounded-lg border border-gray-200 dark:border-slate-800">
                  <div className="flex-1">
                    <p className="font-medium text-sm">{tec.nome}</p>
                    <p className="text-xs text-gray-600">{tec.count} OS entregue(s)</p>
                  </div>
                  <div className="text-right">
                    <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                      {formatarReais(tec.lucro)}
                    </Badge>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500">Nenhum dado disponível</p>
            )}
          </div>
        </GlassCard>

        {/* Top Peças */}
        <GlassCard className="space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-600" />
            Top 5 Peças
          </h3>
          <div className="space-y-3">
            {topPecas.length > 0 ? (
              topPecas.map((pec, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-950 rounded-lg border border-gray-200 dark:border-slate-800">
                  <div className="flex-1">
                    <p className="font-medium text-sm">{pec.nome}</p>
                    <p className="text-xs text-gray-600">{pec.quantidade} unidade(s)</p>
                  </div>
                  <div className="text-right">
                    <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                      {formatarReais(pec.receita)}
                    </Badge>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500">Nenhum dado disponível</p>
            )}
          </div>
        </GlassCard>
      </div>

      {/* Aviso se não há dados */}
      {ordensServico.length === 0 && (
        <GlassCard className="text-center text-gray-500">
          <p className="text-sm">Nenhuma ordem de serviço registrada. Os gráficos aparecerão quando houver dados.</p>
        </GlassCard>
      )}
    </div>
  );
}
