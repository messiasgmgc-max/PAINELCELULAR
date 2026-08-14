'use client';

import { useState, useEffect, useCallback } from 'react';
import { GlassCard } from '@/components/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  FileText, 
  Search, 
  RefreshCw, 
  Filter, 
  User, 
  Building2, 
  Clock, 
  ShieldCheck, 
  ShoppingBag, 
  Wrench, 
  Package, 
  Users, 
  CreditCard 
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { checkIsSuperAdmin } from '@/lib/utils';
import { toast } from 'sonner';

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

export function LogsTab() {
  const { usuario } = useAuth();
  const isSuperAdmin = checkIsSuperAdmin(usuario);

  const [logs, setLogs] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState('todos');
  const [lojaFiltro, setLojaFiltro] = useState(isSuperAdmin ? 'todas' : (usuario?.lojaId || 'todas'));
  const [lojasMap, setLojasMap] = useState<Record<string, string>>({});
  const [lojasLista, setLojasLista] = useState<LojaSimple[]>([]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const targetLoja = isSuperAdmin ? lojaFiltro : (usuario?.lojaId || 'todas');
      const params = new URLSearchParams();
      if (targetLoja && targetLoja !== 'todas') params.append('lojaId', targetLoja);
      if (tipoFiltro && tipoFiltro !== 'todos') params.append('tipo', tipoFiltro);
      if (searchTerm.trim()) params.append('termo', searchTerm.trim());

      const res = await fetch(`/api/logs?${params.toString()}`);
      const data = await res.json();
      setLogs(data.logs || []);
    } catch (error) {
      console.error('Erro ao carregar logs:', error);
      toast.error('Erro ao carregar os logs de auditoria.');
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin, lojaFiltro, tipoFiltro, searchTerm, usuario?.lojaId]);

  // Carrega mapeamento de lojas para exibição amigável
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
    fetchLogs();
  }, [fetchLogs]);

  const getTipoBadge = (tipo: string) => {
    switch (tipo.toLowerCase()) {
      case 'login':
        return <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 gap-1"><User className="w-3 h-3" /> Acesso / Login</Badge>;
      case 'venda':
        return <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 gap-1"><ShoppingBag className="w-3 h-3" /> Venda</Badge>;
      case 'os':
        return <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 gap-1"><Wrench className="w-3 h-3" /> Ordem de Serviço</Badge>;
      case 'estoque':
        return <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 gap-1"><Package className="w-3 h-3" /> Estoque</Badge>;
      case 'equipe':
        return <Badge className="bg-cyan-500/20 text-cyan-300 border-cyan-500/30 gap-1"><Users className="w-3 h-3" /> Equipe</Badge>;
      case 'plano':
        return <Badge className="bg-indigo-500/20 text-indigo-300 border-indigo-500/30 gap-1"><CreditCard className="w-3 h-3" /> Plano</Badge>;
      default:
        return <Badge className="bg-slate-500/20 text-slate-300 border-slate-500/30 gap-1"><ShieldCheck className="w-3 h-3" /> Sistema</Badge>;
    }
  };

  return (
    <GlassCard className="rounded-3xl p-5 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-white/10">
        <div>
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-400" /> Logs & Auditoria de Atividades
          </h3>
          <p className="text-xs text-slate-400">
            Acompanhe em tempo real quem acessou, modificou estoque, registrou vendas ou alterou cadastros.
          </p>
        </div>

        <Button
          onClick={fetchLogs}
          variant="outline"
          size="sm"
          disabled={loading}
          className="border-white/15 hover:bg-white/10 text-slate-200 gap-2 shrink-0 rounded-xl"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar Logs
        </Button>
      </div>

      {/* Barra de Filtros */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por ação, usuário ou detalhes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-glass pl-9 w-full text-sm py-2"
          />
        </div>

        <div>
          <select
            value={tipoFiltro}
            onChange={(e) => setTipoFiltro(e.target.value)}
            className="input-glass w-full text-sm py-2 px-3"
          >
            <option value="todos">Todos os Eventos</option>
            <option value="login">🔑 Acessos & Logins</option>
            <option value="venda">💰 Vendas</option>
            <option value="os">🔧 Ordens de Serviço</option>
            <option value="estoque">📦 Estoque & Aparelhos</option>
            <option value="equipe">👥 Equipe & Usuários</option>
            <option value="plano">💳 Planos & Pagamentos</option>
            <option value="info">⚙️ Geral / Sistema</option>
          </select>
        </div>

        {isSuperAdmin && (
          <div>
            <select
              value={lojaFiltro}
              onChange={(e) => setLojaFiltro(e.target.value)}
              className="input-glass w-full text-sm py-2 px-3"
            >
              <option value="todas">Todas as Lojas (Visão Global)</option>
              {lojasLista.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Tabela de Logs */}
      <div className="overflow-x-auto scrollbar-soft border border-white/10 rounded-2xl">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-slate-900/80 text-slate-300 border-b border-white/10">
              <th className="py-3 px-4">Data / Hora</th>
              {isSuperAdmin && <th className="py-3 px-3">Loja</th>}
              <th className="py-3 px-3">Usuário</th>
              <th className="py-3 px-3">Tipo</th>
              <th className="py-3 px-3">Ação Realizada</th>
              <th className="py-3 px-4">Detalhes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-slate-200">
            {loading ? (
              <tr>
                <td colSpan={isSuperAdmin ? 6 : 5} className="py-8 text-center text-slate-400">
                  <div className="flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
                    Carregando histórico de logs...
                  </div>
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={isSuperAdmin ? 6 : 5} className="py-8 text-center text-slate-400">
                  Nenhum log encontrado para os filtros selecionados.
                </td>
              </tr>
            ) : (
              logs.map((log) => {
                const dataFormatada = new Date(log.created_at).toLocaleString('pt-BR');
                const nomeLoja = log.loja_id ? (lojasMap[log.loja_id] || 'Loja Registrada') : 'Global / Sistema';

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
                          <span className="truncate max-w-[120px]">{nomeLoja}</span>
                        </div>
                      </td>
                    )}
                    <td className="py-3 px-3">
                      <div>
                        <p className="font-bold text-white text-xs">{log.usuario_nome || 'Usuário do Sistema'}</p>
                        <p className="text-[10px] text-slate-400 truncate max-w-[150px]">{log.usuario_email || 'E-mail não informado'}</p>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      {getTipoBadge(log.tipo_evento)}
                    </td>
                    <td className="py-3 px-3 font-semibold text-indigo-300">
                      {log.acao}
                    </td>
                    <td className="py-3 px-4 text-slate-300 text-[11px]">
                      {log.detalhes || '-'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}
