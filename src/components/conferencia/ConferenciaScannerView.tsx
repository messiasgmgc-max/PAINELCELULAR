'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Camera, Flashlight, Keyboard, RefreshCw, AlertTriangle, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Html5Qrcode } from 'html5-qrcode';
import { cn } from '@/lib/utils';
import { FlashColor } from './types';

interface ConferenciaScannerViewProps {
  onScan: (code: string) => void;
  flashColor: FlashColor;
  isPaused?: boolean;
}

export function ConferenciaScannerView({ onScan, flashColor, isPaused }: ConferenciaScannerViewProps) {
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<{ tipo: string; mensagem: string } | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [manualCode, setManualCode] = useState('');

  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const lastScannedTimeRef = useRef<{ code: string; time: number }>({ code: '', time: 0 });
  const containerId = 'conf-camera-viewport';

  const stopScanner = async () => {
    if (html5QrCodeRef.current) {
      try {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop();
        }
        html5QrCodeRef.current.clear();
      } catch (e) {
        // silencioso
      }
      html5QrCodeRef.current = null;
    }
    setCameraActive(false);
  };

  const startScanner = async () => {
    await stopScanner();
    setCameraError(null);

    // Checagem de HTTPS (necessário no navegador para permissão de mídia)
    if (typeof window !== 'undefined' && window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
      setCameraError({
        tipo: 'https',
        mensagem: 'O acesso à câmera requer conexão segura HTTPS ou localhost.',
      });
      return;
    }

    try {
      // 1. Tenta Capacitor ML Kit nativo se estiver em app móvel
      let isNativeApp = false;
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('BarcodeScanner')) {
          isNativeApp = true;
        }
      } catch (e) {}

      // Se não for app nativo, usa Html5Qrcode com configuração otimizada para 30% dvh
      const html5QrCode = new Html5Qrcode(containerId);
      html5QrCodeRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 15,
          qrbox: { width: 240, height: 160 },
          aspectRatio: 1.333,
        },
        (decodedText) => {
          if (isPaused) return;
          const clean = decodedText.trim();
          if (!clean) return;

          const now = Date.now();
          // Cooldown de 2s para o mesmo código
          if (lastScannedTimeRef.current.code === clean && now - lastScannedTimeRef.current.time < 2000) {
            return;
          }
          lastScannedTimeRef.current = { code: clean, time: now };
          onScan(clean);
        },
        () => {}
      );

      setCameraActive(true);

      // Checa suporte a lanterna
      try {
        const track = (document.querySelector(`#${containerId} video`) as HTMLVideoElement)?.srcObject;
        if (track && 'getVideoTracks' in track) {
          const videoTrack = (track as MediaStream).getVideoTracks()[0];
          const caps = (videoTrack as any).getCapabilities?.();
          if (caps && caps.torch) {
            setTorchSupported(true);
          }
        }
      } catch (e) {}
    } catch (err: any) {
      const msg = String(err?.message || err || '').toLowerCase();
      let tipo = 'generico';
      let mensagem = 'Não foi possível iniciar a câmera.';

      if (msg.includes('permission') || msg.includes('notallowederror')) {
        tipo = 'permissao';
        mensagem = 'Permissão de câmera negada. Clique no cadeado do navegador para permitir o uso da câmera.';
      } else if (msg.includes('notfounderror') || msg.includes('device not found')) {
        tipo = 'dispositivo';
        mensagem = 'Nenhuma câmera detectada neste aparelho.';
      } else if (msg.includes('notreadableerror') || msg.includes('in use') || msg.includes('already')) {
        tipo = 'em_uso';
        mensagem = 'A câmera está sendo utilizada por outro aplicativo ou aba.';
      }

      setCameraError({ tipo, mensagem });
      setCameraActive(false);
    }
  };

  const toggleTorch = async () => {
    try {
      const track = (document.querySelector(`#${containerId} video`) as HTMLVideoElement)?.srcObject;
      if (track && 'getVideoTracks' in track) {
        const videoTrack = (track as MediaStream).getVideoTracks()[0];
        await (videoTrack as any).applyConstraints({
          advanced: [{ torch: !torchOn }],
        });
        setTorchOn(!torchOn);
      }
    } catch (e) {}
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      startScanner();
    }, 120);

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopScanner();
      } else {
        startScanner();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopScanner();
    };
  }, []);

  const handleManualSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!manualCode.trim()) return;
    onScan(manualCode.trim());
    setManualCode('');
  };

  return (
    <div className="flex flex-col gap-2.5 w-full">
      {/* Container compacto da Câmera (~28-32% dvh ou fixo de ~190-230px) */}
      <div 
        className={cn(
          "relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 transition-all duration-300",
          "h-[28dvh] min-h-[170px] max-h-[240px] w-full flex items-center justify-center shrink-0",
          flashColor === 'green' && "ring-4 ring-emerald-500 bg-emerald-950/40",
          flashColor === 'yellow' && "ring-4 ring-amber-500 bg-amber-950/40",
          flashColor === 'red' && "ring-4 ring-rose-500 bg-rose-950/40"
        )}
      >
        <div
          id={containerId}
          className="w-full h-full [&>video]:w-full [&>video]:h-full [&>video]:object-cover [&>video]:rounded-2xl"
        />

        {/* Mira da Câmera com Flash de Feedback */}
        {cameraActive && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10 p-4">
            <div 
              className={cn(
                "w-full max-w-[260px] h-[130px] border-2 rounded-2xl relative overflow-hidden transition-colors duration-200",
                flashColor === 'green' ? "border-emerald-400 shadow-[0_0_25px_#10b981]" :
                flashColor === 'yellow' ? "border-amber-400 shadow-[0_0_25px_#f59e0b]" :
                flashColor === 'red' ? "border-rose-400 shadow-[0_0_25px_#f43f5e]" :
                "border-cyan-400/80 shadow-[0_0_15px_rgba(6,182,212,0.3)]"
              )}
            >
              <div className="absolute inset-x-0 h-0.5 bg-cyan-400 animate-pulse top-1/2 -translate-y-1/2 shadow-[0_0_8px_#22d3ee]" />
            </div>
          </div>
        )}

        {/* Botão de Lanterna (se suportada) */}
        {cameraActive && torchSupported && (
          <button
            type="button"
            onClick={toggleTorch}
            className={cn(
              "absolute top-2.5 right-2.5 z-20 p-2 rounded-xl backdrop-blur-md transition-all cursor-pointer",
              torchOn ? "bg-amber-400 text-slate-950 shadow-lg shadow-amber-400/40" : "bg-black/60 text-white hover:bg-black/80"
            )}
            title={torchOn ? 'Desligar Lanterna' : 'Ligar Lanterna'}
          >
            <Flashlight className="w-4 h-4" />
          </button>
        )}

        {/* Estado de Erro Amigável */}
        {cameraError && (
          <div className="absolute inset-0 z-20 bg-slate-950/95 p-4 flex flex-col items-center justify-center text-center space-y-2">
            {cameraError.tipo === 'permissao' ? (
              <ShieldAlert className="w-8 h-8 text-amber-400 mx-auto" />
            ) : (
              <AlertTriangle className="w-8 h-8 text-rose-400 mx-auto" />
            )}
            <p className="text-xs font-semibold text-white max-w-xs">{cameraError.mensagem}</p>
            <div className="flex items-center gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={startScanner}
                className="text-xs gap-1.5 h-8 bg-white/10 hover:bg-white/20 border-white/15 text-white"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Tentar novamente
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Campo Manual e Leitor USB / Bluetooth */}
      <form onSubmit={handleManualSubmit} className="space-y-1 shrink-0 bg-slate-950 p-2.5 rounded-2xl border border-slate-800">
        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300 px-1">
          <span className="flex items-center gap-1">
            <Keyboard className="w-3.5 h-3.5 text-cyan-400" /> Digitar ou Bipar USB
          </span>
          <span className="text-[10px] text-cyan-400 font-mono">IMEI / Final / Código</span>
        </div>
        <div className="flex gap-2">
          <input
            id="conf-manual-input"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Digite o código ou final do IMEI..."
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono placeholder:text-slate-500 focus:border-cyan-500 outline-none"
          />
          <Button
            type="submit"
            disabled={!manualCode.trim()}
            className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl px-3.5 text-xs shrink-0 cursor-pointer"
          >
            Adicionar
          </Button>
        </div>
      </form>
    </div>
  );
}
