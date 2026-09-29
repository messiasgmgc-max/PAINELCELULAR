'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Camera, 
  X, 
  Volume2, 
  VolumeX, 
  RefreshCw, 
  CheckCircle2, 
  Package, 
  Trash2, 
  ShieldCheck, 
  CheckSquare, 
  FileSpreadsheet,
  MessageCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmarAcaoEstoqueModal } from '@/components/ConfirmarAcaoEstoqueModal';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { cn, sortModelosCronologico, getAparelhoCodigo, parseCapacidadeGB } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { estaNoEstoque, patchSaida } from '@/lib/estoque/ciclo';
import type { PatchCiclo, TipoMovimentacao } from '@/lib/estoque/ciclo';
import { aplicarMudancaEstoque, gerarLoteId } from '@/lib/estoque/movimentacoes';
import type { ResultadoMudancaEstoque } from '@/lib/estoque/movimentacoes';

// Subcomponentes extraídos
import { ConferenciaScannerView } from './conferencia/ConferenciaScannerView';
import { ConferenciaManualView } from './conferencia/ConferenciaManualView';
import { ModalEscolhaAmbigua } from './conferencia/ModalEscolhaAmbigua';
import { 
  salvarRascunho, 
  carregarRascunho, 
  limparRascunho, 
  playBeepFeedback, 
  triggerHaptic, 
  exportarResumoCSV, 
  gerarTextoWhatsAppFaltantes 
} from './conferencia/conferenciaUtils';
import type { ItemEscaneado, FlashColor, AcaoFaltante, RascunhoConferencia } from './conferencia/types';

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
  observacoes?: string;
  saude_bateria?: string;
  saudeBateria?: string;
  categoria?: string;
}

interface ConferenciaEstoqueModalProps {
  isOpen: boolean;
  onClose: () => void;
  aparelhosEstoque: AparelhoAuditoria[];
  lojaId: string | null;
  onEstoqueAtualizado: () => void;
}

export function ConferenciaEstoqueModal({
  isOpen,
  onClose,
  aparelhosEstoque,
  lojaId,
  onEstoqueAtualizado,
}: ConferenciaEstoqueModalProps) {
  const { usuario } = useAuth();
  const [etapa, setEtapa] = useState<'escaneamento' | 'relatorio'>('escaneamento');
  const [modoConferencia, setModoConferencia] = useState<'scanner' | 'manual'>('scanner');
  const [escaneados, setEscaneados] = useState<ItemEscaneado[]>([]);
  const [flashColor, setFlashColor] = useState<FlashColor>('none');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [salvandoAjustes, setSalvandoAjustes] = useState(false);
  const [confirmandoAjustes, setConfirmandoAjustes] = useState(false);
  const [ordemModelos] = useState<'antigo_para_novo' | 'novo_para_antigo'>('antigo_para_novo');

  // Filtro de escopo: por padrão apenas 'celulares' para contagem rigorosa sem poluição de outros itens
  const [filtroCategoria, setFiltroCategoria] = useState<'celulares' | 'todos'>('celulares');

  const totalCelulares = useMemo(() => {
    return aparelhosEstoque.filter((a) => !a.categoria || a.categoria === 'aparelho').length;
  }, [aparelhosEstoque]);

  const aparelhosAlvo = useMemo(() => {
    if (filtroCategoria === 'celulares') {
      return aparelhosEstoque.filter((a) => !a.categoria || a.categoria === 'aparelho');
    }
    return aparelhosEstoque;
  }, [aparelhosEstoque, filtroCategoria]);

  // Rascunho persistente em localStorage
  const [rascunhoPendente, setRascunhoPendente] = useState<RascunhoConferencia | null>(null);

  // Desambiguação de códigos curtos / finais de IMEI
  const [desambiguacao, setDesambiguacao] = useState<{ codigoDigitado: string; candidatos: AparelhoAuditoria[] } | null>(null);

  // Mapeamento de ações para aparelhos faltantes: idAparelho -> AcaoFaltante
  const [acoesFaltantes, setAcoesFaltantes] = useState<Record<string, AcaoFaltante>>({});

  // Histórico para desfazer ação em lote manual
  const [historicoLoteAnterior, setHistoricoLoteAnterior] = useState<ItemEscaneado[] | null>(null);

  // Ao abrir o modal, verifica rascunho anterior
  useEffect(() => {
    if (isOpen && escaneados.length === 0) {
      const r = carregarRascunho(lojaId, usuario?.id);
      if (r && r.escaneados && r.escaneados.length > 0) {
        setRascunhoPendente(r);
      }
    }
  }, [isOpen, lojaId, usuario?.id]);

  // Salva rascunho automaticamente a cada mudança
  useEffect(() => {
    if (isOpen && escaneados.length > 0) {
      salvarRascunho(lojaId, usuario?.id, escaneados, aparelhosAlvo.length);
    }
  }, [escaneados, isOpen, lojaId, usuario?.id, aparelhosAlvo.length]);

  const dispararFlash = (cor: FlashColor) => {
    setFlashColor(cor);
    setTimeout(() => {
      setFlashColor('none');
    }, 450);
  };

  // Processa a leitura de um código de barras / IMEI com correspondência inteligente
  const processarCodigoLido = (rawCode: string) => {
    const clean = rawCode.trim();
    if (!clean) return;

    const inputLower = clean.toLowerCase();
    const cleanDigits = clean.replace(/\D/g, '');

    // 1. Checa se já foi escaneado nesta conferência
    const jaBipado = escaneados.some((item) => {
      if (item.codigoLido.toLowerCase() === inputLower) return true;
      if (cleanDigits && cleanDigits.length >= 4 && item.codigoLido.replace(/\D/g, '') === cleanDigits) return true;
      return false;
    });
    if (jaBipado) {
      toast.info(`O código "${clean}" já foi bipado anteriormente.`);
      dispararFlash('yellow');
      triggerHaptic('aviso');
      playBeepFeedback(soundEnabled);
      return;
    }

    const buscarCandidatos = (lista: AparelhoAuditoria[]) => {
      // 1. Busca exata de texto (código, IMEI, número de série ou ID)
      let match = lista.filter((a) => {
        const c1 = (a.codigo || '').trim().toLowerCase();
        const c2 = (a.imei || '').trim().toLowerCase();
        const c3 = (a.numeroSerie || '').trim().toLowerCase();
        const c4 = (a.id || '').trim().toLowerCase();
        return c1 === inputLower || c2 === inputLower || c3 === inputLower || c4 === inputLower;
      });

      // 2. Se não achou exato por texto e temos dígitos limpos (mínimo 4 dígitos)
      if (match.length === 0 && cleanDigits.length >= 4) {
        // 2a. Dígitos numéricos exatos (ex: IMEI no banco com formatação vs leitor limpo)
        match = lista.filter((a) => {
          const imeiClean = (a.imei || '').replace(/\D/g, '');
          const codClean = (a.codigo || getAparelhoCodigo(a) || '').replace(/\D/g, '');
          const numClean = (a.numeroSerie || '').replace(/\D/g, '');
          return (
            (imeiClean && imeiClean === cleanDigits) ||
            (codClean && codClean === cleanDigits) ||
            (numClean && numClean === cleanDigits)
          );
        });

        // 2b. Match de IMEI completo com leitor longo com dígito verificador ou código de barras de 14+ dígitos
        if (match.length === 0 && cleanDigits.length >= 14) {
          match = lista.filter((a) => {
            const imeiClean = (a.imei || '').replace(/\D/g, '');
            if (!imeiClean || imeiClean.length < 14) return false;
            return imeiClean.includes(cleanDigits) || cleanDigits.includes(imeiClean);
          });
        }

        // 2c. Match por final do IMEI / código (últimos 4 a 13 dígitos)
        if (match.length === 0 && cleanDigits.length >= 4 && cleanDigits.length < 14) {
          match = lista.filter((a) => {
            const imeiClean = (a.imei || '').replace(/\D/g, '');
            const codClean = (a.codigo || getAparelhoCodigo(a) || '').replace(/\D/g, '');
            const numClean = (a.numeroSerie || '').replace(/\D/g, '');
            return (
              (imeiClean && imeiClean.endsWith(cleanDigits)) ||
              (codClean && codClean.endsWith(cleanDigits)) ||
              (numClean && numClean.endsWith(cleanDigits))
            );
          });
        }
      }

      return match;
    };

    let encontrados = buscarCandidatos(aparelhosAlvo);

    // Se não achou na lista alvo (ex: celulares), mas está cadastrado em outra categoria (perfume/acessório)
    if (encontrados.length === 0 && aparelhosAlvo.length !== aparelhosEstoque.length) {
      const emOutros = buscarCandidatos(aparelhosEstoque);
      if (emOutros.length > 0) {
        setFiltroCategoria('todos');
        encontrados = emOutros;
      }
    }

    // Caso 1: Vários aparelhos encontrados (Ambiguidade)
    if (encontrados.length > 1) {
      setDesambiguacao({
        codigoDigitado: clean,
        candidatos: encontrados,
      });
      return;
    }

    // Caso 2: Exatamente 1 aparelho encontrado
    if (encontrados.length === 1) {
      const aparelho = encontrados[0];
      const jaConfirmado = idsConfirmadosSet.has(aparelho.id);
      if (jaConfirmado) {
        toast.info(`✓ ${aparelho.modelo} já foi conferido anteriormente!`);
        dispararFlash('yellow');
        triggerHaptic('aviso');
        playBeepFeedback(soundEnabled);
        return;
      }

      toast.success(`✓ ${aparelho.modelo} (${aparelho.capacidade || ''} ${aparelho.cor || ''}) conferido!`);
      dispararFlash('green');
      triggerHaptic('sucesso');
      playBeepFeedback(soundEnabled);

      setEscaneados((prev) => [
        {
          codigoLido: clean,
          timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          aparelhoEncontrado: aparelho,
        },
        ...prev,
      ]);
      return;
    }

    // Caso 3: Não encontrado no estoque ativo (Sobrando / Fora)
    toast.warning(`⚠️ Código "${clean}" não consta no estoque ativo.`);
    dispararFlash('red');
    triggerHaptic('erro');
    playBeepFeedback(soundEnabled);

    setEscaneados((prev) => [
      {
        codigoLido: clean,
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        aparelhoEncontrado: undefined,
      },
      ...prev,
    ]);
  };

  const handleSelecionarAmbiguidade = (aparelho: AparelhoAuditoria) => {
    if (!desambiguacao) return;
    toast.success(`✓ ${aparelho.modelo} selecionado e conferido!`);
    dispararFlash('green');
    triggerHaptic('sucesso');
    playBeepFeedback(soundEnabled);

    setEscaneados((prev) => [
      {
        codigoLido: desambiguacao.codigoDigitado,
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        aparelhoEncontrado: aparelho,
      },
      ...prev,
    ]);
    setDesambiguacao(null);
  };

  // Aparelhos que foram confirmados / encontrados no escaneamento
  const aparelhosConfirmados = useMemo(() => {
    return aparelhosAlvo
      .filter((aparelho) => {
        const imeiClean = (aparelho.imei || '').replace(/\D/g, '');
        const codClean = (aparelho.codigo || getAparelhoCodigo(aparelho) || '').replace(/\D/g, '');
        const numClean = (aparelho.numeroSerie || '').trim().toLowerCase();

        return escaneados.some((e) => {
          if (e.aparelhoEncontrado?.id === aparelho.id) return true;
          const inputLower = (e.codigoLido || '').trim().toLowerCase();
          const inputDigits = inputLower.replace(/\D/g, '');

          if (inputLower === (aparelho.id || '').toLowerCase()) return true;
          if (inputLower === (aparelho.codigo || '').trim().toLowerCase()) return true;
          if (inputLower === (aparelho.imei || '').trim().toLowerCase()) return true;
          if (inputLower === numClean) return true;

          if (inputDigits.length >= 4) {
            if (imeiClean && imeiClean === inputDigits) return true;
            if (codClean && codClean === inputDigits) return true;
            if (inputDigits.length < 14 && imeiClean.endsWith(inputDigits)) return true;
            if (inputDigits.length >= 14 && imeiClean && (imeiClean.includes(inputDigits) || inputDigits.includes(imeiClean))) return true;
          }
          return false;
        });
      })
      .sort((a, b) => {
        const cron = sortModelosCronologico(a.modelo || '', b.modelo || '', ordemModelos);
        if (cron !== 0) return cron;
        const capA = parseCapacidadeGB(a.capacidade);
        const capB = parseCapacidadeGB(b.capacidade);
        if (capA !== capB) return capA - capB;
        return (a.cor || '').localeCompare(b.cor || '', 'pt-BR');
      });
  }, [aparelhosAlvo, escaneados, ordemModelos]);

  // Aparelhos ativos no banco que NÃO foram bipados (Faltantes) ordenados rigorosamente do mais antigo para o mais novo
  const aparelhosFaltantes = useMemo(() => {
    const idsConfirmados = new Set(aparelhosConfirmados.map((a) => a.id));
    return aparelhosAlvo
      .filter((aparelho) => !idsConfirmados.has(aparelho.id))
      .sort((a, b) => {
        const cron = sortModelosCronologico(a.modelo || '', b.modelo || '', ordemModelos);
        if (cron !== 0) return cron;
        const capA = parseCapacidadeGB(a.capacidade);
        const capB = parseCapacidadeGB(b.capacidade);
        if (capA !== capB) return capA - capB;
        return (a.cor || '').localeCompare(b.cor || '', 'pt-BR');
      });
  }, [aparelhosAlvo, aparelhosConfirmados, ordemModelos]);

  // Códigos bipados que NÃO correspondem a nenhum aparelho ativo no banco
  const codigosSobrando = useMemo(() => {
    return escaneados.filter((e) => !e.aparelhoEncontrado);
  }, [escaneados]);

  const idsConfirmadosSet = useMemo(() => {
    return new Set(aparelhosConfirmados.map((a) => a.id));
  }, [aparelhosConfirmados]);

  // Ações manuais por lista
  const toggleItemManual = (aparelho: AparelhoAuditoria) => {
    const jaConfirmado = idsConfirmadosSet.has(aparelho.id);
    if (jaConfirmado) {
      setEscaneados((prev) => prev.filter((e) => e.aparelhoEncontrado?.id !== aparelho.id));
    } else {
      const codigo = aparelho.codigo || aparelho.imei || aparelho.numeroSerie || aparelho.id;
      setEscaneados((prev) => [
        {
          codigoLido: codigo || 'MANUAL',
          timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          aparelhoEncontrado: aparelho,
        },
        ...prev,
      ]);
    }
  };

  const handleMarcarGrupo = (itens: AparelhoAuditoria[], marcar: boolean) => {
    setHistoricoLoteAnterior([...escaneados]);
    if (marcar) {
      const novos = itens
        .filter((item) => !idsConfirmadosSet.has(item.id))
        .map((item) => ({
          codigoLido: item.codigo || item.imei || item.numeroSerie || item.id,
          timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          aparelhoEncontrado: item,
        }));
      setEscaneados((prev) => [...novos, ...prev]);
    } else {
      const idsDesmarcar = new Set(itens.map((i) => i.id));
      setEscaneados((prev) => prev.filter((e) => !e.aparelhoEncontrado || !idsDesmarcar.has(e.aparelhoEncontrado.id)));
    }
  };

  const handleDesfazerLote = () => {
    if (historicoLoteAnterior) {
      setEscaneados(historicoLoteAnterior);
      setHistoricoLoteAnterior(null);
      toast.success('Ação desfeita com sucesso.');
    }
  };

  const aplicarLoteAcoes = (acao: AcaoFaltante) => {
    const novao: Record<string, AcaoFaltante> = {};
    aparelhosFaltantes.forEach((a) => {
      novao[a.id] = acao;
    });
    setAcoesFaltantes(novao);
    toast.success(`Ação "${acao.toUpperCase()}" aplicada a todos os faltantes.`);
  };

  const copiarParaAreaTransferencia = async (texto: string) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(texto);
        return true;
      }
    } catch (e) {}
    try {
      const textarea = document.createElement('textarea');
      textarea.value = texto;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const copiou = document.execCommand('copy');
      document.body.removeChild(textarea);
      return copiou;
    } catch (e) {
      return false;
    }
  };

  const gerarTextoSaidasGrupo = () => {
    const nomeLoja = 'LOJA';
    return gerarTextoWhatsAppFaltantes(nomeLoja, aparelhosAlvo.length, aparelhosConfirmados.length, aparelhosFaltantes);
  };

  const contagemAjustes = useMemo(() => {
    const porAcao: Record<AcaoFaltante, number> = { manter: 0, vendido: 0, atacado: 0, manutencao: 0, remover: 0 };
    for (const a of aparelhosFaltantes) porAcao[acoesFaltantes[a.id] || 'remover'] += 1;
    const total = porAcao.vendido + porAcao.atacado + porAcao.manutencao + porAcao.remover;
    return { ...porAcao, total };
  }, [aparelhosFaltantes, acoesFaltantes]);

  const handleSalvarAjustesEstoque = async () => {
    setSalvandoAjustes(true);
    setConfirmandoAjustes(false);

    try {
      const loteId = gerarLoteId();
      const porAcao: Record<Exclude<AcaoFaltante, 'manter'>, AparelhoAuditoria[]> = {
        vendido: [],
        atacado: [],
        manutencao: [],
        remover: [],
      };

      for (const aparelho of aparelhosFaltantes) {
        const acao = acoesFaltantes[aparelho.id] || 'remover';
        if (acao !== 'manter') porAcao[acao].push(aparelho);
      }

      let alterados = 0;
      const falhas: string[] = [];
      const contabilizar = (resultado: ResultadoMudancaEstoque) => {
        alterados += resultado.afetados;
      };

      const contexto = {
        loteId,
        lojaId: lojaId || usuario?.lojaId || null,
        usuarioId: usuario?.id || null,
        usuarioNome: usuario?.nome || null,
      };

      const dataIso = new Date().toISOString();
      const dataBr = new Date().toLocaleDateString('pt-BR');
      const saidas: Array<{
        acao: 'vendido' | 'atacado' | 'remover';
        patch: PatchCiclo;
        tipo: TipoMovimentacao;
        observacao: string;
      }> = [
        {
          acao: 'vendido',
          patch: { ...patchSaida('vendido', 'venda'), observacoes: `BAIXA_ESTOQUE:${dataIso}:Baixa automática na conferência de estoque - Marcado como Vendido Varejo em ${dataBr}` },
          tipo: 'venda',
          observacao: 'Conferência de estoque: saída como venda (varejo)',
        },
        {
          acao: 'atacado',
          patch: { ...patchSaida('vendido', 'venda'), observacoes: `BAIXA_ESTOQUE:${dataIso}:Vendido no atacado (Baixa na conferência de estoque em ${dataBr})` },
          tipo: 'venda',
          observacao: 'Conferência de estoque: saída como venda no atacado',
        },
        {
          acao: 'remover',
          patch: { ...patchSaida('baixado', 'baixa_manual'), observacoes: `BAIXA_ESTOQUE:${dataIso}:Removido do estoque por extravio/perda na conferência em ${dataBr}` },
          tipo: 'baixa',
          observacao: 'Conferência de estoque: baixa por extravio/perda',
        },
      ];

      for (const saida of saidas) {
        const grupo = porAcao[saida.acao];
        if (grupo.length === 0) continue;

        for (let inicio = 0; inicio < grupo.length; inicio += 150) {
          const fatia = grupo.slice(inicio, inicio + 150);
          try {
            const resultado = await aplicarMudancaEstoque(supabase, {
              ...contexto,
              ids: fatia.map((a) => a.id),
              patch: saida.patch,
              tipo: saida.tipo,
              origem: 'conferencia',
              observacao: saida.observacao,
              filtroElegivel: (estado) => estaNoEstoque(estado),
            });
            contabilizar(resultado);
          } catch (errGrupo: any) {
            console.error(`Erro ao aplicar "${saida.acao}" na conferência:`, errGrupo);
            falhas.push(`${saida.acao} (${fatia.length}): ${errGrupo?.message || 'falha no servidor'}`);
          }
        }
      }

      // Manutenção
      for (const aparelho of porAcao.manutencao) {
        const dataIsoManut = new Date().toISOString();
        const tagManut = `[MANUTENCAO:status=com_tecnico|tecnico_nome=Oficina / Técnico Responsável|data=${dataIsoManut}|motivo=Encaminhado na conferência de estoque]`;
        const obsAtual = aparelho.observacoes || '';
        const observacoes = obsAtual ? `${obsAtual}\n${tagManut}` : tagManut;

        try {
          const resultado = await aplicarMudancaEstoque(supabase, {
            ...contexto,
            ids: [aparelho.id],
            tipo: 'saida',
            origem: 'conferencia',
            observacao: 'Conferência de estoque: encaminhado para manutenção',
            patch: { status: 'manutencao', observacoes },
            filtroElegivel: (estado) => estaNoEstoque(estado),
          });
          contabilizar(resultado);
        } catch (errManut: any) {
          falhas.push(`manutenção de ${aparelho.modelo}: ${errManut?.message || 'falha no servidor'}`);
        }
      }

      if (falhas.length > 0) {
        toast.error(`Alguns ajustes não foram aplicados: ${falhas.join(' | ')}`);
      } else {
        toast.success(`🚀 Conferência concluída! ${alterados} aparelhos ajustados no estoque.`);
      }

      // Limpa rascunho após sucesso
      limparRascunho(lojaId, usuario?.id);

      onEstoqueAtualizado();
      onClose();
    } catch (err: any) {
      toast.error(`Erro ao aplicar ajustes: ${err?.message || 'Falha no servidor'}`);
    } finally {
      setSalvandoAjustes(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-4xl w-full p-3.5 sm:p-5 shadow-2xl text-white h-[92dvh] max-h-[92dvh] flex flex-col overflow-hidden">
        
        {/* 1. CABEÇALHO FIXO */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold border border-cyan-500/30">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-white">Conferência de Estoque Física</h3>
              <p className="text-[11px] text-slate-400">
                {etapa === 'escaneamento'
                  ? 'Bipe etiquetas ou marque na lista para conferir contagem real'
                  : 'Relatório de divergências e ajuste do banco'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {etapa === 'escaneamento' && (
              <button
                type="button"
                onClick={() => setSoundEnabled(!soundEnabled)}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
                title={soundEnabled ? 'Som ativado' : 'Som desativado'}
              >
                {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4" />}
              </button>
            )}
            <button 
              type="button" 
              onClick={onClose} 
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* BANNER DE RECUPERAÇÃO DE RASCUNHO */}
        {rascunhoPendente && (
          <div className="bg-cyan-950/80 border border-cyan-500/50 p-3 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-2.5 shrink-0 my-2 animate-in fade-in">
            <div className="text-xs">
              <span className="font-bold text-cyan-300">Conferência em andamento encontrada! </span>
              <span className="text-slate-300">Há {rascunhoPendente.escaneados.length} itens salvos nesta sessão.</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  limparRascunho(lojaId, usuario?.id);
                  setRascunhoPendente(null);
                  setEscaneados([]);
                  toast.info('Rascunho anterior descartado.');
                }}
                className="text-xs h-7 text-slate-400 hover:text-white"
              >
                Começar Nova
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setEscaneados(rascunhoPendente.escaneados);
                  setRascunhoPendente(null);
                  toast.success(`${rascunhoPendente.escaneados.length} itens restaurados!`);
                }}
                className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs h-7"
              >
                Continuar
              </Button>
            </div>
          </div>
        )}

        {/* 2. BARRA DE PROGRESSO FIXA */}
        {etapa === 'escaneamento' && (
          <div className="py-2.5 px-3 bg-slate-950/80 rounded-2xl border border-slate-800/80 shrink-0 my-2 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="text-slate-300 flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-cyan-400" /> Progresso da Conferência
              </span>
              <span className="text-cyan-400 font-mono">
                {aparelhosConfirmados.length} / {aparelhosAlvo.length} conferidos
              </span>
            </div>
            <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
              <div 
                className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all duration-300 rounded-full"
                style={{ width: `${Math.min(100, Math.round((aparelhosConfirmados.length / (aparelhosAlvo.length || 1)) * 100))}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
              <span>Bipados: <strong className="text-white">{escaneados.length}</strong></span>
              <span>Faltantes: <strong className="text-amber-400">{aparelhosFaltantes.length}</strong></span>
              <span>Sobrando: <strong className="text-purple-400">{codigosSobrando.length}</strong></span>
            </div>

            {/* Alternador de Categoria de Estoque (Celulares vs Todos) */}
            {totalCelulares < aparelhosEstoque.length && (
              <div className="flex items-center gap-1.5 pt-1 border-t border-slate-800/80">
                <span className="text-[10px] text-slate-400 font-semibold uppercase">Auditar:</span>
                <button
                  type="button"
                  onClick={() => setFiltroCategoria('celulares')}
                  className={cn(
                    "px-2.5 py-0.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer",
                    filtroCategoria === 'celulares'
                      ? "bg-cyan-500 text-slate-950 shadow-sm"
                      : "bg-slate-900 text-slate-400 hover:text-white"
                  )}
                >
                  📱 Celulares ({totalCelulares})
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroCategoria('todos')}
                  className={cn(
                    "px-2.5 py-0.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer",
                    filtroCategoria === 'todos'
                      ? "bg-cyan-500 text-slate-950 shadow-sm"
                      : "bg-slate-900 text-slate-400 hover:text-white"
                  )}
                >
                  📦 Todos ({aparelhosEstoque.length})
                </button>
              </div>
            )}
          </div>
        )}

        {/* 3. SELETOR DE MODO (SCANNER CONTÍNUO VS SELEÇÃO MANUAL) */}
        {etapa === 'escaneamento' && (
          <div className="flex items-center gap-2 p-1 bg-slate-950 rounded-2xl border border-slate-800 shrink-0 mb-3">
            <button
              type="button"
              onClick={() => setModoConferencia('scanner')}
              className={cn(
                "flex-1 py-1.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer",
                modoConferencia === 'scanner'
                  ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-950/40"
                  : "text-slate-400 hover:text-white"
              )}
            >
              <Camera className="w-3.5 h-3.5" /> Bipar / Câmera
            </button>
            <button
              type="button"
              onClick={() => setModoConferencia('manual')}
              className={cn(
                "flex-1 py-1.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer",
                modoConferencia === 'manual'
                  ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-950/40"
                  : "text-slate-400 hover:text-white"
              )}
            >
              <CheckSquare className="w-3.5 h-3.5" /> Seleção Manual ({aparelhosConfirmados.length}/{aparelhosAlvo.length})
            </button>
          </div>
        )}

        {/* 4. CORPO COM SCROLL PRÓPRIO */}
        <div className="flex-1 overflow-y-auto min-h-0 pr-1 scrollbar-soft">
          {etapa === 'escaneamento' && modoConferencia === 'scanner' && (
            <div className="flex flex-col gap-3 min-h-full">
              {/* Visão da Câmera Compacta (~28% dvh) */}
              <ConferenciaScannerView 
                onScan={processarCodigoLido} 
                flashColor={flashColor}
              />

              {/* Lista dos Últimos Itens Bipados */}
              <div className="bg-slate-950/60 p-3 rounded-2xl border border-slate-800 space-y-2 flex-1">
                <div className="flex items-center justify-between text-xs font-bold pb-2 border-b border-slate-800">
                  <span className="text-slate-300">Últimos Aparelhos Bipados</span>
                  <Badge variant="outline" className="text-[10px] text-cyan-400 border-cyan-500/30">
                    {escaneados.length} itens
                  </Badge>
                </div>

                {escaneados.length === 0 ? (
                  <div className="p-6 text-center text-slate-500 text-xs">
                    Nenhum código lido ainda. Aponte a câmera ou digite no campo acima.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1 scrollbar-soft">
                    {escaneados.map((item, idx) => (
                      <div
                        key={`${item.codigoLido}-${idx}`}
                        className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-white truncate">{item.codigoLido}</span>
                            <span className="text-[10px] text-slate-500">{item.timestamp}</span>
                          </div>
                          {item.aparelhoEncontrado ? (
                            <p className="text-[11px] text-emerald-400 font-semibold truncate mt-0.5">
                              ✓ {item.aparelhoEncontrado.modelo} ({item.aparelhoEncontrado.cor || ''} {item.aparelhoEncontrado.capacidade || ''})
                            </p>
                          ) : (
                            <p className="text-[11px] text-amber-400 font-medium truncate mt-0.5">
                              ⚠️ Não consta no estoque ativo
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setEscaneados((prev) => prev.filter((_, i) => i !== idx))}
                          className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {etapa === 'escaneamento' && modoConferencia === 'manual' && (
            <ConferenciaManualView
              aparelhosEstoque={aparelhosAlvo}
              idsConfirmadosSet={idsConfirmadosSet}
              onToggleItem={toggleItemManual}
              onMarcarGrupo={handleMarcarGrupo}
              onDesfazerLote={handleDesfazerLote}
              podeDesfazerLote={!!historicoLoteAnterior}
            />
          )}

          {/* ETAPA 2: RELATÓRIO */}
          {etapa === 'relatorio' && (
            <div className="space-y-4">
              {/* Cards de Resumo */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl">
                  <span className="text-[11px] font-bold text-emerald-400 block uppercase">✓ Encontrados</span>
                  <p className="text-xl font-extrabold text-white mt-1">{aparelhosConfirmados.length}</p>
                </div>
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl">
                  <span className="text-[11px] font-bold text-amber-400 block uppercase">⚠️ Faltantes</span>
                  <p className="text-xl font-extrabold text-white mt-1">{aparelhosFaltantes.length}</p>
                </div>
                <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-2xl">
                  <span className="text-[11px] font-bold text-purple-400 block uppercase">❓ Sobrando / Fora</span>
                  <p className="text-xl font-extrabold text-white mt-1">{codigosSobrando.length}</p>
                </div>
              </div>

              {/* Botões de Ações Rápidas em Massa */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-950 rounded-2xl border border-slate-800">
                <span className="text-xs font-bold text-slate-300">
                  Destino dos {aparelhosFaltantes.length} Faltantes:
                </span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => aplicarLoteAcoes('remover')}
                    className="text-[10px] h-7 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border-rose-500/30 font-bold"
                  >
                    Baixar Todos
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => aplicarLoteAcoes('vendido')}
                    className="text-[10px] h-7 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/30 font-bold"
                  >
                    Marcar Vendidos
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => exportarResumoCSV(aparelhosConfirmados, aparelhosFaltantes, codigosSobrando)}
                    className="text-[10px] h-7 gap-1 font-semibold"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" /> Exportar CSV
                  </Button>
                </div>
              </div>

              {/* Lista dos Faltantes */}
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 scrollbar-soft">
                {aparelhosFaltantes.length === 0 ? (
                  <div className="p-6 text-center text-emerald-400 text-xs font-bold bg-emerald-950/20 rounded-2xl border border-emerald-500/30">
                    🎉 Nenhum aparelho faltante! O estoque físico corresponde 100% ao sistema!
                  </div>
                ) : (
                  aparelhosFaltantes.map((aparelho) => (
                    <div
                      key={aparelho.id}
                      className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-white truncate flex items-center gap-2">
                          <span>{aparelho.modelo}</span>
                          {aparelho.capacidade && <span className="text-[10px] text-slate-400">{aparelho.capacidade}</span>}
                          {aparelho.cor && <span className="text-[10px] text-cyan-400">{aparelho.cor}</span>}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          IMEI: {aparelho.imei || '-'} {aparelho.codigo ? `· Código: ${aparelho.codigo}` : ''}
                        </div>
                      </div>

                      <select
                        value={acoesFaltantes[aparelho.id] || 'remover'}
                        onChange={(e) => setAcoesFaltantes({ ...acoesFaltantes, [aparelho.id]: e.target.value as AcaoFaltante })}
                        className="bg-slate-900 text-xs font-semibold text-white border border-slate-700 rounded-lg px-2.5 py-1.5 outline-none focus:border-cyan-500 shrink-0"
                      >
                        <option value="remover">❌ Dar Baixa (Extravio / Perda)</option>
                        <option value="vendido">🛒 Dar Saída - Vendido</option>
                        <option value="manutencao">🛠️ Encaminhar Manutenção</option>
                        <option value="atacado">📦 Dar Saída - Atacado</option>
                        <option value="manter">🔄 Manter no Estoque</option>
                      </select>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* 5. FOOTER FIXO (SEM ESTOURAR LARGURA EM 360PX) */}
        <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 shrink-0">
          {etapa === 'escaneamento' ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (confirm('Deseja limpar todos os itens bipados nesta conferência?')) {
                    setEscaneados([]);
                    limparRascunho(lojaId, usuario?.id);
                  }
                }}
                className="text-xs text-slate-400 hover:text-white justify-center h-9"
              >
                Limpar Bipados
              </Button>

              <Button
                onClick={() => setEtapa('relatorio')}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs gap-2 px-5 h-9 rounded-xl shadow-lg shadow-emerald-900/20 justify-center cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" /> Finalizar Conferência ({aparelhosConfirmados.length})
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEtapa('escaneamento')}
                className="text-xs text-slate-400 hover:text-white justify-center h-9"
              >
                ← Voltar
              </Button>

              <div className="flex items-center gap-2 flex-wrap justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const txt = gerarTextoSaidasGrupo();
                    const ok = await copiarParaAreaTransferencia(txt);
                    if (ok) {
                      toast.success('📋 Resumo formatado copiado! Cole no WhatsApp.');
                    }
                  }}
                  className="text-xs font-bold gap-1.5 border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 h-9 px-3 rounded-xl cursor-pointer"
                >
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-400" /> WhatsApp
                </Button>

                <Button
                  onClick={() => (contagemAjustes.total > 0 ? setConfirmandoAjustes(true) : handleSalvarAjustesEstoque())}
                  disabled={salvandoAjustes}
                  className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs gap-1.5 px-4 h-9 rounded-xl shadow-lg shadow-cyan-900/20 cursor-pointer"
                >
                  {salvandoAjustes ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Salvando...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" /> Aplicar Ajustes ({contagemAjustes.total})
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>

      </div>

      {/* Modal de Escolha Ambígua */}
      {desambiguacao && (
        <ModalEscolhaAmbigua
          codigoDigitado={desambiguacao.codigoDigitado}
          candidatos={desambiguacao.candidatos}
          onSelecionar={handleSelecionarAmbiguidade}
          onCancelar={() => setDesambiguacao(null)}
        />
      )}

      {/* Modal de Confirmação Final com Quantidade Digitada */}
      {confirmandoAjustes && (
        <ConfirmarAcaoEstoqueModal
          aberto
          tom={contagemAjustes.remover + contagemAjustes.vendido + contagemAjustes.atacado > 0 ? 'perigo' : 'aviso'}
          titulo="Aplicar ajustes da conferência"
          descricao={
            <>
              <strong className="text-rose-300">{contagemAjustes.total} aparelho(s)</strong> não localizados terão o destino
              escolhido aplicado agora de forma atômica no banco de dados.
            </>
          }
          resumo={[
            { rotulo: 'Baixa por extravio/perda', valor: contagemAjustes.remover, tom: contagemAjustes.remover ? 'perigo' : 'neutro' },
            { rotulo: 'Saída como venda (varejo)', valor: contagemAjustes.vendido, tom: contagemAjustes.vendido ? 'aviso' : 'neutro' },
            { rotulo: 'Saída como venda (atacado)', valor: contagemAjustes.atacado, tom: contagemAjustes.atacado ? 'aviso' : 'neutro' },
            { rotulo: 'Encaminhados para manutenção', valor: contagemAjustes.manutencao },
            { rotulo: 'Mantidos no estoque', valor: contagemAjustes.manter, tom: 'positivo' },
          ]}
          quantidadeConfirmacao={contagemAjustes.total}
          rotuloQuantidade="aparelhos que vão mudar"
          acoes={[
            { rotulo: 'Voltar', variante: 'secundaria', onClick: () => setConfirmandoAjustes(false) },
            {
              rotulo: `Confirmar e Aplicar em ${contagemAjustes.total}`,
              variante: 'perigo',
              exigeDigitacao: true,
              onClick: handleSalvarAjustesEstoque,
              carregando: salvandoAjustes,
            },
          ]}
          onFechar={() => setConfirmandoAjustes(false)}
        />
      )}
    </div>
  );
}
