'use client';

import React, { useState, useEffect } from 'react';
import { Download, Smartphone, X, CheckCircle2, Share } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState<boolean>(false);
  const [isIos, setIsIos] = useState<boolean>(false);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [dismissed, setDismissed] = useState<boolean>(false);

  useEffect(() => {
    // Verificar se o app já está rodando instalado em modo standalone
    const isStandaloneApp = window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    setIsStandalone(isStandaloneApp);

    // Detectar dispositivo iOS / Safari
    const userAgent = window.navigator.userAgent.toLowerCase();
    const iosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIos(iosDevice);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        console.log('Usuário aceitou a instalação do PWA');
      }
      setDeferredPrompt(null);
    } else if (isIos) {
      setShowModal(true);
    } else {
      setShowModal(true);
    }
  };

  if (isStandalone || dismissed) {
    return null;
  }

  // Exibe o botão de instalação apenas se o navegador permitiu o prompt ou se for iOS
  const canPrompt = Boolean(deferredPrompt || isIos);

  if (!canPrompt) {
    return null;
  }

  return (
    <>
      {/* Botão / Banner Flutuante no Canto Inferior Esquerdo */}
      <div className="fixed bottom-20 left-4 z-[990] hidden md:flex items-center gap-3 p-3 bg-indigo-600/90 hover:bg-indigo-600 text-white rounded-2xl shadow-2xl backdrop-blur-md border border-white/20 animate-in fade-in slide-in-from-bottom-5 duration-300">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
            <Smartphone className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-xs font-bold leading-tight">Instalar o App Web</p>
            <p className="text-[10px] text-indigo-100 leading-tight">Acesso rápido na tela inicial</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 ml-2">
          <Button
            size="sm"
            onClick={handleInstallClick}
            className="h-8 px-3 text-xs bg-white text-indigo-700 hover:bg-indigo-50 font-bold rounded-xl shadow"
          >
            <Download className="w-3.5 h-3.5 mr-1" /> Instalar
          </Button>
          <button
            onClick={() => setDismissed(true)}
            className="p-1 text-indigo-200 hover:text-white rounded-lg transition-colors"
            title="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Modal com instruções detalhadas para iOS ou navegadores sem prompt direto */}
      {showModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-indigo-600/30 flex items-center justify-center text-indigo-400 font-bold">
                  📲
                </div>
                <h3 className="font-bold text-base">Instalar Aplicativo</h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 hover:bg-white/10 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Instale o <b>Phone Center</b> no seu celular ou computador para ter acesso instantâneo com cara de aplicativo nativo:
            </p>

            {isIos ? (
              <div className="space-y-3 p-3 bg-slate-800/80 rounded-2xl text-xs">
                <div className="flex items-start gap-2.5">
                  <span className="font-bold text-indigo-400 text-sm">1.</span>
                  <p>Toque no botão de <b>Compartilhar</b> <Share className="w-4 h-4 inline text-indigo-400 mx-1" /> na barra inferior do Safari.</p>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="font-bold text-indigo-400 text-sm">2.</span>
                  <p>Role para baixo e selecione <b>&quot;Adicionar à Tela de Início&quot;</b> ➕.</p>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="font-bold text-indigo-400 text-sm">3.</span>
                  <p>Confirme clicando em <b>Adicionar</b> no canto superior direito.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3 p-3 bg-slate-800/80 rounded-2xl text-xs">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <p>Clique no ícone de <b>Instalar App</b> no menu do navegador (ou barra de endereço do Chrome/Edge).</p>
                </div>
              </div>
            )}

            <Button
              onClick={() => setShowModal(false)}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl"
            >
              Entendido
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
