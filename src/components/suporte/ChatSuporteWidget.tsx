'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabaseClient';
import { checkIsSuperAdmin } from '@/lib/utils';
import { toast } from 'sonner';
import {
  LifeBuoy,
  MessageCircle,
  Send,
  X,
  Loader2,
  ChevronDown,
  Minimize2,
  Maximize2,
  Building2,
  Shield,
  Volume2,
  VolumeX,
  Sparkles,
  HelpCircle,
  Check,
  CheckCheck,
  Search,
} from 'lucide-react';

export interface MensagemChat {
  id: string;
  loja_id: string;
  usuario_id?: string;
  autor_nome: string;
  autor_email: string;
  remetente: 'cliente' | 'suporte';
  mensagem: string;
  anexo_url?: string | null;
  lida: boolean;
  created_at: string;
}

interface ConversaLoja {
  loja_id: string;
  loja_nome: string;
  loja_logo?: string | null;
  ultima_mensagem?: MensagemChat | null;
  nao_lidas: number;
  total_mensagens: number;
}

interface ChatSuporteWidgetProps {
  isOpen: boolean;
  onClose: () => void;
  overrideLojaId?: string;
}

export function ChatSuporteWidget({ isOpen, onClose, overrideLojaId }: ChatSuporteWidgetProps) {
  const { usuario } = useAuth();
  const isSuperAdmin = checkIsSuperAdmin(usuario);

  const [mensagens, setMensagens] = useState<MensagemChat[]>([]);
  const [conversas, setConversas] = useState<ConversaLoja[]>([]);
  const [selectedLojaId, setSelectedLojaId] = useState<string | null>(overrideLojaId || null);
  const [selectedLojaNome, setSelectedLojaNome] = useState<string>('Minha Loja');
  
  const [loading, setLoading] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [texto, setTexto] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [termoBuscaConversa, setTermoBuscaConversa] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousMessageCount = useRef<number>(0);

  // Efeito sonoro discreto de notificação
  const playNotificationSound = () => {
    if (!soundEnabled || typeof window === 'undefined') return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.25);
    } catch (e) {
      // Ignora erro de áudio
    }
  };

  // Scroll automático para a última mensagem
  const scrollToBottom = (smooth = true) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
    }
  };

  // Carrega mensagens sem cache (force-fresh)
  const carregarMensagens = async (isPolling = false) => {
    if (!usuario) return;
    if (!isPolling) setLoading(true);

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) return;

      const targetLoja = isSuperAdmin ? selectedLojaId : usuario.loja_id;
      const url = targetLoja
        ? `/api/chat-suporte?loja_id=${targetLoja}&t=${Date.now()}`
        : `/api/chat-suporte?t=${Date.now()}`;

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
        },
        cache: 'no-store',
      });

      const data = await res.json();

      if (data.mensagens) {
        const novasMensagens: MensagemChat[] = data.mensagens;
        
        // Se chegou mensagem nova vinda da outra ponta, toca som
        if (
          isPolling &&
          novasMensagens.length > previousMessageCount.current &&
          previousMessageCount.current > 0
        ) {
          const ultima = novasMensagens[novasMensagens.length - 1];
          const souRemetente = isSuperAdmin ? ultima.remetente === 'suporte' : ultima.remetente === 'cliente';
          if (!souRemetente) {
            playNotificationSound();
          }
        }

        previousMessageCount.current = novasMensagens.length;
        setMensagens(novasMensagens);

        if (data.loja?.nome) {
          setSelectedLojaNome(data.loja.nome);
        }
      }
    } catch (e) {
      console.warn('Aviso sincronização chat suporte:', e);
    } finally {
      if (!isPolling) setLoading(false);
    }
  };

  // Super Admin: Carrega lista de conversas de todas as lojas
  const carregarConversasAdmin = async () => {
    if (!isSuperAdmin || !usuario) return;
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) return;

      const res = await fetch(`/api/chat-suporte?conversas=true&t=${Date.now()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
        cache: 'no-store',
      });
      const data = await res.json();
      if (data.conversas) {
        setConversas(data.conversas);
      }
    } catch (e) {
      console.warn('Erro ao listar conversas de lojas:', e);
    }
  };

  // Inicialização e Polling em Tempo Real (3 segundos)
  useEffect(() => {
    if (!isOpen) return;

    // Se for lojista comum, fixa na loja dele
    if (!isSuperAdmin && usuario?.loja_id) {
      setSelectedLojaId(usuario.loja_id);
    }

    carregarMensagens(false);
    if (isSuperAdmin) {
      carregarConversasAdmin();
    }

    const interval = setInterval(() => {
      carregarMensagens(true);
      if (isSuperAdmin) carregarConversasAdmin();
    }, 3000);

    return () => clearInterval(interval);
  }, [isOpen, selectedLojaId, isSuperAdmin, usuario]);

  // Scroll sempre que as mensagens mudarem
  useEffect(() => {
    scrollToBottom(true);
  }, [mensagens]);

  // Foco no input ao abrir
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, selectedLojaId]);

  if (!isOpen) return null;

  // Envio de nova mensagem
  const handleEnviarMensagem = async (e?: React.FormEvent, textoCustom?: string) => {
    if (e) e.preventDefault();
    const mensagemTexto = (textoCustom || texto).trim();
    if (!mensagemTexto || enviando) return;

    const targetLoja = isSuperAdmin ? selectedLojaId : usuario?.loja_id;
    if (!targetLoja) {
      toast.error('Selecione uma loja para responder.');
      return;
    }

    setEnviando(true);
    const tempId = `temp_${Date.now()}`;
    const mensagemOtimista: MensagemChat = {
      id: tempId,
      loja_id: targetLoja,
      autor_nome: usuario?.nome || (isSuperAdmin ? 'Suporte Phone Center' : 'Lojista'),
      autor_email: usuario?.email || '',
      remetente: isSuperAdmin ? 'suporte' : 'cliente',
      mensagem: mensagemTexto,
      lida: false,
      created_at: new Date().toISOString(),
    };

    // Atualização otimista imediata na UI
    setMensagens((prev) => [...prev, mensagemOtimista]);
    setTexto('');

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      const res = await fetch('/api/chat-suporte', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          loja_id: targetLoja,
          mensagem: mensagemTexto,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao enviar mensagem.');

      // Substitui mensagem temporária pela oficial persistida no banco
      if (data.mensagem) {
        setMensagens((prev) => prev.map((m) => (m.id === tempId ? data.mensagem : m)));
      }

      if (isSuperAdmin) carregarConversasAdmin();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao enviar mensagem.');
      // Remove mensagem otimista em caso de falha
      setMensagens((prev) => prev.filter((m) => m.id !== tempId));
      setTexto(mensagemTexto);
    } finally {
      setEnviando(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const conversasFiltradas = conversas.filter((c) =>
    c.loja_nome.toLowerCase().includes(termoBuscaConversa.toLowerCase())
  );

  const sugestoesRapidas = [
    'Como emitir Nota Fiscal no sistema?',
    'Dúvida sobre configuração das Taxas de Maquininha',
    'Preciso de ajuda com a renovação do meu plano',
    'Como importar meu histórico de vendas em CSV?',
    'Como funciona a vitrine pública e agendamentos?',
  ];

  return (
    <div
      className={`fixed z-[1060] transition-all duration-300 ${
        isExpanded
          ? 'inset-3 sm:inset-6 max-w-5xl mx-auto h-[92vh]'
          : 'bottom-4 right-4 w-[94vw] sm:w-[460px] h-[640px] max-h-[88vh]'
      } flex flex-col rounded-3xl bg-slate-950/95 backdrop-blur-2xl border border-white/15 text-white shadow-2xl shadow-cyan-950/40 overflow-hidden animate-in fade-in zoom-in-95 duration-200`}
    >
      {/* HEADER DO CHAT */}
      <div className="px-4 py-3.5 bg-slate-900/90 border-b border-white/10 flex items-center justify-between shrink-0 select-none">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative shrink-0">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 via-cyan-500 to-emerald-400 p-[2px] shadow-lg shadow-cyan-500/20">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center text-cyan-400 font-bold">
                {isSuperAdmin ? <Shield className="w-5 h-5 text-indigo-400" /> : <LifeBuoy className="w-5 h-5 text-cyan-400" />}
              </div>
            </div>
            {/* Status Online Pulse */}
            <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-slate-950"></span>
            </span>
          </div>

          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white truncate leading-none">
                {isSuperAdmin ? 'Central de Atendimento (Admin)' : 'Suporte Phone Center'}
              </h3>
              <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[9px] px-1.5 py-0 h-4">
                Online
              </Badge>
            </div>
            <p className="text-[11px] text-slate-400 truncate mt-1 flex items-center gap-1">
              <span className="text-cyan-400 font-medium">
                {isSuperAdmin
                  ? selectedLojaId
                    ? `Atendendo: ${selectedLojaNome}`
                    : 'Selecione uma loja'
                  : 'Atendimento direto com o time técnico'}
              </span>
            </p>
          </div>
        </div>

        {/* CONTROLES DO TOPO */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-1.5 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition"
            title={soundEnabled ? 'Desativar som' : 'Ativar som'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-cyan-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
          </button>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition hidden sm:block"
            title={isExpanded ? 'Reduzir' : 'Expandir'}
          >
            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-red-500/20 text-slate-400 hover:text-red-300 transition"
            title="Fechar Chat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* CORPO DO CHAT */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* SUPER ADMIN SIDEBAR COM LISTA DE LOJAS */}
        {isSuperAdmin && (
          <div className="w-64 border-r border-white/10 bg-slate-950/60 flex flex-col shrink-0 hidden md:flex">
            <div className="p-2.5 border-b border-white/10">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Buscar loja..."
                  value={termoBuscaConversa}
                  onChange={(e) => setTermoBuscaConversa(e.target.value)}
                  className="w-full bg-slate-900/80 border border-white/10 rounded-xl pl-8 pr-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
              {conversasFiltradas.length === 0 ? (
                <p className="text-[11px] text-slate-500 p-3 text-center">Nenhuma loja encontrada.</p>
              ) : (
                conversasFiltradas.map((conv) => {
                  const isSelected = selectedLojaId === conv.loja_id;
                  return (
                    <button
                      key={conv.loja_id}
                      onClick={() => {
                        setSelectedLojaId(conv.loja_id);
                        setSelectedLojaNome(conv.loja_nome);
                      }}
                      className={`w-full text-left p-2.5 rounded-2xl transition flex items-start gap-2.5 border cursor-pointer ${
                        isSelected
                          ? 'bg-cyan-950/50 border-cyan-500/40 shadow-sm'
                          : 'bg-white/5 hover:bg-white/10 border-white/5'
                      }`}
                    >
                      <div className="w-7 h-7 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5 border border-blue-500/30">
                        {conv.loja_nome.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold text-white truncate">{conv.loja_nome}</p>
                          {conv.nao_lidas > 0 && (
                            <Badge className="bg-red-500 text-white text-[9px] h-4 px-1.5 rounded-full font-bold">
                              {conv.nao_lidas}
                            </Badge>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 truncate mt-0.5">
                          {conv.ultima_mensagem?.mensagem || 'Sem mensagens recentes'}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* CONTAINER DE MENSAGENS */}
        <div className="flex-1 flex flex-col min-w-0 bg-gradient-to-b from-slate-950/80 via-slate-900/40 to-slate-950/90">
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
            {/* Aviso de Persistência e Notificação por E-mail */}
            <div className="p-3 rounded-2xl bg-cyan-950/30 border border-cyan-500/20 text-center space-y-1">
              <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-cyan-300">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span>Chat com Atendimento Direto</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                As mensagens são salvas permanentemente no banco de dados e enviadas diretamente por e-mail para a nossa equipe. Você pode recarregar ou fechar a qualquer momento sem perder o histórico!
              </p>
            </div>

            {loading && mensagens.length === 0 ? (
              <div className="py-16 flex flex-col items-center justify-center gap-2 text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
                <span className="text-xs">Carregando conversa...</span>
              </div>
            ) : mensagens.length === 0 ? (
              <div className="py-10 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center mx-auto border border-cyan-500/20">
                  <MessageCircle className="w-6 h-6" />
                </div>
                <div className="space-y-1 max-w-xs mx-auto">
                  <p className="text-xs font-bold text-white">Como podemos ajudar sua loja hoje?</p>
                  <p className="text-[11px] text-slate-400">
                    Envie sua dúvida, erro ou sugestão abaixo. Nosso suporte responderá imediatamente!
                  </p>
                </div>

                {/* Sugestões Rápidas de Dúvidas */}
                {!isSuperAdmin && (
                  <div className="pt-2 flex flex-wrap gap-1.5 justify-center max-w-sm mx-auto">
                    {sugestoesRapidas.map((sug, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleEnviarMensagem(undefined, sug)}
                        className="text-[11px] px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-cyan-500/20 border border-white/10 hover:border-cyan-500/40 text-slate-300 hover:text-cyan-200 transition text-left cursor-pointer"
                      >
                        {sug}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              mensagens.map((msg, index) => {
                const isMinhaMensagem = isSuperAdmin ? msg.remetente === 'suporte' : msg.remetente === 'cliente';
                const horaFormatada = new Date(msg.created_at).toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <div
                    key={msg.id || index}
                    className={`flex flex-col ${isMinhaMensagem ? 'items-end' : 'items-start'}`}
                  >
                    {/* Header da Mensagem com Nome */}
                    <div className="flex items-center gap-1.5 mb-1 px-1 text-[10px] text-slate-400">
                      <span className="font-semibold text-slate-300">
                        {msg.remetente === 'suporte' ? '🛡️ Suporte Phone Center' : msg.autor_nome || 'Lojista'}
                      </span>
                      <span>•</span>
                      <span>{horaFormatada}</span>
                    </div>

                    {/* Balão da Mensagem */}
                    <div
                      className={`max-w-[85%] sm:max-w-[75%] p-3.5 rounded-3xl text-xs leading-relaxed break-words shadow-md ${
                        isMinhaMensagem
                          ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-br-none border border-cyan-400/20'
                          : 'bg-slate-900 border border-white/10 text-slate-100 rounded-bl-none'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.mensagem}</p>

                      {/* Status de Envio */}
                      <div className="flex items-center justify-end gap-1 mt-1 text-[9px] text-white/70">
                        <span>{horaFormatada}</span>
                        {isMinhaMensagem && (
                          <CheckCheck className="w-3 h-3 text-cyan-200" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* INPUT BAR DO CHAT */}
          <form
            onSubmit={(e) => handleEnviarMensagem(e)}
            className="p-3 bg-slate-950/90 border-t border-white/10 flex items-center gap-2 shrink-0"
          >
            <input
              ref={inputRef}
              type="text"
              placeholder={
                isSuperAdmin
                  ? `Responder para ${selectedLojaNome}...`
                  : 'Digite sua dúvida ou mensagem para o suporte...'
              }
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              disabled={enviando}
              className="flex-1 px-4 py-2.5 rounded-2xl bg-slate-900 border border-white/15 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 shadow-inner"
            />

            <Button
              type="submit"
              size="sm"
              disabled={enviando || !texto.trim()}
              className="h-10 px-4 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 font-bold text-white shadow-lg shadow-cyan-500/25 shrink-0"
            >
              {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
