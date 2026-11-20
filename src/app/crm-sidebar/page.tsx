'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
} from 'lucide-react';

interface EstoqueItem {
  id: string;
  codigo: string;
  marca: string;
  modelo: string;
  capacidade: string;
  cor: string;
  condicao: string;
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

type AbaId = 'cliente' | 'estoque' | 'simulador' | 'ranking';

const formatBRL = (v: number) =>
  (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function CrmSidebarPage() {
  const [token, setToken] = useState('');
  const [lojaId, setLojaId] = useState('');
  const [lojaNome, setLojaNome] = useState('PhoneCenter');
  const [aba, setAba] = useState<AbaId>('estoque');
  const [erroAuth, setErroAuth] = useState<string | null>(null);
  const [copiadoId, setCopiadoId] = useState<string | null>(null);

  // Contexto vindo do EvoCRM via postMessage
  const [contatoCtx, setContatoCtx] = useState<{ nome: string; telefone: string }>({
    nome: '',
    telefone: '',
  });

  // Aba Estoque
  const [buscaEstoque, setBuscaEstoque] = useState('');
  const [condicaoFiltro, setCondicaoFiltro] = useState<string>('');
  const [estoque, setEstoque] = useState<EstoqueItem[]>([]);
  const [loadingEstoque, setLoadingEstoque] = useState(false);

  // Aba Cliente 360
  const [buscaCliente, setBuscaCliente] = useState('');
  const [cliente360, setCliente360] = useState<Cliente360 | null>(null);
  const [loadingCliente, setLoadingCliente] = useState(false);

  // Aba Simulador Troca & Parcelas
  const [modelosTroca, setModelosTroca] = useState<string[]>([]);
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
  const [loadingSim, setLoadingSim] = useState(false);

  // Aba Ranking
  const [rankingDias, setRankingDias] = useState(30);
  const [ranking, setRanking] = useState<RankingResult | null>(null);
  const [loadingRanking, setLoadingRanking] = useState(false);

  // Lê token/loja_id da URL ou localStorage
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
  }, []);

  const headersBridge = useMemo(() => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) h['X-PhoneCenter-CRM-Key'] = token;
    if (lojaId) h['x-phonecenter-loja-id'] = lojaId;
    return h;
  }, [token, lojaId]);

  const copiarTexto = async (texto: string, id: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiadoId(id);
      setTimeout(() => setCopiadoId(null), 1800);
    } catch {
      // Fallback para iframe sem permissão clipboard
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

  const carregarEstoque = useCallback(async () => {
    if (!token) return;
    setLoadingEstoque(true);
    setErroAuth(null);
    try {
      const qs = new URLSearchParams();
      if (buscaEstoque.trim()) qs.set('q', buscaEstoque.trim());
      if (condicaoFiltro) qs.set('condicao', condicaoFiltro);
      qs.set('limit', '40');
      const res = await fetch(`/api/crm-bridge/estoque?${qs.toString()}`, {
        headers: headersBridge,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setErroAuth(data.error || 'Erro ao carregar estoque.');
        return;
      }
      if (data.loja?.nome) setLojaNome(data.loja.nome);
      setEstoque(data.itens || []);
    } catch {
      setErroAuth('Falha de rede ao consultar PhoneCenter ERP.');
    } finally {
      setLoadingEstoque(false);
    }
  }, [token, buscaEstoque, condicaoFiltro, headersBridge]);

  const buscarDadosCliente = useCallback(
    async (termoRaw: string, nomeOpcional?: string) => {
      if (!token) return;
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
          headers: headersBridge,
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
    [token, headersBridge]
  );

  const carregarModelosTroca = useCallback(async () => {
    if (!token || modelosTroca.length > 0) return;
    try {
      const res = await fetch('/api/crm-bridge/simular', { headers: headersBridge });
      const data = await res.json();
      if (res.ok && data.ok && Array.isArray(data.modelosTroca)) {
        setModelosTroca(data.modelosTroca);
      }
    } catch {
      // ignora
    }
  }, [token, headersBridge, modelosTroca.length]);

  const carregarRanking = useCallback(async () => {
    if (!token) return;
    setLoadingRanking(true);
    try {
      const res = await fetch(`/api/crm-bridge/ranking?dias=${rankingDias}`, {
        headers: headersBridge,
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        if (data.loja?.nome) setLojaNome(data.loja.nome);
        setRanking(data);
      }
    } finally {
      setLoadingRanking(false);
    }
  }, [token, rankingDias, headersBridge]);

  // Escuta postMessage do EvoCRM Dashboard App
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      try {
        const payload =
          typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        const ctx = payload?.data || payload;
        const contact = ctx?.contact || ctx?.conversation?.meta?.sender;
        if (contact?.phone_number || contact?.name) {
          const tel = String(contact.phone_number || '');
          const nome = String(contact.name || '');
          setContatoCtx({ nome, telefone: tel });
          setBuscaCliente(tel || nome);
          if (token) {
            buscarDadosCliente(tel || nome, nome);
          }
        }
      } catch {
        // Ignora mensagens não JSON
      }
    };

    window.addEventListener('message', onMessage);
    // Solicita contexto ao host EvoCRM/Chatwoot
    try {
      window.parent?.postMessage('chatwoot-dashboard-app:fetch-info', '*');
    } catch {
      // fora de iframe
    }
    return () => window.removeEventListener('message', onMessage);
  }, [token, buscarDadosCliente]);

  useEffect(() => {
    if (!token) return;
    const t = setTimeout(() => {
      carregarEstoque();
    }, 250);
    return () => clearTimeout(t);
  }, [token, buscaEstoque, condicaoFiltro, carregarEstoque]);

  useEffect(() => {
    if (aba === 'simulador') carregarModelosTroca();
    if (aba === 'ranking') carregarRanking();
  }, [aba, carregarModelosTroca, carregarRanking]);

  const executarSimulacao = async () => {
    if (!token) return;
    const valorNum = Number(valorAparelho.replace(',', '.')) || 0;
    if (valorNum <= 0) return;
    setLoadingSim(true);
    try {
      const res = await fetch('/api/crm-bridge/simular', {
        method: 'POST',
        headers: headersBridge,
        body: JSON.stringify({
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
      if (res.ok && data.ok) {
        setSimulacao(data);
      }
    } finally {
      setLoadingSim(false);
    }
  };

  const abrirNoSimulador = (item: EstoqueItem) => {
    setModeloNovo(`${item.modelo} ${item.capacidade} ${item.cor}`.trim());
    setValorAparelho(String(item.preco));
    setSimulacao(null);
    setAba('simulador');
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
        <a
          href="/"
          target="_blank"
          rel="noreferrer"
          className="text-[11px] px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-slate-300 flex items-center gap-1 border border-white/10"
          title="Abrir PhoneCenter ERP"
        >
          ERP <ExternalLink className="w-3 h-3" />
        </a>
      </header>

      {/* Banner de configuração rápida se sem token */}
      {!token && (
        <div className="m-3 p-3 rounded-xl bg-[#0f172a] border border-[#0066FF]/40 space-y-2">
          <div className="font-semibold text-white flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-[#007BFF]" />
            Conectar ao PhoneCenter ERP
          </div>
          <p className="text-slate-400 text-[11px]">
            Informe a chave <code className="text-blue-300">CRM_BRIDGE_SECRET</code> (ou passe{' '}
            <code className="text-blue-300">?token=...</code> na URL do Dashboard App do EvoCRM).
          </p>
          <input
            type="password"
            placeholder="Cole o token CRM_BRIDGE_SECRET..."
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

      {erroAuth && (
        <div className="mx-3 mt-2 p-2.5 rounded-lg bg-red-500/15 border border-red-500/40 text-red-200 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{erroAuth}</span>
        </div>
      )}

      {/* Navegação por abas */}
      <nav className="grid grid-cols-4 gap-1 p-2 bg-[#0f172a]/70 border-b border-white/10">
        {(
          [
            { id: 'estoque', label: 'Estoque', icon: Smartphone },
            { id: 'cliente', label: 'Cliente', icon: UserCheck },
            { id: 'simulador', label: 'Troca/Calc', icon: Calculator },
            { id: 'ranking', label: 'Ranking', icon: Trophy },
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

            <div className="space-y-2">
              {estoque.map((item) => (
                <div
                  key={item.id}
                  className="p-2.5 rounded-xl bg-[#0f172a] border border-white/10 hover:border-[#0066FF]/50 transition space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-white text-[12px] truncate">
                        {item.modelo} {item.capacidade}
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
                  <div className="flex gap-1.5 pt-1">
                    <button
                      onClick={() => copiarTexto(item.textoWhatsapp, item.id)}
                      className="flex-1 py-1.5 px-2 rounded-lg bg-[#0066FF]/20 hover:bg-[#0066FF]/35 border border-[#0066FF]/40 text-blue-200 flex items-center justify-center gap-1 font-medium"
                    >
                      {copiadoId === item.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" /> Copiado!
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" /> Copiar p/ Chat
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => abrirNoSimulador(item)}
                      className="py-1.5 px-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 flex items-center gap-1"
                    >
                      <Calculator className="w-3 h-3" /> Simular
                    </button>
                  </div>
                </div>
              ))}
              {!loadingEstoque && estoque.length === 0 && token && (
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
            {contatoCtx.nome && (
              <div className="px-2.5 py-1.5 rounded-lg bg-[#0066FF]/15 border border-[#0066FF]/30 text-blue-200 text-[11px]">
                Chat ativo: <strong>{contatoCtx.nome}</strong>{' '}
                {contatoCtx.telefone ? `(${contatoCtx.telefone})` : ''}
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

        {/* ==================== ABA SIMULADOR TROCA & PROPOSTA ==================== */}
        {aba === 'simulador' && (
          <div className="space-y-2.5">
            <div className="p-2.5 rounded-xl bg-[#0f172a] border border-white/10 space-y-2">
              <div className="font-semibold text-white text-[12px]">
                Simulador de Upgrade, Troca & Parcelas
              </div>
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
                      {(modelosTroca.length ? modelosTroca : ['iPhone 11', 'iPhone 12', 'iPhone 13', 'iPhone 14', 'iPhone 15', 'iPhone 15 Pro Max']).map(
                        (m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        )
                      )}
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
                onClick={executarSimulacao}
                disabled={loadingSim || !valorAparelho}
                className="w-full py-2 rounded-lg bg-[#0066FF] hover:bg-[#0052CC] disabled:opacity-50 text-white font-semibold"
              >
                {loadingSim ? 'Calculando...' : 'Calcular Troca & Parcelas'}
              </button>
            </div>

            {simulacao && (
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

                <div className="max-h-44 overflow-y-auto divide-y divide-white/5 border-t border-white/10 pt-1">
                  {simulacao.parcelamento.map((p) => (
                    <div key={p.parcelas} className="py-1 flex justify-between text-[11px]">
                      <span className="text-slate-300">{p.parcelas}x no cartão</span>
                      <span className="font-semibold text-white">
                        {formatBRL(p.valorParcela)}{' '}
                        <span className="text-[10px] text-slate-500">
                          ({formatBRL(p.totalComTaxa)})
                        </span>
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex gap-1.5 pt-1">
                  <button
                    onClick={() => copiarTexto(simulacao.textoWhatsapp, 'sim-wa')}
                    className="flex-1 py-1.5 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center justify-center gap-1"
                  >
                    {copiadoId === 'sim-wa' ? (
                      <>
                        <Check className="w-3.5 h-3.5" /> Copiado!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> Copiar Orçamento
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="py-1.5 px-2.5 rounded-lg bg-white/10 hover:bg-white/15 text-white flex items-center gap-1"
                    title="Imprimir / Salvar Proposta PDF"
                  >
                    <Printer className="w-3.5 h-3.5" /> PDF
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================== ABA RANKING & METAS ==================== */}
        {aba === 'ranking' && (
          <div className="space-y-2.5">
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
                    <div className="text-[10px] text-slate-400">Faturamento ({ranking.periodoDias}d)</div>
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

                {ranking.topModelos.length > 0 && (
                  <div className="p-2.5 rounded-xl bg-[#0f172a] border border-white/10 space-y-1">
                    <div className="font-semibold text-white text-[11px]">Modelos Mais Vendidos</div>
                    {ranking.topModelos.slice(0, 5).map((m) => (
                      <div key={m.modelo} className="flex justify-between text-[11px]">
                        <span className="text-slate-300 truncate pr-2">{m.modelo}</span>
                        <span className="text-blue-300 shrink-0">{m.quantidade}x</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
