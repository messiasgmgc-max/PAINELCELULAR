'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { GlassCard } from './GlassCard';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { MessageCircle, Wifi, WifiOff, QrCode, List, Smartphone, Play, RefreshCcw } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export function WhatsappTab() {
  const { usuario } = useAuth();
  const [status, setStatus] = useState('Desconectado');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    if (!usuario?.lojaId) return;

    // 1. Carregar dados iniciais
    const loadInitialData = async () => {
      const { data: session } = await supabase
        .from('whatsapp_sessions')
        .select('*')
        .eq('loja_id', usuario.lojaId)
        .single();
      
      if (session) {
        const s = session.status;
        if (['connected', 'isLogged', 'inChat', 'qrReadSuccess', 'chatsAvailable'].includes(s)) {
          setStatus('Conectado');
        } else if (s === 'qr_code' || s === 'notLogged' || s === 'waitingChat') {
          setStatus('Aguardando QR Code');
        } else if (session.status === 'initializing') {
          setStatus('Iniciando...');
        }
        setQrCode(session.qr_code);
      }

      const { data: logsData } = await supabase
        .from('whatsapp_logs')
        .select('*')
        .eq('loja_id', usuario.lojaId)
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (logsData) setLogs(logsData);
    };

    loadInitialData();

    // 2. Escutar mudanças em tempo real via Supabase
    const channel = supabase
      .channel('whatsapp_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_sessions', filter: `loja_id=eq.${usuario.lojaId}` }, 
        (payload: any) => {
          console.log('Mudança no WhatsApp:', payload.new);
          const newStatus = payload.new.status;
          if (['connected', 'isLogged', 'inChat', 'qrReadSuccess', 'chatsAvailable'].includes(newStatus)) {
            setStatus('Conectado');
            setQrCode(null); // Limpa o QR Code ao conectar
          } else if (newStatus === 'qr_code' || newStatus === 'notLogged' || newStatus === 'waitingChat') {
            setStatus('Aguardando QR Code');
            if (payload.new.qr_code) setQrCode(payload.new.qr_code);
          } else if (newStatus === 'initializing') {
            setStatus('Iniciando...');
          }
        }
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'whatsapp_logs', filter: `loja_id=eq.${usuario.lojaId}` }, 
        (payload: any) => {
          console.log('Novo log de preço recebido:', payload.new);
          setLogs(prev => [payload.new, ...prev].slice(0, 20));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [usuario?.lojaId]);

  const handleConnect = async () => {
    if (!usuario?.lojaId) {
      alert('Erro: ID da loja não encontrado. Tente sair e entrar novamente no sistema.');
      return;
    }

    if (status === 'Iniciando...' || status === 'Aguardando QR Code') {
      return; // Evita múltiplos cliques enquanto processa
    }

    try {
      // Atualiza o banco para avisar o script que deve começar
      const { error } = await supabase
        .from('whatsapp_sessions')
        .upsert({ 
          loja_id: usuario.lojaId, 
          status: 'initializing', 
          qr_code: null,
          session_name: `loja-${usuario.lojaId}`
        }, { onConflict: 'loja_id' });
      
      if (error) {
        console.error('Erro Supabase (Upsert):', error.message, error.details, error.hint);
        throw error;
      }

      setStatus('Iniciando...');
      setQrCode(null);
    } catch (err: any) {
      console.error('Erro completo ao iniciar conexão:', err);
      alert('Erro ao salvar no banco: ' + (err.message || 'Erro desconhecido. Verifique o console do navegador.'));
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Deseja realmente interromper a tentativa de conexão?')) return;
    try {
      await supabase
        .from('whatsapp_sessions')
        .update({ status: 'disconnected', qr_code: null })
        .eq('loja_id', usuario?.lojaId);
      
      setStatus('Desconectado');
      setQrCode(null);
    } catch (err) {
      console.error('Erro ao desconectar:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Status Card - Liquid Glass */}
      <GlassCard className="flex items-center justify-between rounded-3xl">
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-full ${status === 'Conectado' ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>
            {status === 'Conectado' ? <Wifi className="w-6 h-6" /> : <WifiOff className="w-6 h-6" />}
          </div>
          <div>
            <h2 className="text-xl font-bold">Leitor de Preços WhatsApp</h2>
            <p className="text-sm text-muted-foreground">Monitoramento automático de fornecedores</p>
          </div>
        </div>
        <Badge variant={status === 'Conectado' ? 'default' : 'destructive'} className="rounded-full px-4">
          {status}
        </Badge>
      </GlassCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* QR Code Section */}
        <GlassCard className="flex flex-col items-center justify-center min-h-[450px] rounded-[2.5rem]">
          <div className="flex items-center gap-2 mb-8">
            <QrCode className="w-5 h-5 text-blue-600" />
            <h3 className="font-bold uppercase text-xs tracking-widest text-slate-500">Autenticação</h3>
          </div>
          
          {qrCode ? (
            <div className="flex flex-col items-center gap-6">
              <div className="bg-white p-6 rounded-[2rem] shadow-2xl border-4 border-blue-500/20">
                <img src={qrCode} alt="WhatsApp QR Code" className="w-64 h-64" />
              </div>
              <Button variant="outline" onClick={handleDisconnect} className="rounded-full gap-2">
                <RefreshCcw className="w-4 h-4" /> Cancelar e Tentar Novamente
              </Button>
            </div>
          ) : status === 'Conectado' ? (
            <div className="text-center space-y-4 animate-in zoom-in duration-300">
              <div className="w-24 h-24 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-green-500/20">
                <MessageCircle className="w-12 h-12" />
              </div>
              <p className="font-bold text-xl text-slate-800 dark:text-white">WhatsApp Ativo</p>
              <p className="text-sm text-muted-foreground max-w-[250px]">O robô está lendo mensagens e atualizando o banco de dados.</p>
            </div>
          ) : status === 'Desconectado' ? (
            <div className="text-center space-y-6">
              <div className="w-24 h-24 bg-slate-500/10 text-slate-400 rounded-full flex items-center justify-center mx-auto">
                <WifiOff className="w-12 h-12" />
              </div>
              <p className="text-muted-foreground">Sessão não iniciada para esta loja.</p>
              <Button onClick={handleConnect} className="bg-blue-600 hover:bg-blue-700 gap-2 rounded-full px-8">
                <Play className="w-4 h-4" /> Iniciar Conexão
              </Button>
            </div>
          ) : (
            <div className="text-muted-foreground flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <p className="animate-pulse">Iniciando motor do WhatsApp...</p>
              <Button variant="ghost" onClick={handleDisconnect} className="text-xs text-red-500 hover:bg-red-50">
                Cancelar
              </Button>
            </div>
          )}
        </GlassCard>

        {/* Logs Section */}
        <GlassCard className="h-[450px] rounded-[2.5rem] overflow-hidden !p-0">
          <div className="p-6 flex flex-col h-full">
            <div className="flex items-center gap-2 mb-4 border-b border-white/10 pb-4 flex-shrink-0">
            <List className="w-5 h-5 text-blue-600" />
            <h3 className="font-bold uppercase text-xs tracking-widest text-slate-500">Últimas Atualizações</h3>
          </div>
          
            <div className="flex-1 overflow-y-auto space-y-3 pr-2">
            {logs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm italic gap-2">
                <Smartphone className="w-8 h-8 opacity-20" />
                Aguardando mensagens...
              </div>
            ) : (
              logs.map((log, i) => (
                <div key={i} className="p-4 rounded-2xl bg-white/10 dark:bg-white/5 border border-white/10 hover:border-blue-500/30 transition-all">
                  <div className="flex justify-between text-xs mb-2">
                    <span className="font-bold text-blue-500">{log.contato}</span>
                    <span className="text-gray-500">{log.created_at ? new Date(log.created_at).toLocaleTimeString() : ''}</span>
                  </div>
                  <p className="text-sm italic text-slate-600 dark:text-slate-400 mb-3">"{log.mensagem}"</p>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-green-600 text-white font-bold">R$ {Number(log.preco || 0).toFixed(2)}</Badge>
                    <Badge variant="outline" className="uppercase text-[10px] border-blue-500/50 text-blue-500">{log.peca}</Badge>
                  </div>
                </div>
              ))
            )}
          </div>
          </div>
        </GlassCard>
      </div>
    </div>
  )
}