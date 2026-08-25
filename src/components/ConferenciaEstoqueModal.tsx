'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Camera, 
  X, 
  Check, 
  Volume2, 
  VolumeX, 
  Keyboard, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  Package, 
  Wrench, 
  Trash2, 
  ShoppingBag, 
  ArrowRight,
  ShieldCheck,
  Search,
  Plus
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';

interface AparelhoAuditoria {
  id: string;
  modelo: string;
  marca?: string;
  imei?: string;
  numeroSerie?: string;
  codigo?: string;
  status?: string;
  condicao?: string;
  ativo?: boolean;
  preco?: number;
}

interface ItemEscaneado {
  codigoLido: string;
  timestamp: string;
  aparelhoEncontrado?: AparelhoAuditoria;
}

interface ConferenciaEstoqueModalProps {
  isOpen: boolean;
  onClose: () => void;
  aparelhosEstoque: AparelhoAuditoria[];
  lojaId: string | null;
  onEstoqueAtualizado: () => void;
}

type AcaoFaltante = 'manter' | 'vendido' | 'manutencao' | 'atacado' | 'remover';

export function ConferenciaEstoqueModal({
  isOpen,
  onClose,
  aparelhosEstoque,
  lojaId,
  onEstoqueAtualizado,
}: ConferenciaEstoqueModalProps) {
  const [etapa, setEtapa] = useState<'escaneamento' | 'relatorio'>('escaneamento');
  const [escaneados, setEscaneados] = useState<ItemEscaneado[]>([]);
  const [manualCode, setManualCode] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [salvandoAjustes, setSalvandoAjustes] = useState(false);

  // Mapeamento de ações para aparelhos faltantes: idAparelho -> AcaoFaltante
  const [acoesFaltantes, setAcoesFaltantes] = useState<Record<string, AcaoFaltante>>({});

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const keyBufferRef = useRef<string>('');
  const keyTimeoutRef = useRef<any>(null);

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

  // Processa a leitura de um código de barras / IMEI
  const processarCodigoLido = (rawCode: string) => {
    const clean = rawCode.trim();
    if (!clean) return;

    // Evita duplicatas consecutivas imediatas
    setEscaneados((prev) => {
      if (prev.some((item) => item.codigoLido.toLowerCase() === clean.toLowerCase())) {
        toast.info(`O código "${clean}" já foi bipado anteriormente nesta conferência.`);
        return prev;
      }

      playBeep();

      // Procura o aparelho no estoque ativo
      const encontrado = aparelhosEstoque.find((a) => {
        const c1 = (a.codigo || '').trim().toLowerCase();
        const c2 = (a.imei || '').trim().toLowerCase();
        const c3 = (a.numeroSerie || '').trim().toLowerCase();
        const c4 = (a.id || '').trim().toLowerCase();
        const input = clean.toLowerCase();
        return c1 === input || c2 === input || c3 === input || c4 === input;
      });

      if (encontrado) {
        toast.success(`✓ ${encontrado.modelo} bipado com sucesso!`);
      } else {
        toast.warning(`⚠️ Código "${clean}" não foi localizado no estoque ativo.`);
      }

      return [
        {
          codigoLido: clean,
          timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          aparelhoEncontrado: encontrado,
        },
        ...prev,
      ];
    });
  };

  // Listener global para Leitor de Código de Barras USB
  useEffect(() => {
    if (!isOpen || etapa !== 'escaneamento') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
        if ((activeEl as HTMLElement).id === 'conf-manual-input') {
          if (e.key === 'Enter') {
            e.preventDefault();
            processarCodigoLido(manualCode);
            setManualCode('');
          }
        }
        return;
      }

      if (e.key === 'Enter') {
        if (keyBufferRef.current.length >= 3) {
          e.preventDefault();
          processarCodigoLido(keyBufferRef.current);
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
  }, [isOpen, etapa, manualCode, aparelhosEstoque]);

  // Inicializar câmera
  useEffect(() => {
    if (!isOpen || etapa !== 'escaneamento') {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {}).finally(() => {
          scannerRef.current = null;
          setCameraActive(false);
        });
      }
      return;
    }

    let isMounted = true;

    const startCamera = async () => {
      try {
        setCameraError(null);
        const html5QrCode = new Html5Qrcode('conf-qr-container');
        scannerRef.current = html5QrCode;

        await html5QrCode.start(
          { facingMode: 'environment' },
          { fps: 15, qrbox: { width: 260, height: 180 }, aspectRatio: 1.0 },
          (decodedText) => {
            if (isMounted) {
              processarCodigoLido(decodedText);
            }
          },
          () => {}
        );

        if (isMounted) setCameraActive(true);
      } catch (err: any) {
        if (isMounted) {
          setCameraError(err?.message || 'Câmera indisponível.');
          setCameraActive(false);
        }
      }
    };

    const timer = setTimeout(() => { startCamera(); }, 150);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {}).finally(() => {
          scannerRef.current = null;
        });
      }
    };
  }, [isOpen, etapa]);

  // Aparelhos que foram confirmados / encontrados no escaneamento
  const aparelhosConfirmados = useMemo(() => {
    return aparelhosEstoque.filter((aparelho) => {
      return escaneados.some((e) => {
        if (e.aparelhoEncontrado?.id === aparelho.id) return true;
        const c1 = (aparelho.codigo || '').trim().toLowerCase();
        const c2 = (aparelho.imei || '').trim().toLowerCase();
        const c3 = (aparelho.numeroSerie || '').trim().toLowerCase();
        const input = e.codigoLido.toLowerCase();
        return c1 === input || c2 === input || c3 === input;
      });
    });
  }, [aparelhosEstoque, escaneados]);

  // Aparelhos ativos no banco que NÃO foram bipados (Faltantes)
  const aparelhosFaltantes = useMemo(() => {
    const idsConfirmados = new Set(aparelhosConfirmados.map((a) => a.id));
    return aparelhosEstoque.filter((aparelho) => !idsConfirmados.has(aparelho.id));
  }, [aparelhosEstoque, aparelhosConfirmados]);

  // Códigos bipados que NÃO correspondem a nenhum aparelho ativo no banco (Sobrando / Não cadastrado)
  const codigosSobrando = useMemo(() => {
    return escaneados.filter((e) => !e.aparelhoEncontrado);
  }, [escaneados]);

  // Inicializa o mapa de ações padrão para os faltantes como 'manter'
  useEffect(() => {
    const acoes: Record<string, AcaoFaltante> = {};
    aparelhosFaltantes.forEach((aparelho) => {
      acoes[aparelho.id] = acoesFaltantes[aparelho.id] || 'remover';
    });
    setAcoesFaltantes(acoes);
  }, [aparelhosFaltantes]);

  const aplicarLoteAcoes = (acao: AcaoFaltante) => {
    const novao: Record<string, AcaoFaltante> = {};
    aparelhosFaltantes.forEach((a) => {
      novao[a.id] = acao;
    });
    setAcoesFaltantes(novao);
  };

  const handleFinalizarEConferir = () => {
    if (escaneados.length === 0) {
      if (!confirm('Nenhum aparelho foi escaneado ainda. Deseja avançar para o relatório de qualquer forma?')) {
        return;
      }
    }
    setEtapa('relatorio');
  };

  const handleSalvarAjustesEstoque = async () => {
    setSalvandoAjustes(true);
    try {
      let alterados = 0;

      for (const aparelho of aparelhosFaltantes) {
        const acao = acoesFaltantes[aparelho.id];
        if (!acao || acao === 'manter') continue;

        let payload: any = {};
        let obsLog = '';

        if (acao === 'vendido') {
          payload = { ativo: false, condicao: 'vendido', status: 'vendido', observacoes: `Baixa automática na conferência de estoque: Marcado como Vendido em ${new Date().toLocaleDateString('pt-BR')}` };
          obsLog = `Dar saída - Vendido na conferência`;
        } else if (acao === 'manutencao') {
          payload = { status: 'manutencao', observacoes: `Encaminhado para manutenção na conferência de estoque em ${new Date().toLocaleDateString('pt-BR')}` };
          obsLog = `Encaminhado para manutenção na conferência`;
        } else if (acao === 'atacado') {
          payload = { ativo: false, condicao: 'vendido', status: 'vendido', observacoes: `Vendido no atacado (Baixa na conferência de estoque em ${new Date().toLocaleDateString('pt-BR')})` };
          obsLog = `Dar saída - Venda Atacado na conferência`;
        } else if (acao === 'remover') {
          payload = { ativo: false, observacoes: `Removido do estoque por extravio/perda na conferência em ${new Date().toLocaleDateString('pt-BR')}` };
          obsLog = `Baixa por remoção/perda na conferência`;
        }

        if (Object.keys(payload).length > 0) {
          const { error } = await supabase
            .from('aparelhos')
            .update(payload)
            .eq('id', aparelho.id);

          if (!error) {
            alterados += 1;
          }
        }
      }

      toast.success(`🚀 Auditoria concluída! ${alterados} aparelhos tiveram baixa/ajuste no estoque.`);
      onEstoqueAtualizado();
      onClose();
    } catch (err: any) {
      console.error('Erro ao aplicar ajustes na conferência:', err);
      toast.error(`Erro ao aplicar ajustes: ${err?.message || 'Falha no servidor'}`);
    } finally {
      setSalvandoAjustes(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-start sm:items-center justify-center p-2 sm:p-5 pt-2 sm:pt-6 bg-black/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
      <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl p-3.5 sm:p-6 shadow-2xl space-y-4 text-white max-h-[96vh] flex flex-col my-0 sm:my-auto">
        
        {/* CABEÇALHO */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold border border-cyan-500/30">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg text-white">Conferência de Estoque Física</h3>
              <p className="text-xs text-slate-400">
                {etapa === 'escaneamento'
                  ? 'Bipe as etiquetas dos aparelhos na loja para conferir a contagem real'
                  : 'Relatório de divergências e ajuste do banco de dados'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {etapa === 'escaneamento' && (
              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
                title={soundEnabled ? 'Som de beep ativado' : 'Som desativado'}
              >
                {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4" />}
              </button>
            )}
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ETAPA 1: ESCANEAMENTO CONTÍNUO */}
        {etapa === 'escaneamento' && (
          <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-0">
            
            {/* COLUNA ESQUERDA: CÂMERA E ENTRADA */}
            <div className="lg:col-span-5 flex flex-col gap-3 min-h-0">
              <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 flex-1 min-h-[220px] flex items-center justify-center">
                <div id="conf-qr-container" className="w-full h-full" />

                {cameraActive && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="w-56 h-40 border-2 border-cyan-400/80 rounded-2xl shadow-[0_0_20px_rgba(6,182,212,0.4)] relative overflow-hidden">
                      <div className="absolute inset-x-0 h-0.5 bg-cyan-400 animate-pulse top-1/2 -translate-y-1/2 shadow-[0_0_10px_#22d3ee]" />
                    </div>
                  </div>
                )}

                {cameraError && (
                  <div className="p-4 text-center space-y-2">
                    <Keyboard className="w-7 h-7 text-amber-400 mx-auto opacity-80" />
                    <p className="text-xs text-amber-300 font-medium">{cameraError}</p>
                    <p className="text-[11px] text-slate-400">Utilize o Leitor USB ou digite abaixo.</p>
                  </div>
                )}
              </div>

              {/* ENTRADA MANUAL OU LEITOR USB */}
              <div className="space-y-1.5 shrink-0 bg-slate-950 p-3 rounded-2xl border border-slate-800">
                <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                  <span>Bipar com Leitor USB ou Digitar</span>
                  <span className="text-[10px] text-cyan-400 font-mono">IMEI / Código</span>
                </label>
                <div className="flex gap-2">
                  <input
                    id="conf-manual-input"
                    type="text"
                    placeholder="Bipe ou digite o código..."
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono placeholder:text-slate-500 focus:border-cyan-500 outline-none"
                  />
                  <Button
                    onClick={() => {
                      processarCodigoLido(manualCode);
                      setManualCode('');
                    }}
                    className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl px-3 text-xs shrink-0"
                  >
                    Adicionar
                  </Button>
                </div>
              </div>
            </div>

            {/* COLUNA DIREITA: LISTA EM TEMPO REAL E PROGRESSO */}
            <div className="lg:col-span-7 flex flex-col gap-3 min-h-0 bg-slate-950/60 p-4 rounded-2xl border border-slate-800">
              
              {/* Barra de Progresso */}
              <div className="space-y-2 shrink-0 pb-3 border-b border-slate-800">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-slate-300 flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-cyan-400" /> Progresso da Conferência
                  </span>
                  <span className="text-cyan-400 font-mono text-sm">
                    {aparelhosConfirmados.length} / {aparelhosEstoque.length} no estoque
                  </span>
                </div>
                <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                  <div 
                    className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all duration-300 rounded-full"
                    style={{ width: `${Math.min(100, Math.round((aparelhosConfirmados.length / (aparelhosEstoque.length || 1)) * 100))}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-0.5">
                  <span>Total Bipado: <strong className="text-white">{escaneados.length}</strong></span>
                  <span>Sobrando / Fora: <strong className="text-amber-400">{codigosSobrando.length}</strong></span>
                </div>
              </div>

              {/* Lista dos Itens Escaneados */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
                {escaneados.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500 space-y-2">
                    <Camera className="w-8 h-8 opacity-40 animate-pulse" />
                    <p className="text-xs font-medium">Nenhum aparelho bipado nesta sessão.</p>
                    <p className="text-[11px] text-slate-600">Aponte a câmera para o código da etiqueta ou conecte o leitor USB.</p>
                  </div>
                ) : (
                  escaneados.map((item, idx) => (
                    <div 
                      key={`${item.codigoLido}-${idx}`}
                      className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between gap-3 text-xs hover:border-slate-700 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-white truncate">{item.codigoLido}</span>
                          <span className="text-[10px] text-slate-500">{item.timestamp}</span>
                        </div>
                        {item.aparelhoEncontrado ? (
                          <p className="text-[11px] text-emerald-400 font-semibold truncate mt-0.5">
                            ✓ {item.aparelhoEncontrado.modelo} ({item.aparelhoEncontrado.imei || item.aparelhoEncontrado.codigo || 'OK'})
                          </p>
                        ) : (
                          <p className="text-[11px] text-amber-400 font-medium truncate mt-0.5">
                            ⚠️ Não consta no estoque ativo
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {item.aparelhoEncontrado ? (
                          <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[10px]">
                            Encontrado
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-[10px]">
                            Sobrando
                          </Badge>
                        )}
                        <button
                          onClick={() => setEscaneados((prev) => prev.filter((_, i) => i !== idx))}
                          className="p-1 text-slate-500 hover:text-red-400 rounded transition-colors"
                          title="Remover da lista"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Botão Finalizar */}
              <div className="pt-3 border-t border-slate-800 flex items-center justify-between shrink-0">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => {
                    if (confirm('Deseja limpar todos os itens bipados nesta conferência?')) {
                      setEscaneados([]);
                    }
                  }} 
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Limpar Bipados
                </Button>
                <Button 
                  onClick={handleFinalizarEConferir} 
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs gap-2 px-5 py-2.5 rounded-xl shadow-lg shadow-emerald-900/20"
                >
                  <CheckCircle2 className="w-4 h-4" /> Finalizar Conferência ({escaneados.length})
                </Button>
              </div>

            </div>

          </div>
        )}

        {/* ETAPA 2: RELATÓRIO DE DIVERGÊNCIAS E AJUSTES */}
        {etapa === 'relatorio' && (
          <div className="flex-1 overflow-y-auto space-y-5 min-h-0 pr-1">
            
            {/* CARDS DE RESUMO */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl">
                <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block">✓ Encontrados</span>
                <p className="text-2xl font-extrabold text-white mt-1">{aparelhosConfirmados.length}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Aparelhos conferidos no estoque físico</p>
              </div>

              <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl">
                <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider block">⚠️ Faltantes (No banco)</span>
                <p className="text-2xl font-extrabold text-white mt-1">{aparelhosFaltantes.length}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Ativos no sistema mas não bipados</p>
              </div>

              <div className="p-3.5 bg-purple-500/10 border border-purple-500/30 rounded-2xl">
                <span className="text-[11px] font-bold text-purple-400 uppercase tracking-wider block">❓ Sobrando / Fora</span>
                <p className="text-2xl font-extrabold text-white mt-1">{codigosSobrando.length}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Códigos lidos sem cadastro ativo</p>
              </div>
            </div>

            {/* SEÇÃO DE TRATAMENTO DE FALTANTES */}
            <div className="space-y-3 p-4 bg-slate-950 rounded-2xl border border-slate-800">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400" /> O que fazer com os {aparelhosFaltantes.length} Aparelhos Faltantes?
                  </h4>
                  <p className="text-xs text-slate-400">Escolha o destino de cada aparelho não localizado durante a varredura física.</p>
                </div>

                {aparelhosFaltantes.length > 0 && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] text-slate-400">Aplicar a todos:</span>
                    <button
                      onClick={() => aplicarLoteAcoes('remover')}
                      className="px-2 py-1 bg-red-500/20 text-red-300 hover:bg-red-500/30 text-[10px] font-bold rounded-lg"
                    >
                      Remover Todos
                    </button>
                    <button
                      onClick={() => aplicarLoteAcoes('vendido')}
                      className="px-2 py-1 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 text-[10px] font-bold rounded-lg"
                    >
                      Dar Saída Vendido
                    </button>
                  </div>
                )}
              </div>

              {aparelhosFaltantes.length === 0 ? (
                <div className="p-6 text-center text-emerald-400 text-xs font-bold bg-emerald-950/20 rounded-xl border border-emerald-500/30">
                  🎉 Nenhum aparelho faltante! O estoque físico corresponde 100% ao banco de dados!
                </div>
              ) : (
                <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                  {aparelhosFaltantes.map((aparelho) => (
                    <div key={aparelho.id} className="p-3 bg-slate-900 border border-slate-800 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <p className="font-bold text-white truncate">{aparelho.modelo}</p>
                        <p className="text-[11px] text-slate-400 font-mono">
                          IMEI/Código: {aparelho.imei || aparelho.codigo || aparelho.numeroSerie || aparelho.id}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <select
                          value={acoesFaltantes[aparelho.id] || 'remover'}
                          onChange={(e) => setAcoesFaltantes({ ...acoesFaltantes, [aparelho.id]: e.target.value as AcaoFaltante })}
                          className="bg-slate-950 text-xs font-semibold text-white border border-slate-700 rounded-lg px-2.5 py-1.5 outline-none focus:border-cyan-500 cursor-pointer"
                        >
                          <option value="remover">❌ Remover do Estoque (Baixa)</option>
                          <option value="vendido">🛒 Dar Saída - Vendido</option>
                          <option value="manutencao">🛠️ Encaminhar para Manutenção</option>
                          <option value="atacado">📦 Dar Saída - Venda Atacado</option>
                          <option value="manter">🔄 Manter no Estoque (Ignorar)</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* BOTÕES DE AÇÃO DO RELATÓRIO */}
            <div className="flex items-center justify-between pt-2">
              <Button variant="ghost" size="sm" onClick={() => setEtapa('escaneamento')} className="text-xs text-slate-400 hover:text-white">
                ← Voltar para Escaneamento
              </Button>

              <Button
                onClick={handleSalvarAjustesEstoque}
                disabled={salvandoAjustes}
                className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs gap-2 px-6 py-2.5 rounded-xl shadow-lg shadow-cyan-900/20"
              >
                {salvandoAjustes ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Atualizando Estoque...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" /> Aplicar Ajustes no Estoque
                  </>
                )}
              </Button>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
