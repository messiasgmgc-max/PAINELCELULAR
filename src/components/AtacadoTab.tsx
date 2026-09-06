'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  ChevronDown,
  ShieldCheck,
  ShoppingBag,
  Edit2,
  Camera,
  FileText,
  Bot,
  Clock,
  Send,
  Settings,
  UserPlus,
  ExternalLink,
  AlertTriangle,
  Check,
  Copy,
  Phone,
  RefreshCw
} from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ModalPortal } from '@/components/ModalPortal';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
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
import { NovoClienteAtacadoModal } from '@/components/NovoClienteAtacadoModal';

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

interface ClienteAtacado {
  id: string;
  loja_id: string;
  nome: string;
  telefone?: string;
  whatsapp?: string;
  limite_credito?: number;
  saldo_devedor?: number;
  cpf_cnpj?: string;
  cidade?: string;
  observacoes?: string;
  chave_pix?: string;
  ativo?: boolean;
  ultimo_disparo_cobranca?: string;
  created_at?: string;
}

interface ConfigAtacadoBot {
  ativo: boolean;
  horario_disparo: string;
  dias_semana: number[];
  dias_carencia: number;
  mensagem_template: string;
  enviar_somente_dias_uteis: boolean;
  notificar_dono: boolean;
  chave_pix?: string;
}

const DEFAULT_CONFIG_BOT: ConfigAtacadoBot = {
  ativo: true,
  horario_disparo: '10:00',
  dias_semana: [1, 2, 3, 4, 5],
  dias_carencia: 1,
  mensagem_template: `Olá {nome}! Tudo bem? Passando para lembrar sobre os pagamentos pendentes das suas retiradas de atacado na {nome_loja}.\n\n*Saldo em aberto: {valor}*\n\nChave Pix para quitação: {chave_pix}\n\nSe já realizou a transferência, por favor nos envie o comprovante!`,
  enviar_somente_dias_uteis: true,
  notificar_dono: true,
  chave_pix: '',
};

const DIAS_SEMANA_OPCOES = [
  { valor: 0, label: 'Dom', nome: 'Domingo' },
  { valor: 1, label: 'Seg', nome: 'Segunda' },
  { valor: 2, label: 'Ter', nome: 'Terça' },
  { valor: 3, label: 'Qua', nome: 'Quarta' },
  { valor: 4, label: 'Qui', nome: 'Quinta' },
  { valor: 5, label: 'Sex', nome: 'Sexta' },
  { valor: 6, label: 'Sáb', nome: 'Sábado' },
];

function formatarDataSegura(dataStr: any): string {
  if (!dataStr) return new Date().toLocaleDateString('pt-BR');
  
  let str = String(dataStr).trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{1,2}$/.test(str)) {
    str += ':00:00';
  } else if (/^\d{4}-\d{2}-\d{2}T\d{1,2}:\d{2}$/.test(str)) {
    str += ':00';
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toLocaleDateString('pt-BR');
  }

  const matchYmd = str.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (matchYmd) {
    return `${matchYmd[3]}/${matchYmd[2]}/${matchYmd[1]}`;
  }

  const matchDmy = str.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (matchDmy) {
    return `${matchDmy[1]}/${matchDmy[2]}/${matchDmy[3]}`;
  }

  return new Date().toLocaleDateString('pt-BR');
}

export function AtacadoTab() {
  const { usuario } = useAuth();
  const { config } = useStoreConfig(usuario?.lojaId || usuario?.loja_id);
  const { aparelhos, loading, fetchAparelhos } = useAparelhos();

  const [busca, setBusca] = useState('');
  const [compradorFiltro, setCompradorFiltro] = useState<string>('todos');
  const [periodoFiltro, setPeriodoFiltro] = useState<'todos' | 'mes' | 'ano'>('todos');
  const [abaSubTab, setAbaSubTab] = useState<'metricas' | 'fiado' | 'clientes' | 'configuracoes' | 'historico'>('metricas');
  
  // Modais de Vendas e Estoque
  const [showAtacadoModal, setShowAtacadoModal] = useState(false);
  const [showNovaVendaModal, setShowNovaVendaModal] = useState(false);
  const [abrirScannerAtacado, setAbrirScannerAtacado] = useState(false);
  const [aparelhoSelecionadoVenda, setAparelhoSelecionadoVenda] = useState<Aparelho | null>(null);
  const [vendaParaEditar, setVendaParaEditar] = useState<any | null>(null);
  const [lojistaParaBaixa, setLojistaParaBaixa] = useState<{ lojistaNome: string; saldoDevedorTotal: number; vendasEmAberto: any[] } | null>(null);
  const [lojistaParaExtrato, setLojistaParaExtrato] = useState<{ lojistaNome: string; vendasLojista: any[] } | null>(null);
  const [vendasBanco, setVendasBanco] = useState<any[]>([]);

  // Clientes de Atacado & Bot
  const [clientesAtacado, setClientesAtacado] = useState<ClienteAtacado[]>([]);
  const [loadingClientes, setLoadingClientes] = useState(false);
  const [clienteParaEditar, setClienteParaEditar] = useState<ClienteAtacado | null>(null);
  const [showNovoClienteModal, setShowNovoClienteModal] = useState(false);
  const [buscaClientes, setBuscaClientes] = useState('');

  // Configurações do Bot de Cobrança
  const [configBot, setConfigBot] = useState<ConfigAtacadoBot>(DEFAULT_CONFIG_BOT);
  const [loadingConfigBot, setLoadingConfigBot] = useState(false);
  const [salvandoConfigBot, setSalvandoConfigBot] = useState(false);
  const [disparandoCobrancas, setDisparandoCobrancas] = useState(false);

  // Carrega vendas do Supabase para controle de fiado e histórico
  const fetchVendasBanco = useCallback(async () => {
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

  // Carrega lista de clientes de atacado
  const fetchClientesAtacado = useCallback(async () => {
    setLoadingClientes(true);
    try {
      const res = await fetch('/api/atacado/clientes');
      if (res.ok) {
        const json = await res.json();
        if (json.clientes) {
          setClientesAtacado(json.clientes);
        }
      }
    } catch (err) {
      console.error('Erro ao buscar clientes de atacado:', err);
    } finally {
      setLoadingClientes(false);
    }
  }, []);

  // Carrega configurações do Bot
  const fetchConfigBot = useCallback(async () => {
    setLoadingConfigBot(true);
    try {
      const res = await fetch('/api/atacado/configuracoes');
      if (res.ok) {
        const json = await res.json();
        if (json.config) {
          setConfigBot({
            ...DEFAULT_CONFIG_BOT,
            ...json.config,
            chave_pix: json.config.chave_pix || config.chavePix || '',
          });
        }
      }
    } catch (err) {
      console.error('Erro ao carregar configurações do bot:', err);
    } finally {
      setLoadingConfigBot(false);
    }
  }, [config.chavePix]);

  // Salvar configurações do Bot
  const handleSalvarConfigBot = async () => {
    setSalvandoConfigBot(true);
    try {
      const res = await fetch('/api/atacado/configuracoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configBot),
      });

      if (!res.ok) throw new Error('Falha ao salvar configurações.');

      toast.success('Configurações do Bot de Atacado salvas com sucesso! 🤖✅');
    } catch (err: any) {
      console.error('Erro ao salvar config:', err);
      toast.error(err.message || 'Erro ao salvar configurações.');
    } finally {
      setSalvandoConfigBot(false);
    }
  };

  // Disparar cobranças (Simulação ou Real)
  const handleDispararCobrancas = async (simular: boolean = false) => {
    if (!simular && !confirm('Deseja realmente disparar mensagens de cobrança no WhatsApp para todos os lojistas devedores agora?')) {
      return;
    }

    setDisparandoCobrancas(true);
    const toastId = toast.loading(simular ? 'Simulando disparos do bot...' : 'Enviando cobranças via WhatsApp...');

    try {
      const res = await fetch('/api/atacado/disparar-cobrancas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ simular }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || 'Erro ao processar disparos.');
      }

      if (simular) {
        toast.info(`Simulação concluída: ${json.devedoresEncontrados || 0} devedor(es) analisado(s). ${json.mensagensEnviadas || 0} receberiam mensagem.`, { id: toastId });
      } else {
        toast.success(`Disparo finalizado! ${json.mensagensEnviadas || 0} mensagem(ns) enviada(s) com sucesso.`, { id: toastId });
        await fetchClientesAtacado();
        await fetchVendasBanco();
      }
    } catch (err: any) {
      console.error('Erro no disparo:', err);
      toast.error(err.message || 'Falha ao disparar cobranças.', { id: toastId });
    } finally {
      setDisparandoCobrancas(false);
    }
  };

  // Excluir cliente de atacado
  const handleExcluirCliente = async (id: string, nome: string) => {
    if (!confirm(`Tem certeza que deseja excluir o lojista parceiro "${nome}"?`)) return;

    try {
      const res = await fetch(`/api/atacado/clientes?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Falha ao excluir.');

      toast.success(`Lojista "${nome}" excluído com sucesso.`);
      fetchClientesAtacado();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao excluir.');
    }
  };

  useEffect(() => {
    fetchVendasBanco();
    fetchClientesAtacado();
    fetchConfigBot();
  }, [fetchVendasBanco, fetchClientesAtacado, fetchConfigBot]);

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

    aparelhos.forEach((a: any) => {
      if (a.ativo === true && a.status === 'disponivel') return;
      if (a.status !== 'vendido' && a.condicao !== 'vendido' && a.ativo !== false) return;

      const obs = String(a.observacoes || '');
      const matchBaixa = obs.match(/BAIXA_ESTOQUE:(\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z?)?):([\s\S]*)$/i)
        || obs.match(/BAIXA_ESTOQUE:([^:]+(?::\d{2}(?::\d{2})?(?:\.\d+)?(?:Z)?)?):([\s\S]*)$/i)
        || obs.match(/BAIXA_ESTOQUE:([^:]+):([\s\S]*)$/i);

      if (matchBaixa) {
        let dataIso = matchBaixa[1] || a.dataCadastro || new Date().toISOString();
        const textoDetalhe = matchBaixa[2] || '';

        if (/^\d{4}-\d{2}-\d{2}T\d{1,2}$/.test(dataIso)) dataIso += ':00:00';
        else if (/^\d{4}-\d{2}-\d{2}T\d{1,2}:\d{2}$/.test(dataIso)) dataIso += ':00';

        const matchTipo = textoDetalhe.match(/Venda (ATACADO|VAREJO)/i);
        const matchComp = textoDetalhe.match(/Comprador:\s*([^|\n]+)/i);
        const matchVal = textoDetalhe.match(/Valor:\s*R\$\s*([\d.,]+)/i);
        const matchPgto = textoDetalhe.match(/Pgto:\s*([^|\n]+)/i);

        const ehAtacado = (matchTipo && matchTipo[1].toUpperCase() === 'ATACADO') || 
                          obs.toUpperCase().includes('ATACADO') ||
                          (a.tipo_venda && a.tipo_venda.toUpperCase() === 'ATACADO');

        if (ehAtacado) {
          const valorVenda = matchVal ? parseMonetaryValue(matchVal[1]) : (a.preco || 0);
          const custo = Number(a.custo || a.precoCompra || 0);
          const lucro = valorVenda - custo;
          const margem = custo > 0 ? (lucro / custo) * 100 : 0;
          const comprador = matchComp ? matchComp[1].trim() : (a.cliente || 'Lojista / Revenda');
          const metodoPgto = matchPgto ? matchPgto[1].trim() : 'dinheiro';

          let imeiLimpo = (a.imei || '').trim();
          if (!imeiLimpo && a.observacoes) {
            const matchImei = a.observacoes.match(/IMEI:\s*([A-Za-z0-9]+)/i);
            if (matchImei) imeiLimpo = matchImei[1];
          }

          lista.push({
            id: a.id,
            aparelhoId: a.id,
            data: dataIso,
            comprador,
            modelo: a.modelo || 'Sem Modelo',
            marca: a.marca || 'Apple',
            cor: a.cor,
            capacidade: a.capacidade,
            imei: imeiLimpo,
            codigo: getAparelhoCodigo(a) || '',
            valorVenda,
            custo,
            lucro,
            margem,
            metodoPgto,
            status: 'concluida',
            raw: a,
          });
        }
      }
    });

    // Mescla vendas registradas no banco que sejam de atacado
    vendasBanco.forEach((v) => {
      const isAtacado = (v.tipoEntrega && v.tipoEntrega.toLowerCase().includes('atacado')) ||
                        (v.descricao && v.descricao.toLowerCase().includes('atacado')) ||
                        (v.itens && Array.isArray(v.itens) && v.itens.some((it: any) => it.tipoVenda === 'atacado'));

      if (isAtacado) {
        const jaEstaNaLista = lista.some(item => 
          item.id === v.id || 
          item.aparelhoId === v.aparelhoId || 
          (v.itens && Array.isArray(v.itens) && v.itens.some((it: any) => it.aparelhoId === item.aparelhoId))
        );

        if (!jaEstaNaLista) {
          const valorVenda = Number(v.valor || 0);
          const custo = Number(v.custo || 0);
          const lucro = valorVenda - custo;
          const margem = custo > 0 ? (lucro / custo) * 100 : 0;

          lista.push({
            id: v.id,
            aparelhoId: v.aparelhoId,
            data: v.dataPagamento || v.data || v.created_at || new Date().toISOString(),
            comprador: v.clienteNome || 'Lojista / Revenda',
            modelo: v.descricao || 'Lote de Aparelhos',
            marca: 'Atacado',
            valorVenda,
            custo,
            lucro,
            margem,
            metodoPgto: v.metodo || 'dinheiro',
            status: v.status,
            valorPago: v.valorPago,
            saldoDevedor: v.saldoDevedor,
            dataVencimento: v.dataVencimento,
            raw: v,
          });
        }
      }
    });

    return lista.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
  }, [aparelhos, vendasBanco]);

  // Vendas Filtradas
  const vendasFiltradas = useMemo(() => {
    return vendasAtacado.filter((v) => {
      if (compradorFiltro !== 'todos' && v.comprador.toLowerCase() !== compradorFiltro.toLowerCase()) {
        return false;
      }

      if (periodoFiltro === 'mes') {
        const d = new Date(v.data);
        const agora = new Date();
        if (d.getMonth() !== agora.getMonth() || d.getFullYear() !== agora.getFullYear()) return false;
      } else if (periodoFiltro === 'ano') {
        const d = new Date(v.data);
        if (d.getFullYear() !== new Date().getFullYear()) return false;
      }

      if (busca.trim()) {
        const q = busca.toLowerCase();
        const matchMod = v.modelo.toLowerCase().includes(q);
        const matchComp = v.comprador.toLowerCase().includes(q);
        const matchImei = (v.imei || '').toLowerCase().includes(q);
        const matchCod = (v.codigo || '').toLowerCase().includes(q);
        if (!matchMod && !matchComp && !matchImei && !matchCod) return false;
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

  // ── 4. Ranking dos Principais Compradores ──
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

  // ── 5. Ranking de Modelos Mais Vendidos ──
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

  // ── 6. Lojistas Devedores & Controle de Fiado ──
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

    vendasBanco.forEach(v => {
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
        if (devedor <= 0 && isFiado && v.status !== 'pago') devedor = total;
        if (isFiado && pago === 0) devedor = total;
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

    vendasAtacado.forEach(va => {
      if (va.metodoPgto === 'fiado') {
        const cliente = (va.comprador || 'Não Informado').trim();
        
        const jaNoBanco = vendasBanco.some(vb => 
          vb.id === va.id || 
          vb.aparelhoId === va.aparelhoId || 
          (vb.itens && Array.isArray(vb.itens) && vb.itens.some((it: any) => it.aparelhoId === va.aparelhoId))
        );
        if (jaNoBanco) return;

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
        entry.dataVencimentoMaisAntiga = (menorVencimento as Date).toISOString();
        if ((menorVencimento as Date).getTime() < agora.getTime()) {
          const diffMs = agora.getTime() - (menorVencimento as Date).getTime();
          const dias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
          entry.diasAtraso = dias;
          entry.estaEmAtraso = dias > 0;
        }
      }
    });

    return Array.from(mapa.values()).sort((a, b) => {
      if (a.estaEmAtraso !== b.estaEmAtraso) {
        return a.estaEmAtraso ? -1 : 1;
      }
      return b.saldoDevedor - a.saldoDevedor;
    });
  }, [vendasBanco, vendasAtacado]);

  const totalFiadoEmAberto = useMemo(() => {
    return lojistasDevedores.reduce((acc, l) => acc + l.saldoDevedor, 0);
  }, [lojistasDevedores]);

  // Clientes Filtrados
  const clientesFiltrados = useMemo(() => {
    if (!buscaClientes.trim()) return clientesAtacado;
    const q = buscaClientes.toLowerCase();
    return clientesAtacado.filter(c => 
      c.nome.toLowerCase().includes(q) ||
      (c.whatsapp || '').includes(q) ||
      (c.telefone || '').includes(q) ||
      (c.cidade || '').toLowerCase().includes(q) ||
      (c.cpf_cnpj || '').includes(q)
    );
  }, [clientesAtacado, buscaClientes]);

  // Emissão NF-e
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
          clienteNome: v.comprador,
          valor: v.valorVenda,
          modelo: v.modelo,
          imei: v.imei,
          tipoNota: 'NFe_55',
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Erro na SEFAZ');
      }

      toast.success('Solicitação de NF-e enviada com sucesso!');
    } catch (err: any) {
      toast.error(err.message || 'Falha ao emitir NF-e.');
    }
  };

  // Reverter Venda
  const handleReverterVenda = async (venda: VendaAtacadoItem) => {
    if (!confirm(`Tem certeza que deseja estornar a venda do aparelho ${venda.modelo}? O produto retornará ao estoque ativo como "disponível".`)) {
      return;
    }

    const toastId = toast.loading('Revertendo venda e restaurando estoque...');

    try {
      const obsLimpa = String(venda.raw?.observacoes || '')
        .replace(/BAIXA_ESTOQUE:[^\n]+(?:\n|$)/gi, '')
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

  // Exportar Lista Zap
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

  // Exportar CSV
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

  // Live preview do template de mensagem do bot
  const previewMensagemBot = useMemo(() => {
    const template = configBot.mensagem_template || '';
    return template
      .replace(/\{nome\}/gi, 'João da Silva')
      .replace(/\{valor\}/gi, 'R$ 3.850,00')
      .replace(/\{chave_pix\}/gi, configBot.chave_pix || config.chavePix || '12.345.678/0001-90')
      .replace(/\{nome_loja\}/gi, config.nomeLoja || 'Phone Center')
      .replace(/\{itens\}/gi, 'iPhone 13 128GB, iPhone 14 Pro');
  }, [configBot.mensagem_template, configBot.chave_pix, config.chavePix, config.nomeLoja]);

  return (
    <div className="panel-shell space-y-5">
      
      {/* CABEÇALHO PRINCIPAL DO ATACADO - PALETA DARK PADRÃO (AZUL / ÍNDIGO / SLATE) */}
      <GlassCard className="rounded-3xl p-4 sm:p-6 border border-slate-800/80">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600/20 to-indigo-600/20 text-blue-400 flex items-center justify-center font-bold border border-blue-500/30 shadow-lg shadow-blue-950/20">
              <Boxes className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                Painel de Atacado & Revenda
                <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 text-[10px]">
                  B2B / Lojistas
                </Badge>
              </h2>
              <p className="text-xs sm:text-sm text-slate-400">
                Gestão completa de lojistas parceiros, estoques em lote, fiado e bot automático de cobrança
              </p>
            </div>
          </div>

          {/* BOTÕES DE AÇÃO RÁPIDA (CATEGORIZADOS EM MENUS DROPDOWN PARA NÃO POLUIR) */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full md:w-auto">
            {/* 1. Botão Principal: Nova Venda */}
            <Button
              onClick={() => {
                setAbrirScannerAtacado(false);
                setShowNovaVendaModal(true);
              }}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-2xl px-4 text-xs sm:text-sm shadow-md shadow-blue-950/30 flex items-center justify-center gap-2 border border-blue-400/30 transition-all hover:scale-[1.02] active:scale-[0.98] h-10 cursor-pointer flex-1 sm:flex-initial"
            >
              <Plus className="w-4 h-4" />
              Nova Venda Atacado
            </Button>

            {/* 2. Botão Bipar Venda */}
            <Button
              onClick={() => {
                setAbrirScannerAtacado(true);
                setShowNovaVendaModal(true);
              }}
              className="bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 font-semibold rounded-2xl px-3 text-xs sm:text-sm border border-cyan-500/30 flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] h-10 cursor-pointer shadow-sm"
              title="Bipar aparelhos via Câmera ou Leitor de Código de Barras USB"
            >
              <Camera className="w-4 h-4 text-cyan-400" />
              Bipar
            </Button>

            {/* 3. MENU CATEGORIZADO: CATÁLOGO & LISTAS */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700 rounded-2xl px-3 text-xs sm:text-sm h-10 flex items-center gap-1.5 cursor-pointer"
                >
                  <Tag className="w-4 h-4 text-indigo-400" />
                  <span>Catálogo & Listas</span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-slate-950 border-slate-800 text-slate-200">
                <DropdownMenuLabel className="text-[11px] text-slate-400 font-semibold">Tabelas e Exportação</DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => setShowAtacadoModal(true)}
                  className="cursor-pointer flex items-center gap-2 hover:bg-slate-900 focus:bg-slate-900"
                >
                  <Tag className="w-4 h-4 text-indigo-400" />
                  <span>Tabela de Preços Atacado</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleExportWhatsAppAtacado}
                  className="cursor-pointer flex items-center gap-2 hover:bg-slate-900 focus:bg-slate-900"
                >
                  <MessageCircle className="w-4 h-4 text-emerald-400" />
                  <span>Copiar Lista Zap (WhatsApp)</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-slate-800" />
                <DropdownMenuItem
                  onClick={handleExportCSVVendas}
                  className="cursor-pointer flex items-center gap-2 hover:bg-slate-900 focus:bg-slate-900"
                >
                  <FileSpreadsheet className="w-4 h-4 text-blue-400" />
                  <span>Exportar CSV de Vendas</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* 4. MENU CATEGORIZADO: GESTÃO & BOT */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700 rounded-2xl px-3 text-xs sm:text-sm h-10 flex items-center gap-1.5 cursor-pointer"
                >
                  <Bot className="w-4 h-4 text-blue-400" />
                  <span>Gestão & Bot</span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 bg-slate-950 border-slate-800 text-slate-200">
                <DropdownMenuLabel className="text-[11px] text-slate-400 font-semibold">Clientes & Automação</DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => {
                    setClienteParaEditar(null);
                    setShowNovoClienteModal(true);
                  }}
                  className="cursor-pointer flex items-center gap-2 hover:bg-slate-900 focus:bg-slate-900"
                >
                  <UserPlus className="w-4 h-4 text-emerald-400" />
                  <span>Novo Cliente Atacado</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setAbaSubTab('configuracoes')}
                  className="cursor-pointer flex items-center gap-2 hover:bg-slate-900 focus:bg-slate-900"
                >
                  <Settings className="w-4 h-4 text-blue-400" />
                  <span>Configurações do Bot</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-slate-800" />
                <DropdownMenuItem
                  onClick={() => handleDispararCobrancas(false)}
                  disabled={disparandoCobrancas}
                  className="cursor-pointer flex items-center gap-2 text-rose-400 hover:bg-rose-950/30 focus:bg-rose-950/30"
                >
                  <Send className="w-4 h-4 text-rose-400" />
                  <span>Disparar Cobranças Agora</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
              <ShoppingBag className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-base sm:text-xl font-bold font-mono text-indigo-300">
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

          {/* Card 5: Fiado a Receber */}
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
                ? "bg-blue-600 text-white shadow-lg shadow-blue-950/40"
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
                ? "bg-rose-600 text-white shadow-lg shadow-rose-950/40"
                : "bg-slate-900/90 hover:bg-slate-800 text-slate-300 border border-slate-800"
            )}
          >
            <DollarSign className="w-4 h-4 text-rose-300" /> 💸 Fiado & Devedores ({lojistasDevedores.length})
            {totalFiadoEmAberto > 0 && (
              <Badge className="bg-rose-950 text-rose-300 text-[10px] ml-1">
                R$ {totalFiadoEmAberto.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
              </Badge>
            )}
          </button>

          <button
            type="button"
            onClick={() => setAbaSubTab('clientes')}
            className={cn(
              "px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer",
              abaSubTab === 'clientes'
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-950/40"
                : "bg-slate-900/90 hover:bg-slate-800 text-slate-300 border border-slate-800"
            )}
          >
            <Users className="w-4 h-4" /> 👥 Clientes Atacado ({clientesAtacado.length})
          </button>

          <button
            type="button"
            onClick={() => setAbaSubTab('configuracoes')}
            className={cn(
              "px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer",
              abaSubTab === 'configuracoes'
                ? "bg-cyan-600 text-white shadow-lg shadow-cyan-950/40"
                : "bg-slate-900/90 hover:bg-slate-800 text-slate-300 border border-slate-800"
            )}
          >
            <Bot className="w-4 h-4" /> 🤖 Configurações do Bot
          </button>

          <button
            type="button"
            onClick={() => setAbaSubTab('historico')}
            className={cn(
              "px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer",
              abaSubTab === 'historico'
                ? "bg-slate-700 text-white shadow-lg shadow-slate-950/40"
                : "bg-slate-900/90 hover:bg-slate-800 text-slate-300 border border-slate-800"
            )}
          >
            <History className="w-4 h-4" /> 📜 Histórico ({vendasAtacado.length})
          </button>
        </div>
      </GlassCard>

      {/* CONTEÚDO 1: ABA DE MÉTRICAS & RANKINGS */}
      {abaSubTab === 'metricas' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* RANKING DOS PRINCIPAIS COMPRADORES */}
            <GlassCard className="lg:col-span-8 rounded-3xl p-4 sm:p-5 space-y-3 border border-slate-800/80">
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-400" />
                  <h3 className="font-bold text-sm text-white">Ranking dos Principais Compradores / Lojistas</h3>
                </div>
                <span className="text-[11px] text-slate-400">{rankingCompradores.length} lojistas compradores</span>
              </div>

              {rankingCompradores.length === 0 ? (
                <div className="p-8 text-center text-slate-500 space-y-2">
                  <Users className="w-8 h-8 opacity-40 mx-auto" />
                  <p className="text-xs">Nenhuma venda de atacado registrada ainda.</p>
                  <p className="text-[11px] text-slate-600">Venda produtos marcando como "Atacado" e informando o nome do comprador.</p>
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
                            ? "bg-blue-600/15 border-blue-500/50 shadow-md shadow-blue-950/30"
                            : "bg-slate-950/70 border-slate-800/80 hover:border-slate-700"
                        )}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center",
                              idx === 0 ? "bg-blue-600 text-white" :
                              idx === 1 ? "bg-indigo-600 text-white" :
                              idx === 2 ? "bg-slate-700 text-slate-200" : "bg-slate-800 text-slate-400"
                            )}>
                              {idx + 1}
                            </span>
                            <span className="font-bold text-xs text-white truncate max-w-[120px]">{comp.nome}</span>
                          </div>
                          <Badge variant="outline" className="text-[9px] bg-slate-900 border-slate-700 text-blue-300">
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
            <GlassCard className="lg:col-span-4 rounded-3xl p-4 sm:p-5 space-y-3 border border-slate-800/80">
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

      {/* CONTEÚDO 2: ABA DE FIADO & LOJISTAS DEVEDORES */}
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
                    Controle Milimétrico de Fiado & Devedores
                  </h3>
                  <p className="text-xs text-slate-400">
                    Acompanhe exatamente o que cada lojista pegou e abata pagamentos parciais ou totais
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  onClick={() => handleDispararCobrancas(false)}
                  disabled={disparandoCobrancas || lojistasDevedores.length === 0}
                  className="bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-2xl text-xs h-10 gap-1.5 shadow-md cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  Cobrar via Bot Zap
                </Button>

                <div className="text-right shrink-0 bg-slate-950/90 p-3 rounded-2xl border border-rose-500/20">
                  <span className="text-[11px] text-slate-400 block">Total a Receber</span>
                  <span className="text-xl sm:text-2xl font-bold font-mono text-rose-400">
                    R$ {totalFiadoEmAberto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          </GlassCard>

          {/* LISTA DE CARDS POR LOJISTA DEVEDOR */}
          {lojistasDevedores.length === 0 ? (
            <GlassCard className="rounded-3xl p-8 text-center text-slate-500 space-y-2 border border-slate-800">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto opacity-60" />
              <h4 className="text-sm font-bold text-white">Nenhum fiado em aberto no momento! 🎉</h4>
              <p className="text-xs text-slate-400">Todos os lojistas e compradores estão 100% quitados.</p>
            </GlassCard>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {lojistasDevedores.map((lojista) => (
                <GlassCard key={lojista.lojistaNome} className="rounded-3xl p-4 sm:p-5 space-y-3.5 border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition-all">
                  
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2.5">
                        <div className={cn(
                          "w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm border",
                          lojista.estaEmAtraso 
                            ? "bg-red-500/20 text-red-400 border-red-500/40" 
                            : "bg-blue-500/20 text-blue-400 border-blue-500/30"
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
                      <MessageCircle className="w-3.5 h-3.5 text-emerald-400" /> Extrato Zap
                    </Button>
                  </div>

                </GlassCard>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CONTEÚDO 3: ABA DE CLIENTES DE ATACADO (LOJISTAS PARCEIROS & WHATSAPP) */}
      {abaSubTab === 'clientes' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <GlassCard className="rounded-3xl p-4 sm:p-6 border border-slate-800/80 space-y-4">
            
            {/* TOPO DA ABA DE CLIENTES */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
              <div>
                <h3 className="font-bold text-base text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-400" />
                  Clientes Atacado & Lojistas Parceiros
                </h3>
                <p className="text-xs text-slate-400">
                  Cadastre o WhatsApp de cada lojista para o bot enviar listas de estoque e lembretes de cobrança automática
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1 sm:w-64">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Buscar nome, zap, cidade..."
                    value={buscaClientes}
                    onChange={(e) => setBuscaClientes(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-xl pl-8 pr-3 py-2 outline-none focus:border-indigo-500"
                  />
                </div>

                <Button
                  onClick={() => {
                    setClienteParaEditar(null);
                    setShowNovoClienteModal(true);
                  }}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl px-3 text-xs h-9 gap-1.5 cursor-pointer shrink-0"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Novo Cliente
                </Button>
              </div>
            </div>

            {/* LISTAGEM DE CLIENTES */}
            {loadingClientes ? (
              <div className="py-12 text-center text-slate-400 flex flex-col items-center gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
                <span className="text-xs">Carregando lojistas parceiros...</span>
              </div>
            ) : clientesFiltrados.length === 0 ? (
              <div className="py-12 text-center text-slate-500 space-y-3">
                <Users className="w-10 h-10 opacity-30 mx-auto" />
                <p className="text-sm font-semibold text-slate-400">Nenhum cliente de atacado cadastrado.</p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Cadastre seus parceiros com WhatsApp para ativar os disparos automáticos de cobrança e lista de estoque.
                </p>
                <Button
                  onClick={() => {
                    setClienteParaEditar(null);
                    setShowNovoClienteModal(true);
                  }}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Cadastrar Primeiro Cliente
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {clientesFiltrados.map((cliente) => {
                  const saldo = Number(cliente.saldo_devedor || 0);
                  const limite = Number(cliente.limite_credito || 0);
                  const zapLimpo = (cliente.whatsapp || cliente.telefone || '').replace(/\D/g, '');
                  const temZap = zapLimpo.length >= 10;
                  const zapLink = temZap 
                    ? `https://wa.me/${zapLimpo.startsWith('55') ? zapLimpo : `55${zapLimpo}`}`
                    : null;

                  return (
                    <div 
                      key={cliente.id} 
                      className="bg-slate-950/70 border border-slate-800/80 hover:border-slate-700 rounded-2xl p-4 space-y-3 transition-all flex flex-col justify-between"
                    >
                      <div>
                        {/* Topo do Card */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center font-bold text-sm">
                              {cliente.nome.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <h4 className="font-bold text-sm text-white">{cliente.nome}</h4>
                              {cliente.cidade ? (
                                <span className="text-[11px] text-slate-400 block">{cliente.cidade}</span>
                              ) : (
                                <span className="text-[10px] text-slate-500 block">Lojista Parceiro</span>
                              )}
                            </div>
                          </div>

                          <Badge className={cn("text-[9px]", cliente.ativo !== false ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-slate-800 text-slate-400")}>
                            {cliente.ativo !== false ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </div>

                        {/* Informações de Contato */}
                        <div className="mt-3 p-2.5 bg-slate-900/60 rounded-xl space-y-1.5 border border-white/5 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400 flex items-center gap-1">
                              <MessageCircle className="w-3.5 h-3.5 text-emerald-400" /> WhatsApp:
                            </span>
                            {temZap ? (
                              <a 
                                href={zapLink!} 
                                target="_blank" 
                                rel="noreferrer" 
                                className="font-mono text-emerald-400 hover:underline flex items-center gap-1 font-bold"
                              >
                                {cliente.whatsapp || cliente.telefone}
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : (
                              <span className="text-slate-500 italic">Não informado</span>
                            )}
                          </div>

                          {cliente.cpf_cnpj && (
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-slate-400">CPF/CNPJ:</span>
                              <span className="font-mono text-slate-300">{cliente.cpf_cnpj}</span>
                            </div>
                          )}

                          <div className="flex items-center justify-between text-[11px] pt-1 border-t border-white/5">
                            <span className="text-slate-400">Limite de Crédito:</span>
                            <span className="font-mono text-blue-300 font-bold">
                              R$ {limite.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-400">Saldo Devedor:</span>
                            <span className={cn("font-mono font-bold", saldo > 0 ? "text-rose-400" : "text-emerald-400")}>
                              R$ {saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>

                        {cliente.observacoes && (
                          <p className="text-[11px] text-slate-400 italic mt-2 line-clamp-2">
                            "{cliente.observacoes}"
                          </p>
                        )}
                      </div>

                      {/* Ações do Card */}
                      <div className="flex items-center justify-between pt-2 border-t border-white/5 gap-2">
                        {temZap && (
                          <a
                            href={zapLink!}
                            target="_blank"
                            rel="noreferrer"
                            className="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xl px-2.5 py-1.5 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                            Abrir Zap
                          </a>
                        )}

                        <div className="flex items-center gap-1 ml-auto">
                          <button
                            onClick={() => {
                              setClienteParaEditar(cliente);
                              setShowNovoClienteModal(true);
                            }}
                            className="p-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded-lg transition-colors cursor-pointer"
                            title="Editar dados"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleExcluirCliente(cliente.id, cliente.nome)}
                            className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                            title="Excluir cliente"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                    </div>
                  );
                })}
              </div>
            )}
          </GlassCard>
        </div>
      )}

      {/* CONTEÚDO 4: ABA DE CONFIGURAÇÕES DO BOT DE COBRANÇA */}
      {abaSubTab === 'configuracoes' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          <GlassCard className="rounded-3xl p-4 sm:p-6 border border-slate-800/80 space-y-6">
            
            {/* Cabeçalho das Configurações */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-cyan-600/20 text-cyan-400 flex items-center justify-center font-bold border border-cyan-500/30 shadow-md">
                  <Bot className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-base sm:text-lg text-white flex items-center gap-2">
                    Automação do Bot de Cobrança & Mensagens
                  </h3>
                  <p className="text-xs text-slate-400">
                    Defina horários, dias da semana e modelos de mensagem para cobrança automática de devedores no WhatsApp
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  onClick={() => handleDispararCobrancas(true)}
                  disabled={disparandoCobrancas}
                  variant="outline"
                  className="bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800 text-xs h-9 rounded-xl gap-1.5 cursor-pointer"
                >
                  <Search className="w-3.5 h-3.5 text-cyan-400" />
                  Simular Disparos
                </Button>

                <Button
                  onClick={handleSalvarConfigBot}
                  disabled={salvandoConfigBot}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs h-9 gap-1.5 shadow-md cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  {salvandoConfigBot ? 'Salvando...' : 'Salvar Configurações'}
                </Button>
              </div>
            </div>

            {/* Grid de Configurações */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Coluna 1: Parâmetros de Disparo e Horários (7 colunas) */}
              <div className="lg:col-span-7 space-y-4">
                
                {/* Ativação Principal */}
                <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-sm text-white">Disparo Automático do Bot</h4>
                    <p className="text-xs text-slate-400">
                      Quando ativado, o sistema enviará mensagens de cobrança automaticamente no horário programado
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={configBot.ativo}
                      onChange={(e) => setConfigBot({ ...configBot, ativo: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                {/* Horário de Disparo */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1.5">
                    <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-cyan-400" />
                      Horário do Disparo:
                    </label>
                    <input
                      type="time"
                      value={configBot.horario_disparo}
                      onChange={(e) => setConfigBot({ ...configBot, horario_disparo: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 text-white font-mono font-bold text-sm rounded-xl px-3 py-2 outline-none focus:border-cyan-500"
                    />
                    <span className="text-[10px] text-slate-500 block">Horário de Brasília (ex: 10:00)</span>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1.5">
                    <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                      Dias de Carência:
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="30"
                      value={configBot.dias_carencia}
                      onChange={(e) => setConfigBot({ ...configBot, dias_carencia: Number(e.target.value) || 0 })}
                      className="w-full bg-slate-900 border border-slate-700 text-white font-mono font-bold text-sm rounded-xl px-3 py-2 outline-none focus:border-indigo-500"
                    />
                    <span className="text-[10px] text-slate-500 block">Dias após o vencimento antes de cobrar</span>
                  </div>
                </div>

                {/* Dias da Semana para Disparo */}
                <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2.5">
                  <label className="text-xs font-bold text-slate-300 block">
                    Dias da Semana Permitidos para Envio:
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {DIAS_SEMANA_OPCOES.map((dia) => {
                      const selecionado = configBot.dias_semana.includes(dia.valor);
                      return (
                        <button
                          key={dia.valor}
                          type="button"
                          onClick={() => {
                            const novos = selecionado
                              ? configBot.dias_semana.filter(d => d !== dia.valor)
                              : [...configBot.dias_semana, dia.valor];
                            setConfigBot({ ...configBot, dias_semana: novos });
                          }}
                          className={cn(
                            "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer",
                            selecionado
                              ? "bg-blue-600 text-white shadow-md shadow-blue-950/40"
                              : "bg-slate-900 hover:bg-slate-800 text-slate-400 border border-slate-800"
                          )}
                        >
                          {dia.label}
                        </button>
                      );
                    })}
                  </div>
                  <span className="text-[10px] text-slate-500 block">
                    Recomendado: Segunda a Sexta para maior receptividade comercial
                  </span>
                </div>

                {/* Chave Pix para Cobrança */}
                <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                    Chave Pix para Pagamento no Atacado:
                  </label>
                  <input
                    type="text"
                    placeholder="CNPJ, E-mail, Celular ou Chave Aleatória"
                    value={configBot.chave_pix || ''}
                    onChange={(e) => setConfigBot({ ...configBot, chave_pix: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 text-white font-mono text-xs rounded-xl px-3 py-2 outline-none focus:border-emerald-500"
                  />
                  <span className="text-[10px] text-slate-500 block">
                    Substitui a tag &#123;chave_pix&#125; na mensagem de cobrança
                  </span>
                </div>

                {/* Template da Mensagem */}
                <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-300">
                      Modelo da Mensagem de Cobrança:
                    </label>
                    <span className="text-[10px] text-slate-400">Variáveis disponíveis abaixo</span>
                  </div>

                  {/* Badges para inserir variáveis no texto */}
                  <div className="flex flex-wrap gap-1.5">
                    {['{nome}', '{valor}', '{chave_pix}', '{nome_loja}', '{itens}'].map(tag => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => {
                          setConfigBot({
                            ...configBot,
                            mensagem_template: (configBot.mensagem_template || '') + ` ${tag} `,
                          });
                        }}
                        className="bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-slate-700 rounded-lg px-2 py-0.5 text-[10px] font-mono cursor-pointer transition-colors"
                      >
                        + {tag}
                      </button>
                    ))}
                  </div>

                  <textarea
                    rows={6}
                    value={configBot.mensagem_template}
                    onChange={(e) => setConfigBot({ ...configBot, mensagem_template: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 text-white text-xs rounded-xl p-3 outline-none focus:border-blue-500 font-sans leading-relaxed"
                  />
                </div>

              </div>

              {/* Coluna 2: Prévia Visual do WhatsApp & Gatilhos Manuais (5 colunas) */}
              <div className="lg:col-span-5 space-y-4">
                
                {/* Prévia do Balão de WhatsApp */}
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-white/5">
                    <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <MessageCircle className="w-4 h-4 text-emerald-400" />
                      Prévia da Mensagem (WhatsApp)
                    </span>
                    <span className="text-[10px] text-slate-500">Exemplo real</span>
                  </div>

                  {/* Simulação do Balão */}
                  <div className="bg-[#0b141a] rounded-2xl p-4 border border-emerald-950/40 space-y-2">
                    <div className="bg-[#005c4b] text-white text-xs rounded-2xl rounded-tr-none p-3 shadow-sm whitespace-pre-wrap leading-relaxed font-sans">
                      {previewMensagemBot}
                      <span className="text-[9px] text-emerald-200/60 block text-right mt-1">
                        {configBot.horario_disparo} ✓✓
                      </span>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-400">
                    O bot formata automaticamente o nome do lojista parceiro, o valor exato devido e sua chave Pix.
                  </p>
                </div>

                {/* Card de Disparo Manual Imediato */}
                <div className="p-4 rounded-2xl bg-gradient-to-br from-rose-950/30 to-slate-950 border border-rose-900/30 space-y-3">
                  <div>
                    <h4 className="font-bold text-sm text-white flex items-center gap-1.5">
                      <Send className="w-4 h-4 text-rose-400" />
                      Disparo Manual Forçado
                    </h4>
                    <p className="text-xs text-slate-400">
                      Deseja enviar a cobrança para todos os devedores agora mesmo sem esperar o horário programado?
                    </p>
                  </div>

                  <div className="pt-1 flex flex-col gap-2">
                    <Button
                      onClick={() => handleDispararCobrancas(false)}
                      disabled={disparandoCobrancas || lojistasDevedores.length === 0}
                      className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs h-10 gap-1.5 shadow-md cursor-pointer"
                    >
                      <Send className="w-4 h-4" />
                      {disparandoCobrancas ? 'Enviando...' : `Disparar para ${lojistasDevedores.length} Devedores Agora`}
                    </Button>

                    <Button
                      onClick={() => handleDispararCobrancas(true)}
                      disabled={disparandoCobrancas}
                      variant="outline"
                      className="w-full bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800 text-xs h-9 rounded-xl gap-1.5 cursor-pointer"
                    >
                      <Search className="w-3.5 h-3.5 text-cyan-400" />
                      Apenas Simular (Ver quem receberia)
                    </Button>
                  </div>
                </div>

              </div>

            </div>

          </GlassCard>
        </div>
      )}

      {/* CONTEÚDO 5: HISTÓRICO GERAL DE VENDAS EM ATACADO */}
      {(abaSubTab === 'historico' || abaSubTab === 'metricas') && (
        <GlassCard className="rounded-3xl p-4 sm:p-6 space-y-4 border border-slate-800/80">
          
          {/* BARRA DE FILTROS */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
            <div>
              <h3 className="font-bold text-sm sm:text-base text-white flex items-center gap-2">
                <History className="w-4 h-4 text-blue-400" />
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
                  className="bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-xl px-3 py-2 outline-none focus:border-blue-500 cursor-pointer"
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
                  className={cn("px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer", periodoFiltro === 'todos' ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white")}
                >
                  Tudo
                </button>
                <button
                  onClick={() => setPeriodoFiltro('mes')}
                  className={cn("px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer", periodoFiltro === 'mes' ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white")}
                >
                  Este Mês
                </button>
                <button
                  onClick={() => setPeriodoFiltro('ano')}
                  className={cn("px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer", periodoFiltro === 'ano' ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white")}
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
                  className="bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-xl pl-8 pr-3 py-2 outline-none focus:border-blue-500 w-full sm:w-56"
                />
              </div>
            </div>
          </div>

          {/* VISUALIZAÇÃO MOBILE (CARDS) */}
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
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
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

                  <div className="bg-slate-900/60 rounded-xl p-2.5 border border-white/5 space-y-0.5">
                    <div className="font-bold text-xs text-white">{v.modelo}</div>
                    <div className="text-[10px] text-slate-400 font-mono flex items-center justify-between">
                      <span>{v.capacidade} · {v.cor}</span>
                      <span>ID: {v.codigo || v.imei || '-'}</span>
                    </div>
                  </div>

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

                  <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                    <button
                      onClick={() => setVendaParaEditar(v)}
                      className="flex-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 rounded-xl py-2 px-3 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer active:scale-[0.98]"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-blue-400" />
                      Editar
                    </button>

                    <button
                      onClick={() => handleEmitirNFeAtacado(v)}
                      className="bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-xl py-2 px-2.5 text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer active:scale-[0.98]"
                      title="Emitir ou Consultar NF-e (Modelo 55)"
                    >
                      <FileText className="w-3.5 h-3.5 text-indigo-400" />
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
                          <span className="w-2 h-2 rounded-full bg-blue-400" />
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
                            title="Editar dados"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleEmitirNFeAtacado(v)}
                            className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold p-1.5 rounded-lg hover:bg-indigo-500/10 transition-colors"
                            title="Emitir ou Consultar NF-e (Modelo 55)"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleReverterVenda(v)}
                            className="text-xs text-rose-400 hover:text-rose-300 font-semibold p-1.5 rounded-lg hover:bg-rose-500/10 transition-colors"
                            title="Cancelar venda e devolver aparelho ao estoque"
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

      {/* MODAL DE CADASTRO E EDIÇÃO DE CLIENTE DE ATACADO */}
      <ModalPortal>
        <NovoClienteAtacadoModal
          isOpen={showNovoClienteModal}
          onClose={() => {
            setShowNovoClienteModal(false);
            setClienteParaEditar(null);
          }}
          clienteParaEditar={clienteParaEditar}
          onSuccess={fetchClientesAtacado}
        />
      </ModalPortal>

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
            await fetchClientesAtacado();
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

      {/* MODAL PARA EDITAR VENDA / REGISTRO */}
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
            await fetchClientesAtacado();
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
          chavePix={configBot.chave_pix || config.chavePix || ''}
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
