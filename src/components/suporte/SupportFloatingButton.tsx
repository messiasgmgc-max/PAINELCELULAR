'use client';

import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { LifeBuoy } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabaseClient';
import { checkIsSuperAdmin } from '@/lib/utils';

const ChatSuporteWidget = dynamic(
  () => import('./ChatSuporteWidget').then((m) => m.ChatSuporteWidget),
  { ssr: false }
);

export function SupportFloatingButton() {
  const { usuario } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const userId = usuario?.id;
  const userLojaId = usuario?.lojaId || (usuario as any)?.loja_id || null;
  const isSuperAdmin = checkIsSuperAdmin(usuario);

  const checarNaoLidas = useCallback(async () => {
    if (!userId) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) return;

      const url = isSuperAdmin
        ? `/api/chat-suporte?conversas=true&t=${Date.now()}`
        : userLojaId
        ? `/api/chat-suporte?loja_id=${userLojaId}&t=${Date.now()}`
        : `/api/chat-suporte?t=${Date.now()}`;

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Cache-Control': 'no-cache, no-store',
        },
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data = await res.json();

      if (isSuperAdmin && data.conversas) {
        const total = data.conversas.reduce((acc: number, c: any) => acc + (c.nao_lidas || 0), 0);
        setUnreadCount(total);
      } else if (data.mensagens) {
        const total = data.mensagens.filter((m: any) => !m.lida && m.remetente === 'suporte').length;
        setUnreadCount(total);
      }
    } catch {
      // Ignora erro silenciosamente
    }
  }, [userId, userLojaId, isSuperAdmin]);

  useEffect(() => {
    if (!userId) return;
    // Atrasa a primeira checagem para não disputar rede com o carregamento inicial da loja
    const initialTimer = setTimeout(checarNaoLidas, 1500);
    const interval = setInterval(checarNaoLidas, 30_000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checarNaoLidas();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [userId, checarNaoLidas]);

  useEffect(() => {
    const handleAbrirChat = () => setIsOpen(true);
    window.addEventListener('phonecenter:abrir-chat-suporte', handleAbrirChat);
    return () => window.removeEventListener('phonecenter:abrir-chat-suporte', handleAbrirChat);
  }, []);

  if (!usuario) return null;

  return (
    <>
      <div className="fixed bottom-5 right-5 z-[990] flex items-center group">
        <button
          onClick={() => setIsOpen(true)}
          className="relative flex items-center gap-2 bg-gradient-to-r from-blue-600 via-cyan-600 to-indigo-600 hover:from-blue-500 hover:to-cyan-400 text-white px-3.5 py-2.5 rounded-full shadow-2xl shadow-cyan-600/40 border border-cyan-300/30 hover:scale-105 active:scale-95 transition-all cursor-pointer font-bold text-xs group"
          title="Suporte Phone Center"
          aria-label="Abrir Chat de Suporte"
        >
          <div className="relative">
            <LifeBuoy className="w-4 h-4 text-cyan-200 group-hover:rotate-45 transition-transform duration-300" />
            <span className="absolute -top-1 -right-1 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
            </span>
          </div>

          <span className="hidden sm:inline tracking-wide">Suporte</span>

          {unreadCount > 0 && (
            <span className="bg-red-500 text-white font-black text-[10px] px-1.5 py-0.5 rounded-full shadow-md animate-pulse">
              {unreadCount}
            </span>
          )}
        </button>
      </div>

      {isOpen && <ChatSuporteWidget isOpen={isOpen} onClose={() => setIsOpen(false)} />}
    </>
  );
}
