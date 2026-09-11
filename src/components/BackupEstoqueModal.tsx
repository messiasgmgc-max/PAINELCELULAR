'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  X,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Save,
  History,
  Cloud,
  HardDrive,
  Loader2,
  Ban,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Aparelho } from '@/lib/db/types';
import { useAuth } from '@/hooks/useAuth';
import { registrarLog } from '@/lib/logger';
import { ehAparelhoDeCliente, ehEstadoAmbiguoLegado, estaNoEstoque, patchRestauracao, patchSaida } from '@/lib/estoque/ciclo';
import { aplicarMudancaEstoque, gerarLoteId } from '@/lib/estoque/movimentacoes';

/**
 * Pontos de backup do estoque.
 *
 * Antes existiam só no localStorage: não apareciam em outro dispositivo e sumiam
 * ao limpar o cache — falhavam justamente quando mais se precisava deles. Agora
 * são gravados em `backups_estoque` no Supabase, e o localStorage fica como cache
 * local (e como plano B se a gravação na nuvem falhar).
 */

export interface PontoBackup {
  id: string;
  dataHora: string;
  criadoEm: string;
  motivo: string;
  lojaId: string | null;
  totalAparelhos: number;
  /** Os backups da nuvem trazem o conteúdo sob demanda: cada um tem centenas de aparelhos. */
  aparelhos?: Aparelho[];
  origem: 'nuvem' | 'local';
}

const BACKUP_STORAGE_KEY = 'painel_celular_pontos_backup_estoque';
const LIMITE_CACHE_LOCAL = 10;
const LIMITE_LISTA_NUVEM = 30;

function lerCacheLocal(): PontoBackup[] {
  try {
    const raw = localStorage.getItem(BACKUP_STORAGE_KEY);
    if (!raw) return [];
    const lista = JSON.parse(raw) as Array<Partial<PontoBackup>>;
    return lista.map((p) => {
      // Entradas antigas não tinham origem nem data ISO; o id era bkp_<timestamp>.
      const ts = Number(String(p.id || '').replace('bkp_', ''));
      return {
        id: String(p.id),
        dataHora: p.dataHora || '',
        criadoEm: p.criadoEm || (Number.isFinite(ts) && ts > 0 ? new Date(ts).toISOString() : ''),
        motivo: p.motivo || 'Backup',
        lojaId: p.lojaId ?? null,
        totalAparelhos: p.totalAparelhos ?? p.aparelhos?.length ?? 0,
        aparelhos: p.aparelhos,
        origem: p.origem || 'local',
      };
    });
  } catch {
    return [];
  }
}

function gravarCacheLocal(lista: PontoBackup[]) {
  try {
    localStorage.setItem(BACKUP_STORAGE_KEY, JSON.stringify(lista.slice(0, LIMITE_CACHE_LOCAL)));
  } catch (e) {
    // localStorage tem ~5 MB: com estoques grandes o cache pode não caber.
    console.warn('[Backup] Cache local cheio ou indisponível:', e);
  }
}

export async function salvarSnapshotBackup(
  aparelhos: Aparelho[],
  lojaId: string | null,
  motivo: string = 'Backup Manual',
  criadoPor?: string | null
): Promise<PontoBackup> {
  const agora = new Date();
  const copia = JSON.parse(JSON.stringify(aparelhos)) as Aparelho[];
  const ponto: PontoBackup = {
    id: `bkp_${agora.getTime()}`,
    dataHora: agora.toLocaleString('pt-BR'),
    criadoEm: agora.toISOString(),
    motivo,
    lojaId,
    totalAparelhos: copia.length,
    aparelhos: copia,
    origem: 'local',
  };

  // Cache local primeiro: vale mesmo sem rede e antes da migration existir.
  const cache = lerCacheLocal();
  gravarCacheLocal([ponto, ...cache]);

  if (!lojaId) return ponto;

  try {
    const { data, error } = await supabase
      .from('backups_estoque')
      .insert({
        loja_id: lojaId,
        motivo,
        total_aparelhos: copia.length,
        criado_por: criadoPor || null,
        payload: copia,
      })
      .select('id, criado_em')
      .single();

    if (error) throw error;

    const idLocal = ponto.id;
    ponto.id = data.id;
    ponto.criadoEm = data.criado_em;
    ponto.origem = 'nuvem';
    // Troca o id no cache para a mesma cópia não aparecer duas vezes na lista.
    gravarCacheLocal(lerCacheLocal().map((p) => (p.id === idLocal ? { ...ponto } : p)));
  } catch (err) {
    console.warn('[Backup] Não foi possível salvar na nuvem; ficou só neste dispositivo:', err);
  }

  return ponto;
}

export async function obterPontosBackup(lojaId: string | null): Promise<PontoBackup[]> {
  const locais = lerCacheLocal().filter((p) => !lojaId || !p.lojaId || p.lojaId === lojaId);

  let nuvem: PontoBackup[] = [];
  if (lojaId) {
    const { data, error } = await supabase
      .from('backups_estoque')
      .select('id, motivo, criado_em, total_aparelhos, loja_id')
      .eq('loja_id', lojaId)
      .order('criado_em', { ascending: false })
      .limit(LIMITE_LISTA_NUVEM);

    if (error) {
      console.warn('[Backup] Não foi possível listar backups da nuvem:', error.message);
    } else {
      nuvem = (data || []).map((r: any) => ({
        id: r.id,
        dataHora: new Date(r.criado_em).toLocaleString('pt-BR'),
        criadoEm: r.criado_em,
        motivo: r.motivo,
        lojaId: r.loja_id,
        totalAparelhos: r.total_aparelhos,
        origem: 'nuvem' as const,
      }));
    }
  }

  const locaisPorId = new Map(locais.map((p) => [p.id, p]));
  const idsNuvem = new Set(nuvem.map((p) => p.id));

  return [
    ...nuvem.map((p) => (locaisPorId.get(p.id)?.aparelhos ? { ...p, aparelhos: locaisPorId.get(p.id)!.aparelhos } : p)),
    ...locais.filter((p) => !idsNuvem.has(p.id)),
  ].sort((a, b) => (b.criadoEm || '').localeCompare(a.criadoEm || ''));
}

async function carregarConteudo(ponto: PontoBackup): Promise<Aparelho[]> {
  if (ponto.aparelhos) return ponto.aparelhos;
  const { data, error } = await supabase.from('backups_estoque').select('payload').eq('id', ponto.id).single();
  if (error) throw error;
  return (data?.payload || []) as Aparelho[];
}

/** Campos cadastrais que a restauração devolve ao valor do backup. Nunca o ciclo de vida. */
function camposCadastrais(a: Aparelho): Record<string, unknown> {
  const dados: Record<string, unknown> = {
    preco: a.preco,
    precoAtacado: (a as any).precoAtacado,
    custo: a.custo,
    modelo: a.modelo,
    cor: a.cor,
    capacidade: a.capacidade,
    observacoes: a.observacoes,
  };
  // Backups antigos podem ter condicao='vendido' gravada pelo bug: esse valor
  // não é uma condição física e não pode ser restaurado.
  if (a.condicao && a.condicao !== 'vendido') dados.condicao = a.condicao;
  return dados;
}

interface BackupEstoqueModalProps {
  isOpen: boolean;
  onClose: () => void;
  aparelhosAtuais: Aparelho[];
  lojaId: string | null;
  onEstoqueAtualizado: () => Promise<void>;
}

export function BackupEstoqueModal({
  isOpen,
  onClose,
  aparelhosAtuais,
  lojaId,
  onEstoqueAtualizado,
}: BackupEstoqueModalProps) {
  const { usuario } = useAuth();
  const [backups, setBackups] = useState<PontoBackup[]>([]);
  const [carregandoLista, setCarregandoLista] = useState(false);
  const [backupSelecionado, setBackupSelecionado] = useState<PontoBackup | null>(null);
  const [carregandoConteudo, setCarregandoConteudo] = useState(false);
  const [executando, setExecutando] = useState(false);
  const [criandoPonto, setCriandoPonto] = useState(false);

  const selecionar = useCallback(async (ponto: PontoBackup | null) => {
    setBackupSelecionado(ponto);
    if (!ponto || ponto.aparelhos) return;
    setCarregandoConteudo(true);
    try {
      const aparelhos = await carregarConteudo(ponto);
      const completo = { ...ponto, aparelhos };
      setBackupSelecionado((atual) => (atual?.id === ponto.id ? completo : atual));
      setBackups((lista) => lista.map((p) => (p.id === ponto.id ? completo : p)));
    } catch (err: any) {
      toast.error(`Não foi possível abrir este backup: ${err?.message || 'falha ao carregar'}`);
    } finally {
      setCarregandoConteudo(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    let ativo = true;
    setCarregandoLista(true);
    obterPontosBackup(lojaId)
      .then((lista) => {
        if (!ativo) return;
        setBackups(lista);
        void selecionar(lista[0] || null);
      })
      .finally(() => ativo && setCarregandoLista(false));
    return () => {
      ativo = false;
    };
  }, [isOpen, lojaId, selecionar]);

  // Diferença entre o backup e o estoque atual.
  const relatorioDiff = useMemo(() => {
    const vazio = {
      paraReativar: [] as Aparelho[],
      vendidosDepois: [] as Aparelho[],
      ambiguos: [] as Aparelho[],
      ausentes: [] as Aparelho[],
      comAlteracao: [] as { aparelhoBackup: Aparelho; aparelhoAtual: Aparelho; camposDiferentes: string[] }[],
      novosParaDesativar: [] as Aparelho[],
    };
    if (!backupSelecionado?.aparelhos) return vazio;

    const mapaAtuais = new Map(aparelhosAtuais.map((a) => [a.id, a]));
    const mapaBackup = new Map(backupSelecionado.aparelhos.map((a) => [a.id, a]));

    for (const aBackup of backupSelecionado.aparelhos) {
      // O snapshot guarda a loja inteira, vendidos inclusive. Só quem estava NO
      // ESTOQUE na hora do backup é candidato: antes, restaurar reativava também
      // o que já estava vendido quando o backup foi feito.
      if (!estaNoEstoque(aBackup as any)) continue;

      const aAtual = mapaAtuais.get(aBackup.id);
      if (!aAtual) {
        vazio.ausentes.push(aBackup);
      } else if (!estaNoEstoque(aAtual as any)) {
        if ((aAtual as any).status === 'vendido') vazio.vendidosDepois.push(aBackup);
        else if (ehEstadoAmbiguoLegado(aAtual as any)) vazio.ambiguos.push(aBackup);
        else vazio.paraReativar.push(aBackup);
      } else {
        const difs: string[] = [];
        if (aAtual.preco !== aBackup.preco) difs.push(`Preço: R$ ${aAtual.preco} ➔ R$ ${aBackup.preco}`);
        if ((aAtual as any).precoAtacado !== (aBackup as any).precoAtacado) {
          difs.push(`Atacado: R$ ${(aAtual as any).precoAtacado || 0} ➔ R$ ${(aBackup as any).precoAtacado || 0}`);
        }
        if (aBackup.condicao !== 'vendido' && aAtual.condicao !== aBackup.condicao) {
          difs.push(`Condição: ${aAtual.condicao} ➔ ${aBackup.condicao}`);
        }
        if (aAtual.modelo !== aBackup.modelo) difs.push(`Modelo: ${aAtual.modelo} ➔ ${aBackup.modelo}`);
        if (difs.length > 0) vazio.comAlteracao.push({ aparelhoBackup: aBackup, aparelhoAtual: aAtual, camposDiferentes: difs });
      }
    }

    vazio.novosParaDesativar = aparelhosAtuais.filter((a) => estaNoEstoque(a as any) && !mapaBackup.has(a.id));
    return vazio;
  }, [backupSelecionado, aparelhosAtuais]);

  if (!isOpen) return null;

  const handleCriarNovoBackupManual = async () => {
    setCriandoPonto(true);
    try {
      const criado = await salvarSnapshotBackup(aparelhosAtuais, lojaId, 'Ponto de Backup Manual', usuario?.nome);
      const lista = await obterPontosBackup(lojaId);
      setBackups(lista);
      setBackupSelecionado(lista.find((p) => p.id === criado.id) || criado);
      if (criado.origem === 'nuvem') {
        toast.success(`Ponto de backup salvo na nuvem (${criado.totalAparelhos} aparelhos).`);
      } else {
        toast.warning(`Backup salvo só neste dispositivo (${criado.totalAparelhos} aparelhos): a nuvem não respondeu.`);
      }
    } finally {
      setCriandoPonto(false);
    }
  };

  const handleConfirmarRestauracao = async () => {
    if (!backupSelecionado?.aparelhos) return;

    setExecutando(true);
    const { paraReativar, comAlteracao, novosParaDesativar } = relatorioDiff;
    const total = paraReativar.length + comAlteracao.length + (novosParaDesativar.length ? 1 : 0);
    const toastId = toast.loading(`Restaurando estoque (0 de ${total})...`);

    const contexto = {
      loteId: gerarLoteId(),
      lojaId,
      usuarioId: usuario?.id || null,
      usuarioNome: usuario?.nome || null,
    };
    let reativados = 0;
    let alterados = 0;
    let desativados = 0;
    let auditoriaIncompleta = false;
    let feitos = 0;
    const progresso = () => {
      feitos += 1;
      if (feitos % 10 === 0) toast.loading(`Restaurando estoque (${feitos} de ${total})...`, { id: toastId });
    };

    try {
      for (const item of paraReativar) {
        const r = await aplicarMudancaEstoque(supabase, {
          ...contexto,
          ids: [item.id],
          patch: { ...camposCadastrais(item), ...patchRestauracao() },
          tipo: 'restauracao',
          origem: 'backup_restauracao',
          camposAuditados: ['preco', 'modelo'],
          observacao: `Restaurado do backup "${backupSelecionado.motivo}" de ${backupSelecionado.dataHora}.`,
          // Revalida: se foi vendido depois que a prévia foi montada, fica de fora.
          filtroElegivel: (estado) => !estaNoEstoque(estado) && estado.status !== 'vendido' && !ehEstadoAmbiguoLegado(estado) && !ehAparelhoDeCliente(estado),
        });
        reativados += r.afetados;
        auditoriaIncompleta ||= !r.auditoriaRegistrada;
        progresso();
      }

      for (const { aparelhoBackup } of comAlteracao) {
        const r = await aplicarMudancaEstoque(supabase, {
          ...contexto,
          ids: [aparelhoBackup.id],
          patch: camposCadastrais(aparelhoBackup),
          tipo: 'edicao',
          origem: 'backup_restauracao',
          camposAuditados: ['preco', 'precoAtacado', 'modelo', 'cor', 'capacidade'],
          observacao: `Valores revertidos para o backup de ${backupSelecionado.dataHora}.`,
        });
        alterados += r.afetados;
        auditoriaIncompleta ||= !r.auditoriaRegistrada;
        progresso();
      }

      if (novosParaDesativar.length > 0) {
        const r = await aplicarMudancaEstoque(supabase, {
          ...contexto,
          ids: novosParaDesativar.map((a) => a.id),
          patch: patchSaida('baixado', 'baixa_massa'),
          tipo: 'baixa',
          origem: 'backup_restauracao',
          observacao: `Cadastrado depois do backup de ${backupSelecionado.dataHora}.`,
          filtroElegivel: (estado) => estaNoEstoque(estado),
        });
        desativados = r.afetados;
        auditoriaIncompleta ||= !r.auditoriaRegistrada;
      }

      await registrarLog({
        loja_id: lojaId,
        usuario_id: usuario?.id || null,
        usuario_nome: usuario?.nome || null,
        tipo_evento: 'estoque',
        acao: 'Restauração de ponto de backup',
        detalhes:
          `Lote ${contexto.loteId}: backup "${backupSelecionado.motivo}" de ${backupSelecionado.dataHora}. ` +
          `${reativados} reativados, ${alterados} com valores revertidos, ${desativados} baixados.`,
        valor_anterior: {
          backup_id: backupSelecionado.id,
          em_estoque_antes: aparelhosAtuais.filter((a) => estaNoEstoque(a as any)).length,
          vendidos_depois_do_backup: relatorioDiff.vendidosDepois.length,
          ambiguos_ignorados: relatorioDiff.ambiguos.length,
          ausentes_no_banco: relatorioDiff.ausentes.length,
        },
        valor_novo: { lote_id: contexto.loteId, reativados, alterados, baixados: desativados },
      });

      toast.success(`Estoque restaurado para o backup de ${backupSelecionado.dataHora}.`, { id: toastId, duration: 6000 });
      if (auditoriaIncompleta) {
        toast.warning('Restauração aplicada, mas parte da auditoria não foi gravada. Avise o suporte.');
      }
      await onEstoqueAtualizado();
      onClose();
    } catch (err: any) {
      console.error('Erro ao restaurar backup:', err);
      toast.error(
        `Erro ao restaurar (${reativados} reativados e ${alterados} revertidos antes do erro): ${err?.message || 'falha no banco'}`,
        { id: toastId, duration: 10000 }
      );
      await onEstoqueAtualizado();
    } finally {
      setExecutando(false);
    }
  };

  const conteudoPronto = Boolean(backupSelecionado?.aparelhos);
  const totalAlteracoes =
    relatorioDiff.paraReativar.length + relatorioDiff.comAlteracao.length + relatorioDiff.novosParaDesativar.length;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-6 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-4xl w-full p-3.5 sm:p-6 shadow-2xl space-y-4 text-white max-h-[92dvh] overflow-y-auto flex flex-col my-auto">
        {/* CABEÇALHO */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold border border-emerald-500/30">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg text-white">Restaurar Ponto de Backup do Estoque</h3>
              <p className="text-xs text-slate-400">
                Veja o que muda antes de restaurar. Backups ficam salvos na nuvem da loja.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleCriarNovoBackupManual}
              disabled={criandoPonto || executando}
              className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 font-bold text-xs rounded-xl gap-1.5 cursor-pointer h-9"
            >
              {criandoPonto ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Criar Ponto Agora
            </Button>
            <button
              onClick={onClose}
              disabled={executando}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors disabled:opacity-40"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {carregandoLista ? (
          <div className="p-8 text-center text-sm text-slate-400 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando pontos de backup...
          </div>
        ) : backups.length === 0 ? (
          <div className="p-8 text-center bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
            <History className="w-10 h-10 text-slate-600 mx-auto" />
            <p className="text-sm font-bold text-slate-300">Nenhum ponto de backup encontrado.</p>
            <p className="text-xs text-slate-500">Clique em "Criar Ponto Agora" para salvar o estoque atual.</p>
          </div>
        ) : (
          <div className="space-y-3 flex-1 flex flex-col min-h-0">
            <div className="flex items-center gap-2 overflow-x-auto pb-1 shrink-0 scrollbar-none">
              <span className="text-xs font-bold text-slate-400 shrink-0">Pontos salvos:</span>
              {backups.map((bkp) => (
                <button
                  key={bkp.id}
                  onClick={() => void selecionar(bkp)}
                  disabled={executando}
                  title={bkp.origem === 'nuvem' ? 'Salvo na nuvem da loja' : 'Salvo só neste dispositivo'}
                  className={cn(
                    'px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 border cursor-pointer',
                    backupSelecionado?.id === bkp.id
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md shadow-emerald-950/40'
                      : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                  )}
                >
                  {bkp.origem === 'nuvem' ? <Cloud className="w-3.5 h-3.5" /> : <HardDrive className="w-3.5 h-3.5" />}
                  <Clock className="w-3.5 h-3.5" />
                  <span>{bkp.dataHora}</span>
                  <Badge variant="outline" className="bg-black/30 text-[10px] border-white/20 ml-1">
                    {bkp.totalAparelhos} itens
                  </Badge>
                </button>
              ))}
            </div>

            {backupSelecionado && (
              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 flex items-center justify-between text-xs text-slate-300 shrink-0">
                <div>
                  <span className="font-bold text-white">Backup selecionado: </span>
                  <span className="text-emerald-400 font-semibold">{backupSelecionado.motivo}</span>
                  <span className="text-slate-500 ml-2">({backupSelecionado.dataHora})</span>
                  {backupSelecionado.origem === 'local' && (
                    <span className="ml-2 text-amber-300">· só neste dispositivo</span>
                  )}
                </div>
                <span className="font-mono text-slate-400">Total: {backupSelecionado.totalAparelhos} aparelhos</span>
              </div>
            )}

            {carregandoConteudo || !conteudoPronto ? (
              <div className="p-8 text-center text-sm text-slate-400 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Abrindo o conteúdo do backup...
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-4 pr-1 min-h-0 max-h-[46vh]">
                <SecaoDiff
                  titulo={`1. Voltam ao estoque (${relatorioDiff.paraReativar.length})`}
                  subtitulo="Estavam no estoque no backup e hoje estão fora dele"
                  tom="positivo"
                  vazio="Nenhum aparelho a reativar."
                  itens={relatorioDiff.paraReativar}
                  etiqueta="+ Reativar"
                />

                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <span className="font-bold text-xs text-amber-400 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4" /> 2. Valores a reverter ({relatorioDiff.comAlteracao.length})
                    </span>
                    <span className="text-[10px] text-slate-400">Voltam ao valor do backup</span>
                  </div>
                  {relatorioDiff.comAlteracao.length === 0 ? (
                    <p className="text-xs text-slate-500 py-1">Nenhuma divergência de valor.</p>
                  ) : (
                    <div className="space-y-2 pt-1">
                      {relatorioDiff.comAlteracao.map((item) => (
                        <div
                          key={item.aparelhoBackup.id}
                          className="p-2.5 rounded-xl bg-slate-950 border border-amber-500/30 text-xs flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-white">
                              {item.aparelhoBackup.modelo} ({item.aparelhoBackup.cor || ''})
                            </div>
                            <div className="text-[10px] text-amber-300 font-mono mt-0.5">{item.camposDiferentes.join(' | ')}</div>
                          </div>
                          <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-[9px] shrink-0">
                            Reverter
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {relatorioDiff.novosParaDesativar.length > 0 && (
                  <SecaoDiff
                    titulo={`3. Cadastrados depois do backup (${relatorioDiff.novosParaDesativar.length})`}
                    subtitulo="Serão baixados — confira se não são entradas legítimas"
                    tom="perigo"
                    vazio=""
                    itens={relatorioDiff.novosParaDesativar}
                    etiqueta="Baixar"
                  />
                )}

                {(relatorioDiff.vendidosDepois.length > 0 ||
                  relatorioDiff.ambiguos.length > 0 ||
                  relatorioDiff.ausentes.length > 0) && (
                  <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3.5 space-y-1.5 text-xs text-slate-400">
                    <p className="font-bold text-slate-300 flex items-center gap-1.5">
                      <Ban className="w-4 h-4 text-slate-500" /> Não serão alterados
                    </p>
                    {relatorioDiff.vendidosDepois.length > 0 && (
                      <p>
                        {relatorioDiff.vendidosDepois.length} vendido(s) depois do backup — venda concluída não é desfeita
                        por restauração.
                      </p>
                    )}
                    {relatorioDiff.ambiguos.length > 0 && (
                      <p>
                        {relatorioDiff.ambiguos.length} com estado ambíguo (baixados por remontagem com defeito) — conferir
                        fisicamente.
                      </p>
                    )}
                    {relatorioDiff.ausentes.length > 0 && (
                      <p>{relatorioDiff.ausentes.length} não existem mais no banco e não podem ser restaurados daqui.</p>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="pt-3 border-t border-slate-800 flex items-center justify-between shrink-0">
              <span className="text-xs text-slate-400">
                {conteudoPronto ? `${totalAlteracoes} alteração(ões) serão aplicadas` : ' '}
              </span>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={onClose} disabled={executando} className="text-xs text-slate-400 hover:text-white">
                  Cancelar
                </Button>
                <Button
                  onClick={handleConfirmarRestauracao}
                  disabled={executando || !conteudoPronto || totalAlteracoes === 0}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs gap-2 px-5 py-2.5 rounded-xl shadow-lg shadow-emerald-950/40 cursor-pointer"
                >
                  {executando ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                  Confirmar restauração
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SecaoDiff({
  titulo,
  subtitulo,
  tom,
  vazio,
  itens,
  etiqueta,
}: {
  titulo: string;
  subtitulo: string;
  tom: 'positivo' | 'perigo';
  vazio: string;
  itens: Aparelho[];
  etiqueta: string;
}) {
  const cores =
    tom === 'positivo'
      ? { titulo: 'text-emerald-400', borda: 'border-emerald-500/30', badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' }
      : { titulo: 'text-rose-400', borda: 'border-rose-500/30', badge: 'bg-rose-500/20 text-rose-300 border-rose-500/30' };
  const Icone = tom === 'positivo' ? CheckCircle2 : X;

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 space-y-2">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800 gap-3">
        <span className={cn('font-bold text-xs flex items-center gap-1.5', cores.titulo)}>
          <Icone className="w-4 h-4" /> {titulo}
        </span>
        <span className="text-[10px] text-slate-400 text-right">{subtitulo}</span>
      </div>
      {itens.length === 0 ? (
        <p className="text-xs text-slate-500 py-1">{vazio}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          {itens.map((item) => (
            <div key={item.id} className={cn('p-2.5 rounded-xl bg-slate-950 border text-xs flex items-center justify-between', cores.borda)}>
              <div>
                <div className="font-bold text-white">{item.modelo}</div>
                <div className="text-[10px] text-slate-400 font-mono">
                  {item.capacidade} · {item.cor} · IMEI/Cod: {item.codigo || item.imei || item.numeroSerie || item.id}
                </div>
              </div>
              <Badge className={cn('text-[9px]', cores.badge)}>{etiqueta}</Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
