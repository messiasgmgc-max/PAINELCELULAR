'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Smartphone,
  UserCheck,
  Calculator,
  Trophy,
  Search,
  Copy,
  Check,
  RefreshCw,
  ShieldCheck,
  Wrench,
  Printer,
  Sparkles,
  ExternalLink,
  AlertCircle,
  Sliders,
  Link2,
  Send,
  Camera,
  Phone,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import CrmOpsPanel from '@/components/crm/CrmOpsPanel';
import {
  mensagemAgendarConferenciaTroca,
  mensagemPedirAvaliacaoTroca,
  mensagemResultadoAvaliacaoTroca,
} from '@/lib/crm-bridge/mensagensTroca';
import { supabase } from '@/lib/supabaseClient';

interface EstoqueItem {
  id: string;
  codigo: string;
  marca: string;
  modelo: string;
  capacidade: string;
  cor: string;
  condicao: string;
  status?: string;
  reservado?: boolean;
  saudeBateria: string;
  preco: number;
  quantidade: number;
  imeiFinal: string;
  textoWhatsapp: string;
}

interface Cliente360 {
  encontrado: boolean;
  cliente: {
    id: string;
    nome: string;
    telefone: string;
    email: string;
    cpf: string;
    cidade: string;
  } | null;
  compras: Array<{
    id: string;
    aparelhoDescricao: string;
    valor: number;
    dataPagamento: string;
    metodo: string;
    status: string;
  }>;
  garantias: Array<{ aparelhoModelo: string; dataFim: string; status: string }>;
  ordensServico: Array<{
    numeroOS: string;
    aparelhoModelo: string;
    defeito: string;
    status: string;
    dataEntrada: string;
  }>;
  resumo: {
    totalCompras: number;
    totalGasto: number;
    garantiasAtivas: number;
    osAbertas: number;
  };
}

interface SimulacaoResult {
  valorAparelho: number;
  valorTroca: number;
  entradaPix: number;
  saldoFinanciar: number;
  avaliacaoTroca?: {
    modelo: string;
    capacidade: string;
    valorBase: number;
    valorFinal: number;
    deducoes: Array<{ motivo: string; valor: number }>;
  };
  parcelamento: Array<{
    parcelas: number;
    taxaPercentual: number;
    totalComTaxa: number;
    valorParcela: number;
  }>;
  textoWhatsapp: string;
}

interface RankingResult {
  periodoDias: number;
  totalVendas: number;
  faturamentoTotal: number;
  ticketMedioGeral: number;
  ranking: Array<{
    vendedor: string;
    quantidade: number;
    faturamento: number;
    ticketMedio: number;
  }>;
  topModelos: Array<{ modelo: string; quantidade: number; faturamento: number }>;
}

interface EvolucaoItem {
  vendedor: string;
  faturamento: number;
  quantidade: number;
  metaFaturamento: number;
  comissaoEstimada: number;
  progressoFatPct: number;
}

type AbaId = 'cliente' | 'estoque' | 'simulador' | 'ranking' | 'ops';

const formatBRL = (v: number) =>
  (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function CrmSidebarPage() {
  const [token, setToken] = useState('');
  const [lojaId, setLojaId] = useState('');
  const [lojaNome, setLojaNome] = useState('PhoneCenter');
  const [sessaoAtiva, setSessaoAtiva] = useState(false);
  const [bearerSessao, setBearerSessao] = useState('');
  const [aba, setAba] = useState<AbaId>('estoque');
  const [erroAuth, setErroAuth] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [copiadoId, setCopiadoId] = useState<string | null>(null);

  // Contexto vindo do EvoCRM via postMessage
  const [contatoCtx, setContatoCtx] = useState<{
    nome: string;
    telefone: string;
    conversationId: string;
  }>({
    nome: '',
    telefone: '',
    conversationId: '',
  });

  // Aba Estoque + IMEI
  const [buscaEstoque, setBuscaEstoque] = useState('');
  const [condicaoFiltro, setCondicaoFiltro] = useState<string>('');
  const [estoque, setEstoque] = useState<EstoqueItem[]>([]);
  const [loadingEstoque, setLoadingEstoque] = useState(false);
  const [imeiConsulta, setImeiConsulta] = useState('');
  const [imeiResult, setImeiResult] = useState<{
    validacao: { valido: boolean; motivo?: string };
    restricaoInterna: boolean;
    motivoRestricao: string | null;
    aparelhos: Array<Record<string, unknown>>;
  } | null>(null);

  // Aba Cliente 360 + Telefonia entrante
  const [buscaCliente, setBuscaCliente] = useState('');
  const [cliente360, setCliente360] = useState<Cliente360 | null>(null);
  const [loadingCliente, setLoadingCliente] = useState(false);
  const [chamadaAtiva, setChamadaAtiva] = useState<{
    id: string;
    telefone: string;
    cliente_nome: string;
    status: string;
  } | null>(null);

  // Aba Simulador Troca & Proposta & Fechar Venda
  const [modelosTroca, setModelosTroca] = useState<string[]>([]);
  const [aparelhoSelecionadoId, setAparelhoSelecionadoId] = useState('');
  const [modeloNovo, setModeloNovo] = useState('');
  const [valorAparelho, setValorAparelho] = useState('');
  const [entradaPix, setEntradaPix] = useState('');
  const [usarTroca, setUsarTroca] = useState(false);
  const [trocaModelo, setTrocaModelo] = useState('iPhone 13');
  const [trocaCapacidade, setTrocaCapacidade] = useState('128GB');
  const [trocaBateria, setTrocaBateria] = useState('86');
  const [trocaTela, setTrocaTela] = useState('original_impecavel');
  const [trocaCarcaca, setTrocaCarcaca] = useState('impecavel');
  const [trocaFaceId, setTrocaFaceId] = useState(true);
  const [valorTrocaManual, setValorTrocaManual] = useState('');
  const [simulacao, setSimulacao] = useState<SimulacaoResult | null>(null);
  const [modoTabelaParcela, setModoTabelaParcela] = useState<'resumo' | 'completa' | 'selecionadas'>('resumo');
  const [mostrarTotalParcela, setMostrarTotalParcela] = useState(false);
  const [parcelasSelecionadas, setParcelasSelecionadas] = useState<number[]>([6, 10, 12, 18]);
  const [loadingSim, setLoadingSim] = useState(false);
  const [avaliandoFoto, setAvaliandoFoto] = useState(false);
  const [obsFotoIa, setObsFotoIa] = useState<string | null>(null);
  const [propostaLink, setPropostaLink] = useState<{ url: string; protocolo: string } | null>(null);
  const [gerandoProposta, setGerandoProposta] = useState(false);
  const [fechandoVenda, setFechandoVenda] = useState(false);
  const [vendaFechadaRes, setVendaFechadaRes] = useState<{
    codigo: string;
    linkRecibo: string;
    whatsappEnviado: boolean;
  } | null>(null);

  // Aba Ranking & Minha Evolução
  const [subRanking, setSubRanking] = useState<'equipe' | 'evolucao'>('equipe');
  const [rankingDias, setRankingDias] = useState(30);
  const [ranking, setRanking] = useState<RankingResult | null>(null);
  const [evolucaoMetas, setEvolucaoMetas] = useState<EvolucaoItem[]>([]);
  const [loadingRanking, setLoadingRanking] = useState(false);

  // Lê token/loja_id da URL ou localStorage e verifica sessão do ERP
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const tUrl = sp.get('token') || '';
    const lUrl = sp.get('loja_id') || '';
    const savedToken = tUrl || window.localStorage.getItem('pc_crm_bridge_token') || '';
    const savedLoja = lUrl || window.localStorage.getItem('pc_crm_bridge_loja') || '';
    if (tUrl) window.localStorage.setItem('pc_crm_bridge_token', tUrl);
    if (lUrl) window.localStorage.setItem('pc_crm_bridge_loja', lUrl);
    setToken(savedToken);
    setLojaId(savedLoja);

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (data.session?.access_token) {
          setSessaoAtiva(true);
          setBearerSessao(data.session.access_token);
        }
      })
      .catch(() => {});
  }, []);

  const autenticado = Boolean(token || sessaoAtiva);

  const obterHeadersBridge = useCallback(() => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) h['X-PhoneCenter-CRM-Key'] = token;
    else if (bearerSessao) h.Authorization = `Bearer ${bearerSessao}`;
    if (lojaId) h['x-phonecenter-loja-id'] = lojaId;
    return h;
  }, [token, bearerSessao, lojaId]);

  const mostrarFeedback = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 3200);
  };

  const copiarTexto = async (texto: string, id: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiadoId(id);
      setTimeout(() => setCopiadoId(null), 1800);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = texto;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopiadoId(id);
      setTimeout(() => setCopiadoId(null), 1800);
    }
  };

  const enviarDiretoNoChat = async (texto: string, telefoneOpcional?: string) => {
    const res = await fetch('/api/crm-bridge/enviar-mensagem', {
      method: 'POST',
      headers: obterHeadersBridge(),
      credentials: 'include',
      body: JSON.stringify({
        conversationId: contatoCtx.conversationId || undefined,
        telefone: telefoneOpcional || contatoCtx.telefone || cliente360?.cliente?.telefone || '',
        texto,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      mostrarFeedback(`Enviado direto no chat (${data.canalUsado})!`);
      return true;
    }
    await copiarTexto(texto, 'fallback-copy');
    mostrarFeedback(data.error || 'Copiado para colar no chat.');
    return false;
  };

  const carregarEstoque = useCallback(async () => {
    if (!autenticado) return;
    setLoadingEstoque(true);
    setErroAuth(null);
    try {
      const qs = new URLSearchParams();
      if (buscaEstoque.trim()) qs.set('q', buscaEstoque.trim());
      if (condicaoFiltro) qs.set('condicao', condicaoFiltro);
      qs.set('limit', '40');
      const res = await fetch(`/api/crm-bridge/estoque?${qs.toString()}`, {
        headers: obterHeadersBridge(),
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        if (res.status === 401) {
          setErroAuth(data.error || 'Token ou sessão necessária.');
        } else {
          setErroAuth(data.error || 'Erro ao carregar estoque.');
        }
        return;
      }
      if (data.loja?.nome) setLojaNome(data.loja.nome);
      setEstoque(data.itens || []);
    } catch {
      setErroAuth('Falha de rede ao consultar PhoneCenter ERP.');
    } finally {
      setLoadingEstoque(false);
    }
  }, [autenticado, buscaEstoque, condicaoFiltro, obterHeadersBridge]);

  const buscarDadosCliente = useCallback(
    async (termoRaw: string, nomeOpcional?: string) => {
      if (!autenticado) return;
      const termo = termoRaw.trim();
      if (!termo && !nomeOpcional) return;
      setLoadingCliente(true);
      try {
        const qs = new URLSearchParams();
        const soDigitos = termo.replace(/\D/g, '');
        if (soDigitos.length === 11 && !termo.includes('+')) {
          qs.set('cpf', soDigitos);
          qs.set('telefone', soDigitos);
        } else if (soDigitos.length >= 8) {
          qs.set('telefone', soDigitos);
        } else if (termo) {
          qs.set('nome', termo);
        }
        if (nomeOpcional) qs.set('nome', nomeOpcional);

        const res = await fetch(`/api/crm-bridge/clientes/lookup?${qs.toString()}`, {
          headers: obterHeadersBridge(),
          credentials: 'include',
        });
        const data = await res.json();
        if (res.ok && data.ok) {
          if (data.loja?.nome) setLojaNome(data.loja.nome);
          setCliente360(data);
        }
      } finally {
        setLoadingCliente(false);
      }
    },
    [autenticado, obterHeadersBridge]
  );

  const checarChamadaAtiva = useCallback(async () => {
    if (!autenticado) return;
    try {
      const res = await fetch('/api/crm-bridge/telefonia', {
        headers: obterHeadersBridge(),
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok && data.ok && data.chamadaAtiva) {
        setChamadaAtiva(data.chamadaAtiva);
        if (data.cliente360Ativo && !cliente360) {
          setCliente360(data.cliente360Ativo);
        }
      } else {
        setChamadaAtiva(null);
      }
    } catch {
      // ignora
    }
  }, [autenticado, obterHeadersBridge, cliente360]);

  const carregarModelosTroca = useCallback(async () => {
    if (!autenticado || modelosTroca.length > 0) return;
    try {
      const res = await fetch('/api/crm-bridge/simular', {
        headers: obterHeadersBridge(),
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok && data.ok && Array.isArray(data.modelosTroca)) {
        setModelosTroca(data.modelosTroca);
      }
    } catch {
      // ignora
    }
  }, [autenticado, obterHeadersBridge, modelosTroca.length]);

  const carregarRanking = useCallback(async () => {
    if (!autenticado) return;
    setLoadingRanking(true);
    try {
      const [rRes, mRes] = await Promise.all([
        fetch(`/api/crm-bridge/ranking?dias=${rankingDias}`, {
          headers: obterHeadersBridge(),
          credentials: 'include',
        }),
        fetch('/api/crm-bridge/metas', {
          headers: obterHeadersBridge(),
          credentials: 'include',
        }),
      ]);
      const rData = await rRes.json();
      const mData = await mRes.json().catch(() => ({}));
      if (rRes.ok && rData.ok) {
        if (rData.loja?.nome) setLojaNome(rData.loja.nome);
        setRanking(rData);
      }
      if (mRes.ok && mData.ok && Array.isArray(mData.evolucao)) {
        setEvolucaoMetas(mData.evolucao);
      }
    } finally {
      setLoadingRanking(false);
    }
  }, [autenticado, rankingDias, obterHeadersBridge]);

  // Escuta postMessage do EvoCRM Dashboard App (captura contato + conversationId)
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      try {
        const payload =
          typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        const ctx = payload?.data || payload;
        const contact = ctx?.contact || ctx?.conversation?.meta?.sender;
        const convId = String(ctx?.conversation?.id || ctx?.id || '');
        if (contact?.phone_number || contact?.name || convId) {
          const tel = String(contact?.phone_number || '');
          const nome = String(contact?.name || '');
          setContatoCtx({ nome, telefone: tel, conversationId: convId });
          if (tel || nome) {
            setBuscaCliente(tel || nome);
            if (autenticado) buscarDadosCliente(tel || nome, nome);
          }
        }
      } catch {
        // Ignora mensagens não JSON
      }
    };

    window.addEventListener('message', onMessage);
    try {
      window.parent?.postMessage('chatwoot-dashboard-app:fetch-info', '*');
    } catch {
      // fora de iframe
    }
    return () => window.removeEventListener('message', onMessage);
  }, [autenticado, buscarDadosCliente]);

  useEffect(() => {
    if (!autenticado) return;
    const t = setTimeout(() => {
      carregarEstoque();
    }, 250);
    return () => clearTimeout(t);
  }, [autenticado, buscaEstoque, condicaoFiltro, carregarEstoque]);

  useEffect(() => {
    if (aba === 'cliente') checarChamadaAtiva();
    if (aba === 'simulador') carregarModelosTroca();
    if (aba === 'ranking') carregarRanking();
  }, [aba, checarChamadaAtiva, carregarModelosTroca, carregarRanking]);

  const executarSimulacao = async (overrides?: {
    trocaModelo?: string;
    trocaCapacidade?: string;
    trocaBateria?: string;
    trocaTela?: string;
    trocaCarcaca?: string;
    trocaFaceId?: boolean;
    usarTroca?: boolean;
  }) => {
    if (!autenticado) return;
    const valorNum = Number(valorAparelho.replace(',', '.')) || 0;
    if (valorNum <= 0) return;
    setLoadingSim(true);
    try {
      const ativoTroca = overrides?.usarTroca ?? usarTroca;
      const res = await fetch('/api/crm-bridge/simular', {
        method: 'POST',
        headers: obterHeadersBridge(),
        credentials: 'include',
        body: JSON.stringify({
          modeloNovo: modeloNovo || 'Aparelho Selecionado',
          valorAparelho: valorNum,
          entradaPix: Number(entradaPix.replace(',', '.')) || 0,
          valorTrocaManual: valorTrocaManual
            ? Number(valorTrocaManual.replace(',', '.'))
            : undefined,
          troca: ativoTroca
            ? {
                modelo: overrides?.trocaModelo || trocaModelo,
                capacidade: overrides?.trocaCapacidade || trocaCapacidade,
                condicoes: {
                  bateriaPercentual: Number(overrides?.trocaBateria || trocaBateria) || 85,
                  estadoTela: overrides?.trocaTela || trocaTela,
                  estadoCarcaca: overrides?.trocaCarcaca || trocaCarcaca,
                  faceIdFunciona: overrides?.trocaFaceId ?? trocaFaceId,
                },
              }
            : undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setSimulacao(data);
      }
    } finally {
      setLoadingSim(false);
    }
  };

  const avaliarFotoTroca = async (file: File) => {
    setAvaliandoFoto(true);
    setObsFotoIa(null);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Falha ao ler imagem.'));
        reader.readAsDataURL(file);
      });

      const res = await fetch('/api/crm-bridge/avaliar-foto-troca', {
        method: 'POST',
        headers: obterHeadersBridge(),
        credentials: 'include',
        body: JSON.stringify({ imageBase64: base64, mimeType: file.type }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setObsFotoIa(data.error || 'Não foi possível avaliar a foto.');
        return;
      }

      setUsarTroca(true);
      setTrocaModelo(data.modelo);
      setTrocaCapacidade(data.capacidade);
      setTrocaBateria(String(data.condicoes.bateriaPercentual));
      setTrocaTela(data.condicoes.estadoTela);
      setTrocaCarcaca(data.condicoes.estadoCarcaca);
      setTrocaFaceId(Boolean(data.condicoes.faceIdFunciona));
      setObsFotoIa(
        `IA detectou ${data.modelo} ${data.capacidade} (Bat. ${data.condicoes.bateriaPercentual}%) → Avaliado em ${formatBRL(data.avaliacao.valorFinal)}. ${data.observacoesIa}`
      );

      if (Number(valorAparelho.replace(',', '.')) > 0) {
        await executarSimulacao({
          usarTroca: true,
          trocaModelo: data.modelo,
          trocaCapacidade: data.capacidade,
          trocaBateria: String(data.condicoes.bateriaPercentual),
          trocaTela: data.condicoes.estadoTela,
          trocaCarcaca: data.condicoes.estadoCarcaca,
          trocaFaceId: Boolean(data.condicoes.faceIdFunciona),
        });
      }
    } finally {
      setAvaliandoFoto(false);
    }
  };

  const abrirNoSimulador = (item: EstoqueItem) => {
    setAparelhoSelecionadoId(item.id);
    setModeloNovo(`${item.modelo} ${item.capacidade} ${item.cor}`.trim());
    setValorAparelho(String(item.preco));
    setSimulacao(null);
    setVendaFechadaRes(null);
    setAba('simulador');
  };

  const checarImeiRapido = async () => {
    const clean = imeiConsulta.replace(/\D/g, '');
    if (!clean) return;
    const res = await fetch(`/api/crm-bridge/imei?imei=${encodeURIComponent(clean)}`, {
      headers: obterHeadersBridge(),
      credentials: 'include',
    });
    const data = await res.json();
    if (res.ok && data.ok) setImeiResult(data);
  };

  const iniciarChamadaClickToCall = async (tel: string, nome?: string) => {
    const limpo = tel.replace(/\D/g, '');
    if (!limpo) return;
    try {
      await fetch('/api/crm-bridge/telefonia', {
        method: 'POST',
        headers: obterHeadersBridge(),
        credentials: 'include',
        body: JSON.stringify({
          direcao: 'saida',
          telefone: tel,
          clienteNome: nome || '',
          status: 'em_andamento',
        }),
      });
    } catch {
      // não bloqueia discagem
    }
    window.open(`tel:${limpo}`, '_self');
  };

  const fecharVendaENotinha = async () => {
    const valorNum = Number(valorAparelho.replace(',', '.')) || 0;
    if (valorNum <= 0 || !modeloNovo) return;
    if (!window.confirm(`Confirmar venda de "${modeloNovo}" (${formatBRL(valorNum)}) e emitir notinha?`)) {
      return;
    }
    setFechandoVenda(true);
    setErroAuth(null);
    try {
      const cliTel = contatoCtx.telefone || cliente360?.cliente?.telefone || '';
      const res = await fetch('/api/crm-bridge/pre-venda', {
        method: 'POST',
        headers: obterHeadersBridge(),
        credentials: 'include',
        body: JSON.stringify({
          aparelhoId: aparelhoSelecionadoId || undefined,
          modeloNovo,
          clienteNome: contatoCtx.nome || cliente360?.cliente?.nome || 'Cliente WhatsApp',
          clienteTelefone: cliTel,
          valorVenda: valorNum,
          valorTroca: simulacao?.valorTroca || 0,
          trocaModelo: usarTroca ? `${trocaModelo} ${trocaCapacidade}` : '',
          entradaPix: Number(entradaPix.replace(',', '.')) || 0,
          formaPagamento: 'pix',
          enviarWhatsapp: Boolean(cliTel),
          conversationId: contatoCtx.conversationId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setErroAuth(data.error || 'Erro ao fechar venda.');
        return;
      }
      setVendaFechadaRes({
        codigo: data.codigo,
        linkRecibo: data.linkRecibo,
        whatsappEnviado: Boolean(data.whatsappEnviado),
      });
      carregarEstoque();
    } finally {
      setFechandoVenda(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col font-sans text-xs">
      {/* Header PhoneCenterCRM */}
      <header className="sticky top-0 z-20 bg-[#0f172a]/95 backdrop-blur border-b border-white/10 px-3 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <img
            src="/logosnome.png"
            alt="PhoneCenterCRM"
            className="w-7 h-7 rounded-lg object-contain bg-[#090d16] p-0.5 border border-[#0066FF]/40"
          />
          <div className="truncate">
            <div className="font-bold text-sm tracking-tight text-white flex items-center gap-1">
              PhoneCenter<span className="text-[#007BFF]">CRM</span>
            </div>
            <div className="text-[10px] text-slate-400 truncate">{lojaNome} • ERP Conectado</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <a
            href="/crm-hub"
            target="_blank"
            rel="noreferrer"
            className="text-[11px] px-2 py-1 rounded-md bg-[#0066FF]/20 hover:bg-[#0066FF]/35 text-blue-200 border border-[#0066FF]/40"
          >
            Suite
          </a>
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className="text-[11px] px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-slate-300 flex items-center gap-1 border border-white/10"
            title="Abrir PhoneCenter ERP"
          >
            ERP <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </header>

      {/* Banner de configuração rápida se não autenticado */}
      {!autenticado && (
        <div className="m-3 p-3 rounded-xl bg-[#0f172a] border border-[#0066FF]/40 space-y-2">
          <div className="font-semibold text-white flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-[#007BFF]" />
            Conectar ao PhoneCenter ERP
          </div>
          <p className="text-slate-400 text-[11px]">
            Informe o <code className="text-blue-300">bridge_token</code> da sua loja (gerado em{' '}
            <code>/crm-config</code>) ou passe <code>?token=...</code> na URL do Dashboard App.
          </p>
          <input
            type="password"
            placeholder="Cole o bridge_token da loja..."
            className="w-full px-2.5 py-1.5 rounded-lg bg-[#090d16] border border-white/15 text-white outline-none focus:border-[#0066FF]"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const v = (e.target as HTMLInputElement).value.trim();
                if (v) {
                  window.localStorage.setItem('pc_crm_bridge_token', v);
                  setToken(v);
                }
              }
            }}
          />
        </div>
      )}

      {feedback && (
        <div className="mx-3 mt-2 p-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-[11px]">
          {feedback}
        </div>
      )}

      {erroAuth && (
        <div className="mx-3 mt-2 p-2.5 rounded-lg bg-red-500/15 border border-red-500/40 text-red-200 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{erroAuth}</span>
        </div>
      )}

      {/* Navegação por abas */}
      <nav className="grid grid-cols-5 gap-1 p-2 bg-[#0f172a]/70 border-b border-white/10">
        {(
          [
            { id: 'estoque', label: 'Estoque', icon: Smartphone },
            { id: 'cliente', label: 'Cliente', icon: UserCheck },
            { id: 'simulador', label: 'Troca', icon: Calculator },
            { id: 'ranking', label: 'Ranking', icon: Trophy },
            { id: 'ops', label: 'Ops', icon: Sliders },
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          const ativo = aba === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setAba(item.id)}
              className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-lg transition text-[11px] font-medium ${
                ativo
                  ? 'bg-[#0066FF] text-white shadow-sm shadow-[#0066FF]/30'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Conteúdo */}
      <main className="flex-1 p-2.5 space-y-2.5 overflow-y-auto">
        {/* ==================== ABA ESTOQUE ==================== */}
        {aba === 'estoque' && (
          <div className="space-y-2.5">
            <div className="flex gap-1.5">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  value={buscaEstoque}
                  onChange={(e) => setBuscaEstoque(e.target.value)}
                  placeholder="Buscar ex: 15pm 256 natural..."
                  className="w-full pl-8 pr-2.5 py-2 rounded-lg bg-[#0f172a] border border-white/10 text-white placeholder:text-slate-500 outline-none focus:border-[#0066FF]"
                />
              </div>
              <button
                onClick={carregarEstoque}
                className="px-2.5 rounded-lg bg-[#0f172a] border border-white/10 hover:border-[#0066FF] text-slate-300"
                title="Atualizar estoque"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingEstoque ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="flex gap-1.5">
              {[
                { val: '', label: 'Todos' },
                { val: 'novo', label: 'Lacrados' },
                { val: 'seminovo', label: 'Seminovos' },
              ].map((f) => (
                <button
                  key={f.val}
                  onClick={() => setCondicaoFiltro(f.val)}
                  className={`px-2.5 py-1 rounded-full text-[11px] border ${
                    condicaoFiltro === f.val
                      ? 'bg-[#0066FF]/20 border-[#0066FF] text-blue-300'
                      : 'bg-[#0f172a] border-white/10 text-slate-400'
                  }`}
                >
                  {f.label}
                </button>
              ))}
              <span className="ml-auto text-[11px] text-slate-400 self-center">
                {estoque.length} un.
              </span>
            </div>

            {/* Checar IMEI rápido */}
            <div className="p-2 rounded-xl bg-[#0f172a] border border-white/10 space-y-1.5">
              <div className="flex gap-1.5">
                <input
                  value={imeiConsulta}
                  onChange={(e) => setImeiConsulta(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && checarImeiRapido()}
                  placeholder="Checar IMEI (15 dígitos / Luhn + histórico)..."
                  className="flex-1 px-2.5 py-1 rounded-lg bg-[#090d16] border border-white/10 text-[11px] text-white"
                />
                <button
                  onClick={checarImeiRapido}
                  className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-[11px] text-white"
                >
                  Checar
                </button>
              </div>
              {imeiResult && (
                <div
                  className={`p-1.5 rounded text-[10px] ${
                    imeiResult.restricaoInterna || !imeiResult.validacao.valido
                      ? 'bg-red-500/15 text-red-200 border border-red-500/30'
                      : 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30'
                  }`}
                >
                  <div>
                    Luhn: <strong>{imeiResult.validacao.valido ? 'Válido' : imeiResult.validacao.motivo}</strong>
                  </div>
                  {imeiResult.restricaoInterna && (
                    <div className="font-bold">{imeiResult.motivoRestricao}</div>
                  )}
                  {imeiResult.aparelhos.length > 0 && (
                    <div>Encontrado no estoque: {String(imeiResult.aparelhos[0].modelo || '')}</div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              {estoque.map((item) => (
                <div
                  key={item.id}
                  className={`p-2.5 rounded-xl bg-[#0f172a] border transition space-y-1.5 ${
                    item.reservado
                      ? 'border-amber-500/50 bg-amber-500/5'
                      : 'border-white/10 hover:border-[#0066FF]/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-white text-[12px] truncate flex items-center gap-1.5">
                        <span>
                          {item.modelo} {item.capacidade}
                        </span>
                        {item.reservado && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[9px] font-bold">
                            <Lock className="w-2.5 h-2.5" /> RESERVADO
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 flex flex-wrap gap-1.5 mt-0.5">
                        {item.cor && <span>{item.cor}</span>}
                        {item.saudeBateria && (
                          <span className="text-emerald-400">🔋 {item.saudeBateria}</span>
                        )}
                        <span className="px-1.5 py-0.2 rounded bg-white/5 uppercase text-[10px]">
                          {item.condicao}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold text-emerald-400 text-[13px]">
                        {formatBRL(item.preco)}
                      </div>
                      {item.imeiFinal && (
                        <div className="text-[10px] text-slate-500">{item.imeiFinal}</div>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-1 pt-1">
                    <button
                      onClick={() => enviarDiretoNoChat(item.textoWhatsapp)}
                      className="py-1.5 px-1.5 rounded-lg bg-emerald-600/25 hover:bg-emerald-600/40 border border-emerald-500/40 text-emerald-200 flex items-center justify-center gap-1 font-medium"
                      title="Enviar oferta direto na conversa"
                    >
                      <Send className="w-3 h-3" /> Enviar
                    </button>
                    <button
                      onClick={() => copiarTexto(item.textoWhatsapp, item.id)}
                      className="py-1.5 px-1.5 rounded-lg bg-[#0066FF]/20 hover:bg-[#0066FF]/35 border border-[#0066FF]/40 text-blue-200 flex items-center justify-center gap-1 font-medium"
                    >
                      {copiadoId === item.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" /> Copiado
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" /> Copiar
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => abrirNoSimulador(item)}
                      className="py-1.5 px-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 flex items-center justify-center gap-1"
                    >
                      <Calculator className="w-3 h-3" /> Simular
                    </button>
                  </div>
                </div>
              ))}
              {!loadingEstoque && estoque.length === 0 && autenticado && (
                <div className="text-center py-8 text-slate-500">
                  Nenhum aparelho disponível encontrado.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================== ABA CLIENTE 360 ==================== */}
        {aba === 'cliente' && (
          <div className="space-y-2.5">
            {chamadaAtiva && (
              <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/50 text-emerald-100 space-y-1 animate-pulse">
                <div className="font-bold flex items-center gap-1.5 text-[11px]">
                  <Phone className="w-3.5 h-3.5" /> Chamada {chamadaAtiva.status}:{' '}
                  {chamadaAtiva.cliente_nome || chamadaAtiva.telefone}
                </div>
                <div className="text-[10px] text-emerald-200">
                  Telefone: {chamadaAtiva.telefone}
                </div>
              </div>
            )}

            {contatoCtx.nome && (
              <div className="px-2.5 py-1.5 rounded-lg bg-[#0066FF]/15 border border-[#0066FF]/30 text-blue-200 text-[11px] flex items-center justify-between gap-2">
                <span className="truncate">
                  Chat: <strong>{contatoCtx.nome}</strong>{' '}
                  {contatoCtx.telefone ? `(${contatoCtx.telefone})` : ''}
                </span>
                {contatoCtx.telefone && (
                  <button
                    onClick={() => iniciarChamadaClickToCall(contatoCtx.telefone, contatoCtx.nome)}
                    className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] flex items-center gap-1 shrink-0"
                  >
                    <Phone className="w-2.5 h-2.5" /> Ligar
                  </button>
                )}
              </div>
            )}

            <div className="flex gap-1.5">
              <input
                value={buscaCliente}
                onChange={(e) => setBuscaCliente(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && buscarDadosCliente(buscaCliente)}
                placeholder="Telefone, CPF ou nome..."
                className="flex-1 px-2.5 py-2 rounded-lg bg-[#0f172a] border border-white/10 text-white outline-none focus:border-[#0066FF]"
              />
              <button
                onClick={() => buscarDadosCliente(buscaCliente)}
                className="px-3 rounded-lg bg-[#0066FF] hover:bg-[#0052CC] text-white font-medium"
              >
                {loadingCliente ? '...' : 'Buscar'}
              </button>
            </div>

            {cliente360 && (
              <div className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 rounded-xl bg-[#0f172a] border border-white/10">
                    <div className="text-[10px] text-slate-400">Total em Compras</div>
                    <div className="text-sm font-bold text-emerald-400">
                      {formatBRL(cliente360.resumo.totalGasto)}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {cliente360.resumo.totalCompras} compra(s)
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#0f172a] border border-white/10">
                    <div className="text-[10px] text-slate-400">Garantias / OS</div>
                    <div className="text-sm font-bold text-blue-400">
                      {cliente360.resumo.garantiasAtivas} ativ. / {cliente360.resumo.osAbertas} OS
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {cliente360.cliente?.cpf ? `CPF ${cliente360.cliente.cpf}` : 'Sem CPF'}
                    </div>
                  </div>
                </div>

                {cliente360.cliente?.telefone && (
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={() =>
                        iniciarChamadaClickToCall(
                          cliente360.cliente!.telefone,
                          cliente360.cliente!.nome
                        )
                      }
                      className="py-1.5 px-2 rounded-lg bg-emerald-600/25 hover:bg-emerald-600/40 border border-emerald-500/40 text-emerald-200 flex items-center justify-center gap-1 font-semibold"
                    >
                      <Phone className="w-3 h-3" /> Ligar Agora
                    </button>
                    <button
                      onClick={() =>
                        enviarDiretoNoChat(
                          `Olá *${cliente360.cliente!.nome}*! Conferi seu cadastro na ${lojaNome}: você possui ${cliente360.resumo.garantiasAtivas} garantia(s) ativa(s) e ${cliente360.resumo.osAbertas} OS em aberto.`
                        )
                      }
                      className="py-1.5 px-2 rounded-lg bg-[#0066FF]/25 hover:bg-[#0066FF]/40 border border-[#0066FF]/40 text-blue-200 flex items-center justify-center gap-1 font-semibold"
                    >
                      <Send className="w-3 h-3" /> Enviar Resumo
                    </button>
                  </div>
                )}

                {cliente360.compras.length > 0 && (
                  <div className="p-2.5 rounded-xl bg-[#0f172a] border border-white/10 space-y-1.5">
                    <div className="font-semibold text-white text-[11px]">Histórico de Compras</div>
                    {cliente360.compras.map((c) => (
                      <div
                        key={c.id}
                        className="flex justify-between items-center py-1 border-b border-white/5 last:border-0"
                      >
                        <div className="truncate pr-2">
                          <div className="text-slate-200 truncate">{c.aparelhoDescricao}</div>
                          <div className="text-[10px] text-slate-500">
                            {c.dataPagamento?.slice(0, 10)} • {c.metodo}
                          </div>
                        </div>
                        <span className="font-semibold text-emerald-400 shrink-0">
                          {formatBRL(c.valor)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {cliente360.garantias.length > 0 && (
                  <div className="p-2.5 rounded-xl bg-[#0f172a] border border-white/10 space-y-1.5">
                    <div className="font-semibold text-white text-[11px] flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Garantias
                    </div>
                    {cliente360.garantias.map((g, i) => (
                      <div key={i} className="flex justify-between text-[11px]">
                        <span className="text-slate-200 truncate">{g.aparelhoModelo}</span>
                        <span className="text-slate-400 shrink-0">até {g.dataFim?.slice(0, 10)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {cliente360.ordensServico.length > 0 && (
                  <div className="p-2.5 rounded-xl bg-[#0f172a] border border-white/10 space-y-1.5">
                    <div className="font-semibold text-white text-[11px] flex items-center gap-1">
                      <Wrench className="w-3.5 h-3.5 text-amber-400" /> Ordens de Serviço
                    </div>
                    {cliente360.ordensServico.map((o, i) => (
                      <div key={i} className="text-[11px] border-b border-white/5 pb-1 last:border-0">
                        <div className="flex justify-between">
                          <span className="font-medium text-white">
                            #{o.numeroOS} {o.aparelhoModelo}
                          </span>
                          <span className="text-amber-300 uppercase text-[10px]">{o.status}</span>
                        </div>
                        <div className="text-[10px] text-slate-400">{o.defeito}</div>
                      </div>
                    ))}
                  </div>
                )}

                {!cliente360.encontrado && (
                  <div className="text-center py-6 text-slate-500">
                    Cliente ainda não cadastrado no PhoneCenter ERP.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ==================== ABA SIMULADOR TROCA & PROPOSTA & VENDA ==================== */}
        {aba === 'simulador' && (
          <div className="space-y-2.5">
            <div className="p-2.5 rounded-xl bg-[#0f172a] border border-white/10 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold text-white text-[12px]">
                  Simulador Troca &amp; Fechamento
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      enviarDiretoNoChat(
                        mensagemPedirAvaliacaoTroca({
                          nomeCliente: contatoCtx.nome || cliente360?.cliente?.nome || undefined,
                          nomeLoja: lojaNome,
                          modeloInteresse: modeloNovo || undefined,
                        })
                      )
                    }
                    className="px-2 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/35 border border-amber-500/40 text-amber-200 text-[10px] font-semibold flex items-center gap-1"
                    title="Envia checklist pronto pedindo dados e fotos do aparelho usado para avaliação de volta"
                  >
                    🔄 Pedir Volta
                  </button>
                  <label className="px-2 py-1 rounded-lg bg-[#0066FF]/20 hover:bg-[#0066FF]/35 border border-[#0066FF]/40 text-blue-200 text-[10px] font-semibold flex items-center gap-1 cursor-pointer">
                    <Camera className="w-3 h-3" />
                    {avaliandoFoto ? 'Analisando...' : 'Foto IA'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={avaliandoFoto}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) avaliarFotoTroca(f);
                      }}
                    />
                  </label>
                </div>
              </div>

              {obsFotoIa && (
                <div className="p-2 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-200 text-[10px]">
                  {obsFotoIa}
                </div>
              )}

              <input
                value={modeloNovo}
                onChange={(e) => setModeloNovo(e.target.value)}
                placeholder="Aparelho desejado (ex: iPhone 16 Pro 256GB)"
                className="w-full px-2.5 py-1.5 rounded-lg bg-[#090d16] border border-white/10 text-white"
              />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400">Valor Aparelho (R$)</label>
                  <input
                    type="number"
                    value={valorAparelho}
                    onChange={(e) => setValorAparelho(e.target.value)}
                    placeholder="7290"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[#090d16] border border-white/10 text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400">Entrada Pix (R$)</label>
                  <input
                    type="number"
                    value={entradaPix}
                    onChange={(e) => setEntradaPix(e.target.value)}
                    placeholder="0"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[#090d16] border border-white/10 text-white"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-slate-300 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={usarTroca}
                  onChange={(e) => setUsarTroca(e.target.checked)}
                  className="accent-[#0066FF]"
                />
                <span>Cliente dará iPhone usado na troca</span>
              </label>

              {usarTroca && (
                <div className="p-2 rounded-lg bg-[#090d16] border border-white/10 space-y-2">
                  <div className="grid grid-cols-2 gap-1.5">
                    <select
                      value={trocaModelo}
                      onChange={(e) => setTrocaModelo(e.target.value)}
                      className="px-2 py-1.5 rounded bg-[#0f172a] border border-white/10 text-white"
                    >
                      {(modelosTroca.length
                        ? modelosTroca
                        : ['iPhone 11', 'iPhone 12', 'iPhone 13', 'iPhone 14', 'iPhone 15', 'iPhone 15 Pro Max']
                      ).map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                    <select
                      value={trocaCapacidade}
                      onChange={(e) => setTrocaCapacidade(e.target.value)}
                      className="px-2 py-1.5 rounded bg-[#0f172a] border border-white/10 text-white"
                    >
                      {['64GB', '128GB', '256GB', '512GB', '1TB'].map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <input
                      type="number"
                      value={trocaBateria}
                      onChange={(e) => setTrocaBateria(e.target.value)}
                      placeholder="Bateria %"
                      className="px-2 py-1.5 rounded bg-[#0f172a] border border-white/10 text-white"
                    />
                    <input
                      type="number"
                      value={valorTrocaManual}
                      onChange={(e) => setValorTrocaManual(e.target.value)}
                      placeholder="Valor manual (opc.)"
                      className="px-2 py-1.5 rounded bg-[#0f172a] border border-white/10 text-white"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <select
                      value={trocaTela}
                      onChange={(e) => setTrocaTela(e.target.value)}
                      className="px-2 py-1.5 rounded bg-[#0f172a] border border-white/10 text-white"
                    >
                      <option value="original_impecavel">Tela Impecável</option>
                      <option value="riscos_leves">Tela Riscos Leves</option>
                      <option value="trocada_compativel">Tela Trocada</option>
                      <option value="trincada_quebrada">Tela Trincada</option>
                    </select>
                    <select
                      value={trocaCarcaca}
                      onChange={(e) => setTrocaCarcaca(e.target.value)}
                      className="px-2 py-1.5 rounded bg-[#0f172a] border border-white/10 text-white"
                    >
                      <option value="impecavel">Carcaça Impecável</option>
                      <option value="marcas_leves">Marcas Leves</option>
                      <option value="amassados_arranhaos">Amassados</option>
                      <option value="trincada_quebrada">Traseira Quebrada</option>
                    </select>
                  </div>
                  <label className="flex items-center gap-2 text-[11px] text-slate-300">
                    <input
                      type="checkbox"
                      checked={trocaFaceId}
                      onChange={(e) => setTrocaFaceId(e.target.checked)}
                      className="accent-[#0066FF]"
                    />
                    Face ID / Biometria funcionando
                  </label>
                </div>
              )}

              <button
                onClick={() => executarSimulacao()}
                disabled={loadingSim || !valorAparelho}
                className="w-full py-2 rounded-lg bg-[#0066FF] hover:bg-[#0052CC] disabled:opacity-50 text-white font-semibold"
              >
                {loadingSim ? 'Calculando...' : 'Calcular Troca & Parcelas'}
              </button>
            </div>

            {simulacao && (() => {
              const montarTextoSimulacao = () => {
                let lista = simulacao.parcelamento;
                if (modoTabelaParcela === 'resumo') {
                  const dest = lista.filter((p) => [6, 10, 12, 18].includes(p.parcelas));
                  lista = dest.length ? dest : lista.slice(0, 4);
                } else if (modoTabelaParcela === 'selecionadas') {
                  const sel = lista.filter((p) => parcelasSelecionadas.includes(p.parcelas));
                  lista = sel.length ? sel : lista.slice(0, 4);
                }
                const linhas: string[] = [
                  `📋 *ORÇAMENTO — ${(lojaNome || 'PhoneCenter').toUpperCase()}*`,
                ];
                if (modeloNovo) linhas.push(`📱 Aparelho: *${modeloNovo}*`);
                linhas.push(`💰 Valor à vista: *${formatBRL(simulacao.valorAparelho)}*`);
                if (simulacao.valorTroca > 0) {
                  const descTroca = usarTroca ? `${trocaModelo} ${trocaCapacidade}`.trim() : 'Aparelho usado';
                  linhas.push(`🔄 Troca (${descTroca}): *-${formatBRL(simulacao.valorTroca)}*`);
                }
                if (simulacao.entradaPix > 0) {
                  linhas.push(`⚡ Entrada Pix: *-${formatBRL(simulacao.entradaPix)}*`);
                }
                linhas.push(`✅ *Saldo restante: ${formatBRL(simulacao.saldoFinanciar)}*`);
                if (lista.length) {
                  linhas.push('', '*Opções no Cartão:*');
                  lista.forEach((p) => {
                    const base = `💳 ${p.parcelas}x de *${formatBRL(p.valorParcela)}*`;
                    linhas.push(mostrarTotalParcela ? `${base} (total ${formatBRL(p.totalComTaxa)})` : base);
                  });
                }
                linhas.push('', '_Simulação sujeita à conferência presencial do aparelho._');
                return linhas.join('\n');
              };
              const textoSimAtual = montarTextoSimulacao();
              const parcela12 = simulacao.parcelamento.find((p) => p.parcelas === 12);

              return (
              <div className="p-2.5 rounded-xl bg-[#0f172a] border border-[#0066FF]/40 space-y-2">
                <div className="flex justify-between text-slate-300">
                  <span>Troca avaliada:</span>
                  <strong className="text-amber-300">{formatBRL(simulacao.valorTroca)}</strong>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white font-semibold">Saldo a pagar:</span>
                  <strong className="text-emerald-400">
                    {formatBRL(simulacao.saldoFinanciar)}
                  </strong>
                </div>

                {/* Controles de envio da tabela de parcelamento */}
                <div className="pt-1 border-t border-white/10 space-y-1.5">
                  <div className="grid grid-cols-3 gap-1">
                    {(
                      [
                        { id: 'resumo', label: 'Resumo' },
                        { id: 'completa', label: 'Completa' },
                        { id: 'selecionadas', label: 'Selecionadas' },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setModoTabelaParcela(m.id)}
                        className={`py-1 px-1.5 rounded text-[10px] font-semibold border ${
                          modoTabelaParcela === m.id
                            ? 'bg-[#0066FF]/30 border-[#0066FF] text-white'
                            : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                  <label className="flex items-center gap-1.5 text-[10px] text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={mostrarTotalParcela}
                      onChange={(e) => setMostrarTotalParcela(e.target.checked)}
                      className="accent-[#0066FF]"
                    />
                    Mostrar total com juros na mensagem
                  </label>
                </div>

                <div className="max-h-44 overflow-y-auto divide-y divide-white/5 border-t border-white/10 pt-1">
                  {simulacao.parcelamento.map((p) => {
                    const marcada = parcelasSelecionadas.includes(p.parcelas);
                    return (
                      <div key={p.parcelas} className="py-1 flex items-center justify-between gap-1 text-[11px]">
                        <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                          {modoTabelaParcela === 'selecionadas' && (
                            <input
                              type="checkbox"
                              checked={marcada}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setParcelasSelecionadas((prev) => [...prev, p.parcelas]);
                                } else {
                                  setParcelasSelecionadas((prev) => prev.filter((x) => x !== p.parcelas));
                                }
                              }}
                              className="accent-[#0066FF]"
                            />
                          )}
                          <span>{p.parcelas}x no cartão</span>
                        </label>
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-white">
                            {formatBRL(p.valorParcela)}{' '}
                            <span className="text-[10px] text-slate-500">
                              ({formatBRL(p.totalComTaxa)})
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              enviarDiretoNoChat(
                                `💳 *${modeloNovo || 'Simulação'}* em *${p.parcelas}x de ${formatBRL(p.valorParcela)}*${mostrarTotalParcela ? ` (total ${formatBRL(p.totalComTaxa)})` : ''}`
                              )
                            }
                            className="px-1.5 py-0.5 rounded bg-emerald-600/25 hover:bg-emerald-600/45 text-emerald-200 text-[10px]"
                            title={`Enviar apenas ${p.parcelas}x no chat`}
                          >
                            💬
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="grid grid-cols-3 gap-1 pt-1">
                  <button
                    onClick={() => enviarDiretoNoChat(textoSimAtual)}
                    className="py-1.5 px-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center justify-center gap-1"
                  >
                    <Send className="w-3 h-3" /> Enviar
                  </button>
                  <button
                    onClick={() => copiarTexto(textoSimAtual, 'sim-wa')}
                    className="py-1.5 px-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white font-semibold flex items-center justify-center gap-1"
                  >
                    {copiadoId === 'sim-wa' ? (
                      <>
                        <Check className="w-3 h-3" /> Copiado
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" /> Copiar
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="py-1.5 px-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white flex items-center justify-center gap-1"
                    title="Imprimir / Salvar Proposta PDF"
                  >
                    <Printer className="w-3 h-3" /> PDF
                  </button>
                </div>

                {/* Mensagens prontas de avaliação de volta (troca) */}
                {simulacao.valorTroca > 0 && (
                  <div className="grid grid-cols-2 gap-1 pt-1">
                    <button
                      type="button"
                      onClick={() =>
                        enviarDiretoNoChat(
                          mensagemResultadoAvaliacaoTroca({
                            nomeLoja: lojaNome,
                            nomeCliente: contatoCtx.nome || cliente360?.cliente?.nome || undefined,
                            modeloUsado: usarTroca ? trocaModelo : 'Seu aparelho',
                            capacidadeUsado: usarTroca ? trocaCapacidade : undefined,
                            valorAvaliado: simulacao.valorTroca,
                            modeloNovo: modeloNovo || undefined,
                            valorNovo: simulacao.valorAparelho,
                            diferencaPix: simulacao.saldoFinanciar,
                            parcela12x: parcela12?.valorParcela,
                          })
                        )
                      }
                      className="py-1.5 px-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/35 border border-amber-500/40 text-amber-200 text-[10px] font-semibold"
                    >
                      🔄 Enviar Pré-Avaliação
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        enviarDiretoNoChat(
                          mensagemAgendarConferenciaTroca({
                            nomeLoja: lojaNome,
                            nomeCliente: contatoCtx.nome || cliente360?.cliente?.nome || undefined,
                            modeloNovo: modeloNovo || undefined,
                          })
                        )
                      }
                      className="py-1.5 px-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 text-[10px] font-semibold"
                    >
                      📍 Agendar Conferência
                    </button>
                  </div>
                )}

                <button
                  disabled={gerandoProposta}
                  onClick={async () => {
                    if (!autenticado) return;
                    const valorNum = Number(valorAparelho.replace(',', '.')) || 0;
                    if (valorNum <= 0) return;
                    setGerandoProposta(true);
                    try {
                      const res = await fetch('/api/crm-bridge/propostas', {
                        method: 'POST',
                        headers: obterHeadersBridge(),
                        credentials: 'include',
                        body: JSON.stringify({
                          clienteNome: contatoCtx.nome || cliente360?.cliente?.nome || 'Cliente',
                          clienteTelefone: contatoCtx.telefone || cliente360?.cliente?.telefone || '',
                          modeloNovo: modeloNovo || 'Aparelho Selecionado',
                          valorAparelho: valorNum,
                          entradaPix: Number(entradaPix.replace(',', '.')) || 0,
                          valorTrocaManual: valorTrocaManual
                            ? Number(valorTrocaManual.replace(',', '.'))
                            : undefined,
                          troca: usarTroca
                            ? {
                                modelo: trocaModelo,
                                capacidade: trocaCapacidade,
                                condicoes: {
                                  bateriaPercentual: Number(trocaBateria) || 85,
                                  estadoTela: trocaTela,
                                  estadoCarcaca: trocaCarcaca,
                                  faceIdFunciona: trocaFaceId,
                                },
                              }
                            : undefined,
                        }),
                      });
                      const data = await res.json();
                      if (res.ok && data.ok && data.urlPublica) {
                        setPropostaLink({
                          url: data.urlPublica,
                          protocolo: data.proposta?.protocolo || '#PROP',
                        });
                        if (data.proposta?.texto_whatsapp) {
                          await enviarDiretoNoChat(data.proposta.texto_whatsapp);
                        }
                      } else {
                        setErroAuth(data.error || 'Erro ao gerar link de proposta.');
                      }
                    } finally {
                      setGerandoProposta(false);
                    }
                  }}
                  className="w-full py-1.5 px-2 rounded-lg bg-[#0066FF]/25 hover:bg-[#0066FF]/40 border border-[#0066FF]/50 text-blue-200 font-semibold flex items-center justify-center gap-1.5"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  {gerandoProposta ? 'Gerando link oficial...' : 'Gerar Link Oficial & Enviar'}
                </button>

                <button
                  disabled={fechandoVenda}
                  onClick={fecharVendaENotinha}
                  className="w-full py-2 px-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold flex items-center justify-center gap-1.5 shadow"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {fechandoVenda ? 'Registrando & Emitindo PDF...' : 'Fechar Venda & Notinha PDF'}
                </button>

                {propostaLink && (
                  <div className="p-2 rounded-lg bg-[#090d16] border border-emerald-500/30 flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-emerald-300 truncate">
                      {propostaLink.protocolo}: {propostaLink.url}
                    </span>
                    <a
                      href={propostaLink.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-300 underline shrink-0"
                    >
                      Abrir
                    </a>
                  </div>
                )}

                {vendaFechadaRes && (
                  <div className="p-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 space-y-1 text-[11px]">
                    <div className="font-bold text-emerald-200">
                      ✅ Venda #{vendaFechadaRes.codigo} registrada!
                    </div>
                    <div className="text-[10px] text-emerald-100">
                      {vendaFechadaRes.whatsappEnviado
                        ? 'Recibo PDF enviado no WhatsApp do cliente!'
                        : 'Recibo digital pronto para enviar.'}
                    </div>
                    <a
                      href={vendaFechadaRes.linkRecibo}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-200 underline inline-block"
                    >
                      Abrir Recibo #{vendaFechadaRes.codigo}
                    </a>
                  </div>
                )}
              </div>
              );
            })()}
          </div>
        )}

        {/* ==================== ABA RANKING & MINHA EVOLUÇÃO ==================== */}
        {aba === 'ranking' && (
          <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-1 bg-[#0f172a] p-1 rounded-xl border border-white/10">
              <button
                onClick={() => setSubRanking('equipe')}
                className={`py-1 rounded-lg text-[11px] font-medium ${
                  subRanking === 'equipe' ? 'bg-[#0066FF] text-white' : 'text-slate-400'
                }`}
              >
                Ranking Equipe
              </button>
              <button
                onClick={() => setSubRanking('evolucao')}
                className={`py-1 rounded-lg text-[11px] font-medium ${
                  subRanking === 'evolucao' ? 'bg-[#0066FF] text-white' : 'text-slate-400'
                }`}
              >
                Minha Evolução
              </button>
            </div>

            {subRanking === 'equipe' && (
              <>
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-white text-[12px]">
                    Ranking de Vendas (ERP Real)
                  </div>
                  <div className="flex gap-1">
                    {[7, 30, 90].map((d) => (
                      <button
                        key={d}
                        onClick={() => setRankingDias(d)}
                        className={`px-2 py-0.5 rounded text-[11px] border ${
                          rankingDias === d
                            ? 'bg-[#0066FF] border-[#0066FF] text-white'
                            : 'bg-[#0f172a] border-white/10 text-slate-400'
                        }`}
                      >
                        {d}d
                      </button>
                    ))}
                  </div>
                </div>

                {loadingRanking && (
                  <div className="text-center py-6 text-slate-400">Carregando ranking...</div>
                )}

                {ranking && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2.5 rounded-xl bg-[#0f172a] border border-white/10">
                        <div className="text-[10px] text-slate-400">
                          Faturamento ({ranking.periodoDias}d)
                        </div>
                        <div className="text-sm font-bold text-emerald-400">
                          {formatBRL(ranking.faturamentoTotal)}
                        </div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-[#0f172a] border border-white/10">
                        <div className="text-[10px] text-slate-400">Vendas / Ticket Médio</div>
                        <div className="text-sm font-bold text-blue-400">
                          {ranking.totalVendas} • {formatBRL(ranking.ticketMedioGeral)}
                        </div>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-[#0f172a] border border-white/10 space-y-1.5">
                      <div className="font-semibold text-white text-[11px]">Top Vendedores</div>
                      {ranking.ranking.map((r, idx) => (
                        <div
                          key={r.vendedor}
                          className="flex items-center justify-between py-1 border-b border-white/5 last:border-0"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-5 h-5 rounded-full bg-[#0066FF]/20 text-blue-300 flex items-center justify-center font-bold text-[10px]">
                              {idx + 1}
                            </span>
                            <div className="truncate">
                              <div className="text-white font-medium truncate">{r.vendedor}</div>
                              <div className="text-[10px] text-slate-400">
                                {r.quantidade} venda(s) • TM {formatBRL(r.ticketMedio)}
                              </div>
                            </div>
                          </div>
                          <span className="font-bold text-emerald-400 shrink-0">
                            {formatBRL(r.faturamento)}
                          </span>
                        </div>
                      ))}
                      {ranking.ranking.length === 0 && (
                        <div className="text-slate-500 text-center py-3">
                          Sem vendas registradas no período.
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
            )}

            {subRanking === 'evolucao' && (
              <div className="p-2.5 rounded-xl bg-[#0f172a] border border-white/10 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-white text-[11px]">
                    Metas &amp; Comissão do Mês
                  </span>
                  <a
                    href="/crm-hub?tab=metas"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-blue-300 underline"
                  >
                    Configurar Metas
                  </a>
                </div>
                {evolucaoMetas.map((ev) => (
                  <div
                    key={ev.vendedor}
                    className="p-2 rounded-lg bg-[#090d16] border border-white/5 space-y-1"
                  >
                    <div className="flex justify-between text-[11px]">
                      <strong className="text-white">{ev.vendedor}</strong>
                      <span className="text-emerald-400 font-bold">{formatBRL(ev.faturamento)}</span>
                    </div>
                    {ev.metaFaturamento > 0 && (
                      <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full bg-[#0066FF]"
                          style={{ width: `${Math.min(100, ev.progressoFatPct)}%` }}
                        />
                      </div>
                    )}
                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span>
                        {ev.quantidade} venda(s)
                        {ev.metaFaturamento > 0
                          ? ` • Meta ${formatBRL(ev.metaFaturamento)} (${ev.progressoFatPct}%)`
                          : ''}
                      </span>
                      {ev.comissaoEstimada > 0 && (
                        <span className="text-blue-300">Comissão {formatBRL(ev.comissaoEstimada)}</span>
                      )}
                    </div>
                  </div>
                ))}
                {evolucaoMetas.length === 0 && (
                  <div className="text-center py-4 text-slate-500">
                    Nenhuma meta ou venda registrada neste mês ainda.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ==================== ABA OPS (ADS, PIX, CHAT INTERNO, CONEXÕES) ==================== */}
        {aba === 'ops' && (
          <CrmOpsPanel
            headersBridge={obterHeadersBridge()}
            autenticado={autenticado}
            conversationId={contatoCtx.conversationId}
            clienteCtx={{ nome: contatoCtx.nome, telefone: contatoCtx.telefone }}
            estoqueItens={estoque}
            onEnviadoChat={mostrarFeedback}
          />
        )}
      </main>
    </div>
  );
}
