'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Camera, X, Volume2, VolumeX, Keyboard, Flashlight, Settings, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Html5Qrcode } from 'html5-qrcode';
import type { PluginListenerHandle } from '@capacitor/core';
import type { BarcodeFormat, Resolution } from '@capacitor-mlkit/barcode-scanning';
import {
  FORMATOS_LEITOR_NATIVO,
  escolherCodigoLido,
  normalizarValorLido,
  registrarLeitura,
  type CodigoDetectado,
  type UltimaLeitura,
} from '@/lib/scanner/leitura';
import {
  MENSAGENS_LEITOR,
  acaoPermissaoCamera,
  classificarFalhaNativa,
  escolherMotorLeitura,
  mensagemErroCameraWeb,
  type MotorLeitura,
} from '@/lib/scanner/motor';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
  title?: string;
  subtitle?: string;
  keepOpenOnScan?: boolean;
}

type PluginLeitorNativo = (typeof import('@capacitor-mlkit/barcode-scanning'))['BarcodeScanner'];
type EstadoNativo = 'parado' | 'iniciando' | 'lendo' | 'permissao_negada';

/**
 * No app, o ML Kit desenha a câmera ATRÁS do WebView. Enquanto ela está ligada,
 * a página fica transparente e só a tela do leitor (e os toasts) aparece.
 */
const CLASSE_LEITOR_NATIVO = 'leitor-nativo-ativo';
const CSS_LEITOR_NATIVO = `
html.${CLASSE_LEITOR_NATIVO}, html.${CLASSE_LEITOR_NATIVO} body { background: transparent !important; background-image: none !important; color-scheme: light !important; }
html.${CLASSE_LEITOR_NATIVO} body { visibility: hidden !important; }
html.${CLASSE_LEITOR_NATIVO} body * { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }
html.${CLASSE_LEITOR_NATIVO} [data-leitor-nativo], html.${CLASSE_LEITOR_NATIVO} [data-sonner-toaster] { visibility: visible !important; }
`;
/** `Resolution['1920x1080']` do plugin: o código do IMEI na caixa é fino e denso. */
const RESOLUCAO_LEITOR_NATIVO = 2 as Resolution;

const detectarAmbienteNativo = async () => {
  try {
    const { Capacitor } = await import('@capacitor/core');
    const plataformaNativa = Capacitor.isNativePlatform();
    return { plataformaNativa, pluginDisponivel: plataformaNativa && Capacitor.isPluginAvailable('BarcodeScanner') };
  } catch (e) {
    return { plataformaNativa: false, pluginDisponivel: false };
  }
};

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
      // Engole erro de transição "Cannot transition to a new state"
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
  startPromise?: Promise<unknown> | null
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

  // Leitor nativo (ML Kit) no app; html5-qrcode no navegador, no Electron e como reserva.
  const [motor, setMotor] = useState<MotorLeitura | null>(null);
  const [estadoNativo, setEstadoNativo] = useState<EstadoNativo>('parado');
  const [modoManual, setModoManual] = useState(false);
  const [tentativaNativa, setTentativaNativa] = useState(0);
  const [avisoMotor, setAvisoMotor] = useState<string | null>(null);
  const [lanternaDisponivel, setLanternaDisponivel] = useState(false);
  const [lanternaLigada, setLanternaLigada] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const startPromiseRef = useRef<Promise<unknown> | null>(null);
  const keyBufferRef = useRef<string>('');
  const keyTimeoutRef = useRef<any>(null);
  const modalContainerRef = useRef<HTMLDivElement>(null);

  const noAppRef = useRef(false);
  const pluginNativoRef = useRef<PluginLeitorNativo | null>(null);
  /** Cada abertura da câmera nativa ganha um número; resposta de abertura antiga é ignorada. */
  const sessaoNativaRef = useRef(0);
  /** Sessão cuja câmera nativa foi ligada e ainda não foi desligada. */
  const cameraNativaSessaoRef = useRef<number | null>(null);
  const ouvintesNativosRef = useRef<PluginListenerHandle[]>([]);
  const ultimaLeituraRef = useRef<UltimaLeitura | null>(null);

  const pararCameraNativa = async () => {
    const ouvintes = ouvintesNativosRef.current;
    ouvintesNativosRef.current = [];
    await Promise.all(ouvintes.map((o) => o.remove().catch(() => {})));
    const plugin = pluginNativoRef.current;
    if (plugin && cameraNativaSessaoRef.current !== null) {
      cameraNativaSessaoRef.current = null;
      try {
        await plugin.stopScan();
      } catch (e) {}
    }
  };

  const encerrarLeitorNativo = () => {
    sessaoNativaRef.current += 1;
    setEstadoNativo('parado');
    setLanternaLigada(false);
    return pararCameraNativa();
  };

  // Fechar de forma limpa desligando a câmera antes de solicitar ao pai
  const handleClose = async () => {
    void encerrarLeitorNativo();
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
    const clean = normalizarValorLido(barcode);
    if (!clean) return;

    playBeep();
    setLastScanned(clean);
    onScan(clean);

    if (!keepOpenOnScan) {
      handleClose();
    }
  };

  // As câmeras chamam a versão mais recente (props e som atuais), não a da hora em que abriram.
  const handleBarcodeFoundRef = useRef(handleBarcodeFound);
  handleBarcodeFoundRef.current = handleBarcodeFound;

  const aoLerNativo = (codigos: CodigoDetectado[]) => {
    const valor = escolherCodigoLido(codigos);
    if (!valor) return;
    const { aceitar, ultima } = registrarLeitura(valor, ultimaLeituraRef.current, Date.now());
    ultimaLeituraRef.current = ultima;
    if (!aceitar) return;
    try {
      navigator.vibrate?.(60);
    } catch (e) {}
    handleBarcodeFoundRef.current(valor);
  };

  const cairParaHtml5 = async (motivo?: unknown) => {
    console.warn('Leitor nativo indisponível, usando html5-qrcode:', motivo);
    await encerrarLeitorNativo();
    setAvisoMotor(MENSAGENS_LEITOR.nativoIndisponivel);
    setMotor(escolherMotorLeitura({ plataformaNativa: noAppRef.current, pluginDisponivel: true, nativoFalhou: true }));
  };

  const iniciarLeitorNativo = async () => {
    const sessao = ++sessaoNativaRef.current;
    const valida = () => sessao === sessaoNativaRef.current;
    setEstadoNativo('iniciando');
    setLanternaDisponivel(false);
    setLanternaLigada(false);

    try {
      const { BarcodeScanner } = await import('@capacitor-mlkit/barcode-scanning');
      pluginNativoRef.current = BarcodeScanner;
      if (!valida()) return;

      let { camera } = await BarcodeScanner.checkPermissions();
      let acao = acaoPermissaoCamera(camera, false);
      if (acao === 'pedir') {
        ({ camera } = await BarcodeScanner.requestPermissions());
        acao = acaoPermissaoCamera(camera, true);
      }
      if (!valida()) return;
      if (acao === 'negada') {
        setEstadoNativo('permissao_negada');
        return;
      }

      const ouvintes = [
        await BarcodeScanner.addListener('barcodesScanned', (evento) => {
          if (valida()) aoLerNativo(evento.barcodes);
        }),
        await BarcodeScanner.addListener('scanError', (evento) => {
          if (valida()) void cairParaHtml5(evento?.message);
        }),
      ];
      if (!valida()) {
        ouvintes.forEach((o) => o.remove().catch(() => {}));
        return;
      }
      ouvintesNativosRef.current = ouvintes;

      cameraNativaSessaoRef.current = sessao;
      await BarcodeScanner.startScan({
        formats: FORMATOS_LEITOR_NATIVO as unknown as BarcodeFormat[],
        resolution: RESOLUCAO_LEITOR_NATIVO,
      });

      if (!valida()) {
        // Fechou enquanto a câmera abria: o stopScan de antes pode ter chegado cedo demais.
        if (cameraNativaSessaoRef.current === null || cameraNativaSessaoRef.current === sessao) {
          cameraNativaSessaoRef.current = null;
          try {
            await BarcodeScanner.stopScan();
          } catch (e) {}
        }
        return;
      }
      setEstadoNativo('lendo');

      try {
        const { available } = await BarcodeScanner.isTorchAvailable();
        if (valida()) setLanternaDisponivel(available);
      } catch (e) {}
    } catch (erro) {
      if (!valida()) return;
      const falha = classificarFalhaNativa(erro);
      if (falha === 'indisponivel') {
        await cairParaHtml5(erro);
        return;
      }
      await pararCameraNativa();
      if (valida()) setEstadoNativo(falha === 'permissao' ? 'permissao_negada' : 'parado');
    }
  };

  const abrirCameraNativa = () => {
    setModoManual(false);
    setTentativaNativa((n) => n + 1);
  };

  const irParaDigitacao = () => {
    setModoManual(true);
    void encerrarLeitorNativo();
    setTimeout(() => document.getElementById('manual-barcode-input')?.focus(), 100);
  };

  const abrirConfiguracoes = async () => {
    try {
      await pluginNativoRef.current?.openSettings();
    } catch (e) {}
  };

  const alternarLanterna = async () => {
    const plugin = pluginNativoRef.current;
    if (!plugin) return;
    try {
      await plugin.toggleTorch();
      const { enabled } = await plugin.isTorchEnabled();
      setLanternaLigada(enabled);
    } catch (e) {}
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

  // Escolher o motor de leitura a cada abertura
  useEffect(() => {
    if (!isOpen) {
      setMotor(null);
      return;
    }

    let vivo = true;
    setModoManual(false);
    setEstadoNativo('parado');
    setAvisoMotor(null);
    setCameraError(null);
    ultimaLeituraRef.current = null;

    detectarAmbienteNativo().then((ambiente) => {
      if (!vivo) return;
      noAppRef.current = ambiente.plataformaNativa;
      setMotor(escolherMotorLeitura({ ...ambiente, nativoFalhou: false }));
    });

    return () => {
      vivo = false;
    };
  }, [isOpen]);

  // Leitor nativo (ML Kit)
  useEffect(() => {
    if (!isOpen || motor !== 'nativo' || modoManual) return;
    void iniciarLeitorNativo();
    return () => {
      void encerrarLeitorNativo();
    };
    // As funções usam refs; reabrir só quando muda abertura, motor, digitação ou nova tentativa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, motor, modoManual, tentativaNativa]);

  const telaNativaVisivel = isOpen && motor === 'nativo' && (estadoNativo === 'iniciando' || estadoNativo === 'lendo');

  useEffect(() => {
    if (!telaNativaVisivel) return;
    const raiz = document.documentElement;
    raiz.classList.add(CLASSE_LEITOR_NATIVO);
    return () => raiz.classList.remove(CLASSE_LEITOR_NATIVO);
  }, [telaNativaVisivel]);

  // Inicializar câmera com Html5Qrcode de forma segura
  useEffect(() => {
    let isMounted = true;

    if (!isOpen || motor !== 'html5') {
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
              handleBarcodeFoundRef.current(decodedText);
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
          setCameraError(mensagemErroCameraWeb(err, noAppRef.current));
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
  }, [isOpen, motor]);

  // Manter o container do leitor no DOM para evitar que a remoção do DOM cause erro no Html5Qrcode
  if (!isOpen) {
    return (
      <div style={{ display: 'none' }}>
        <div id="qr-reader-container" />
      </div>
    );
  }

  const telaLeitorNativo = telaNativaVisivel
    ? createPortal(
        <div
          data-leitor-nativo
          className={`fixed inset-0 z-[10000] flex flex-col text-white ${estadoNativo === 'lendo' ? 'bg-transparent' : 'bg-black'}`}
        >
          <style>{CSS_LEITOR_NATIVO}</style>

          <div className="flex items-start justify-between gap-3 px-4 pb-6 pt-[max(1rem,env(safe-area-inset-top))] bg-gradient-to-b from-black/80 to-transparent">
            <div>
              <h3 className="font-bold text-base">{title}</h3>
              <p className="text-xs text-slate-200">
                {estadoNativo === 'lendo' ? 'Aponte para o código de barras, o IMEI da caixa ou o QR' : 'Abrindo a câmera...'}
              </p>
            </div>
            <button
              onClick={handleClose}
              aria-label="Fechar leitor"
              className="p-2 rounded-xl bg-black/40 text-white hover:bg-black/60 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Mira: o resto da tela fica escurecido pela sombra */}
          <div className="flex-1 flex items-center justify-center">
            {estadoNativo === 'lendo' && (
              <div className="relative w-72 max-w-[80vw] h-44 rounded-2xl border-2 border-cyan-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
                <div className="absolute inset-x-3 top-1/2 h-0.5 -translate-y-1/2 bg-cyan-400 animate-pulse shadow-[0_0_10px_#22d3ee]" />
              </div>
            )}
          </div>

          <div className="space-y-3 px-4 pt-6 pb-[max(1rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-black/80 to-transparent">
            {lastScanned && keepOpenOnScan && (
              <div className="p-2.5 bg-emerald-500/20 border border-emerald-500/40 rounded-xl flex items-center justify-between text-xs">
                <span className="text-slate-200">Último lido:</span>
                <span className="font-mono font-bold text-emerald-300">{lastScanned}</span>
              </div>
            )}

            <div className="flex gap-2">
              {lanternaDisponivel && (
                <Button
                  onClick={alternarLanterna}
                  aria-pressed={lanternaLigada}
                  className={`rounded-xl px-3 shrink-0 ${lanternaLigada ? 'bg-amber-400 text-black hover:bg-amber-300' : 'bg-slate-800/90 text-white hover:bg-slate-700'}`}
                >
                  <Flashlight className="w-4 h-4" />
                </Button>
              )}
              <Button onClick={irParaDigitacao} className="flex-1 rounded-xl bg-slate-800/90 text-white hover:bg-slate-700">
                <Keyboard className="w-4 h-4 mr-1.5" /> Digitar código
              </Button>
              <Button onClick={handleClose} className="flex-1 rounded-xl bg-cyan-600 text-white font-bold hover:bg-cyan-500">
                {keepOpenOnScan ? 'Concluir' : 'Cancelar'}
              </Button>
            </div>

            <button
              onClick={() => void cairParaHtml5('trocado pela pessoa')}
              className="block w-full text-center text-[11px] text-slate-300 underline underline-offset-2"
            >
              A câmera não aparece? Usar a câmera pelo navegador
            </button>
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <div
      ref={modalContainerRef}
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-start p-2 sm:p-4 pt-2 sm:pt-4 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200"
    >
      {telaLeitorNativo}

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

        {/* Câmera Viewfinder (Limitada com CSS estrito para não engolir o layout) */}
        <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 h-[220px] sm:h-[240px] w-full flex items-center justify-center shrink-0">
          <div
            id="qr-reader-container"
            className="w-full h-full [&>video]:w-full [&>video]:h-full [&>video]:object-cover [&>video]:max-h-[240px] [&>video]:rounded-2xl"
          />

          {/* Mira de Escaneamento */}
          {motor === 'html5' && cameraActive && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
              <div className="w-64 h-44 border-2 border-cyan-400/80 rounded-2xl shadow-[0_0_20px_rgba(6,182,212,0.4)] relative overflow-hidden">
                <div className="absolute inset-x-0 h-0.5 bg-cyan-400 animate-pulse top-1/2 -translate-y-1/2 shadow-[0_0_10px_#22d3ee]" />
              </div>
            </div>
          )}

          {/* Mensagem de Erro na Câmera */}
          {motor === 'html5' && cameraError && (
            <div className="absolute inset-0 p-4 flex flex-col items-center justify-center text-center space-y-2 z-10">
              <Keyboard className="w-8 h-8 text-amber-400 mx-auto opacity-80" />
              <p className="text-xs text-amber-300 font-medium">{cameraError}</p>
              <p className="text-[11px] text-slate-400">Você ainda pode usar um <b>Leitor de Código de Barras USB</b> ou digitar manualmente abaixo.</p>
            </div>
          )}

          {motor === null && (
            <p className="absolute inset-0 flex items-center justify-center text-xs text-slate-400 z-10">Preparando a câmera...</p>
          )}

          {/* Leitor nativo: a câmera abre em tela cheia; aqui fica o estado dela */}
          {motor === 'nativo' && (
            <div className="absolute inset-0 p-4 flex flex-col items-center justify-center text-center gap-2.5 z-10">
              {estadoNativo === 'permissao_negada' ? (
                <>
                  <Camera className="w-8 h-8 text-amber-400 opacity-80" />
                  <p className="text-xs text-amber-300 font-medium">{MENSAGENS_LEITOR.permissaoNegadaApp}</p>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={abrirConfiguracoes} className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl">
                      <Settings className="w-4 h-4 mr-1.5" /> Abrir configurações
                    </Button>
                    <Button size="sm" variant="ghost" onClick={abrirCameraNativa} className="text-slate-300 hover:text-white rounded-xl">
                      <RefreshCw className="w-4 h-4 mr-1.5" /> Tentar de novo
                    </Button>
                  </div>
                  <p className="text-[11px] text-slate-400">Você ainda pode usar um <b>Leitor de Código de Barras USB</b> ou digitar manualmente abaixo.</p>
                </>
              ) : estadoNativo === 'parado' ? (
                <Button onClick={abrirCameraNativa} className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl px-5">
                  <Camera className="w-4 h-4 mr-1.5" /> Abrir câmera
                </Button>
              ) : (
                <p className="text-xs text-slate-400">Abrindo a câmera...</p>
              )}
            </div>
          )}
        </div>

        {avisoMotor && <p className="text-[11px] text-amber-300">{avisoMotor}</p>}

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
