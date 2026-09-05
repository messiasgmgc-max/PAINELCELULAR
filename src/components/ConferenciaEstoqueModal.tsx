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
  Plus,
  CheckSquare,
  Square,
  ArrowUpDown,
  Copy
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { cn, sortModelosCronologico, getAparelhoCodigo } from '@/lib/utils';

interface AparelhoAuditoria {
  id: string;
  modelo: string;
  marca?: string;
  imei?: string;
  numeroSerie?: string;
  codigo?: string;
  status?: string;
  condicao?: string;
  cor?: string;
  capacidade?: string;
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

export function ConferenciaEstoqueModal({
  isOpen,
  onClose,
  aparelhosEstoque,
  lojaId,
  onEstoqueAtualizado,
}: ConferenciaEstoqueModalProps) {
  const [etapa, setEtapa] = useState<'escaneamento' | 'relatorio'>('escaneamento');
  const [modoConferencia, setModoConferencia] = useState<'scanner' | 'manual'>('scanner');
  const [buscaManual, setBuscaManual] = useState('');
  const [escaneados, setEscaneados] = useState<ItemEscaneado[]>([]);
  const [manualCode, setManualCode] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [salvandoAjustes, setSalvandoAjustes] = useState(false);
  const [ordemModelos, setOrdemModelos] = useState<'antigo_para_novo' | 'novo_para_antigo'>('antigo_para_novo');

  // Mapeamento de ações para aparelhos faltantes: idAparelho -> AcaoFaltante
  const [acoesFaltantes, setAcoesFaltantes] = useState<Record<string, AcaoFaltante>>({});

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const startPromiseRef = useRef<Promise<void> | null>(null);
  const keyBufferRef = useRef<string>('');
  const keyTimeoutRef = useRef<any>(null);
  const modalContainerRef = useRef<HTMLDivElement>(null);

  // Desligar câmera de forma limpa antes de fechar o modal
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

  // Processa a leitura de um código de barras / IMEI
  const processarCodigoLido = (rawCode: string) => {
    const clean = rawCode.trim();
    if (!clean) return;

    setEscaneados((prev) => {
      if (prev.some((item) => item.codigoLido.toLowerCase() === clean.toLowerCase())) {
        toast.info(`O código "${clean}" já foi bipado anteriormente nesta conferência.`);
        return prev;
      }

      playBeep();

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

  // Inicializar câmera com cancelamento seguro
  useEffect(() => {
    let isMounted = true;

    if (!isOpen || etapa !== 'escaneamento') {
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
        const container = document.getElementById('conf-qr-container');
        if (!container) return;

        const html5QrCode = createSafeScanner('conf-qr-container');
        scannerRef.current = html5QrCode;

        const promise = html5QrCode.start(
          { facingMode: 'environment' },
          { fps: 15, qrbox: { width: 260, height: 180 }, aspectRatio: 1.0 },
          (decodedText) => {
            if (isMounted) {
              processarCodigoLido(decodedText);
            }
          },
          () => {}
        );

        startPromiseRef.current = promise;
        await promise;

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
        const instance = scannerRef.current;
        const p = startPromiseRef.current;
        scannerRef.current = null;
        startPromiseRef.current = null;
        stopScannerInstance(instance, p);
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

  // Aparelhos ativos no banco que NÃO foram bipados (Faltantes) - Ordenados cronologicamente do mais antigo para o mais novo
  const aparelhosFaltantes = useMemo(() => {
    const idsConfirmados = new Set(aparelhosConfirmados.map((a) => a.id));
    return aparelhosEstoque
      .filter((aparelho) => !idsConfirmados.has(aparelho.id))
      .sort((a, b) => sortModelosCronologico(a.modelo || '', b.modelo || '', ordemModelos));
  }, [aparelhosEstoque, aparelhosConfirmados, ordemModelos]);

  // Códigos bipados que NÃO correspondem a nenhum aparelho ativo no banco (Sobrando / Não cadastrado)
  const codigosSobrando = useMemo(() => {
    return escaneados.filter((e) => !e.aparelhoEncontrado);
  }, [escaneados]);

  // ── Lógica para Seleção Manual por Lista ──
  const idsConfirmadosSet = useMemo(() => {
    return new Set(aparelhosConfirmados.map((a) => a.id));
  }, [aparelhosConfirmados]);

  const aparelhosFiltradosManual = useMemo(() => {
    if (!buscaManual.trim()) return aparelhosEstoque;
    const termo = buscaManual.toLowerCase().trim();
    return aparelhosEstoque.filter((a) => {
      const mod = (a.modelo || '').toLowerCase();
      const mar = (a.marca || '').toLowerCase();
      const ime = (a.imei || '').toLowerCase();
      const cod = (a.codigo || '').toLowerCase();
      const num = (a.numeroSerie || '').toLowerCase();
      return mod.includes(termo) || mar.includes(termo) || ime.includes(termo) || cod.includes(termo) || num.includes(termo);
    });
  }, [aparelhosEstoque, buscaManual]);

  // Agrupa e ordena modelos do mais ANTIGO para o mais NOVO
  const gruposModelosOrdenados = useMemo(() => {
    const map: Record<string, AparelhoAuditoria[]> = {};
    aparelhosFiltradosManual.forEach((a) => {
      const modeloKey = a.modelo ? a.modelo.replace(/^Apple\s+/i, '').trim() : 'Outros';
      if (!map[modeloKey]) map[modeloKey] = [];
      map[modeloKey].push(a);
    });

    const entries = Object.entries(map).sort(([modA], [modB]) => {
      return sortModelosCronologico(modA, modB, ordemModelos);
    });

    return entries.map(([modelo, itens]) => {
      const itensOrdenados = [...itens].sort((a, b) => {
        const capNumA = parseInt(String(a.capacidade || '').replace(/\D/g, ''), 10) || 0;
        const capNumB = parseInt(String(b.capacidade || '').replace(/\D/g, ''), 10) || 0;
        if (capNumA !== capNumB) return capNumA - capNumB;
        return (a.cor || '').localeCompare(b.cor || '', 'pt-BR');
      });
      return { modelo, itens: itensOrdenados };
    });
  }, [aparelhosFiltradosManual, ordemModelos]);

  const toggleItemManual = (aparelho: AparelhoAuditoria) => {
    const jaConfirmado = idsConfirmadosSet.has(aparelho.id);
    if (jaConfirmado) {
      setEscaneados((prev) => prev.filter((e) => e.aparelhoEncontrado?.id !== aparelho.id));
    } else {
      const codigo = aparelho.codigo || aparelho.imei || aparelho.numeroSerie || aparelho.id;
      setEscaneados((prev) => [
        {
          codigoLido: codigo,
          timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          aparelhoEncontrado: aparelho,
        },
        ...prev,
      ]);
      playBeep();
    }
  };

  const marcarListaManual = (itens: AparelhoAuditoria[]) => {
    const novos: ItemEscaneado[] = [];
    itens.forEach((aparelho) => {
      if (!idsConfirmadosSet.has(aparelho.id)) {
        const codigo = aparelho.codigo || aparelho.imei || aparelho.numeroSerie || aparelho.id;
        novos.push({
          codigoLido: codigo,
          timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          aparelhoEncontrado: aparelho,
        });
      }
    });
    if (novos.length > 0) {
      setEscaneados((prev) => [...novos, ...prev]);
      toast.success(`${novos.length} aparelho(s) marcado(s) como localizado(s)!`);
    }
  };

  const desmarcarListaManual = (itens: AparelhoAuditoria[]) => {
    const idsRemover = new Set(itens.map((a) => a.id));
    setEscaneados((prev) => prev.filter((e) => !e.aparelhoEncontrado || !idsRemover.has(e.aparelhoEncontrado.id)));
    toast.info(`${itens.length} aparelho(s) desmarcado(s).`);
  };

  const aplicarLoteAcoes = (acao: AcaoFaltante) => {
    const novao: Record<string, AcaoFaltante> = {};
    aparelhosFaltantes.forEach((a) => {
      novao[a.id] = acao;
    });
    setAcoesFaltantes(novao);
  };

  const handleFinalizarEConferir = async () => {
    if (escaneados.length === 0) {
      if (!confirm('Nenhum aparelho foi escaneado ainda. Deseja avançar para o relatório de qualquer forma?')) {
        return;
      }
    }
    if (scannerRef.current) {
      const instance = scannerRef.current;
      const p = startPromiseRef.current;
      scannerRef.current = null;
      startPromiseRef.current = null;
      setCameraActive(false);
      await stopScannerInstance(instance, p);
    }
    setEtapa('relatorio');
  };

  const copiarParaAreaTransferencia = async (texto: string) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(texto);
        return true;
      }
    } catch (e) {
      console.warn('Falha no navigator.clipboard, tentando fallback:', e);
    }

    try {
      const textarea = document.createElement('textarea');
      textarea.value = texto;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const copiado = document.execCommand('copy');
      document.body.removeChild(textarea);
      return copiado;
    } catch (errFallback) {
      console.error('Falha geral no clipboard:', errFallback);
      return false;
    }
  };

  const gerarTextoSaidasGrupo = () => {
    const dataHora = new Date().toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const itensComSaida = aparelhosFaltantes
      .map((a) => ({ aparelho: a, acao: acoesFaltantes[a.id] || 'remover' }))
      .filter((item) => item.acao !== 'manter');

    let txt = `📦 *CONFERÊNCIA DE ESTOQUE - RELATÓRIO DE SAÍDAS*\n`;
    txt += `📅 *Data/Hora:* ${dataHora}\n`;
    txt += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    txt += `✅ *Aparelhos no estoque físico:* ${aparelhosConfirmados.length}\n`;
    txt += `⚠️ *Total de baixas/saídas:* ${itensComSaida.length}\n`;
    txt += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    if (itensComSaida.length === 0) {
      txt += `🎉 *NENHUMA SAÍDA REGISTRADA!*\n`;
      txt += `Todos os ${aparelhosConfirmados.length} aparelhos foram conferidos e localizados fisicamente.\n`;
    } else {
      txt += `📋 *DETALHAMENTO DAS SAÍDAS:*\n\n`;

      const porAcao: Record<string, Array<{ aparelho: AparelhoAuditoria; acao: AcaoFaltante }>> = {};
      itensComSaida.forEach((item) => {
        if (!porAcao[item.acao]) porAcao[item.acao] = [];
        porAcao[item.acao].push(item);
      });

      const titulos: Record<string, { label: string; icon: string }> = {
        vendido: { label: 'VENDIDOS (VAREJO)', icon: '🛒' },
        atacado: { label: 'VENDA ATACADO (LOJISTA)', icon: '📦' },
        manutencao: { label: 'ENCAMINHADOS PARA MANUTENÇÃO', icon: '🛠️' },
        remover: { label: 'BAIXAS / EXTRAVIOS / REMOVIDOS', icon: '❌' },
      };

      Object.entries(porAcao).forEach(([acaoKey, lista]) => {
        const info = titulos[acaoKey] || { label: acaoKey.toUpperCase(), icon: '📍' };
        txt += `${info.icon} *${info.label} (${lista.length}):*\n`;
        lista.forEach(({ aparelho }) => {
          const cod = getAparelhoCodigo(aparelho as any);
          const imeiStr = aparelho.imei ? ` | IMEI: ${aparelho.imei}` : '';
          const capStr = aparelho.capacidade ? ` ${aparelho.capacidade}` : '';
          const corStr = aparelho.cor ? ` ${aparelho.cor}` : '';
          txt += `• *${aparelho.marca || ''} ${aparelho.modelo}*${capStr}${corStr} (ID: ${cod}${imeiStr})\n`;
        });
        txt += `\n`;
      });
    }

    if (codigosSobrando.length > 0) {
      txt += `❓ *CÓDIGOS BIPADOS SEM CADASTRO (${codigosSobrando.length}):*\n`;
      codigosSobrando.forEach((s) => {
        txt += `• Código: ${s.codigoLido}\n`;
      });
      txt += `\n`;
    }

    txt += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    txt += `📲 _Copiado automaticamente na conferência do estoque._`;
    return txt;
  };

  const handleSalvarAjustesEstoque = async () => {
    setSalvandoAjustes(true);
    try {
      let alterados = 0;

      for (const aparelho of aparelhosFaltantes) {
        const acao = acoesFaltantes[aparelho.id];
        if (!acao || acao === 'manter') continue;

        let payload: any = {};

        if (acao === 'vendido') {
          payload = { ativo: false, condicao: 'vendido', status: 'vendido', observacoes: `Baixa automática na conferência de estoque: Marcado como Vendido em ${new Date().toLocaleDateString('pt-BR')}` };
        } else if (acao === 'manutencao') {
          payload = { status: 'manutencao', observacoes: `Encaminhado para manutenção na conferência de estoque em ${new Date().toLocaleDateString('pt-BR')}` };
        } else if (acao === 'atacado') {
          payload = { ativo: false, condicao: 'vendido', status: 'vendido', observacoes: `Vendido no atacado (Baixa na conferência de estoque em ${new Date().toLocaleDateString('pt-BR')})` };
        } else if (acao === 'remover') {
          payload = { ativo: false, observacoes: `Removido do estoque por extravio/perda na conferência em ${new Date().toLocaleDateString('pt-BR')}` };
        }

        if (Object.keys(payload).length > 0) {
          const { error } = await supabase
            .from('aparelhos')
            .update(payload)
            .eq('id', aparelho.id);

          if (!error) {
            alterados += 1;

            // Se for vendido ou atacado, registra também em vendas com dados pendentes
            if (acao === 'vendido' || acao === 'atacado') {
              try {
                const dataIso = new Date().toISOString();
                const precoNum = aparelho.preco || 0;
                await supabase.from('vendas').insert([{
                  clienteNome: acao === 'atacado' ? 'Venda Atacado (Conferência)' : 'Venda Varejo (Conferência)',
                  tipoEntrega: acao === 'atacado' ? 'Atacado / Lojista' : 'Varejo',
                  valor: precoNum,
                  custo: 0,
                  lucro: precoNum,
                  percentualLucro: 100,
                  dataPagamento: dataIso,
                  status: 'pago',
                  metodo: 'dinheiro',
                  saldoDevedor: 0,
                  valorPago: precoNum,
                  dados_cliente_pendente: acao === 'vendido',
                  descricao: `Baixa na conferência de estoque: ${aparelho.modelo}`,
                  itens: [{
                    id: `${Date.now()}_${aparelho.id}`,
                    aparelhoId: aparelho.id,
                    descricao: `${aparelho.marca || ''} ${aparelho.modelo} (ID: ${getAparelhoCodigo(aparelho as any)})`,
                    quantidade: 1,
                    valorInterno: 0,
                    valorExibir: precoNum,
                    total: precoNum,
                  }],
                  loja_id: (aparelho as any).loja_id || (aparelho as any).lojaId || null
                }]);
              } catch (errV) {
                console.warn('Registro de venda na conferência:', errV);
              }
            }
          }
        }
      }

      // Copia automaticamente o texto das saídas para a área de transferência!
      const textoSaidas = gerarTextoSaidasGrupo();
      const copiou = await copiarParaAreaTransferencia(textoSaidas);

      if (copiou) {
        toast.success(`📋 Todas as saídas (${alterados}) copiadas para a área de transferência! Só colar no grupo WhatsApp!`, {
          duration: 9000,
        });
      } else {
        toast.success(`🚀 Auditoria concluída! ${alterados} aparelhos tiveram baixa/ajuste no estoque.`);
      }

      onEstoqueAtualizado();
      handleClose();
    } catch (err: any) {
      console.error('Erro ao aplicar ajustes na conferência:', err);
      toast.error(`Erro ao aplicar ajustes: ${err?.message || 'Falha no servidor'}`);
    } finally {
      setSalvandoAjustes(false);
    }
  };

  // Manter o container do leitor no DOM para evitar que a remoção do DOM cause erro no Html5Qrcode
  if (!isOpen) {
    return (
      <div style={{ display: 'none' }}>
        <div id="conf-qr-container" />
      </div>
    );
  }

  return (
    <div 
      ref={modalContainerRef}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-6 bg-black/85 backdrop-blur-md overflow-y-auto"
    >
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-4xl w-full p-3.5 sm:p-6 shadow-2xl space-y-4 text-white max-h-[92dvh] overflow-y-auto flex flex-col my-auto">
        
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
            <button onClick={handleClose} className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* SELETOR DE MODO DE CONFERÊNCIA (Etapa 1) */}
        {etapa === 'escaneamento' && (
          <div className="flex items-center gap-2 p-1 bg-slate-950 rounded-2xl border border-slate-800 shrink-0">
            <button
              onClick={() => setModoConferencia('scanner')}
              className={cn(
                "flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer",
                modoConferencia === 'scanner'
                  ? "bg-cyan-500 text-white shadow-md shadow-cyan-950/40"
                  : "text-slate-400 hover:text-white hover:bg-slate-900"
              )}
            >
              <Camera className="w-4 h-4" /> Bipar Código de Barras / Câmera
            </button>
            <button
              onClick={() => setModoConferencia('manual')}
              className={cn(
                "flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer",
                modoConferencia === 'manual'
                  ? "bg-cyan-500 text-white shadow-md shadow-cyan-950/40"
                  : "text-slate-400 hover:text-white hover:bg-slate-900"
              )}
            >
              <CheckSquare className="w-4 h-4" /> Seleção Manual por Lista ({aparelhosConfirmados.length}/{aparelhosEstoque.length})
            </button>
          </div>
        )}

        {/* ETAPA 1 - MODO A: SCANNER CONTÍNUO */}
        {etapa === 'escaneamento' && modoConferencia === 'scanner' && (
          <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-0">
            
            {/* COLUNA ESQUERDA: CÂMERA E ENTRADA */}
            <div className="lg:col-span-5 flex flex-col gap-3 min-h-0">
              <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 h-[220px] sm:h-[260px] w-full flex items-center justify-center shrink-0">
                
                {/* O container id="conf-qr-container" fica AQUI DENTRO da moldura da esquerda */}
                <div 
                  id="conf-qr-container" 
                  className="w-full h-full [&>video]:w-full [&>video]:h-full [&>video]:object-cover [&>video]:max-h-[260px] [&>video]:rounded-2xl" 
                />

                {/* Elemento visual ou mira da câmera */}
                {cameraActive && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
                    <div className="w-52 h-36 border-2 border-cyan-400/80 rounded-2xl shadow-[0_0_20px_rgba(6,182,212,0.4)] relative overflow-hidden">
                      <div className="absolute inset-x-0 h-0.5 bg-cyan-400 animate-pulse top-1/2 -translate-y-1/2 shadow-[0_0_10px_#22d3ee]" />
                    </div>
                  </div>
                )}

                {cameraError && (
                  <div className="p-4 text-center space-y-2 z-10">
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
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0 max-h-[320px]">
                {escaneados.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500 space-y-2">
                    <Camera className="w-8 h-8 opacity-40 animate-pulse mx-auto" />
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
                  <CheckCircle2 className="w-4 h-4" /> Finalizar Conferência ({aparelhosConfirmados.length})
                </Button>
              </div>

            </div>

          </div>
        )}

        {/* ETAPA 1 - MODO B: SELEÇÃO MANUAL POR LISTA */}
        {etapa === 'escaneamento' && modoConferencia === 'manual' && (
          <div className="flex-1 overflow-hidden flex flex-col gap-3 min-h-0 bg-slate-950/60 p-4 rounded-2xl border border-slate-800">
            
            {/* Barra de Busca e Ações Rápidas */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0 pb-3 border-b border-slate-800">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar modelo, cor, IMEI ou código..."
                  value={buscaManual}
                  onChange={(e) => setBuscaManual(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-cyan-500 outline-none"
                />
              </div>
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <button
                  type="button"
                  onClick={() => setOrdemModelos((prev) => (prev === 'antigo_para_novo' ? 'novo_para_antigo' : 'antigo_para_novo'))}
                  className="text-xs bg-slate-900 text-slate-200 border border-slate-700 hover:border-slate-600 font-bold px-3 py-1.5 rounded-xl gap-1.5 flex items-center cursor-pointer transition-colors shadow-sm"
                  title="Alterar ordem de exibição dos modelos (padrão: mais antigo para o mais novo)"
                >
                  <ArrowUpDown className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{ordemModelos === 'antigo_para_novo' ? 'Mais Antigo ➔ Mais Novo' : 'Mais Novo ➔ Mais Antigo'}</span>
                </button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => marcarListaManual(aparelhosFiltradosManual)}
                  className="text-xs bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20 font-bold rounded-xl gap-1.5 cursor-pointer"
                >
                  <CheckSquare className="w-3.5 h-3.5" /> Marcar Filtrados ({aparelhosFiltradosManual.length})
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => desmarcarListaManual(aparelhosFiltradosManual)}
                  className="text-xs bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800 font-bold rounded-xl gap-1.5 cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5 text-slate-400" /> Desmarcar
                </Button>
              </div>
            </div>

            {/* Lista Agrupada por Modelo */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 min-h-0 max-h-[380px]">
              {gruposModelosOrdenados.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-500 space-y-2">
                  <Package className="w-8 h-8 opacity-40 mx-auto" />
                  <p className="text-xs font-medium">Nenhum aparelho localizado com o termo pesquisado.</p>
                </div>
              ) : (
                gruposModelosOrdenados.map(({ modelo, itens }) => {
                  const todosGrupoConfirmados = itens.every((item) => idsConfirmadosSet.has(item.id));
                  const confirmadosNoGrupo = itens.filter((item) => idsConfirmadosSet.has(item.id)).length;

                  return (
                    <div key={modelo} className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3 space-y-2">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-white">{modelo}</span>
                          <Badge variant="outline" className="bg-slate-800 text-slate-300 text-[10px] border-slate-700">
                            {confirmadosNoGrupo} / {itens.length} encontrados
                          </Badge>
                        </div>
                        <button
                          onClick={() => {
                            if (todosGrupoConfirmados) {
                              desmarcarListaManual(itens);
                            } else {
                              marcarListaManual(itens);
                            }
                          }}
                          className="text-[11px] font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 bg-slate-800/60 hover:bg-slate-800 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                        >
                          {todosGrupoConfirmados ? 'Desmarcar Grupo' : 'Marcar Grupo'}
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        {itens.map((item) => {
                          const isChecked = idsConfirmadosSet.has(item.id);
                          return (
                            <label
                              key={item.id}
                              onClick={() => toggleItemManual(item)}
                              className={cn(
                                "p-2.5 rounded-xl border flex items-center gap-3 cursor-pointer transition-all select-none",
                                isChecked
                                  ? "bg-emerald-950/30 border-emerald-500/40 text-emerald-100"
                                  : "bg-slate-950/80 border-slate-800 hover:border-slate-700 text-slate-300"
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {}}
                                className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-0 cursor-pointer"
                              />
                              <div className="min-w-0 flex-1 text-xs">
                                <div className="font-bold text-white flex items-center gap-2">
                                  <span>{item.modelo}</span>
                                  {item.capacidade && <span className="text-[10px] text-slate-400">{item.capacidade}</span>}
                                  {item.cor && <span className="text-[10px] text-slate-400">· {item.cor}</span>}
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono truncate mt-0.5">
                                  IMEI/Cod: {item.codigo || item.imei || item.numeroSerie || item.id}
                                </div>
                              </div>
                              <Badge className={cn("text-[9px] shrink-0", isChecked ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-slate-800 text-slate-400 border-slate-700")}>
                                {isChecked ? '✓ Encontrado' : 'Faltante'}
                              </Badge>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Rodapé do Modo Manual */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-between shrink-0">
              <span className="text-xs text-slate-400">
                Total Localizado: <strong className="text-emerald-400">{aparelhosConfirmados.length}</strong> de <strong className="text-white">{aparelhosEstoque.length}</strong>
              </span>
              <Button 
                onClick={handleFinalizarEConferir} 
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs gap-2 px-5 py-2.5 rounded-xl shadow-lg shadow-emerald-900/20 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" /> Finalizar Conferência ({aparelhosConfirmados.length})
              </Button>
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
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-2 border-t border-slate-800">
              <Button variant="ghost" size="sm" onClick={() => setEtapa('escaneamento')} className="text-xs text-slate-400 hover:text-white">
                ← Voltar para Escaneamento
              </Button>

              <div className="flex items-center gap-2 flex-wrap justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const txt = gerarTextoSaidasGrupo();
                    const ok = await copiarParaAreaTransferencia(txt);
                    if (ok) {
                      toast.success('📋 Mensagem de saídas copiada para a área de transferência! Pronta para colar no grupo WhatsApp!');
                    } else {
                      toast.error('Não foi possível copiar para a área de transferência.');
                    }
                  }}
                  className="border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 font-bold text-xs gap-1.5 cursor-pointer h-9 px-4 rounded-xl"
                  title="Copiar texto formatado das saídas para colar no WhatsApp"
                >
                  <Copy className="w-3.5 h-3.5 text-emerald-400" /> Copiar Saídas p/ WhatsApp
                </Button>

                <Button
                  onClick={handleSalvarAjustesEstoque}
                  disabled={salvandoAjustes}
                  className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs gap-2 px-6 py-2.5 rounded-xl shadow-lg shadow-cyan-900/20 cursor-pointer h-9"
                >
                  {salvandoAjustes ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" /> Atualizando Estoque...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" /> Aplicar Ajustes & Copiar Saídas
                    </>
                  )}
                </Button>
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
