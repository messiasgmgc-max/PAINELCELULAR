'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { GlassCard } from '@/components/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  Search,
  RefreshCw,
  User,
  Building2,
  Clock,
  ShieldCheck,
  ShoppingBag,
  Wrench,
  Package,
  Users,
  CreditCard,
  Sparkles,
  PhoneCall,
  History,
  ChevronDown,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { checkIsSuperAdmin } from '@/lib/utils';
import { toast } from 'sonner';
import {
  intervaloDoPeriodo,
  montarConsultaLogs,
  PERIODOS,
  ROTULO_PERIODO,
  TAMANHO_PAGINA_LOGS,
  type Periodo,
} from '@/lib/auditoria/filtros';
import { ROTULO_TABELA, TABELAS_AUDITADAS, type EventoAuditoria } from '@/lib/auditoria/linhaDoTempo';

interface LogItem {
  id: string;
  loja_id: string | null;
  usuario_id: string | null;
  usuario_email: string | null;
  usuario_nome: string | null;
  tipo_evento: string;
  acao: string;
  detalhes: string | null;
  created_at: string;
}

interface LojaSimple {
  id: string;
  nome: string;
}

type Visao = 'atividades' | 'auditoria';

/** Espera a pessoa parar de digitar antes de consultar o servidor. */
function useDebounce<T>(valor: T, atraso = 400): T {
  const [atual, setAtual] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setAtual(valor), atraso);
    return () => clearTimeout(t);
  }, [valor, atraso]);
  return atual;
}

export function LogsTab() {
  const { usuario } = useAuth();
  const isSuperAdmin = checkIsSuperAdmin(usuario);

  const [visao, setVisao] = useState<Visao>('atividades');
  const [searchTerm, setSearchTerm] = useState('');
  const [usuarioFiltro, setUsuarioFiltro] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState('todos');
  const [tabelaFiltro, setTabelaFiltro] = useState('todas');
  const [periodoFiltro, setPeriodoFiltro] = useState<Periodo>('30dias');
  const [lojaFiltro, setLojaFiltro] = useState(isSuperAdmin ? 'todas' : (usuario?.lojaId || 'todas'));
  const [lojasMap, setLojasMap] = useState<Record<string, string>>({});
  const [lojasLista, setLojasLista] = useState<LojaSimple[]>([]);

  const termoBusca = useDebounce(searchTerm.trim());
  const usuarioBusca = useDebounce(usuarioFiltro.trim());

  // Atividades (logs_sistema)
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [totalLogs, setTotalLogs] = useState<number | null>(null);
  const [temMaisLogs, setTemMaisLogs] = useState(false);
  const [proximoOffsetLogs, setProximoOffsetLogs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const jaSincronizouAutomatico = useRef(false);

  // Auditoria (public.auditoria)
  const [eventos, setEventos] = useState<EventoAuditoria[]>([]);
  const [temMaisEventos, setTemMaisEventos] = useState(false);
  const [proximoOffsetEventos, setProximoOffsetEventos] = useState(0);
  const [avisoAuditoria, setAvisoAuditoria] = useState<string | null>(null);
  const [eventoAberto, setEventoAberto] = useState<string | null>(null);

  const lojaConsulta = isSuperAdmin ? lojaFiltro : (usuario?.lojaId || null);

  const montarParams = useCallback(
    (offset: number) =>
      montarConsultaLogs({
        lojaId: lojaConsulta,
        tipo: tipoFiltro,
        usuario: usuarioBusca,
        termo: termoBusca,
        intervalo: intervaloDoPeriodo(periodoFiltro),
        offset,
      }),
    [lojaConsulta, tipoFiltro, usuarioBusca, termoBusca, periodoFiltro]
  );

  const fetchLogs = useCallback(async (offset = 0) => {
    const primeiraPagina = offset === 0;
    if (primeiraPagina) setLoading(true);
    else setCarregandoMais(true);
    try {
      const res = await fetch(`/api/logs?${montarParams(offset).toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Falha ao consultar os logs');
      const novos: LogItem[] = data.logs || [];
      setLogs((prev) => (primeiraPagina ? novos : [...prev, ...novos]));
      setTemMaisLogs(!!data.temMais);
      setProximoOffsetLogs(typeof data.proximoOffset === 'number' ? data.proximoOffset : offset + novos.length);
      if (primeiraPagina && typeof data.total === 'number') setTotalLogs(data.total);
    } catch (error) {
      console.error('Erro ao carregar logs:', error);
      toast.error('Erro ao carregar os logs de atividades.');
    } finally {
      setLoading(false);
      setCarregandoMais(false);
    }
  }, [montarParams]);

  const fetchAuditoria = useCallback(async (offset = 0) => {
    const primeiraPagina = offset === 0;
    if (primeiraPagina) setLoading(true);
    else setCarregandoMais(true);
    try {
      const params = montarParams(offset);
      params.delete('tipo');
      if (tabelaFiltro !== 'todas') params.set('tabela', tabelaFiltro);
      const res = await fetch(`/api/auditoria?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Falha ao consultar a auditoria');
      const novos: EventoAuditoria[] = data.eventos || [];
      setEventos((prev) => (primeiraPagina ? novos : [...prev, ...novos]));
      setTemMaisEventos(!!data.temMais);
      setProximoOffsetEventos(typeof data.proximoOffset === 'number' ? data.proximoOffset : offset + novos.length);
      setAvisoAuditoria(data.aviso || null);
    } catch (error) {
      console.error('Erro ao carregar auditoria:', error);
      toast.error('Erro ao carregar a trilha de auditoria.');
    } finally {
      setLoading(false);
      setCarregandoMais(false);
    }
  }, [montarParams, tabelaFiltro]);

  // Função para sincronizar todo o histórico existente (vendas, estoque, OS, garantias)
  const handleSincronizarHistorico = useCallback(async () => {
    setSyncing(true);
    const toastId = toast.loading('Sincronizando histórico de atividades da loja...');
    try {
      const res = await fetch('/api/logs/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lojaId: lojaConsulta || 'todas' }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(data.mensagem || 'Histórico sincronizado com sucesso!', { id: toastId });
        await fetchLogs(0);
      } else {
        toast.error('Erro ao sincronizar: ' + (data.error || 'Falha na resposta'), { id: toastId });
      }
    } catch {
      toast.error('Erro ao sincronizar histórico.', { id: toastId });
    } finally {
      setSyncing(false);
    }
  }, [lojaConsulta, fetchLogs]);

  // Carrega mapeamento de lojas para exibição amigável (a RLS já limita à própria loja).
  useEffect(() => {
    const carregarLojas = async () => {
      try {
        const { supabase } = await import('@/lib/supabaseClient');
        const { data } = await supabase.from('lojas').select('id, nome');
        if (data) {
          const map: Record<string, string> = {};
          data.forEach((l) => { map[l.id] = l.nome; });
          setLojasMap(map);
          setLojasLista(data);
        }
      } catch (e) {
        console.warn('Erro ao carregar nomes das lojas para os logs:', e);
      }
    };
    carregarLojas();
  }, []);

  useEffect(() => {
    if (visao === 'atividades') fetchLogs(0);
    else fetchAuditoria(0);
  }, [visao, fetchLogs, fetchAuditoria]);

  // Loja recém-criada (quase sem logs): importa o histórico uma única vez.
  useEffect(() => {
    if (visao !== 'atividades' || loading || jaSincronizouAutomatico.current) return;
    if (periodoFiltro === 'todos' && !termoBusca && tipoFiltro === 'todos' && totalLogs !== null && totalLogs <= 2) {
      jaSincronizouAutomatico.current = true;
      handleSincronizarHistorico();
    }
  }, [visao, loading, periodoFiltro, termoBusca, tipoFiltro, totalLogs, handleSincronizarHistorico]);

  const getTipoBadge = (tipo: string) => {
    switch (tipo.toLowerCase()) {
      case 'login':
        return <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 gap-1"><User className="w-3 h-3" /> Login / Acesso</Badge>;
      case 'venda':
        return <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 gap-1"><ShoppingBag className="w-3 h-3" /> Venda</Badge>;
      case 'os':
        return <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 gap-1"><Wrench className="w-3 h-3" /> Ordem de Serviço</Badge>;
      case 'estoque':
        return <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 gap-1"><Package className="w-3 h-3" /> Estoque</Badge>;
      case 'garantia':
        return <Badge className="bg-teal-500/20 text-teal-300 border-teal-500/30 gap-1"><ShieldCheck className="w-3 h-3" /> Garantia</Badge>;
      case 'cliente':
        return <Badge className="bg-cyan-500/20 text-cyan-300 border-cyan-500/30 gap-1"><PhoneCall className="w-3 h-3" /> Cliente</Badge>;
      case 'equipe':
        return <Badge className="bg-indigo-500/20 text-indigo-300 border-indigo-500/30 gap-1"><Users className="w-3 h-3" /> Equipe</Badge>;
      case 'plano':
        return <Badge className="bg-rose-500/20 text-rose-300 border-rose-500/30 gap-1"><CreditCard className="w-3 h-3" /> Mensalidade / Plano</Badge>;
      default:
        return <Badge className="bg-slate-500/20 text-slate-300 border-slate-500/30 gap-1"><ShieldCheck className="w-3 h-3" /> Sistema</Badge>;
    }
  };

  const getOperacaoBadge = (operacao: string) => {
    if (operacao === 'INSERT') return <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">Criado</Badge>;
    if (operacao === 'DELETE') return <Badge className="bg-rose-500/20 text-rose-300 border-rose-500/30">Apagado</Badge>;
    return <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30">Alterado</Badge>;
  };

  // Limpa as tags técnicas de ref para exibição limpa ao usuário
  const formatarDetalhes = (detalhes: string | null) => {
    if (!detalhes) return '-';
    return detalhes.replace(/\[ref:[a-zA-Z0-9_\-]+\]/g, '').trim();
  };

  const nomeDaLoja = (lojaId: string | null) => (lojaId ? (lojasMap[lojaId] || 'Loja Registrada') : 'Global / Sistema');
  const colunas = isSuperAdmin ? 6 : 5;
  const ehAtividades = visao === 'atividades';

  return (
    <GlassCard className="rounded-3xl p-5 sm:p-6 space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-white/10">
        <div>
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-400" /> Logs & Auditoria de Atividades
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Quem acessou, vendeu, mexeu no estoque ou alterou cadastros. A visão Auditoria mostra cada mudança gravada pelo banco (antes → depois).
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {ehAtividades && (
            <Button
              onClick={handleSincronizarHistorico}
              variant="outline"
              size="sm"
              disabled={syncing}
              className="border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 gap-1.5 rounded-xl text-xs"
              title="Importa e consolida histórico de vendas e estoque passados para os logs"
            >
              <Sparkles className={`w-3.5 h-3.5 text-indigo-400 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Sincronizando...' : 'Sincronizar Histórico'}
            </Button>
          )}

          <Button
            onClick={() => (ehAtividades ? fetchLogs(0) : fetchAuditoria(0))}
            variant="outline"
            size="sm"
            disabled={loading}
            className="border-white/15 hover:bg-white/10 text-slate-200 gap-1.5 rounded-xl text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Visões */}
      <div className="flex items-center gap-2 text-xs">
        <button
          onClick={() => setVisao('atividades')}
          className={`px-3 py-1.5 rounded-xl font-semibold transition flex items-center gap-1.5 ${ehAtividades ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-900/60 hover:bg-slate-800 text-slate-300 border border-white/10'}`}
        >
          <FileText className="w-3.5 h-3.5" /> Atividades
        </button>
        <button
          onClick={() => setVisao('auditoria')}
          className={`px-3 py-1.5 rounded-xl font-semibold transition flex items-center gap-1.5 ${!ehAtividades ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-900/60 hover:bg-slate-800 text-slate-300 border border-white/10'}`}
        >
          <History className="w-3.5 h-3.5" /> Auditoria (antes → depois)
        </button>
        {ehAtividades && totalLogs !== null && (
          <span className="ml-auto text-slate-400">
            {totalLogs.toLocaleString('pt-BR')} registro(s) no filtro · {logs.length} carregado(s)
          </span>
        )}
      </div>

      {/* Barra de Filtros e Período */}
      <div className="space-y-2.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder={ehAtividades ? 'Buscar por ação, cliente, IMEI ou usuário...' : 'IMEI, id do registro, cliente ou modelo...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-glass pl-9 w-full text-xs sm:text-sm py-2"
            />
          </div>

          <div className="relative">
            <User className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="E-mail de quem fez (opcional)"
              value={usuarioFiltro}
              onChange={(e) => setUsuarioFiltro(e.target.value)}
              className="input-glass pl-9 w-full text-xs sm:text-sm py-2"
            />
          </div>

          {ehAtividades ? (
            <select
              value={tipoFiltro}
              onChange={(e) => setTipoFiltro(e.target.value)}
              className="input-glass w-full text-xs sm:text-sm py-2 px-3"
            >
              <option value="todos">Todos os Eventos</option>
              <option value="venda">💰 Vendas (Varejo & Atacado)</option>
              <option value="estoque">📦 Estoque (Entradas & Saídas)</option>
              <option value="os">🔧 Ordens de Serviço</option>
              <option value="garantia">🛡️ Garantias Emitidas</option>
              <option value="login">🔑 Acessos & Logins</option>
              <option value="cliente">👥 Cadastros de Clientes</option>
              <option value="equipe">👤 Equipe & Usuários</option>
              <option value="plano">💳 Planos & Pagamentos</option>
            </select>
          ) : (
            <select
              value={tabelaFiltro}
              onChange={(e) => setTabelaFiltro(e.target.value)}
              className="input-glass w-full text-xs sm:text-sm py-2 px-3"
            >
              <option value="todas">Todos os cadastros</option>
              {TABELAS_AUDITADAS.map((t) => (
                <option key={t} value={t}>{ROTULO_TABELA[t]}</option>
              ))}
            </select>
          )}

          {isSuperAdmin && (
            <select
              value={lojaFiltro}
              onChange={(e) => setLojaFiltro(e.target.value)}
              className="input-glass w-full text-xs sm:text-sm py-2 px-3"
            >
              <option value="todas">Todas as Lojas (Visão Global)</option>
              {lojasLista.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Chips de Período (filtrados no servidor) */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          <span className="text-slate-400 font-medium text-[11px] mr-1">Período:</span>
          {PERIODOS.map((p) => {
            const active = periodoFiltro === p;
            return (
              <button
                key={p}
                onClick={() => setPeriodoFiltro(p)}
                className={`px-3 py-1 rounded-xl font-medium transition cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-900/60 hover:bg-slate-800 text-slate-300 border border-white/10'
                }`}
              >
                {ROTULO_PERIODO[p]}
              </button>
            );
          })}
        </div>
      </div>

      {ehAtividades ? (
        /* Tabela de Logs */
        <div className="overflow-x-auto scrollbar-soft border border-white/10 rounded-2xl">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-900/90 text-slate-300 border-b border-white/10">
                <th className="py-3 px-4">Data / Hora</th>
                {isSuperAdmin && <th className="py-3 px-3">Loja</th>}
                <th className="py-3 px-3">Responsável</th>
                <th className="py-3 px-3">Tipo</th>
                <th className="py-3 px-3">Ação</th>
                <th className="py-3 px-4">Detalhes da Operação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={colunas} className="py-8 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
                      Carregando atividades gravadas...
                    </div>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={colunas} className="py-10 text-center text-slate-400">
                    <p className="font-semibold text-slate-300">Nenhum evento encontrado para os filtros selecionados.</p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Tente ampliar o período ou clique em &quot;Sincronizar Histórico&quot; para importar vendas, aparelhos e OSs anteriores.
                    </p>
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const dataFormatada = new Date(log.created_at).toLocaleString('pt-BR');
                  const inicial = (log.usuario_nome || 'S')[0]?.toUpperCase();

                  return (
                    <tr key={log.id} className="hover:bg-white/5 transition">
                      <td className="py-3 px-4 text-slate-400 font-mono text-[11px] whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          {dataFormatada}
                        </div>
                      </td>
                      {isSuperAdmin && (
                        <td className="py-3 px-3 font-semibold text-white">
                          <div className="flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                            <span className="truncate max-w-[120px]">{nomeDaLoja(log.loja_id)}</span>
                          </div>
                        </td>
                      )}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center justify-center text-[10px] font-bold shrink-0">
                            {inicial}
                          </div>
                          <div>
                            <p className="font-bold text-white text-xs leading-none">{log.usuario_nome || 'Sistema'}</p>
                            {log.usuario_email && (
                              <p className="text-[10px] text-slate-400 truncate max-w-[130px] leading-tight mt-0.5">{log.usuario_email}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        {getTipoBadge(log.tipo_evento)}
                      </td>
                      <td className="py-3 px-3 font-semibold text-indigo-300 whitespace-nowrap">
                        {log.acao}
                      </td>
                      <td className="py-3 px-4 text-slate-300 text-[11px]">
                        {formatarDetalhes(log.detalhes)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* Linha do tempo da auditoria */
        <div className="space-y-2">
          {avisoAuditoria && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-200 text-xs px-4 py-3">{avisoAuditoria}</div>
          )}
          {loading ? (
            <div className="py-8 text-center text-slate-400 flex items-center justify-center gap-2 text-xs">
              <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" /> Carregando trilha de auditoria...
            </div>
          ) : eventos.length === 0 ? (
            <div className="py-10 text-center text-slate-400 border border-white/10 rounded-2xl">
              <p className="font-semibold text-slate-300 text-sm">Nenhuma mudança encontrada.</p>
              <p className="text-[11px] text-slate-500 mt-1">
                Busque por IMEI, id do registro ou nome do cliente. Só entram mudanças feitas depois que a trilha foi ligada no banco.
              </p>
            </div>
          ) : (
            <ol className="relative border-l border-white/10 ml-3 space-y-3">
              {eventos.map((evento) => {
                const aberto = eventoAberto === evento.id;
                return (
                  <li key={evento.id} className="ml-5">
                    <span className="absolute -left-[7px] mt-2 w-3 h-3 rounded-full bg-indigo-500 border-2 border-slate-900" />
                    <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-3 text-xs">
                      <button
                        type="button"
                        onClick={() => setEventoAberto(aberto ? null : evento.id)}
                        className="w-full flex flex-col sm:flex-row sm:items-center gap-2 text-left"
                      >
                        <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                          {getOperacaoBadge(evento.operacao)}
                          <Badge className="bg-slate-500/20 text-slate-300 border-slate-500/30">{evento.tabelaRotulo}</Badge>
                          <span className="font-semibold text-white truncate">{evento.titulo}</span>
                          {evento.mudancas.length > 0 && evento.operacao === 'UPDATE' && (
                            <span className="text-slate-400">· {evento.mudancas.length} campo(s): {evento.mudancas.map((m) => m.campo).slice(0, 4).join(', ')}{evento.mudancas.length > 4 ? '…' : ''}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-slate-400 whitespace-nowrap">
                          {isSuperAdmin && <span className="flex items-center gap-1"><Building2 className="w-3 h-3 text-blue-400" />{nomeDaLoja(evento.lojaId)}</span>}
                          <span className="flex items-center gap-1"><User className="w-3 h-3" />{evento.quem}</span>
                          <span>{evento.origem}</span>
                          <span className="flex items-center gap-1 font-mono"><Clock className="w-3 h-3" />{new Date(evento.quando).toLocaleString('pt-BR')}</span>
                          <ChevronDown className={`w-4 h-4 transition ${aberto ? 'rotate-180' : ''}`} />
                        </div>
                      </button>

                      {aberto && (
                        <div className="mt-3 border-t border-white/10 pt-3 space-y-2">
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
                            {evento.registroId && <span>Registro: <span className="font-mono text-slate-300">{evento.registroId}</span></span>}
                            {evento.loteId && <span>Lote: <span className="font-mono text-slate-300">{evento.loteId}</span></span>}
                          </div>
                          {evento.mudancas.length === 0 ? (
                            <p className="text-slate-500">Sem campos para mostrar.</p>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full text-left">
                                <thead>
                                  <tr className="text-slate-400 border-b border-white/10">
                                    <th className="py-1.5 pr-3 font-medium">Campo</th>
                                    <th className="py-1.5 pr-3 font-medium">Antes</th>
                                    <th className="py-1.5 pr-3 w-4" />
                                    <th className="py-1.5 font-medium">Depois</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                  {evento.mudancas.map((m) => (
                                    <tr key={m.campo}>
                                      <td className="py-1.5 pr-3 font-mono text-indigo-300">{m.campo}</td>
                                      <td className="py-1.5 pr-3 text-slate-400 break-all">{m.antes}</td>
                                      <td className="py-1.5 pr-3"><ArrowRight className="w-3 h-3 text-slate-500" /></td>
                                      <td className="py-1.5 text-white break-all">{m.depois}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}

      {/* Paginação real: 50 por página */}
      {!loading && (ehAtividades ? temMaisLogs : temMaisEventos) && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            disabled={carregandoMais}
            onClick={() => (ehAtividades ? fetchLogs(proximoOffsetLogs) : fetchAuditoria(proximoOffsetEventos))}
            className="border-white/15 hover:bg-white/10 text-slate-200 gap-1.5 rounded-xl text-xs"
          >
            <ChevronDown className={`w-3.5 h-3.5 ${carregandoMais ? 'animate-bounce' : ''}`} />
            {carregandoMais ? 'Carregando...' : `Carregar mais ${TAMANHO_PAGINA_LOGS}`}
          </Button>
        </div>
      )}
    </GlassCard>
  );
}
