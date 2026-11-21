'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  Send,
  Trophy,
  BookOpen,
  Plus,
  Trash2,
  Layers,
} from 'lucide-react';

const formatBRL = (v: number) =>
  (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

interface SectionProps {
  buildHeaders: () => Promise<Record<string, string>>;
}

const COLUNAS_KANBAN = [
  { id: 'fornecedores', label: 'Fornecedores' },
  { id: 'atacado_vip', label: 'Atacado VIP' },
  { id: 'cotacao_dia', label: 'Cotação do Dia' },
  { id: 'fechados', label: 'Parceiros Fechados' },
];

export function KanbanGruposSection({ buildHeaders }: SectionProps) {
  const [grupos, setGrupos] = useState<
    Array<{
      grupoJid: string;
      grupoNome: string;
      coluna: string;
      notas: string;
      participantes?: number;
    }>
  >([]);
  const [msgGrupo, setMsgGrupo] = useState('');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const h = await buildHeaders();
    const res = await fetch('/api/crm-bridge/kanban-grupos', {
      headers: h,
      credentials: 'include',
    });
    const d = await res.json();
    if (res.ok && d.ok) setGrupos(d.grupos || []);
  }, [buildHeaders]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const mover = async (grupoJid: string, grupoNome: string, coluna: string) => {
    const h = await buildHeaders();
    await fetch('/api/crm-bridge/kanban-grupos', {
      method: 'PUT',
      headers: h,
      credentials: 'include',
      body: JSON.stringify({ grupoJid, grupoNome, coluna }),
    });
    carregar();
  };

  const enviarNoGrupo = async (grupoJid: string, grupoNome: string) => {
    const texto = msgGrupo.trim();
    if (!texto) {
      setStatusMsg('Digite a mensagem/lista acima antes de enviar para o grupo.');
      return;
    }
    const h = await buildHeaders();
    const res = await fetch('/api/crm-bridge/kanban-grupos', {
      method: 'POST',
      headers: h,
      credentials: 'include',
      body: JSON.stringify({ grupoJid, mensagem: texto }),
    });
    const d = await res.json();
    setStatusMsg(res.ok && d.ok ? `Enviado para "${grupoNome}"!` : d.error || 'Erro ao enviar.');
  };

  return (
    <div className="space-y-4">
      {statusMsg && (
        <div className="p-3 rounded-xl bg-[#0066FF]/15 border border-[#0066FF]/40 text-blue-200 text-xs">
          {statusMsg}
        </div>
      )}

      <div className="p-3 rounded-2xl bg-[#0f172a] border border-white/10 space-y-2">
        <div className="text-xs font-semibold text-white flex items-center gap-1.5">
          <Layers className="w-4 h-4 text-[#007BFF]" /> Mensagem Rápida para Disparo nos Grupos
        </div>
        <textarea
          rows={2}
          value={msgGrupo}
          onChange={(e) => setMsgGrupo(e.target.value)}
          placeholder="Cole aqui a lista de atacado ou cotação para enviar com 1 clique em qualquer grupo..."
          className="w-full p-2.5 rounded-xl bg-[#090d16] border border-white/10 text-xs text-white"
        />
      </div>

      <div className="grid md:grid-cols-4 gap-3">
        {COLUNAS_KANBAN.map((col) => {
          const cards = grupos.filter((g) => g.coluna === col.id);
          return (
            <div
              key={col.id}
              className="p-3 rounded-2xl bg-[#0f172a] border border-white/10 space-y-2.5 min-h-[260px]"
            >
              <div className="flex items-center justify-between text-xs font-bold text-white border-b border-white/10 pb-2">
                <span>{col.label}</span>
                <span className="px-2 py-0.5 rounded-full bg-white/10 text-[10px]">{cards.length}</span>
              </div>

              {cards.map((g) => (
                <div
                  key={g.grupoJid}
                  className="p-2.5 rounded-xl bg-[#090d16] border border-white/10 space-y-2"
                >
                  <div className="font-semibold text-xs text-white truncate">{g.grupoNome}</div>
                  <select
                    value={g.coluna}
                    onChange={(e) => mover(g.grupoJid, g.grupoNome, e.target.value)}
                    className="w-full px-2 py-1 rounded bg-[#0f172a] border border-white/10 text-[11px] text-slate-300"
                  >
                    {COLUNAS_KANBAN.map((c) => (
                      <option key={c.id} value={c.id}>
                        Mover: {c.label}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => enviarNoGrupo(g.grupoJid, g.grupoNome)}
                    className="w-full py-1 rounded-lg bg-emerald-600/25 hover:bg-emerald-600/40 border border-emerald-500/40 text-emerald-200 text-[11px] flex items-center justify-center gap-1"
                  >
                    <Send className="w-3 h-3" /> Enviar Mensagem
                  </button>
                </div>
              ))}
              {cards.length === 0 && (
                <div className="text-[11px] text-slate-500 text-center py-6">Vazio</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TelefoniaSection({ buildHeaders }: SectionProps) {
  const [chamadas, setChamadas] = useState<Array<Record<string, unknown>>>([]);
  const [chamadaAtiva, setChamadaAtiva] = useState<Record<string, unknown> | null>(null);
  const [cliente360, setCliente360] = useState<{
    resumo?: { totalCompras: number; totalGasto: number; garantiasAtivas: number };
  } | null>(null);
  const [telefoneDiscar, setTelefoneDiscar] = useState('');
  const [anotacao, setAnotacao] = useState('');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const h = await buildHeaders();
    const res = await fetch('/api/crm-bridge/telefonia', { headers: h, credentials: 'include' });
    const d = await res.json();
    if (res.ok && d.ok) {
      setChamadas(d.chamadas || []);
      setChamadaAtiva(d.chamadaAtiva || null);
      setCliente360(d.cliente360Ativo || null);
    }
  }, [buildHeaders]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const registrarLigacao = async (direcao: 'entrada' | 'saida') => {
    if (!telefoneDiscar.trim()) return;
    const h = await buildHeaders();
    const res = await fetch('/api/crm-bridge/telefonia', {
      method: 'POST',
      headers: h,
      credentials: 'include',
      body: JSON.stringify({
        direcao,
        telefone: telefoneDiscar.trim(),
        status: direcao === 'entrada' ? 'tocando' : 'em_andamento',
        anotacoes: anotacao.trim(),
      }),
    });
    const d = await res.json();
    if (res.ok && d.ok) {
      setStatusMsg(
        `Chamada registrada (${d.chamada?.cliente_nome || telefoneDiscar}).`
      );
      if (direcao === 'saida') {
        window.open(`tel:${telefoneDiscar.replace(/\D/g, '')}`, '_self');
      }
      carregar();
    }
  };

  const finalizarChamada = async (id: string) => {
    const h = await buildHeaders();
    await fetch('/api/crm-bridge/telefonia', {
      method: 'PATCH',
      headers: h,
      credentials: 'include',
      body: JSON.stringify({ id, status: 'finalizada', anotacoes: anotacao }),
    });
    carregar();
  };

  return (
    <div className="space-y-4">
      {statusMsg && (
        <div className="p-3 rounded-xl bg-[#0066FF]/15 border border-[#0066FF]/40 text-blue-200 text-xs">
          {statusMsg}
        </div>
      )}

      {chamadaAtiva && (
        <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/50 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-bold text-white flex items-center gap-2 text-sm">
              <PhoneIncoming className="w-4 h-4 text-emerald-400 animate-bounce" />
              Chamada Ativa: {String(chamadaAtiva.cliente_nome || chamadaAtiva.telefone)}
            </div>
            <button
              onClick={() => finalizarChamada(String(chamadaAtiva.id))}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white"
            >
              Salvar Anotação &amp; Encerrar
            </button>
          </div>
          {cliente360?.resumo && (
            <div className="text-xs text-emerald-200">
              Cliente 360º: {cliente360.resumo.totalCompras} compra(s) • Total{' '}
              {formatBRL(cliente360.resumo.totalGasto)} • {cliente360.resumo.garantiasAtivas}{' '}
              garantia(s) ativa(s)
            </div>
          )}
        </div>
      )}

      <div className="p-4 rounded-2xl bg-[#0f172a] border border-white/10 space-y-3">
        <div className="font-bold text-white text-sm flex items-center gap-2">
          <Phone className="w-4 h-4 text-emerald-400" />
          Discador CRM Phone &amp; Registro Rápido de Ligação
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <input
            value={telefoneDiscar}
            onChange={(e) => setTelefoneDiscar(e.target.value)}
            placeholder="Telefone com DDD (ex: 31999990000)"
            className="px-3 py-2 rounded-xl bg-[#090d16] border border-white/10 text-xs text-white"
          />
          <input
            value={anotacao}
            onChange={(e) => setAnotacao(e.target.value)}
            placeholder="Anotação em tempo real durante a ligação..."
            className="px-3 py-2 rounded-xl bg-[#090d16] border border-white/10 text-xs text-white"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => registrarLigacao('saida')}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white flex items-center gap-1.5"
          >
            <PhoneOutgoing className="w-3.5 h-3.5" /> Discar (Click-to-Call)
          </button>
          <button
            onClick={() => registrarLigacao('entrada')}
            className="px-4 py-2 rounded-xl bg-[#0066FF] hover:bg-[#0052CC] text-xs font-semibold text-white flex items-center gap-1.5"
          >
            <PhoneIncoming className="w-3.5 h-3.5" /> Simular Chamada Entrante (Popup 360º)
          </button>
        </div>
      </div>

      <div className="p-4 rounded-2xl bg-[#0f172a] border border-white/10 space-y-2">
        <div className="font-bold text-white text-xs">Histórico de Chamadas</div>
        {chamadas.map((c) => (
          <div
            key={String(c.id)}
            className="p-2.5 rounded-xl bg-[#090d16] border border-white/5 flex flex-wrap justify-between items-center gap-2 text-xs"
          >
            <div>
              <strong className="text-white">{String(c.cliente_nome || c.telefone)}</strong>{' '}
              <span className="text-slate-400">
                ({String(c.direcao)} • {String(c.status)})
              </span>
              {Boolean(c.anotacoes) && (
                <div className="text-[11px] text-slate-400 mt-0.5">{String(c.anotacoes)}</div>
              )}
            </div>
            <span className="text-[10px] text-slate-500">
              {new Date(String(c.created_at)).toLocaleString('pt-BR')}
            </span>
          </div>
        ))}
        {chamadas.length === 0 && (
          <div className="text-center py-4 text-xs text-slate-500">Nenhuma chamada registrada.</div>
        )}
      </div>
    </div>
  );
}

export function MetasSection({ buildHeaders }: SectionProps) {
  const [evolucao, setEvolucao] = useState<Array<Record<string, unknown>>>([]);
  const [vendedorNome, setVendedorNome] = useState('');
  const [metaFat, setMetaFat] = useState('30000');
  const [metaQtd, setMetaQtd] = useState('10');
  const [comissaoPct, setComissaoPct] = useState('2.5');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const h = await buildHeaders();
    const res = await fetch('/api/crm-bridge/metas', { headers: h, credentials: 'include' });
    const d = await res.json();
    if (res.ok && d.ok) setEvolucao(d.evolucao || []);
  }, [buildHeaders]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const salvarMeta = async () => {
    if (!vendedorNome.trim()) return;
    const h = await buildHeaders();
    const res = await fetch('/api/crm-bridge/metas', {
      method: 'PUT',
      headers: h,
      credentials: 'include',
      body: JSON.stringify({
        vendedorNome: vendedorNome.trim(),
        metaFaturamento: Number(metaFat) || 0,
        metaQuantidade: Number(metaQtd) || 0,
        comissaoPercentual: Number(comissaoPct) || 0,
      }),
    });
    const d = await res.json();
    setStatusMsg(res.ok && d.ok ? `Meta de ${vendedorNome} salva!` : d.error || 'Erro ao salvar.');
    carregar();
  };

  return (
    <div className="space-y-4">
      {statusMsg && (
        <div className="p-3 rounded-xl bg-[#0066FF]/15 border border-[#0066FF]/40 text-blue-200 text-xs">
          {statusMsg}
        </div>
      )}

      <div className="p-4 rounded-2xl bg-[#0f172a] border border-white/10 space-y-3">
        <div className="font-bold text-white text-sm flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-400" />
          Definir Meta Mensal &amp; Comissão do Vendedor
        </div>
        <div className="grid sm:grid-cols-4 gap-2 text-xs">
          <input
            value={vendedorNome}
            onChange={(e) => setVendedorNome(e.target.value)}
            placeholder="Nome do vendedor (igual ao ERP)"
            className="px-3 py-2 rounded-xl bg-[#090d16] border border-white/10 text-white"
          />
          <input
            type="number"
            value={metaFat}
            onChange={(e) => setMetaFat(e.target.value)}
            placeholder="Meta R$"
            className="px-3 py-2 rounded-xl bg-[#090d16] border border-white/10 text-white"
          />
          <input
            type="number"
            value={metaQtd}
            onChange={(e) => setMetaQtd(e.target.value)}
            placeholder="Qtd aparelhos"
            className="px-3 py-2 rounded-xl bg-[#090d16] border border-white/10 text-white"
          />
          <input
            type="number"
            step="0.1"
            value={comissaoPct}
            onChange={(e) => setComissaoPct(e.target.value)}
            placeholder="Comissão %"
            className="px-3 py-2 rounded-xl bg-[#090d16] border border-white/10 text-white"
          />
        </div>
        <button
          onClick={salvarMeta}
          className="px-4 py-2 rounded-xl bg-[#0066FF] hover:bg-[#0052CC] text-xs font-semibold text-white"
        >
          Salvar Meta
        </button>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {evolucao.map((ev) => {
          const pct = Number(ev.progressoFatPct) || 0;
          return (
            <div
              key={String(ev.vendedor)}
              className="p-4 rounded-2xl bg-[#0f172a] border border-white/10 space-y-2"
            >
              <div className="flex justify-between items-center">
                <strong className="text-sm text-white">{String(ev.vendedor)}</strong>
                <span className="text-emerald-400 font-bold text-sm">
                  {formatBRL(Number(ev.faturamento))}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-[#0066FF]"
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>
                  {String(ev.quantidade)} venda(s) • TM {formatBRL(Number(ev.ticketMedio))}
                </span>
                <span>
                  Meta: {formatBRL(Number(ev.metaFaturamento))} ({pct}%)
                </span>
              </div>
              <div className="text-[11px] text-blue-300">
                Comissão estimada ({String(ev.comissaoPercentual)}%):{' '}
                <strong>{formatBRL(Number(ev.comissaoEstimada))}</strong>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AcademySection({ buildHeaders }: SectionProps) {
  const [conteudos, setConteudos] = useState<Array<Record<string, unknown>>>([]);
  const [titulo, setTitulo] = useState('');
  const [conteudo, setConteudo] = useState('');
  const [videoUrl, setVideoUrl] = useState('');

  const carregar = useCallback(async () => {
    const h = await buildHeaders();
    const res = await fetch('/api/crm-bridge/academy', { headers: h, credentials: 'include' });
    const d = await res.json();
    if (res.ok && d.ok) setConteudos(d.conteudos || []);
  }, [buildHeaders]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const adicionar = async () => {
    if (!titulo.trim()) return;
    const h = await buildHeaders();
    const res = await fetch('/api/crm-bridge/academy', {
      method: 'POST',
      headers: h,
      credentials: 'include',
      body: JSON.stringify({ titulo, conteudo, videoUrl }),
    });
    if (res.ok) {
      setTitulo('');
      setConteudo('');
      setVideoUrl('');
      carregar();
    }
  };

  const remover = async (id: string) => {
    const h = await buildHeaders();
    await fetch(`/api/crm-bridge/academy?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: h,
      credentials: 'include',
    });
    carregar();
  };

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-2xl bg-[#0f172a] border border-white/10 space-y-2.5">
        <div className="font-bold text-white text-sm flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-[#007BFF]" />
          Adicionar Treinamento / Playbook da Loja
        </div>
        <div className="grid sm:grid-cols-2 gap-2">
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Título do script ou aula..."
            className="px-3 py-2 rounded-xl bg-[#090d16] border border-white/10 text-xs text-white"
          />
          <input
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="Link do vídeo (YouTube/Drive — opcional)"
            className="px-3 py-2 rounded-xl bg-[#090d16] border border-white/10 text-xs text-white"
          />
        </div>
        <textarea
          rows={2}
          value={conteudo}
          onChange={(e) => setConteudo(e.target.value)}
          placeholder="Roteiro, passos ou dicas para a equipe..."
          className="w-full p-2.5 rounded-xl bg-[#090d16] border border-white/10 text-xs text-white"
        />
        <button
          onClick={adicionar}
          className="px-4 py-2 rounded-xl bg-[#0066FF] hover:bg-[#0052CC] text-xs font-semibold text-white flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" /> Publicar no Academy
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        {conteudos.map((c) => (
          <div
            key={String(c.id)}
            className="p-4 rounded-2xl bg-[#0f172a] border border-white/10 space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-[10px] uppercase font-bold text-blue-300">
                  {String(c.categoria)} • {String(c.duracao)}
                </span>
                <h3 className="font-bold text-sm text-white">{String(c.titulo)}</h3>
              </div>
              {!c.builtin && (
                <button
                  onClick={() => remover(String(c.id))}
                  className="text-red-400 hover:text-red-300 p-1"
                  title="Excluir"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <p className="text-xs text-slate-300 whitespace-pre-wrap">
              {String(c.conteudo_markdown || '')}
            </p>
            {Boolean(c.video_url) && (
              <a
                href={String(c.video_url)}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-[#007BFF] underline inline-block"
              >
                Assistir aula em vídeo →
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
