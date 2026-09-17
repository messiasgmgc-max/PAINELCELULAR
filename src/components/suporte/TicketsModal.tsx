'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import {
  LifeBuoy,
  Plus,
  MessageSquare,
  X,
  Loader2,
  Send,
  ChevronRight,
  HelpCircle,
} from 'lucide-react';

interface Resposta {
  id: string;
  autor_nome: string;
  autor_email: string;
  is_staff: boolean;
  mensagem: string;
  created_at: string;
}

interface Ticket {
  id: string;
  loja_id: string;
  assunto: string;
  mensagem: string;
  prioridade: string;
  categoria: string;
  status: 'aberto' | 'em_andamento' | 'respondido' | 'fechado';
  respostas: Resposta[];
  created_at: string;
  updated_at: string;
}

interface TicketsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TicketsModal({ open, onOpenChange }: TicketsModalProps) {
  const { usuario } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);

  // Form states para novo ticket
  const [showNewForm, setShowNewForm] = useState(false);
  const [assunto, setAssunto] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [prioridade, setPrioridade] = useState('normal');
  const [categoria, setCategoria] = useState('duvida');
  const [enviando, setEnviando] = useState(false);

  // Form state para resposta
  const [respostaTexto, setRespostaTexto] = useState('');
  const [enviandoResposta, setEnviandoResposta] = useState(false);

  const carregarTickets = async () => {
    if (!usuario) return;
    setLoading(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) return;

      const res = await fetch('/api/tickets', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.tickets) {
        setTickets(data.tickets);
        if (selectedTicket) {
          const atualizado = data.tickets.find((t: Ticket) => t.id === selectedTicket.id);
          if (atualizado) setSelectedTicket(atualizado);
        }
      }
    } catch (e) {
      console.warn('Erro ao carregar tickets:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      carregarTickets();
    } else {
      setShowNewForm(false);
      setSelectedTicket(null);
    }
  }, [open]);

  if (!open) return null;

  const handleCriarTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assunto.trim() || !mensagem.trim()) {
      toast.error('Preencha o assunto e a mensagem do chamado.');
      return;
    }

    setEnviando(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          assunto,
          mensagem,
          prioridade,
          categoria,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao abrir chamado.');

      toast.success('Chamado aberto com sucesso! E-mail de confirmação enviado.');
      setAssunto('');
      setMensagem('');
      setShowNewForm(false);
      await carregarTickets();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao abrir chamado.');
    } finally {
      setEnviando(false);
    }
  };

  const handleEnviarResposta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !respostaTexto.trim()) return;

    setEnviandoResposta(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      const res = await fetch(`/api/tickets/${selectedTicket.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          resposta: respostaTexto,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao enviar resposta.');

      toast.success('Resposta enviada com sucesso!');
      setRespostaTexto('');
      await carregarTickets();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao enviar resposta.');
    } finally {
      setEnviandoResposta(false);
    }
  };

  const statusBadge = (status: Ticket['status']) => {
    switch (status) {
      case 'aberto':
        return <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30">Aberto</Badge>;
      case 'em_andamento':
        return <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30">Em Análise</Badge>;
      case 'respondido':
        return <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">Respondido</Badge>;
      case 'fechado':
        return <Badge className="bg-slate-500/20 text-slate-300 border-slate-500/30">Fechado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="fixed inset-0 z-[1050] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-slate-950 border border-white/10 text-white rounded-3xl p-6 shadow-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* HEADER */}
        <div className="pb-3 border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <LifeBuoy className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white">Central de Suporte & Chamados</h3>
              <p className="text-xs text-slate-400">
                Fale com a equipe técnica do Phone Center via suporte@phonecenter.tech
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!showNewForm && !selectedTicket && (
              <Button
                onClick={() => setShowNewForm(true)}
                size="sm"
                className="bg-blue-600 hover:bg-blue-500 font-semibold gap-1 text-xs"
              >
                <Plus className="w-4 h-4" /> Novo Chamado
              </Button>
            )}
            <button
              onClick={() => onOpenChange(false)}
              className="p-1.5 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* CORPO MODAL */}
        <div className="flex-1 overflow-y-auto py-3 space-y-4 pr-1">
          {/* VISUALIZAÇÃO: CRIAR NOVO TICKET */}
          {showNewForm ? (
            <form onSubmit={handleCriarTicket} className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <MessageSquare className="w-4 h-4 text-blue-400" /> Abrir Novo Chamado de Suporte
                </h4>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowNewForm(false)}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Voltar para lista
                </Button>
              </div>

              <div className="space-y-3 bg-white/5 p-4 rounded-2xl border border-white/10">
                <div>
                  <label className="text-xs font-semibold text-slate-300">Assunto / Motivo</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Dúvida sobre integração WhatsApp ou nota fiscal"
                    value={assunto}
                    onChange={(e) => setAssunto(e.target.value)}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-300">Categoria</label>
                    <select
                      value={categoria}
                      onChange={(e) => setCategoria(e.target.value)}
                      className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-sm text-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="duvida">Dúvida Geral</option>
                      <option value="problema_tecnico">Problema Técnico / Erro</option>
                      <option value="financeiro">Financeiro & Planos</option>
                      <option value="sugestao">Sugestão de Recurso</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300">Prioridade</label>
                    <select
                      value={prioridade}
                      onChange={(e) => setPrioridade(e.target.value)}
                      className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-sm text-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="baixa">Baixa</option>
                      <option value="normal">Normal</option>
                      <option value="alta">Alta</option>
                      <option value="urgente">Urgente (Sistema Inoperante)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300">Mensagem detalhada</label>
                  <textarea
                    required
                    rows={4}
                    placeholder="Explique detalhadamente o que precisa de suporte..."
                    value={mensagem}
                    onChange={(e) => setMensagem(e.target.value)}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-sm text-white focus:outline-none focus:border-blue-500 resize-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setShowNewForm(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={enviando} className="bg-blue-600 hover:bg-blue-500 font-bold">
                  {enviando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                  Enviar Chamado
                </Button>
              </div>
            </form>
          ) : selectedTicket ? (
            /* VISUALIZAÇÃO: DETALHES DO TICKET SELECIONADO */
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-blue-400">
                      #{selectedTicket.id.slice(0, 8).toUpperCase()}
                    </span>
                    {statusBadge(selectedTicket.status)}
                    <span className="text-[11px] text-slate-400">
                      {new Date(selectedTicket.created_at).toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-white mt-1">{selectedTicket.assunto}</h3>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedTicket(null)}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Voltar para lista
                </Button>
              </div>

              {/* Mensagem Original */}
              <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-1.5">
                <p className="text-xs font-bold text-slate-300">Mensagem Inicial:</p>
                <p className="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
                  {selectedTicket.mensagem}
                </p>
              </div>

              {/* Histórico de Respostas */}
              <div className="space-y-2.5">
                <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Histórico de Mensagens</h5>
                {selectedTicket.respostas && selectedTicket.respostas.length > 0 ? (
                  selectedTicket.respostas.map((r, i) => (
                    <div
                      key={r.id || i}
                      className={`p-3.5 rounded-2xl border text-xs space-y-1 ${
                        r.is_staff
                          ? 'bg-blue-500/10 border-blue-500/30 ml-4'
                          : 'bg-white/5 border-white/10 mr-4'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-white flex items-center gap-1.5">
                          {r.is_staff ? (
                            <span className="text-blue-400 font-bold">🛡️ Suporte Phone Center</span>
                          ) : (
                            <span>{r.autor_nome}</span>
                          )}
                        </span>
                        <span className="text-slate-400">{new Date(r.created_at).toLocaleString('pt-BR')}</span>
                      </div>
                      <p className="text-slate-200 whitespace-pre-wrap leading-relaxed">{r.mensagem}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-500 italic">Aguardando primeira resposta da equipe de suporte.</p>
                )}
              </div>

              {/* Form de Resposta */}
              <form onSubmit={handleEnviarResposta} className="pt-2 flex gap-2">
                <input
                  type="text"
                  placeholder="Escreva uma resposta..."
                  value={respostaTexto}
                  onChange={(e) => setRespostaTexto(e.target.value)}
                  className="flex-1 px-3.5 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white focus:outline-none focus:border-blue-500"
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={enviandoResposta || !respostaTexto.trim()}
                  className="bg-blue-600 hover:bg-blue-500 font-bold shrink-0"
                >
                  {enviandoResposta ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                </Button>
              </form>
            </div>
          ) : (
            /* VISUALIZAÇÃO: LISTAGEM DE TICKETS */
            <div className="space-y-3">
              {loading ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                  <span className="text-xs">Carregando chamados...</span>
                </div>
              ) : tickets.length === 0 ? (
                <div className="py-12 text-center rounded-2xl border border-white/10 bg-white/5 p-6 space-y-3">
                  <div className="w-12 h-12 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center mx-auto border border-blue-500/20">
                    <HelpCircle className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="font-bold text-sm text-white">Nenhum chamado aberto</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Precisa de ajuda com alguma funcionalidade ou configuração? Abra um chamado de suporte!
                    </p>
                  </div>
                  <Button
                    onClick={() => setShowNewForm(true)}
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-500 font-bold text-xs"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" /> Abrir Meu Primeiro Chamado
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {tickets.map((t) => (
                    <div
                      key={t.id}
                      onClick={() => setSelectedTicket(t)}
                      className="p-3.5 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all cursor-pointer flex items-center justify-between gap-3 group"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] font-mono font-bold text-blue-400">
                            #{t.id.slice(0, 8).toUpperCase()}
                          </span>
                          {statusBadge(t.status)}
                          <span className="text-[10px] text-slate-400">
                            {new Date(t.created_at).toLocaleDateString('pt-BR')}
                          </span>
                        </div>
                        <p className="text-xs font-bold text-white truncate group-hover:text-blue-300 transition-colors">
                          {t.assunto}
                        </p>
                        <p className="text-[11px] text-slate-400 line-clamp-1">{t.mensagem}</p>
                      </div>

                      <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors shrink-0" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
