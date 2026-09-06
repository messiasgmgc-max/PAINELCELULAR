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
  ShoppingBag,
  Edit2,
  Camera,
  FileText
} from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ModalPortal } from '@/components/ModalPortal';
import { useAparelhos } from '@/hooks/useAparelhos';
import { useAuth } from '@/hooks/useAuth';
import { useStoreConfig } from '@/hooks/useStoreConfig';
import { supabase } from '@/lib/supabaseClient';
import { getAparelhoCodigo, cn, parseMonetaryValue } from '@/lib/utils';
import { toast } from 'sonner';
import { Aparelho } from '@/lib/db/types';
import { registrarLog } from '@/lib/logger';
import { EditarValoresAtacadoModal } from '@/components/EditarValoresAtacadoModal';
import { MarcarVendidoModal } from '@/components/MarcarVendidoModal';
import { VendaLoteAtacadoModal } from '@/components/VendaLoteAtacadoModal';
import { EditarVendaRegistroModal } from '@/components/EditarVendaRegistroModal';
import { BaixaFiadoModal } from '@/components/BaixaFiadoModal';
import { ExtratoFiadoLojistaModal } from '@/components/ExtratoFiadoLojistaModal';

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
  metodoPgto?: string;
  status?: string;
  valorPago?: number;
  saldoDevedor?: number;
  dataVencimento?: string;
  observacoes?: string;
  raw?: any;
}

// Formatador seguro de data que jamais retorna "Invalid Date"
function formatarDataSegura(dataStr: any): string {
  if (!dataStr) return new Date().toLocaleDateString('pt-BR');
  
  let str = String(dataStr).trim();
  // Se veio com hora parcial truncada (ex: "2026-09-01T12")
  if (/^\d{4}-\d{2}-\d{2}T\d{1,2}$/.test(str)) {
    str += ':00:00';
  } else if (/^\d{4}-\d{2}-\d{2}T\d{1,2}:\d{2}$/.test(str)) {
    str += ':00';
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toLocaleDateString('pt-BR');
  }

  // Tenta extrair YYYY-MM-DD
  const matchYmd = str.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (matchYmd) {
    return `${matchYmd[3]}/${matchYmd[2]}/${matchYmd[1]}`;
  }

  // Tenta extrair DD/MM/YYYY
  const matchDmy = str.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (matchDmy) {
    return `${matchDmy[1]}/${matchDmy[2]}/${matchDmy[3]}`;
  }

  return new Date().toLocaleDateString('pt-BR');
}

function parseTimestampSeguro(dataStr: any): number {
  if (!dataStr) return 0;
  let str = String(dataStr).trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{1,2}$/.test(str)) str += ':00:00';
  else if (/^\d{4}-\d{2}-\d{2}T\d{1,2}:\d{2}$/.test(str)) str += ':00';

  const t = new Date(str).getTime();
  if (!isNaN(t)) return t;

  const matchYmd = str.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (matchYmd) {
    return new Date(`${matchYmd[1]}-${matchYmd[2]}-${matchYmd[3]}T12:00:00`).getTime();
  }
  return 0;
}

export function AtacadoTab() {
  const { usuario } = useAuth();
  const { config } = useStoreConfig(usuario?.lojaId || usuario?.loja_id);
  const { aparelhos, loading, fetchAparelhos } = useAparelhos();

  const [busca, setBusca] = useState('');
  const [compradorFiltro, setCompradorFiltro] = useState<string>('todos');
  const [periodoFiltro, setPeriodoFiltro] = useState<'todos' | 'mes' | 'ano'>('todos');
  const [abaSubTab, setAbaSubTab] = useState<'metricas' | 'fiado' | 'historico'>('metricas');
  const [showAtacadoModal, setShowAtacadoModal] = useState(false);
  const [showNovaVendaModal, setShowNovaVendaModal] = useState(false);
  const [abrirScannerAtacado, setAbrirScannerAtacado] = useState(false);
  const [aparelhoSelecionadoVenda, setAparelhoSelecionadoVenda] = useState<Aparelho | null>(null);
  const [vendaParaEditar, setVendaParaEditar] = useState<any | null>(null);
  const [lojistaParaBaixa, setLojistaParaBaixa] = useState<{ lojistaNome: string; saldoDevedorTotal: number; vendasEmAberto: any[] } | null>(null);
  const [lojistaParaExtrato, setLojistaParaExtrato] = useState<{ lojistaNome: string; vendasLojista: any[] } | null>(null);
  const [vendasBanco, setVendasBanco] = useState<any[]>([]);

  // Carrega vendas do Supabase para controle de fiado e histórico
  const fetchVendasBanco = React.useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('vendas')
        .select('*')
        .order('dataPagamento', { ascending: false });

      if (data && !error) {
        setVendasBanco(data);
      }
    } catch (e) {
      console.error('Erro ao carregar vendas:', e);
    }
  }, []);

  useEffect(() => {
    fetchVendasBanco();
  }, [fetchVendasBanco]);

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

    // Busca nas observações de baixa dos aparelhos (somente se estiver vendido/baixado)
    aparelhos.forEach((a: any) => {
      // Se o aparelho estiver ativo e disponível no estoque, NUNCA pode figurar como venda concluída
      if (a.ativo === true && a.status === 'disponivel') return;
      if (a.status !== 'vendido' && a.condicao !== 'vendido' && a.ativo !== false) return;

      const obs = String(a.observacoes || '');
      
      // Regex robusto para pegar BAIXA_ESTOQUE com data ISO completa
      const matchBaixa = obs.match(/BAIXA_ESTOQUE:(\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z?)?):([\s\S]*)$/i)
        || obs.match(/BAIXA_ESTOQUE:([^:]+(?::\d{2}(?::\d{2})?(?:\.\d+)?(?:Z)?)?):([\s\S]*)$/i)
        || obs.match(/BAIXA_ESTOQUE:([^:]+):([\s\S]*)$/i);

      if (matchBaixa) {
        let dataIso = matchBaixa[1] || a.dataCadastro || new Date().toISOString();
        const textoDetalhe = matchBaixa[2] || '';

        // Se dataIso for parcial (ex: "2026-09-01T12"), normaliza
        if (/^\d{4}-\d{2}-\d{2}T\d{1,2}$/.test(dataIso)) {
          dataIso += ':00:00';
        }

        // Cross-check prévio com a tabela 'vendas' do Supabase
        const vendaCorrespondente = vendasBanco.find(vb => 
          (vb.itens && Array.isArray(vb.itens) && vb.itens.some((it: any) => it.aparelhoId === a.id)) ||
          vb.aparelhoId === a.id
        );

        const obsLower = obs.toLowerCase();
        const detalheLower = textoDetalhe.toLowerCase();

        // 1. Se for explicitamente VAREJO, NUNCA deve entrar na lista de atacado!
        const isVarejo = 
          detalheLower.includes('venda varejo') || 
          detalheLower.includes('varejo') || 
          obsLower.includes('venda varejo') ||
          (vendaCorrespondente && (
            vendaCorrespondente.tipoEntrega?.toLowerCase().includes('varejo') ||
            vendaCorrespondente.descricao?.toLowerCase().includes('varejo')
          ));

        if (isVarejo) {
          return; // Pula com segurança! É saída de varejo
        }

        // 2. Se for manutenção, perda ou defeito, não é atacado
        if (detalheLower.includes('manutencao') || detalheLower.includes('perda') || obsLower.includes('manutencao')) {
          return;
        }

        // 3. Verifica se é verdadeiramente uma saída de atacado
        const isAtacado = 
          detalheLower.includes('atacado') || 
          obsLower.includes('atacado') ||
          (vendaCorrespondente && (
            vendaCorrespondente.tipoEntrega?.toLowerCase().includes('atacado') ||
            vendaCorrespondente.descricao?.toLowerCase().includes('atacado')
          ));

        if (isAtacado) {
          // Extrai comprador
          const matchComprador = textoDetalhe.match(/para\s+(.*?)\s+por/i) || textoDetalhe.match(/para\s+(.*?)(?:\||$)/i);
          const compradorNome = matchComprador ? matchComprador[1].trim() : (a.cliente || 'Lojista / Revenda');

          // Extrai valor da venda
          const matchValor = textoDetalhe.match(/por\s+R\$\s*([\d.,]+)/i) || obs.match(/por\s+R\$\s*([\d.,]+)/i);
          let valorVenda = matchValor 
            ? parseMonetaryValue(matchValor[1])
            : ((a as any).precoAtacado || (a as any).preco_atacado || a.preco || 0);

          // Se existe registro na tabela 'vendas', ELE É A FONTE DA VERDADE (especialmente após edições)
          if (vendaCorrespondente && Number(vendaCorrespondente.valor) > 0) {
            valorVenda = Number(vendaCorrespondente.valor);
          }

          // Extrai custo
          const matchCusto = textoDetalhe.match(/Custo:\s*R\$\s*([\d.,]+)/i) || obs.match(/Custo:\s*R\$\s*([\d.,]+)/i);
          let custo = matchCusto 
            ? parseMonetaryValue(matchCusto[1])
            : (a.custo || 0);

          if (vendaCorrespondente && vendaCorrespondente.custo !== undefined && vendaCorrespondente.custo !== null) {
            custo = Number(vendaCorrespondente.custo);
          }

          // Extrai lucro
          const matchLucro = textoDetalhe.match(/Lucro:\s*R\$\s*([\d.,]+)/i) || obs.match(/Lucro:\s*R\$\s*([\d.,]+)/i);
          let lucro = matchLucro 
            ? parseMonetaryValue(matchLucro[1])
            : (valorVenda - custo);

          if (vendaCorrespondente && vendaCorrespondente.lucro !== undefined && vendaCorrespondente.lucro !== null) {
            lucro = Number(vendaCorrespondente.lucro);
          }

          // Extrai forma de pagamento
          const matchPgto = textoDetalhe.match(/Pgto:\s*([A-Za-z0-9_]+)/i) || obs.match(/Pgto:\s*([A-Za-z0-9_]+)/i);
          let metodoPgto = matchPgto ? matchPgto[1].toLowerCase() : 'pix';

          if (vendaCorrespondente && vendaCorrespondente.metodo) {
            metodoPgto = String(vendaCorrespondente.metodo).toLowerCase();
          }

          const margem = custo > 0 ? (lucro / custo) * 100 : 100;
          const finalId = vendaCorrespondente?.id || a.id;

          lista.push({
            id: finalId,
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
            status: vendaCorrespondente?.status,
            valorPago: vendaCorrespondente?.valorPago,
            saldoDevedor: vendaCorrespondente?.saldoDevedor,
            observacoes: a.observacoes,
            raw: a,
          });
        }
      }
    });

    return lista.sort((a, b) => parseTimestampSeguro(b.data) - parseTimestampSeguro(a.data));
  }, [aparelhos, vendasBanco]);

  // Filtro de Vendas por Período e Busca
  const vendasFiltradas = useMemo(() => {
    return vendasAtacado.filter((v) => {
      // Filtro por Comprador
      const compStr = (v.comprador || '').toLowerCase();
      if (compradorFiltro !== 'todos' && compStr !== compradorFiltro.toLowerCase()) {
        return false;
      }

      // Filtro por Período
      if (periodoFiltro === 'mes') {
        const dataVenda = new Date(v.data);
        const agora = new Date();
        if (isNaN(dataVenda.getTime()) || dataVenda.getMonth() !== agora.getMonth() || dataVenda.getFullYear() !== agora.getFullYear()) {
          return false;
        }
      } else if (periodoFiltro === 'ano') {
        const dataVenda = new Date(v.data);
        const agora = new Date();
        if (isNaN(dataVenda.getTime()) || dataVenda.getFullYear() !== agora.getFullYear()) {
          return false;
        }
      }

      // Filtro por Busca de Texto
      if (busca.trim()) {
        const t = busca.toLowerCase().trim();
        const mod = (v.modelo || '').toLowerCase();
        const comp = compStr;
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

  // ── 6. Lojistas Devedores & Controle Milimétrico de Fiado ──
  const lojistasDevedores = useMemo(() => {
    const mapa = new Map<string, {
      lojistaNome: string;
      totalComprado: number;
      totalPago: number;
      saldoDevedor: number;
      pedidos: any[];
      ultimoPedido: string;
      dataVencimentoMaisAntiga?: string;
      diasAtraso: number;
      estaEmAtraso: boolean;
    }>();

    // 1. Processa vendas da tabela 'vendas'
    vendasBanco.forEach(v => {
      // Ignora vendas explicitamente de varejo no painel de lojistas de atacado
      const tipoEntregaLower = String(v.tipoEntrega || '').toLowerCase();
      const descLower = String(v.descricao || '').toLowerCase();
      const isVarejo = tipoEntregaLower.includes('varejo') || (descLower.includes('varejo') && !descLower.includes('atacado'));
      if (isVarejo) return;

      const isFiado = v.metodo === 'fiado';
      const isPendente = v.status === 'pendente' || v.status === 'parcial';
      if (!isFiado && !isPendente) return;

      const cliente = (v.clienteNome || 'Lojista / Revenda').trim();
      const total = Number(v.valor || 0);
      const pago = Number(v.valorPago || 0);
      
      let devedor = 0;
      if (v.saldoDevedor !== undefined && v.saldoDevedor !== null && Number(v.saldoDevedor) > 0) {
        devedor = Number(v.saldoDevedor);
      } else {
        devedor = Math.max(0, total - pago);
        if (devedor <= 0 && isFiado && v.status !== 'pago') {
          devedor = total;
        }
        if (isFiado && pago === 0) {
          devedor = total;
        }
      }

      if (devedor > 0.01) {
        if (!mapa.has(cliente)) {
          mapa.set(cliente, {
            lojistaNome: cliente,
            totalComprado: 0,
            totalPago: 0,
            saldoDevedor: 0,
            pedidos: [],
            ultimoPedido: v.dataPagamento || v.data || v.created_at,
            diasAtraso: 0,
            estaEmAtraso: false,
          });
        }

        const entry = mapa.get(cliente)!;
        entry.totalComprado += total;
        entry.totalPago += pago;
        entry.saldoDevedor += devedor;
        entry.pedidos.push({
          ...v,
          saldoDevedor: devedor,
        });
      }
    });

    // 2. Processa baixas de aparelhos marcadas como fiado que NÃO existam na tabela 'vendas'
    vendasAtacado.forEach(va => {
      if (va.metodoPgto === 'fiado') {
        const cliente = (va.comprador || 'Não Informado').trim();
        
        // Se este aparelho já possui registro na tabela 'vendas', vendasBanco é a autoridade máxima!
        const jaNoBanco = vendasBanco.some(vb => 
          vb.id === va.id || 
          vb.aparelhoId === va.aparelhoId || 
          (vb.itens && Array.isArray(vb.itens) && vb.itens.some((it: any) => it.aparelhoId === va.aparelhoId))
        );
        if (jaNoBanco) {
          return; // A tabela vendas é a autoridade máxima. Se já está quitada lá, não reabre fiado!
        }

        let jaEstaNoMapa = false;
        mapa.forEach(entry => {
          if (entry.pedidos.some((p: any) => 
            p.id === va.id || 
            p.aparelhoId === va.aparelhoId || 
            (p.itens && Array.isArray(p.itens) && p.itens.some((it: any) => it.aparelhoId === va.aparelhoId))
          )) {
            jaEstaNoMapa = true;
          }
        });

        if (!jaEstaNoMapa) {
          if (!mapa.has(cliente)) {
            mapa.set(cliente, {
              lojistaNome: cliente,
              totalComprado: 0,
              totalPago: 0,
              saldoDevedor: 0,
              pedidos: [],
              ultimoPedido: va.data,
              diasAtraso: 0,
              estaEmAtraso: false,
            });
          }
          const entry = mapa.get(cliente)!;
          entry.totalComprado += va.valorVenda;
          entry.saldoDevedor += va.valorVenda;
          entry.pedidos.push({
            id: va.id,
            aparelhoId: va.aparelhoId,
            descricao: `${va.marca} ${va.modelo} (${va.capacidade || ''})`,
            valor: va.valorVenda,
            valorPago: 0,
            saldoDevedor: va.valorVenda,
            dataPagamento: va.data,
            metodo: 'fiado',
            status: 'pendente',
          });
        }
      }
    });

    // 3. Calcula datas de vencimento e dias em atraso
    const agora = new Date();
    mapa.forEach((entry) => {
      let menorVencimento: Date | null = null;
      entry.pedidos.forEach((p: any) => {
        const dataVencStr = p.dataVencimento || (p.raw && p.raw.dataVencimento);
        if (dataVencStr) {
          const d = new Date(dataVencStr);
          if (!isNaN(d.getTime())) {
            if (!menorVencimento || d < menorVencimento) {
              menorVencimento = d;
            }
          }
        }
      });

      if (menorVencimento) {
        entry.dataVencimentoMaisAntiga = menorVencimento.toISOString();
        if (menorVencimento.getTime() < agora.getTime()) {
          const diffMs = agora.getTime() - menorVencimento.getTime();
          const dias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
          entry.diasAtraso = dias;
          entry.estaEmAtraso = dias > 0;
        }
      }
    });

    return Array.from(mapa.values()).sort((a, b) => {
      // Prioriza quem está em atraso, depois maior saldo devedor
      if (a.estaEmAtraso !== b.estaEmAtraso) {
        return a.estaEmAtraso ? -1 : 1;
      }
      return b.saldoDevedor - a.saldoDevedor;
    });
  }, [vendasBanco, vendasAtacado]);

  const totalFiadoEmAberto = useMemo(() => {
    return lojistasDevedores.reduce((acc, l) => acc + l.saldoDevedor, 0);
  }, [lojistasDevedores]);

  // Emissão e consulta de NF-e (Modelo 55 - Atacado/PJ)
  const handleEmitirNFeAtacado = async (v: VendaAtacadoItem) => {
    try {
      toast.info('Consultando ou emitindo NF-e (Modelo 55) na SEFAZ...');
      const resStatus = await fetch(`/api/fiscal/status/${v.id}`);
      if (resStatus.ok) {
        const statusJson = await resStatus.json();
        if (statusJson.status === 'autorizada') {
          toast.success(`NF-e já autorizada! Chave: ${statusJson.chaveAcesso ? statusJson.chaveAcesso.slice(-8) : ''}`);
          if (statusJson.urlDanfe) {
            window.open(statusJson.urlDanfe, '_blank');
          }
          return;
        }
      }

      const res = await fetch('/api/fiscal/emitir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendaId: v.id,
          tipo: 'nfe',
          lojaId: usuario?.lojaId,
          destinatario: {
            nome: v.comprador,
          }
        })
      });

      const json = await res.json();
      if (json.sucesso && json.status === 'autorizada') {
        toast.success('NF-e emitida e autorizada pela SEFAZ!');
        if (json.urlDanfe) {
          window.open(json.urlDanfe, '_blank');
        }
      } else if (json.configurado === false) {
        toast.warning('Configure os dados fiscais da loja em Configurações > Fiscal para emitir NF-e.');
      } else if (json.status === 'processando') {
        toast.info('NF-e enviada e em processamento na SEFAZ.');
      } else {
        toast.error(json.mensagem || 'Erro na autorização da NF-e.');
      }
    } catch (err: any) {
      console.error('Erro ao emitir NF-e de atacado:', err);
      toast.error('Erro ao processar NF-e.');
    }
  };

  // Reverter/Cancelar Venda de Atacado (Devolve o aparelho para o estoque ativo)
  const handleReverterVenda = async (venda: VendaAtacadoItem) => {
    if (!venda.aparelhoId) return;

    if (!confirm(`Deseja cancelar esta venda e devolver o ${venda.modelo} (${venda.comprador}) para o estoque ativo?`)) {
      return;
    }

    const toastId = toast.loading('Revertendo venda e reativando aparelho...');

    try {
      // 1. Limpa as observações de baixa no aparelho e reativa no estoque disponível
      const { data: aparAtual } = await supabase
        .from('aparelhos')
        .select('observacoes')
        .eq('id', venda.aparelhoId)
        .maybeSingle();

      const obsAtual = String(aparAtual?.observacoes || venda.observacoes || '');
      const obsLimpa = obsAtual
        .replace(/BAIXA_ESTOQUE:[^\n|]+(?:\|\s*)?/gi, '')
        .replace(/Venda (?:ATACADO|VAREJO)[^\n|]*(?:\|\s*)?/gi, '')
        .trim();

      const { error: errApar } = await supabase
        .from('aparelhos')
        .update({
          ativo: true,
          condicao: 'seminovo',
          status: 'disponivel',
          cliente: null,
          observacoes: obsLimpa || null,
        })
        .eq('id', venda.aparelhoId);

      if (errApar) throw errApar;

      // 2. Localiza e exclui a venda correspondente da tabela 'vendas'
      const { data: vendasRelacionadas } = await supabase
        .from('vendas')
        .select('id, itens');

      const vendaParaDeletar = vendasRelacionadas?.find(vb => 
        (vb.itens && Array.isArray(vb.itens) && vb.itens.some((it: any) => it.aparelhoId === venda.aparelhoId)) ||
        (vb as any).aparelhoId === venda.aparelhoId
      );

      if (vendaParaDeletar?.id) {
        await supabase.from('vendas').delete().eq('id', vendaParaDeletar.id);
      }

      // 3. Registra auditoria
      await registrarLog({
        lojaId: usuario?.lojaId || (usuario as any)?.loja_id,
        tipoEvento: 'estoque',
        acao: 'Venda de Atacado Revertida',
        detalhes: `Venda do aparelho ${venda.modelo} para ${venda.comprador} (R$ ${venda.valorVenda}) cancelada e devolvida ao estoque ativo.`,
      });

      toast.success(`⚡ Venda cancelada! ${venda.modelo} retornou ao estoque ativo.`, { id: toastId });
      await fetchAparelhos();
      await fetchVendasBanco();
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
      formatarDataSegura(v.data),
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

          {/* BOTÕES DE AÇÃO RÁPIDA (RESPONSIVOS) */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto">
            <Button
              onClick={() => {
                setAbrirScannerAtacado(false);
                setShowNovaVendaModal(true);
              }}
              className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-bold rounded-2xl px-4 text-xs sm:text-sm shadow-md shadow-amber-950/30 flex items-center justify-center gap-2 border border-amber-400/30 transition-all hover:scale-[1.02] active:scale-[0.98] h-11 sm:h-10 cursor-pointer w-full sm:w-auto"
            >
              <Plus className="w-4 h-4" />
              Nova Venda Atacado
            </Button>

            <div className="grid grid-cols-2 sm:flex items-center gap-2">
              <Button
                onClick={() => {
                  setAbrirScannerAtacado(true);
                  setShowNovaVendaModal(true);
                }}
                className="bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 font-semibold rounded-2xl px-3 text-xs sm:text-sm border border-cyan-500/30 flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] h-10 cursor-pointer shadow-sm"
                title="Bipar aparelhos no atacado via Câmera ou Leitor de Código de Barras USB"
              >
                <Camera className="w-4 h-4 text-cyan-400" />
                Bipar Venda
              </Button>

              <Button
                onClick={() => setShowAtacadoModal(true)}
                className="bg-slate-800/90 hover:bg-slate-700/90 text-amber-300 hover:text-amber-200 font-semibold rounded-2xl px-3 text-xs sm:text-sm border border-slate-700/80 flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] h-10 shadow-sm cursor-pointer"
              >
                <Tag className="w-4 h-4 text-amber-400" />
                Preços Atacado
              </Button>

              <Button
                onClick={handleExportWhatsAppAtacado}
                className="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 font-semibold rounded-2xl px-3 text-xs sm:text-sm border border-emerald-500/30 flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] h-10 cursor-pointer"
              >
                <MessageCircle className="w-4 h-4 text-emerald-400" />
                Lista Zap
              </Button>

              <Button
                onClick={handleExportCSVVendas}
                className="bg-slate-800/90 hover:bg-slate-700/90 text-slate-200 font-semibold rounded-2xl px-3 text-xs sm:text-sm border border-slate-700/80 flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] h-10 cursor-pointer"
                title="Exportar CSV de Vendas de Atacado"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                CSV
              </Button>
            </div>
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

          {/* Card 5: Fiado a Receber (Dívidas) */}
          <div className="bg-slate-950/70 border border-rose-900/40 rounded-2xl p-3.5 space-y-1 shadow-sm col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span className="text-rose-400 font-bold">Fiado a Receber</span>
              <DollarSign className="w-4 h-4 text-rose-400" />
            </div>
            <div className="text-base sm:text-xl font-bold font-mono text-rose-400">
              R$ {totalFiadoEmAberto.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-slate-500">
              {lojistasDevedores.length} lojista(s) com débitos
            </div>
          </div>

        </div>

        {/* SUB-ABAS DO PAINEL DE ATACADO */}
        <div className="flex items-center gap-2 pt-4 border-t border-white/10 mt-4 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setAbaSubTab('metricas')}
            className={cn(
              "px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer",
              abaSubTab === 'metricas'
                ? "bg-amber-500 text-slate-950 shadow-lg shadow-amber-950/40"
                : "bg-slate-900/90 hover:bg-slate-800 text-slate-300 border border-slate-800"
            )}
          >
            <TrendingUp className="w-4 h-4" /> 📊 Visão Geral & Métricas
          </button>

          <button
            type="button"
            onClick={() => setAbaSubTab('fiado')}
            className={cn(
              "px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer",
              abaSubTab === 'fiado'
                ? "bg-rose-500 text-white shadow-lg shadow-rose-950/40"
                : "bg-slate-900/90 hover:bg-slate-800 text-slate-300 border border-slate-800"
            )}
          >
            <DollarSign className="w-4 h-4 text-rose-300" /> 💸 Fiado & Lojistas Devedores ({lojistasDevedores.length})
            {totalFiadoEmAberto > 0 && (
              <Badge className="bg-rose-950 text-rose-300 text-[10px] ml-1">
                R$ {totalFiadoEmAberto.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
              </Badge>
            )}
          </button>

          <button
            type="button"
            onClick={() => setAbaSubTab('historico')}
            className={cn(
              "px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer",
              abaSubTab === 'historico'
                ? "bg-blue-500 text-white shadow-lg shadow-blue-950/40"
                : "bg-slate-900/90 hover:bg-slate-800 text-slate-300 border border-slate-800"
            )}
          >
            <History className="w-4 h-4" /> 📜 Histórico Geral de Saídas ({vendasAtacado.length})
          </button>
        </div>
      </GlassCard>

      {/* CONTEÚDO 1: ABA DE MÉTRICAS & RANKINGS */}
      {abaSubTab === 'metricas' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* RANKING DOS PRINCIPAIS COMPRADORES */}
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
                  <p className="text-[11px] text-slate-600">Venda produtos marcando como "Atacado" e informando o nome do comprador (ex: "Junior").</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1">
                  {rankingCompradores.slice(0, 6).map((comp, idx) => {
                    const isSelected = (compradorFiltro || '').toLowerCase() === (comp?.nome || '').toLowerCase();

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
                          <span>{formatarDataSegura(comp.ultimaCompra)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </GlassCard>

            {/* TOP MODELOS VENDIDOS NO ATACADO */}
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
        </div>
      )}

      {/* CONTEÚDO 2: ABA DE FIADO & CONTAS A RECEBER DE LOJISTAS */}
      {abaSubTab === 'fiado' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          
          {/* BANNER DE RESUMO DO FIADO */}
          <GlassCard className="rounded-3xl p-4 sm:p-5 border border-rose-500/30 bg-gradient-to-r from-rose-950/30 via-slate-950/80 to-slate-900/50">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center font-bold border border-rose-500/30">
                  <DollarSign className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                    Controle Milimétrico de Fiado & Lojistas Devedores
                  </h3>
                  <p className="text-xs text-slate-400">
                    Acompanhe exatamente o que cada lojista pegou (celulares, perfumes, acessórios) e abata pagamentos parciais
                  </p>
                </div>
              </div>

              <div className="text-right shrink-0 bg-slate-950/90 p-3 rounded-2xl border border-rose-500/20">
                <span className="text-[11px] text-slate-400 block">Total a Receber</span>
                <span className="text-xl sm:text-2xl font-bold font-mono text-rose-400">
                  R$ {totalFiadoEmAberto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </GlassCard>

          {/* LISTA DE CARDS POR LOJISTA DEVEDOR */}
          {lojistasDevedores.length === 0 ? (
            <GlassCard className="rounded-3xl p-8 text-center text-slate-500 space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto opacity-60" />
              <h4 className="text-sm font-bold text-white">Nenhum fiado em aberto no momento! 🎉</h4>
              <p className="text-xs text-slate-400">Todos os lojistas e compradores estão 100% quitados.</p>
            </GlassCard>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {lojistasDevedores.map((lojista) => (
                <GlassCard key={lojista.lojistaNome} className="rounded-3xl p-4 sm:p-5 space-y-3.5 border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition-all">
                  
                  {/* CABEÇALHO DO CARD DO LOJISTA */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2.5">
                        <div className={cn(
                          "w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm border",
                          lojista.estaEmAtraso 
                            ? "bg-red-500/20 text-red-400 border-red-500/40" 
                            : "bg-amber-500/20 text-amber-400 border-amber-500/30"
                        )}>
                          {lojista.lojistaNome.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h4 className="font-bold text-sm text-white">{lojista.lojistaNome}</h4>
                            {lojista.estaEmAtraso && (
                              <Badge className="bg-red-500/20 text-red-300 border-red-500/40 text-[9px] px-1.5 py-0 animate-pulse font-mono font-bold">
                                ⚠️ {lojista.diasAtraso}d atraso
                              </Badge>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400">
                            Última compra: {formatarDataSegura(lojista.ultimoPedido)}
                          </span>
                        </div>
                      </div>

                      <Badge className="bg-rose-500/20 text-rose-300 border-rose-500/30 text-[10px]">
                        {lojista.pedidos.length} pedido(s)
                      </Badge>
                    </div>

                    {/* DÍVIDA ATUAL */}
                    <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800/80 space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">Saldo Devedor:</span>
                        <span className="text-rose-400 font-bold font-mono text-base">
                          R$ {lojista.saldoDevedor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-white/5">
                        <span>Pego: R$ {lojista.totalComprado.toFixed(0)}</span>
                        <span className="text-emerald-400">Pago: R$ {lojista.totalPago.toFixed(0)}</span>
                      </div>
                    </div>

                    {/* PRÉVIA DOS ITENS PEGOS */}
                    <div className="space-y-1 pt-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                        Itens em Aberto:
                      </span>
                      <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
                        {lojista.pedidos.slice(0, 3).map((p, pIdx) => (
                          <div key={pIdx} className="text-[11px] bg-slate-900/80 px-2 py-1 rounded-lg text-slate-300 flex items-center justify-between">
                            <span className="truncate max-w-[170px]">{p.descricao || 'Item de Estoque'}</span>
                            <span className="font-mono text-rose-400 font-bold shrink-0">
                              R$ {Number(p.saldoDevedor !== undefined ? p.saldoDevedor : p.valor).toFixed(0)}
                            </span>
                          </div>
                        ))}
                        {lojista.pedidos.length > 3 && (
                          <span className="text-[10px] text-slate-500 block text-center">
                            + {lojista.pedidos.length - 3} outros itens...
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* BOTÕES DE AÇÃO DO FIADO */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10">
                    <Button
                      size="sm"
                      onClick={() => setLojistaParaBaixa({
                        lojistaNome: lojista.lojistaNome,
                        saldoDevedorTotal: lojista.saldoDevedor,
                        vendasEmAberto: lojista.pedidos,
                      })}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs h-9 rounded-xl gap-1.5 shadow-md shadow-emerald-950/30 cursor-pointer"
                    >
                      <DollarSign className="w-3.5 h-3.5" /> Abater / Pagar
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setLojistaParaExtrato({
                        lojistaNome: lojista.lojistaNome,
                        vendasLojista: lojista.pedidos,
                      })}
                      className="bg-slate-900 border-slate-700 hover:bg-slate-800 text-slate-200 text-xs h-9 rounded-xl gap-1.5 cursor-pointer"
                    >
                      <MessageCircle className="w-3.5 h-3.5 text-emerald-400" /> Extrato WhatsApp
                    </Button>
                  </div>

                </GlassCard>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CONTEÚDO 3: HISTÓRICO GERAL DE VENDAS EM ATACADO (SELECIONADO OU DEFAULT) */}
      {(abaSubTab === 'historico' || abaSubTab === 'metricas') && (
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

              {/* Campo de Busca */}
              <div className="relative w-full sm:w-auto flex-1 sm:flex-initial">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar modelo, lojista, IMEI..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-xl pl-8 pr-3 py-2 outline-none focus:border-amber-500 w-full sm:w-56"
                />
              </div>
            </div>
          </div>

          {/* VISUALIZAÇÃO MOBILE (CARDS TOUCH-FRIENDLY) */}
          <div className="md:hidden space-y-3">
            {vendasFiltradas.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-xs">
                Nenhuma venda de atacado encontrada para este filtro.
              </div>
            ) : (
              vendasFiltradas.map((v) => (
                <div 
                  key={v.id} 
                  className="bg-slate-950/80 border border-slate-800/90 rounded-2xl p-3.5 space-y-2.5 shadow-sm relative"
                >
                  {/* Linha 1: Comprador + Data + Forma de Pgto */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                      <span className="font-bold text-xs text-white truncate">{v.comprador}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant="outline" className={cn("text-[10px] uppercase font-mono", v.metodoPgto === 'fiado' ? "bg-rose-500/20 border-rose-500/30 text-rose-300" : "bg-slate-900 border-slate-800 text-slate-300")}>
                        {v.metodoPgto}
                      </Badge>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {formatarDataSegura(v.data)}
                      </span>
                    </div>
                  </div>

                  {/* Linha 2: Modelo + Especificações */}
                  <div className="bg-slate-900/60 rounded-xl p-2.5 border border-white/5 space-y-0.5">
                    <div className="font-bold text-xs text-white">{v.modelo}</div>
                    <div className="text-[10px] text-slate-400 font-mono flex items-center justify-between">
                      <span>{v.capacidade} · {v.cor}</span>
                      <span>ID: {v.codigo || v.imei || '-'}</span>
                    </div>
                  </div>

                  {/* Linha 3: Financeiro (Valor Venda, Custo, Lucro) */}
                  <div className="grid grid-cols-3 gap-1.5 pt-1 text-center">
                    <div className="bg-slate-900/40 rounded-lg p-1.5 border border-white/5">
                      <span className="text-[9px] text-slate-400 block">Venda</span>
                      <span className="text-xs font-bold font-mono text-white">
                        R$ {v.valorVenda.toFixed(0)}
                      </span>
                    </div>

                    <div className="bg-slate-900/40 rounded-lg p-1.5 border border-white/5">
                      <span className="text-[9px] text-slate-400 block">Custo</span>
                      <span className="text-xs font-bold font-mono text-slate-400">
                        R$ {v.custo.toFixed(0)}
                      </span>
                    </div>

                    <div className="bg-slate-900/40 rounded-lg p-1.5 border border-white/5">
                      <span className="text-[9px] text-slate-400 block">Lucro</span>
                      <span className={cn("text-xs font-bold font-mono", v.lucro >= 0 ? "text-emerald-400" : "text-rose-400")}>
                        R$ {v.lucro.toFixed(0)}
                      </span>
                    </div>
                  </div>

                  {/* Linha 4: Ações Rápidas (Botões Grandes e Confortáveis) */}
                  <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                    <button
                      onClick={() => setVendaParaEditar(v)}
                      className="flex-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 rounded-xl py-2 px-3 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer active:scale-[0.98]"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-blue-400" />
                      Editar Dados
                    </button>

                    <button
                      onClick={() => handleEmitirNFeAtacado(v)}
                      className="bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 rounded-xl py-2 px-2.5 text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer active:scale-[0.98]"
                      title="Emitir ou Consultar NF-e (Modelo 55)"
                    >
                      <FileText className="w-3.5 h-3.5 text-amber-400" />
                      NF-e
                    </button>

                    <button
                      onClick={() => handleReverterVenda(v)}
                      className="bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 rounded-xl py-2 px-3 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer active:scale-[0.98]"
                      title="Devolver ao estoque ativo"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
                      Estornar
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* TABELA DE VENDAS (DESKTOP) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-2 px-3">Data</th>
                  <th className="py-2 px-3">Comprador / Lojista</th>
                  <th className="py-2 px-3">Produto / Aparelho</th>
                  <th className="py-2 px-3 text-right">Valor Venda</th>
                  <th className="py-2 px-3 text-right">Custo</th>
                  <th className="py-2 px-3 text-right">Lucro Líquido</th>
                  <th className="py-2 px-3 text-center">Pagamento</th>
                  <th className="py-2 px-3 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {vendasFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-500">
                      Nenhuma venda de atacado encontrada para este filtro.
                    </td>
                  </tr>
                ) : (
                  vendasFiltradas.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-900/60 transition-colors">
                      <td className="py-3 px-3 text-slate-400 whitespace-nowrap">
                        {formatarDataSegura(v.data)}
                      </td>

                      <td className="py-3 px-3 font-bold text-white whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-400" />
                          {v.comprador}
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
                        <Badge variant="outline" className={cn("text-[10px] uppercase", v.metodoPgto === 'fiado' ? "bg-rose-500/20 border-rose-500/30 text-rose-300" : "bg-slate-900 border-slate-800 text-slate-300")}>
                          {v.metodoPgto}
                        </Badge>
                      </td>

                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => setVendaParaEditar(v)}
                            className="text-xs text-blue-400 hover:text-blue-300 font-semibold p-1.5 rounded-lg hover:bg-blue-500/10 transition-colors"
                            title="Editar data, custo, valor ou lojista"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleEmitirNFeAtacado(v)}
                            className="text-xs text-amber-400 hover:text-amber-300 font-semibold p-1.5 rounded-lg hover:bg-amber-500/10 transition-colors"
                            title="Emitir ou Consultar NF-e (Modelo 55)"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleReverterVenda(v)}
                            className="text-xs text-rose-400 hover:text-rose-300 font-semibold p-1.5 rounded-lg hover:bg-rose-500/10 transition-colors"
                            title="Cancelar venda e devolver aparelho ao estoque ativo"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

        </GlassCard>
      )}

      {/* MODAL DE VENDA DE ATACADO EM LOTE (MÚLTIPLOS PRODUTOS) */}
      <ModalPortal>
        <VendaLoteAtacadoModal
          isOpen={showNovaVendaModal}
          onClose={() => {
            setShowNovaVendaModal(false);
            setAbrirScannerAtacado(false);
          }}
          abrirScannerInicial={abrirScannerAtacado}
          aparelhosEstoque={aparelhosEstoqueAtivo as any}
          lojaId={usuario?.lojaId || usuario?.loja_id || null}
          onSuccess={async () => {
            await fetchAparelhos();
            await fetchVendasBanco();
          }}
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

      {/* MODAL PARA EDITAR VENDA / REGISTRO / CUSTOS RETROATIVOS */}
      <ModalPortal>
        <EditarVendaRegistroModal
          isOpen={!!vendaParaEditar}
          onClose={() => setVendaParaEditar(null)}
          venda={vendaParaEditar}
          lojaId={usuario?.lojaId || usuario?.loja_id || null}
          onSuccess={async () => {
            await fetchAparelhos();
            await fetchVendasBanco();
          }}
        />
      </ModalPortal>

      {/* MODAL DE RECEBER PAGAMENTO / ABATIMENTO DE FIADO */}
      <ModalPortal>
        <BaixaFiadoModal
          isOpen={!!lojistaParaBaixa}
          onClose={() => setLojistaParaBaixa(null)}
          lojistaNome={lojistaParaBaixa?.lojistaNome || ''}
          saldoDevedorTotal={lojistaParaBaixa?.saldoDevedorTotal || 0}
          vendasEmAberto={lojistaParaBaixa?.vendasEmAberto || []}
          lojaId={usuario?.lojaId || usuario?.loja_id || null}
          onSuccess={async () => {
            await fetchAparelhos();
            await fetchVendasBanco();
          }}
        />
      </ModalPortal>

      {/* MODAL DE EXTRATO DE FIADO & COBRANÇA WHATSAPP */}
      <ModalPortal>
        <ExtratoFiadoLojistaModal
          isOpen={!!lojistaParaExtrato}
          onClose={() => setLojistaParaExtrato(null)}
          lojistaNome={lojistaParaExtrato?.lojistaNome || ''}
          vendasLojista={lojistaParaExtrato?.vendasLojista || []}
          chavePix={config.chavePix || ''}
          onAbrirBaixaModal={() => {
            if (lojistaParaExtrato) {
              const devedor = lojistaParaExtrato.vendasLojista.reduce((acc, v) => acc + (Number(v.saldoDevedor !== undefined ? v.saldoDevedor : (Number(v.valor || 0) - Number(v.valorPago || 0)))), 0);
              setLojistaParaBaixa({
                lojistaNome: lojistaParaExtrato.lojistaNome,
                saldoDevedorTotal: devedor,
                vendasEmAberto: lojistaParaExtrato.vendasLojista,
              });
            }
          }}
        />
      </ModalPortal>

    </div>
  );
}
