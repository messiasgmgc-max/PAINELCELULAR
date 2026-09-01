'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Boxes, 
  Package, 
  Users, 
  DollarSign, 
  TrendingUp, 
  ShoppingCart, 
  History, 
  Download, 
  Search, 
  Calendar, 
  ArrowUpRight, 
  CheckCircle2, 
  Trash2, 
  Filter, 
  Sparkles, 
  Plus, 
  RotateCcw, 
  FileSpreadsheet, 
  MessageCircle,
  Smartphone,
  Tag,
  ChevronRight,
  ShieldCheck,
  ShoppingBag
} from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ModalPortal } from '@/components/ModalPortal';
import { useAparelhos } from '@/hooks/useAparelhos';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabaseClient';
import { getAparelhoCodigo, cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Aparelho } from '@/lib/db/types';
import { EditarValoresAtacadoModal } from '@/components/EditarValoresAtacadoModal';
import { MarcarVendidoModal } from '@/components/MarcarVendidoModal';
import { VendaLoteAtacadoModal } from '@/components/VendaLoteAtacadoModal';

interface VendaAtacadoItem {
  id: string;
  aparelhoId?: string;
  data: string;
  comprador: string;
  modelo: string;
  marca: string;
  cor?: string;
  capacidade?: string;
  imei?: string;
  codigo?: string;
  valorVenda: number;
  custo: number;
  lucro: number;
  margem: number;
  metodoPgto: string;
  observacoes?: string;
  raw?: any;
}

export function AtacadoTab() {
  const { usuario } = useAuth();
  const { aparelhos, loading, fetchAparelhos } = useAparelhos();

  const [busca, setBusca] = useState('');
  const [compradorFiltro, setCompradorFiltro] = useState<string>('todos');
  const [periodoFiltro, setPeriodoFiltro] = useState<'todos' | 'mes' | 'ano'>('todos');
  const [showAtacadoModal, setShowAtacadoModal] = useState(false);
  const [showNovaVendaModal, setShowNovaVendaModal] = useState(false);
  const [aparelhoSelecionadoVenda, setAparelhoSelecionadoVenda] = useState<Aparelho | null>(null);

  // ── 1. Aparelhos Ativos Disponíveis no Estoque ──
  const aparelhosEstoqueAtivo = useMemo(() => {
    return aparelhos.filter((a: any) => {
      if (a.ativo === false) return false;
      if (a.condicao === 'vendido' || a.status === 'vendido') return false;
      return true;
    });
  }, [aparelhos]);

  // Valor total de estoque a preço de atacado
  const totalEstoqueAtacadoValor = useMemo(() => {
    return aparelhosEstoqueAtivo.reduce((acc, a) => {
      const precoAtac = (a as any).precoAtacado || a.preco || 0;
      return acc + Number(precoAtac);
    }, 0);
  }, [aparelhosEstoqueAtivo]);

  // ── 2. Histórico de Vendas em Atacado ──
  const vendasAtacado = useMemo<VendaAtacadoItem[]>(() => {
    const lista: VendaAtacadoItem[] = [];

    // Busca nas observações de baixa dos aparelhos
    aparelhos.forEach((a: any) => {
      const obs = String(a.observacoes || '');
      const matchBaixa = obs.match(/BAIXA_ESTOQUE:([^:]+):(.*?)$/m);

      if (matchBaixa) {
        const dataIso = matchBaixa[1];
        const textoDetalhe = matchBaixa[2];

        // Verifica se é uma saída de atacado
        const isAtacado = 
          textoDetalhe.toLowerCase().includes('atacado') || 
          obs.toLowerCase().includes('atacado') ||
          (a.cliente && a.cliente.toLowerCase() !== 'venda varejo' && a.cliente.toLowerCase() !== 'cliente final');

        if (isAtacado) {
          // Extrai comprador
          const matchComprador = textoDetalhe.match(/para\s+(.*?)\s+por/i) || textoDetalhe.match(/para\s+(.*?)(?:\||$)/i);
          const compradorNome = matchComprador ? matchComprador[1].trim() : (a.cliente || 'Lojista / Revenda');

          // Extrai valor da venda
          const matchValor = textoDetalhe.match(/por\s+R\$\s*([\d.,]+)/i);
          const valorVenda = matchValor 
            ? parseFloat(matchValor[1].replace(/\./g, '').replace(',', '.')) 
            : ((a as any).precoAtacado || a.preco || 0);

          // Extrai custo
          const matchCusto = textoDetalhe.match(/Custo:\s*R\$\s*([\d.,]+)/i);
          const custo = matchCusto 
            ? parseFloat(matchCusto[1].replace(/\./g, '').replace(',', '.')) 
            : (a.custo || 0);

          // Extrai lucro
          const matchLucro = textoDetalhe.match(/Lucro:\s*R\$\s*([\d.,]+)/i);
          const lucro = matchLucro 
            ? parseFloat(matchLucro[1].replace(/\./g, '').replace(',', '.')) 
            : (valorVenda - custo);

          // Extrai forma de pagamento
          const matchPgto = textoDetalhe.match(/Pgto:\s*([A-Za-z0-9_]+)/i);
          const metodoPgto = matchPgto ? matchPgto[1] : 'pix';

          const margem = custo > 0 ? (lucro / custo) * 100 : 100;

          lista.push({
            id: `venda_${a.id}`,
            aparelhoId: a.id,
            data: dataIso,
            comprador: compradorNome,
            modelo: a.modelo || '',
            marca: a.marca || 'Apple',
            cor: a.cor,
            capacidade: a.capacidade,
            imei: a.imei,
            codigo: getAparelhoCodigo(a),
            valorVenda,
            custo,
            lucro,
            margem,
            metodoPgto,
            observacoes: a.observacoes,
            raw: a,
          });
        }
      }
    });

    return lista.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
  }, [aparelhos]);

  // Filtro de Vendas por Período e Busca
  const vendasFiltradas = useMemo(() => {
    return vendasAtacado.filter((v) => {
      // Filtro por Comprador
      if (compradorFiltro !== 'todos' && v.comprador.toLowerCase() !== compradorFiltro.toLowerCase()) {
        return false;
      }

      // Filtro por Período
      if (periodoFiltro === 'mes') {
        const dataVenda = new Date(v.data);
        const agora = new Date();
        if (dataVenda.getMonth() !== agora.getMonth() || dataVenda.getFullYear() !== agora.getFullYear()) {
          return false;
        }
      } else if (periodoFiltro === 'ano') {
        const dataVenda = new Date(v.data);
        const agora = new Date();
        if (dataVenda.getFullYear() !== agora.getFullYear()) {
          return false;
        }
      }

      // Filtro por Busca de Texto
      if (busca.trim()) {
        const t = busca.toLowerCase().trim();
        const mod = v.modelo.toLowerCase();
        const comp = v.comprador.toLowerCase();
        const ime = (v.imei || '').toLowerCase();
        const cod = (v.codigo || '').toLowerCase();
        return mod.includes(t) || comp.includes(t) || ime.includes(t) || cod.includes(t);
      }

      return true;
    });
  }, [vendasAtacado, compradorFiltro, periodoFiltro, busca]);

  // ── 3. Métricas e KPIs Consolidados ──
  const kpis = useMemo(() => {
    const faturamentoTotal = vendasFiltradas.reduce((acc, v) => acc + v.valorVenda, 0);
    const custoTotal = vendasFiltradas.reduce((acc, v) => acc + v.custo, 0);
    const lucroTotal = vendasFiltradas.reduce((acc, v) => acc + v.lucro, 0);
    const totalAparelhosVendidos = vendasFiltradas.length;
    const ticketMedio = totalAparelhosVendidos > 0 ? faturamentoTotal / totalAparelhosVendidos : 0;
    const margemMedia = custoTotal > 0 ? (lucroTotal / custoTotal) * 100 : 0;

    return {
      faturamentoTotal,
      lucroTotal,
      totalAparelhosVendidos,
      ticketMedio,
      margemMedia,
    };
  }, [vendasFiltradas]);

  // ── 4. Ranking dos Principais Compradores / Lojistas ──
  const rankingCompradores = useMemo(() => {
    const map: Record<string, { nome: string; totalGasto: number; totalAparelhos: number; lucroGerado: number; ultimaCompra: string }> = {};

    vendasAtacado.forEach((v) => {
      const chave = v.comprador || 'Outros Lojistas';
      if (!map[chave]) {
        map[chave] = {
          nome: chave,
          totalGasto: 0,
          totalAparelhos: 0,
          lucroGerado: 0,
          ultimaCompra: v.data,
        };
      }
      map[chave].totalGasto += v.valorVenda;
      map[chave].totalAparelhos += 1;
      map[chave].lucroGerado += v.lucro;
      if (new Date(v.data) > new Date(map[chave].ultimaCompra)) {
        map[chave].ultimaCompra = v.data;
      }
    });

    return Object.values(map).sort((a, b) => b.totalGasto - a.totalGasto);
  }, [vendasAtacado]);

  // ── 5. Ranking de Modelos Mais Vendidos no Atacado ──
  const rankingModelos = useMemo(() => {
    const map: Record<string, { modelo: string; qtd: number; faturamento: number }> = {};

    vendasAtacado.forEach((v) => {
      const chave = v.modelo || 'Outros';
      if (!map[chave]) {
        map[chave] = { modelo: chave, qtd: 0, faturamento: 0 };
      }
      map[chave].qtd += 1;
      map[chave].faturamento += v.valorVenda;
    });

    return Object.values(map).sort((a, b) => b.qtd - a.qtd).slice(0, 5);
  }, [vendasAtacado]);

  // Reverter/Cancelar Venda de Atacado (Devolve o aparelho para o estoque ativo)
  const handleReverterVenda = async (venda: VendaAtacadoItem) => {
    if (!venda.aparelhoId) return;

    if (!confirm(`Deseja cancelar esta venda e devolver o ${venda.modelo} (${venda.comprador}) para o estoque ativo?`)) {
      return;
    }

    const toastId = toast.loading('Revertendo venda e reativando aparelho...');

    try {
      const { error } = await supabase
        .from('aparelhos')
        .update({
          ativo: true,
          condicao: 'seminovo',
          status: 'disponivel',
        })
        .eq('id', venda.aparelhoId);

      if (error) throw error;

      toast.success(`⚡ Venda cancelada! ${venda.modelo} retornou ao estoque ativo.`, { id: toastId });
      await fetchAparelhos();
    } catch (err: any) {
      console.error('Erro ao reverter venda:', err);
      toast.error(`Erro ao reverter: ${err.message || 'Falha no banco'}`, { id: toastId });
    }
  };

  // Exportar Lista de Atacado para o WhatsApp
  const handleExportWhatsAppAtacado = () => {
    const dataCurta = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    
    const grupos: Record<string, Aparelho[]> = {};
    aparelhosEstoqueAtivo.forEach((a) => {
      const modeloClean = a.modelo ? a.modelo.replace(/^Apple\s+/i, '').trim() : 'Outros';
      if (!grupos[modeloClean]) grupos[modeloClean] = [];
      grupos[modeloClean].push(a);
    });

    let texto = `📦 *ESTOQUE ATACADO (${dataCurta})*\n\n`;

    Object.entries(grupos).forEach(([modeloHeader, itens]) => {
      texto += `*${modeloHeader}*\n`;
      itens.forEach((a) => {
        const valAtacado = (a as any).precoAtacado || a.preco || 0;
        const precoStr = valAtacado > 0 
          ? `*R$ ${valAtacado.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}*` 
          : '';

        let imeiReal = (a.imei || '').trim();
        if (!imeiReal && a.observacoes) {
          const matchImei = a.observacoes.match(/IMEI:\s*([A-Za-z0-9]+)/i);
          if (matchImei) imeiReal = matchImei[1];
        }
        const codigoDisplay = imeiReal ? imeiReal : (getAparelhoCodigo(a) || '');

        let bateriaStr = '';
        if (a.observacoes) {
          const bMatch = a.observacoes.match(/(\d+)%\s*bat/i) || a.observacoes.match(/\b(\d{2,3})%\b/);
          if (bMatch) bateriaStr = `${bMatch[1]}%`;
        }

        const partes = [];
        if (a.capacidade) partes.push(a.capacidade);
        if (a.cor) partes.push(a.cor);
        if (bateriaStr) partes.push(bateriaStr);

        const detalhe = partes.join(' ');
        const tag = codigoDisplay ? ` (${codigoDisplay})` : '';
        const precoTag = precoStr ? ` ➔ ${precoStr}` : '';

        texto += `🔘 ${detalhe}${precoTag}${tag}\n`;
      });
      texto += '\n';
    });

    navigator.clipboard.writeText(texto)
      .then(() => toast.success('Lista de Atacado copiada para o WhatsApp! 📋'))
      .catch(() => toast.error('Erro ao copiar lista.'));
  };

  // Exportar CSV de Vendas
  const handleExportCSVVendas = () => {
    if (vendasFiltradas.length === 0) {
      toast.error('Nenhuma venda para exportar!');
      return;
    }

    const headers = ['Data', 'Comprador/Lojista', 'Modelo', 'Capacidade', 'Cor', 'IMEI/ID', 'Valor Venda (R$)', 'Custo (R$)', 'Lucro Líquido (R$)', 'Forma Pagamento'];
    const rows = vendasFiltradas.map(v => [
      new Date(v.data).toLocaleDateString('pt-BR'),
      v.comprador,
      v.modelo,
      v.capacidade || '',
      v.cor || '',
      v.imei || v.codigo || '',
      v.valorVenda.toFixed(2),
      v.custo.toFixed(2),
      v.lucro.toFixed(2),
      v.metodoPgto,
    ]);

    let csv = headers.join(',') + '\n';
    rows.forEach(r => {
      csv += r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `vendas_atacado_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="panel-shell space-y-5">
      
      {/* CABEÇALHO PRINCIPAL DO ATACADO */}
      <GlassCard className="rounded-3xl p-4 sm:p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 text-amber-400 flex items-center justify-center font-bold border border-amber-500/30 shadow-lg shadow-amber-950/20">
              <Boxes className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                Painel de Atacado & Revenda
                <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-[10px]">
                  B2B / Lojistas
                </Badge>
              </h2>
              <p className="text-xs sm:text-sm text-slate-400">
                Controle de vendas para lojistas, compradores frequentes e métricas de atacado
              </p>
            </div>
          </div>

          {/* BOTÕES DE AÇÃO RÁPIDA */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              onClick={() => setShowNovaVendaModal(true)}
              className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-bold rounded-xl px-4 text-xs sm:text-sm shadow-md shadow-amber-950/30 flex items-center gap-2 border border-amber-400/30 transition-all hover:scale-[1.02] active:scale-[0.98] h-10 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Nova Venda Atacado
            </Button>

            <Button
              onClick={() => setShowAtacadoModal(true)}
              className="bg-slate-800/90 hover:bg-slate-700/90 text-amber-300 hover:text-amber-200 font-semibold rounded-xl px-4 text-xs sm:text-sm border border-slate-700/80 flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] h-10 shadow-sm cursor-pointer"
            >
              <Tag className="w-4 h-4 text-amber-400" />
              Preços de Atacado
            </Button>

            <Button
              onClick={handleExportWhatsAppAtacado}
              className="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 font-semibold rounded-xl px-4 text-xs sm:text-sm border border-emerald-500/30 flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] h-10 cursor-pointer"
            >
              <MessageCircle className="w-4 h-4 text-emerald-400" />
              Lista WhatsApp
            </Button>

            <Button
              onClick={handleExportCSVVendas}
              className="bg-slate-800/90 hover:bg-slate-700/90 text-slate-200 font-semibold rounded-xl px-3 text-xs sm:text-sm border border-slate-700/80 flex items-center gap-1.5 transition-all hover:scale-[1.02] active:scale-[0.98] h-10 cursor-pointer"
              title="Exportar CSV de Vendas de Atacado"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            </Button>
          </div>
        </div>

        {/* CARDS DE KPIS & MÉTRICAS DE ATACADO */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 pt-4">
          
          {/* Card 1: Faturamento Atacado */}
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-3.5 space-y-1 shadow-sm">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Faturamento</span>
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-base sm:text-xl font-bold font-mono text-emerald-400">
              R$ {kpis.faturamentoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-slate-500">
              {vendasFiltradas.length} aparelho(s) vendidos
            </div>
          </div>

          {/* Card 2: Lucro Líquido */}
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-3.5 space-y-1 shadow-sm">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Lucro Líquido</span>
              <TrendingUp className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-base sm:text-xl font-bold font-mono text-cyan-400">
              R$ {kpis.lucroTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-slate-500">
              Margem média: <strong className="text-cyan-300">{kpis.margemMedia.toFixed(1)}%</strong>
            </div>
          </div>

          {/* Card 3: Unidades Vendidas */}
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-3.5 space-y-1 shadow-sm">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Aparelhos Vendidos</span>
              <ShoppingBag className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-base sm:text-xl font-bold font-mono text-amber-400">
              {kpis.totalAparelhosVendidos} <span className="text-xs font-normal text-slate-400">unid.</span>
            </div>
            <div className="text-[10px] text-slate-500">
              Ticket médio: R$ {kpis.ticketMedio.toFixed(0)}/un
            </div>
          </div>

          {/* Card 4: Estoque Disponível */}
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-3.5 space-y-1 shadow-sm">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Estoque Disponível</span>
              <Package className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-base sm:text-xl font-bold font-mono text-blue-400">
              {aparelhosEstoqueAtivo.length} <span className="text-xs font-normal text-slate-400">unid.</span>
            </div>
            <div className="text-[10px] text-slate-500">
              Valor Total: R$ {totalEstoqueAtacadoValor.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
            </div>
          </div>

          {/* Card 5: Compradores Ativos */}
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-3.5 space-y-1 shadow-sm col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Parceiros / Lojistas</span>
              <Users className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-base sm:text-xl font-bold font-mono text-purple-400">
              {rankingCompradores.length} <span className="text-xs font-normal text-slate-400">lojistas</span>
            </div>
            <div className="text-[10px] text-slate-500">
              {rankingCompradores[0] ? `Top 1: ${rankingCompradores[0].nome}` : 'Nenhum comprador ainda'}
            </div>
          </div>

        </div>
      </GlassCard>

      {/* GRID DE RANKING DE COMPRADORES & MODELOS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* RANKING DOS PRINCIPAIS COMPRADORES (Lado Esquerdo) */}
        <GlassCard className="lg:col-span-8 rounded-3xl p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-amber-400" />
              <h3 className="font-bold text-sm text-white">Ranking dos Principais Compradores / Lojistas</h3>
            </div>
            <span className="text-[11px] text-slate-400">{rankingCompradores.length} lojistas cadastrados</span>
          </div>

          {rankingCompradores.length === 0 ? (
            <div className="p-8 text-center text-slate-500 space-y-2">
              <Users className="w-8 h-8 opacity-40 mx-auto" />
              <p className="text-xs">Nenhuma venda de atacado registrada ainda.</p>
              <p className="text-[11px] text-slate-600">Venda aparelhos marcando como "Atacado" e informando o nome do comprador (ex: "Junior").</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1">
              {rankingCompradores.slice(0, 6).map((comp, idx) => {
                const isSelected = compradorFiltro.toLowerCase() === comp.nome.toLowerCase();

                return (
                  <div
                    key={comp.nome}
                    onClick={() => setCompradorFiltro(isSelected ? 'todos' : comp.nome)}
                    className={cn(
                      "p-3 rounded-2xl border transition-all cursor-pointer select-none relative group",
                      isSelected
                        ? "bg-amber-500/15 border-amber-500/50 shadow-md shadow-amber-950/30"
                        : "bg-slate-950/70 border-slate-800/80 hover:border-slate-700"
                    )}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center",
                          idx === 0 ? "bg-amber-500 text-slate-950" :
                          idx === 1 ? "bg-slate-300 text-slate-950" :
                          idx === 2 ? "bg-amber-700 text-white" : "bg-slate-800 text-slate-300"
                        )}>
                          {idx + 1}
                        </span>
                        <span className="font-bold text-xs text-white truncate max-w-[120px]">{comp.nome}</span>
                      </div>
                      <Badge variant="outline" className="text-[9px] bg-slate-900 border-slate-700 text-amber-300">
                        {comp.totalAparelhos} unid.
                      </Badge>
                    </div>

                    <div className="text-sm font-bold font-mono text-emerald-400">
                      R$ {comp.totalGasto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1 pt-1 border-t border-white/5">
                      <span>Lucro: R$ {comp.lucroGerado.toFixed(0)}</span>
                      <span>{new Date(comp.ultimaCompra).toLocaleDateString('pt-BR')}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </GlassCard>

        {/* TOP MODELOS VENDIDOS NO ATACADO (Lado Direito) */}
        <GlassCard className="lg:col-span-4 rounded-3xl p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-cyan-400" />
              <h3 className="font-bold text-sm text-white">Modelos Mais Vendidos</h3>
            </div>
          </div>

          {rankingModelos.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-6">Nenhum dado disponível.</p>
          ) : (
            <div className="space-y-2 pt-1">
              {rankingModelos.map((m, idx) => (
                <div key={m.modelo} className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-bold text-slate-500 text-[11px]">#{idx + 1}</span>
                    <span className="font-bold text-white truncate">{m.modelo}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge className="bg-cyan-500/20 text-cyan-300 border-cyan-500/30 text-[10px]">
                      {m.qtd} unid.
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassCard>

      </div>

      {/* HISTÓRICO COMPLETO DE VENDAS EM ATACADO */}
      <GlassCard className="rounded-3xl p-4 sm:p-6 space-y-4">
        
        {/* BARRA DE FILTROS */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
          <div>
            <h3 className="font-bold text-sm sm:text-base text-white flex items-center gap-2">
              <History className="w-4 h-4 text-amber-400" />
              Histórico de Vendas em Atacado
            </h3>
            <p className="text-xs text-slate-400">
              {vendasFiltradas.length} venda(s) encontrada(s)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filtro Comprador */}
            {rankingCompradores.length > 0 && (
              <select
                value={compradorFiltro}
                onChange={(e) => setCompradorFiltro(e.target.value)}
                className="bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-xl px-3 py-2 outline-none focus:border-amber-500 cursor-pointer"
              >
                <option value="todos">Todos os Compradores</option>
                {rankingCompradores.map((c) => (
                  <option key={c.nome} value={c.nome}>{c.nome} ({c.totalAparelhos})</option>
                ))}
              </select>
            )}

            {/* Filtro Período */}
            <div className="flex items-center bg-slate-900 rounded-xl p-1 border border-slate-800 text-xs">
              <button
                onClick={() => setPeriodoFiltro('todos')}
                className={cn("px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer", periodoFiltro === 'todos' ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white")}
              >
                Tudo
              </button>
              <button
                onClick={() => setPeriodoFiltro('mes')}
                className={cn("px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer", periodoFiltro === 'mes' ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white")}
              >
                Este Mês
              </button>
              <button
                onClick={() => setPeriodoFiltro('ano')}
                className={cn("px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer", periodoFiltro === 'ano' ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white")}
              >
                Este Ano
              </button>
            </div>
          </div>
        </div>

        {/* CAMPO DE BUSCA */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por modelo, comprador, IMEI ou código..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-amber-500 outline-none"
          />
        </div>

        {/* TABELA DE VENDAS */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-medium border-collapse min-w-[700px]">
            <thead>
              <tr className="border-b border-white/10 text-slate-400 uppercase text-[10px] tracking-wider">
                <th className="py-3 px-3">Data</th>
                <th className="py-3 px-3">Comprador / Lojista</th>
                <th className="py-3 px-3">Aparelho</th>
                <th className="py-3 px-3 text-right">Valor Venda</th>
                <th className="py-3 px-3 text-right">Custo</th>
                <th className="py-3 px-3 text-right">Lucro Líquido</th>
                <th className="py-3 px-3 text-center">Pagamento</th>
                <th className="py-3 px-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {vendasFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-slate-500">
                    Nenhuma venda de atacado encontrada para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                vendasFiltradas.map((v) => (
                  <tr key={v.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-3 px-3 text-slate-400 font-mono text-[11px] whitespace-nowrap">
                      {new Date(v.data).toLocaleDateString('pt-BR')}
                    </td>

                    <td className="py-3 px-3">
                      <div className="font-bold text-white flex items-center gap-1.5">
                        <Users className="w-3 h-3 text-amber-400" />
                        <span>{v.comprador}</span>
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      <div className="font-bold text-white">
                        {v.modelo}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {v.capacidade} · {v.cor} · ID: {v.codigo || v.imei || '-'}
                      </div>
                    </td>

                    <td className="py-3 px-3 text-right font-mono font-bold text-white whitespace-nowrap">
                      R$ {v.valorVenda.toFixed(2).replace('.', ',')}
                    </td>

                    <td className="py-3 px-3 text-right font-mono text-slate-400 whitespace-nowrap">
                      R$ {v.custo.toFixed(2).replace('.', ',')}
                    </td>

                    <td className="py-3 px-3 text-right font-mono font-bold whitespace-nowrap">
                      <span className={v.lucro >= 0 ? "text-emerald-400" : "text-rose-400"}>
                        R$ {v.lucro.toFixed(2).replace('.', ',')}
                      </span>
                      <span className="text-[10px] text-slate-500 block">
                        ({v.margem.toFixed(1)}%)
                      </span>
                    </td>

                    <td className="py-3 px-3 text-center">
                      <Badge variant="outline" className="text-[10px] bg-slate-900 border-slate-800 text-slate-300 uppercase">
                        {v.metodoPgto}
                      </Badge>
                    </td>

                    <td className="py-3 px-3 text-center">
                      <button
                        onClick={() => handleReverterVenda(v)}
                        className="text-xs text-rose-400 hover:text-rose-300 font-semibold p-1.5 rounded-lg hover:bg-rose-500/10 transition-colors"
                        title="Cancelar venda e devolver aparelho ao estoque ativo"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

      </GlassCard>

      {/* MODAL DE VENDA DE ATACADO EM LOTE (MÚLTIPLOS APARELHOS) */}
      <ModalPortal>
        <VendaLoteAtacadoModal
          isOpen={showNovaVendaModal}
          onClose={() => setShowNovaVendaModal(false)}
          aparelhosEstoque={aparelhosEstoqueAtivo as any}
          lojaId={usuario?.lojaId || usuario?.loja_id || null}
          onSuccess={fetchAparelhos}
        />
      </ModalPortal>

      {/* MODAL DE EDIÇÃO DE PREÇOS DE ATACADO */}
      <ModalPortal>
        <EditarValoresAtacadoModal
          isOpen={showAtacadoModal}
          onClose={() => setShowAtacadoModal(false)}
          aparelhos={aparelhos as any}
          onEstoqueAtualizado={fetchAparelhos}
        />
      </ModalPortal>

      {/* MODAL PARA REGISTRAR VENDA COM COMPRADOR */}
      <ModalPortal>
        <MarcarVendidoModal
          isOpen={!!aparelhoSelecionadoVenda}
          onClose={() => setAparelhoSelecionadoVenda(null)}
          aparelho={aparelhoSelecionadoVenda}
          lojaId={usuario?.lojaId || usuario?.loja_id || null}
          onSuccess={fetchAparelhos}
          tipoInicial="atacado"
        />
      </ModalPortal>

    </div>
  );
}
