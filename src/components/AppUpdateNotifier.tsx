'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Sparkles, RefreshCw, X, ArrowUpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';

const LOCAL_VERSION_KEY = 'phonecenter_app_build_version';
const LAST_CHECK_KEY = 'phonecenter_app_last_check_time';

export function AppUpdateNotifier() {
  const { usuario, authReady } = useAuth();
  const [atualizacaoDisponivel, setAtualizacaoDisponivel] = useState(false);
  const [atualizando, setAtualizando] = useState(false);
  const [versaoServidor, setVersaoServidor] = useState<string | null>(null);
  const [ignorado, setIgnorado] = useState(false);

  const checarAtualizacao = useCallback(async (forcar = false) => {
    try {
      // Se não for forçado, checa no máximo a cada 60 segundos para economizar requisições
      const agora = Date.now();
      const ultimaChecagem = Number(localStorage.getItem(LAST_CHECK_KEY) || 0);
      if (!forcar && agora - ultimaChecagem < 60000) {
        return;
      }
      localStorage.setItem(LAST_CHECK_KEY, String(agora));

      const res = await fetch(`/api/version?t=${agora}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
        },
      });

      if (!res.ok) return;
      const data = await res.json();
      const versaoRemota = data?.version;
      const buildTimeRemoto = data?.buildTime;

      if (!versaoRemota) return;

      const versaoLocal = localStorage.getItem(LOCAL_VERSION_KEY);

      if (!versaoLocal) {
        // Primeira inicialização: grava versão atual
        localStorage.setItem(LOCAL_VERSION_KEY, versaoRemota);
      } else if (versaoLocal !== versaoRemota) {
        // Versão remota diferente da versão local salva!
        console.log(`[AppUpdate] Nova versão disponível: ${versaoRemota} (local: ${versaoLocal})`);
        setVersaoServidor(versaoRemota);
        setAtualizacaoDisponivel(true);
      }
    } catch (err) {
      console.warn('[AppUpdate] Erro ao checar versão do servidor:', err);
    }
  }, []);

  // Checar ao logar ou ao inicializar sessão
  useEffect(() => {
    if (authReady) {
      checarAtualizacao(true);
    }
  }, [authReady, usuario?.id, checarAtualizacao]);

  // Listener para quando a aba volta a ficar visível
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checarAtualizacao(false);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [checarAtualizacao]);

  const aplicarAtualizacao = async () => {
    setAtualizando(true);
    try {
      // Salva a nova versão
      if (versaoServidor) {
        localStorage.setItem(LOCAL_VERSION_KEY, versaoServidor);
      }

      // Limpa caches do Service Worker e navegador se disponíveis
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          try {
            await reg.update();
            if (reg.active) {
              reg.active.postMessage('CLEAR_CACHE');
              reg.active.postMessage('SKIP_WAITING');
            }
          } catch (e) {}
        }
      }

      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }

      // Pequeno delay e recarrega a página limpa com o novo código estrutural
      setTimeout(() => {
        window.location.reload();
      }, 300);
    } catch (err) {
      console.error('[AppUpdate] Erro ao aplicar atualização:', err);
      window.location.reload();
    }
  };

  if (!atualizacaoDisponivel || ignorado) {
    return null;
  }

  return (
    <aside
      aria-label="Atualização do sistema disponível"
      className="fixed bottom-5 right-5 z-[9999] max-w-sm w-[calc(100vw-2.5rem)] sm:w-auto animate-in fade-in slide-in-from-bottom-5 duration-300"
    >
      <div className="bg-slate-900/95 border border-indigo-500/40 rounded-3xl p-4 shadow-2xl backdrop-blur-xl text-slate-100 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <Sparkles className="w-5 h-5 text-indigo-400 animate-pulse" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                Nova versão disponível!
              </h4>
              <p className="text-[11px] text-slate-300 leading-tight mt-0.5">
                O sistema recebeu novas melhorias e correções.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIgnorado(true)}
            className="p-1 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Lembrar mais tarde"
            aria-label="Fechar aviso de atualização"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            onClick={aplicarAtualizacao}
            disabled={atualizando}
            className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs h-9 rounded-xl shadow-lg shadow-indigo-600/25"
          >
            {atualizando ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Atualizando...
              </>
            ) : (
              <>
                <ArrowUpCircle className="w-4 h-4 mr-1.5 text-blue-200" /> Atualizar Agora
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIgnorado(true)}
            disabled={atualizando}
            className="text-xs text-slate-400 hover:text-white h-9 rounded-xl"
          >
            Depois
          </Button>
        </div>
      </div>
    </aside>
  );
}
