'use client';

import { useState, useEffect, useMemo } from 'react';
import { useOrdensServico } from '@/hooks/useOrdensServico';
import { usePecas } from '@/hooks/usePecas';
import { useTecnicos } from '@/hooks/useTecnicos';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, Users, Zap, Package, DollarSign, Target, Calendar, ShoppingBag, Wrench } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

export function DashboardTab() {
  const { ordensServico, fetchOrdensServico } = useOrdensServico();
  const { pecas, fetchPecas } = usePecas();
  const { tecnicos, fetchTecnicos } = useTecnicos();

  const [vendas, setVendas] = useState<any[]>([]);
  
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
    fetchOrdensServico();
    fetchPecas();
    fetchTecnicos();
    
    const fetchVendas = async () => {
      const { data, error } = await supabase
        .from('vendas')
        .select('*');
      if (!error && data) {
        setVendas(data);
      }
    };
    fetchVendas();
  }, []);

  // Filtrar dados pelo período
  const filteredData = useMemo(() => {
    // Criar datas considerando o início e fim do dia no fuso local
    const start = new Date(`${dateRange.start}T00:00:00`);
    const end = new Date(`${dateRange.end}T23:59:59.999`);

    const osFiltradas = ordensServico.filter(os => {
      // Usa dataEntrada ou createdAt ou hoje como fallback
      const dataStr = os.dataEntrada || (os as any).createdAt || new Date().toISOString();
      const date = new Date(dataStr);
      return date >= start && date <= end;
    });

    const vendasFiltradas = vendas.filter(v => {
      const date = v.dataPagamento ? new Date(v.dataPagamento) : new Date();
      return date >= start && date <= end;
    });

    return { os: osFiltradas, vendas: vendasFiltradas };
  }, [ordensServico, vendas, dateRange]);

  // Calcula KPIs
  const kpis = useMemo(() => {
    const { os, vendas } = filteredData;

    // OS (Considerar apenas ENTREGUE para financeiro)
    const osEntregues = os.filter(item => item.status === 'entregue');
    const osReceita = osEntregues.reduce((sum, item) => sum + (item.precoVenda || 0), 0);
    const osLucro = osEntregues.reduce((sum, item) => sum + (item.lucro || 0), 0);
    const osCount = os.length;
    const osEntregueCount = osEntregues.length;

    // Vendas (valores em reais/float)
    const vendasReceita = vendas.reduce((sum, item) => sum + (item.valor || 0), 0);
    const vendasLucro = vendas.reduce((sum, item) => sum + (item.lucro || 0), 0);
    const vendasCount = vendas.length;

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
  }, [filteredData, pecas, tecnicos]);

  // Dados por período para o gráfico
  const chartData = useMemo(() => {
    const dataMap: Record<string, { date: string; receitaOS: number; lucroOS: number; receitaVendas: number; lucroVendas: number }> = {};
    
    // Preencher com dados de OS
    filteredData.os.forEach(os => {
      const dateStr = os.dataEntrada ? new Date(os.dataEntrada).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
      if (!dataMap[dateStr]) dataMap[dateStr] = { date: new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), receitaOS: 0, lucroOS: 0, receitaVendas: 0, lucroVendas: 0 };
      if (os.status === 'entregue') {
        dataMap[dateStr].receitaOS += (os.precoVenda || 0);
        dataMap[dateStr].lucroOS += (os.lucro || 0);
      }
    });

    // Preencher com dados de Vendas
    filteredData.vendas.forEach(v => {
      const dateStr = v.dataPagamento ? new Date(v.dataPagamento).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
      if (!dataMap[dateStr]) dataMap[dateStr] = { date: new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), receitaOS: 0, lucroOS: 0, receitaVendas: 0, lucroVendas: 0 };
      dataMap[dateStr].receitaVendas += (v.valor || 0);
      dataMap[dateStr].lucroVendas += (v.lucro || 0);
    });

    return Object.values(dataMap).sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredData]);

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

  return (
    <div className="space-y-6">
      {/* Filtro de Data */}
      <div className="flex flex-col sm:flex-row gap-4 items-end sm:items-center bg-white dark:bg-slate-900 p-4 rounded-lg border shadow-sm">
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
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Faturamento Geral */}
        <Card className="p-6 space-y-2 border-2 border-blue-100 dark:border-blue-900 bg-card dark:bg-slate-950">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">Faturamento Geral</p>
            <DollarSign className="w-5 h-5 text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">R$ {kpis.totalReceita.toFixed(2).replace('.', ',')}</p>
          <p className="text-xs text-muted-foreground">OS + Vendas</p>
        </Card>

        {/* Lucro Geral */}
        <Card className="p-6 space-y-2 border-2 border-green-100 dark:border-green-900 bg-card dark:bg-slate-950">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">Lucro Líquido</p>
            <TrendingUp className="w-5 h-5 text-green-600" />
          </div>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">R$ {kpis.totalLucro.toFixed(2).replace('.', ',')}</p>
          <p className="text-xs text-muted-foreground">Margem Global: {kpis.margemLucro}%</p>
        </Card>

        {/* Serviços (OS) */}
        <Card className="p-6 space-y-2 border-2 border-purple-100 dark:border-purple-900 bg-card dark:bg-slate-950">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">Serviços (OS)</p>
            <Wrench className="w-5 h-5 text-purple-600" />
          </div>
          <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">R$ {kpis.osReceita.toFixed(2).replace('.', ',')}</p>
          <div className="flex justify-between text-xs text-muted-foreground font-medium">
            <span>Lucro: R$ {kpis.osLucro.toFixed(2)}</span>
            <span>{kpis.osEntregue} / {kpis.osCount} Entregues</span>
          </div>
        </Card>

        {/* Vendas */}
        <Card className="p-6 space-y-2 border-2 border-amber-100 dark:border-amber-900 bg-card dark:bg-slate-950">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">Vendas Diretas</p>
            <ShoppingBag className="w-5 h-5 text-amber-600" />
          </div>
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">R$ {kpis.vendasReceita.toFixed(2).replace('.', ',')}</p>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Lucro: R$ {kpis.vendasLucro.toFixed(2)}</span>
            <span>{kpis.vendasCount} Vendas</span>
          </div>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Comparativo OS vs Vendas */}
        <Card className="p-4 lg:col-span-2 border-2">
          <h3 className="text-sm font-semibold mb-4">Desempenho Financeiro (OS vs Vendas)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value: number) => `R$ ${value.toFixed(2)}`} />
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
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* Status das OS - Gráfico de Pizza */}
        <Card className="p-4 border-2">
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
        </Card>
      </div>

      {/* Top Técnicos e Peças */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Técnicos */}
        <Card className="p-6 space-y-4 border-2">
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
                      R$ {tec.lucro.toFixed(2).replace('.', ',')}
                    </Badge>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500">Nenhum dado disponível</p>
            )}
          </div>
        </Card>

        {/* Top Peças */}
        <Card className="p-6 space-y-4 border-2">
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
                      R$ {pec.receita.toFixed(2).replace('.', ',')}
                    </Badge>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500">Nenhum dado disponível</p>
            )}
          </div>
        </Card>
      </div>

      {/* Aviso se não há dados */}
      {ordensServico.length === 0 && (
        <Card className="p-8 text-center text-gray-500 border-2 border-dashed">
          <p className="text-sm">Nenhuma ordem de serviço registrada. Os gráficos aparecerão quando houver dados.</p>
        </Card>
      )}
    </div>
  );
}
