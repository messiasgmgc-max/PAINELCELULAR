'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Camera, X, Volume2, VolumeX, Keyboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Html5Qrcode } from 'html5-qrcode';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
  title?: string;
  subtitle?: string;
  keepOpenOnScan?: boolean;
}

const createSafeScanner = (elementId: string) => {
  const instance = new Html5Qrcode(elementId);
  const originalStop = instance.stop.bind(instance);
  const originalClear = instance.clear.bind(instance);

  instance.stop = async () => {
    try {
      const state = (instance as any).getState?.();
      const isScanning = (instance as any).isScanning;
      // 2 = SCANNING, 3 = PAUSED
      if (isScanning && (state === 2 || state === 3)) {
        return await originalStop();
      }
    } catch (e) {
      // Engole o erro "Cannot transition to a new state"
    }
  };

  instance.clear = () => {
    try {
      return originalClear();
    } catch (e) {}
  };

  return instance;
};

const stopScannerInstance = async (
  scannerInstance: Html5Qrcode | null,
  startPromise?: Promise<void> | null
) => {
  if (!scannerInstance) return;
  try {
    if (startPromise) {
      await startPromise.catch(() => {});
    }
    await scannerInstance.stop();
    scannerInstance.clear();
  } catch (e) {}
};

export function BarcodeScannerModal({
  isOpen,
  onClose,
  onScan,
  title = 'Scanner de Código de Barras / Câmera',
  subtitle = 'Aponte a câmera para a etiqueta ou conecte um leitor USB',
  keepOpenOnScan = false,
}: BarcodeScannerModalProps) {
  const [manualCode, setManualCode] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const startPromiseRef = useRef<Promise<void> | null>(null);
  const keyBufferRef = useRef<string>('');
  const keyTimeoutRef = useRef<any>(null);
  const modalContainerRef = useRef<HTMLDivElement>(null);

  // Fechar de forma limpa desligando a câmera antes de solicitar ao pai
  const handleClose = async () => {
    if (scannerRef.current) {
      const instance = scannerRef.current;
      const p = startPromiseRef.current;
      scannerRef.current = null;
      startPromiseRef.current = null;
      setCameraActive(false);
      await stopScannerInstance(instance, p);
    }
    onClose();
  };

  // Previnir crash de tela do Next.js se o Html5Qrcode lançar erro de transição não capturado
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reasonStr = String(event.reason?.message || event.reason || '');
      if (
        reasonStr.includes('Cannot transition to a new state') ||
        reasonStr.includes('already under transition') ||
        reasonStr.includes('Html5Qrcode')
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  // Garantir que a modal abra no topo absoluto da tela no mobile
  useEffect(() => {
    if (isOpen) {
      if (modalContainerRef.current) {
        modalContainerRef.current.scrollTop = 0;
      }
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [isOpen]);

  // Tocar aviso sonoro de beep
  const playBeep = () => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    } catch (e) {}
  };

  const handleBarcodeFound = (barcode: string) => {
    const clean = barcode.trim();
    if (!clean) return;

    playBeep();
    setLastScanned(clean);
    onScan(clean);

    if (!keepOpenOnScan) {
      handleClose();
    }
  };

  // Listener global para Leitor de Código de Barras USB
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
        if ((activeEl as HTMLElement).id === 'manual-barcode-input') {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleBarcodeFound(manualCode);
            setManualCode('');
          }
        }
        return;
      }

      if (e.key === 'Enter') {
        if (keyBufferRef.current.length >= 3) {
          e.preventDefault();
          handleBarcodeFound(keyBufferRef.current);
          keyBufferRef.current = '';
        }
      } else if (e.key.length === 1) {
        keyBufferRef.current += e.key;

        if (keyTimeoutRef.current) clearTimeout(keyTimeoutRef.current);
        keyTimeoutRef.current = setTimeout(() => {
          keyBufferRef.current = '';
        }, 200);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (keyTimeoutRef.current) clearTimeout(keyTimeoutRef.current);
    };
  }, [isOpen, manualCode]);

  // Inicializar câmera com Html5Qrcode de forma segura
  useEffect(() => {
    let isMounted = true;

    if (!isOpen) {
      if (scannerRef.current) {
        const instance = scannerRef.current;
        const p = startPromiseRef.current;
        scannerRef.current = null;
        startPromiseRef.current = null;
        setCameraActive(false);
        stopScannerInstance(instance, p);
      }
      return;
    }

    const startCamera = async () => {
      try {
        setCameraError(null);
        const container = document.getElementById('qr-reader-container');
        if (!container) return;

        const html5QrCode = createSafeScanner('qr-reader-container');
        scannerRef.current = html5QrCode;

        const config = {
          fps: 15,
          qrbox: { width: 250, height: 180 },
          aspectRatio: 1.0,
        };

        const promise = html5QrCode.start(
          { facingMode: 'environment' },
          config,
          (decodedText) => {
            if (isMounted) {
              handleBarcodeFound(decodedText);
            }
          },
          () => {}
        );

        startPromiseRef.current = promise;
        await promise;

        if (isMounted) {
          setCameraActive(true);
        }
      } catch (err: any) {
        console.warn('Erro ao acessar câmera:', err);
        if (isMounted) {
          setCameraError(err?.message || 'Câmera não permitida ou indisponível.');
          setCameraActive(false);
        }
      }
    };

    const timer = setTimeout(() => {
      startCamera();
    }, 150);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      if (scannerRef.current) {
        const instance = scannerRef.current;
        const p = startPromiseRef.current;
        scannerRef.current = null;
        startPromiseRef.current = null;
        stopScannerInstance(instance, p);
      }
    };
  }, [isOpen]);

  // Manter o container do leitor no DOM para evitar que a remoção do DOM cause erro no Html5Qrcode
  if (!isOpen) {
    return (
      <div style={{ display: 'none' }}>
        <div id="qr-reader-container" />
      </div>
    );
  }

  return (
    <div 
      ref={modalContainerRef}
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-start p-2 sm:p-4 pt-2 sm:pt-4 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200"
    >
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-2xl space-y-3.5 text-white relative my-0 shrink-0">
        
        {/* Cabeçalho */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold border border-cyan-500/30">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">{title}</h3>
              <p className="text-xs text-slate-400">{subtitle}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
              title={soundEnabled ? 'Som ativado' : 'Som desativado'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4" />}
            </button>

            <button
              onClick={handleClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Câmera Viewfinder */}
        <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 min-h-[240px] flex items-center justify-center">
          <div id="qr-reader-container" className="w-full h-full" />

          {/* Mira de Escaneamento */}
          {cameraActive && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-64 h-44 border-2 border-cyan-400/80 rounded-2xl shadow-[0_0_20px_rgba(6,182,212,0.4)] relative overflow-hidden">
                <div className="absolute inset-x-0 h-0.5 bg-cyan-400 animate-pulse top-1/2 -translate-y-1/2 shadow-[0_0_10px_#22d3ee]" />
              </div>
            </div>
          )}

          {/* Mensagem de Erro na Câmera */}
          {cameraError && (
            <div className="p-4 text-center space-y-2">
              <Keyboard className="w-8 h-8 text-amber-400 mx-auto opacity-80" />
              <p className="text-xs text-amber-300 font-medium">{cameraError}</p>
              <p className="text-[11px] text-slate-400">Você ainda pode usar um <b>Leitor de Código de Barras USB</b> ou digitar manualmente abaixo.</p>
            </div>
          )}
        </div>

        {/* Último código lido */}
        {lastScanned && (
          <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-between text-xs animate-in fade-in">
            <span className="text-slate-300">Último lido:</span>
            <span className="font-mono font-bold text-emerald-400">{lastScanned}</span>
          </div>
        )}

        {/* Entrada Manual ou Leitor USB */}
        <div className="space-y-2 pt-2 border-t border-slate-800">
          <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
            <span>Digitar ou Bipar com Leitor USB</span>
            <span className="text-[10px] text-cyan-400 font-normal">Aceita IMEI, ID ou Código</span>
          </label>

          <div className="flex gap-2">
            <input
              id="manual-barcode-input"
              type="text"
              placeholder="Cole ou bipe o código aqui..."
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white font-mono placeholder:text-slate-500 focus:border-cyan-500 outline-none"
            />
            <Button
              onClick={() => {
                handleBarcodeFound(manualCode);
                setManualCode('');
              }}
              className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl px-4 shrink-0"
            >
              OK
            </Button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-1">
          <span className="text-[10px] text-slate-400">⚡ Compatível com leitor USB e câmera Android/iOS</span>
          <Button variant="ghost" size="sm" onClick={handleClose} className="text-xs text-slate-400 hover:text-white">
            Fechar
          </Button>
        </div>

      </div>
    </div>
  );
}
