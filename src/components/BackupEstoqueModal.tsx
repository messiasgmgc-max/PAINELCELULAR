'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { 
  X, 
  RotateCcw, 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Package, 
  ArrowRight, 
  Save,
  Check,
  History
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Aparelho } from '@/lib/db/types';

export interface PontoBackup {
  id: string;
  dataHora: string;
  motivo: string;
  lojaId: string | null;
  totalAparelhos: number;
  aparelhos: Aparelho[];
}

const BACKUP_STORAGE_KEY = 'painel_celular_pontos_backup_estoque';

export function salvarSnapshotBackup(aparelhos: Aparelho[], lojaId: string | null, motivo: string = 'Backup Manual'): PontoBackup {
  const novoBackup: PontoBackup = {
    id: `bkp_${Date.now()}`,
    dataHora: new Date().toLocaleString('pt-BR'),
    motivo,
    lojaId,
    totalAparelhos: aparelhos.length,
    aparelhos: JSON.parse(JSON.stringify(aparelhos)),
  };

  try {
    const backupsSalvos = obterPontosBackup();
    const atualizados = [novoBackup, ...backupsSalvos].slice(0, 10); // Mantém os 10 últimos backups
    localStorage.setItem(BACKUP_STORAGE_KEY, JSON.stringify(atualizados));
  } catch (e) {
    console.warn("Aviso ao salvar backup no localStorage:", e);
  }

  return novoBackup;
}

export function obterPontosBackup(): PontoBackup[] {
  try {
    const raw = localStorage.getItem(BACKUP_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PontoBackup[];
  } catch (e) {
    return [];
  }
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
  const [backups, setBackups] = useState<PontoBackup[]>([]);
  const [backupSelecionado, setBackupSelecionado] = useState<PontoBackup | null>(null);
  const [executandoRestauração, setExecutandoRestauração] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const lista = obterPontosBackup();
      setBackups(lista);
      if (lista.length > 0) {
        setBackupSelecionado(lista[0]);
      }
    }
  }, [isOpen]);

  // Calcula o relatório de divergências (Diff) entre o Ponto de Backup e o Estoque Atual
  const relatorioDiff = useMemo(() => {
    if (!backupSelecionado) {
      return { paraReativar: [], comAlteracao: [], novosParaDesativar: [] };
    }

    const mapaAtuais = new Map(aparelhosAtuais.map((a) => [a.id, a]));
    const mapaBackup = new Map(backupSelecionado.aparelhos.map((a) => [a.id, a]));

    // 1. Aparelhos no backup que estão inativos ou não existem no estoque atual
    const paraReativar: Aparelho[] = [];
    const comAlteracao: { aparelhoBackup: Aparelho; aparelhoAtual: Aparelho; camposDiferentes: string[] }[] = [];

    backupSelecionado.aparelhos.forEach((aBackup) => {
      const aAtual = mapaAtuais.get(aBackup.id);

      if (!aAtual || aAtual.ativo === false || aAtual.condicao === 'vendido') {
        paraReativar.push(aBackup);
      } else {
        // Compara campos para ver se houve alteração
        const difs: string[] = [];
        if (aAtual.preco !== aBackup.preco) difs.push(`Preço: R$ ${aAtual.preco} ➔ R$ ${aBackup.preco}`);
        if ((aAtual as any).precoAtacado !== (aBackup as any).precoAtacado) difs.push(`Atacado: R$ ${(aAtual as any).precoAtacado || 0} ➔ R$ ${(aBackup as any).precoAtacado || 0}`);
        if (aAtual.condicao !== aBackup.condicao) difs.push(`Condição: ${aAtual.condicao} ➔ ${aBackup.condicao}`);
        if (aAtual.modelo !== aBackup.modelo) difs.push(`Modelo: ${aAtual.modelo} ➔ ${aBackup.modelo}`);

        if (difs.length > 0) {
          comAlteracao.push({
            aparelhoBackup: aBackup,
            aparelhoAtual: aAtual,
            camposDiferentes: difs,
          });
        }
      }
    });

    // 2. Aparelhos no estoque atual ativo que NÃO existiam no backup (criados depois do backup)
    const novosParaDesativar: Aparelho[] = aparelhosAtuais.filter(
      (aAtual) => aAtual.ativo !== false && aAtual.condicao !== 'vendido' && !mapaBackup.has(aAtual.id)
    );

    return { paraReativar, comAlteracao, novosParaDesativar };
  }, [backupSelecionado, aparelhosAtuais]);

  if (!isOpen) return null;

  const handleCriarNovoBackupManual = () => {
    const backupCriado = salvarSnapshotBackup(aparelhosAtuais, lojaId, 'Ponto de Backup Manual');
    const atualizados = obterPontosBackup();
    setBackups(atualizados);
    setBackupSelecionado(backupCriado);
    toast.success(`⚡ Ponto de Backup criado! (${backupCriado.totalAparelhos} aparelhos salvos)`);
  };

  const handleConfirmarRestauracao = async () => {
    if (!backupSelecionado) return;

    setExecutandoRestauração(true);
    const toastId = toast.loading("Restaurando estoque para o ponto de backup selecionado...");

    try {
      const { paraReativar, comAlteracao, novosParaDesativar } = relatorioDiff;
      let totalProcessados = 0;

      // 1. Reativa aparelhos que estavam desativados ou ausentes
      for (const item of paraReativar) {
        const { error } = await supabase
          .from('aparelhos')
          .update({
            ativo: true,
            condicao: item.condicao || 'seminovo',
            preco: item.preco,
            precoAtacado: (item as any).precoAtacado,
            custo: item.custo,
            modelo: item.modelo,
            cor: item.cor,
            capacidade: item.capacidade,
            observacoes: item.observacoes,
          })
          .eq('id', item.id);

        if (!error) totalProcessados++;
      }

      // 2. Restaura valores originais dos aparelhos com alteração
      for (const item of comAlteracao) {
        const aBackup = item.aparelhoBackup;
        const { error } = await supabase
          .from('aparelhos')
          .update({
            preco: aBackup.preco,
            precoAtacado: (aBackup as any).precoAtacado,
            condicao: aBackup.condicao,
            modelo: aBackup.modelo,
            cor: aBackup.cor,
            capacidade: aBackup.capacidade,
            observacoes: aBackup.observacoes,
          })
          .eq('id', aBackup.id);

        if (!error) totalProcessados++;
      }

      // 3. Marca como inativos aparelhos adicionados após a criação do backup
      for (const item of novosParaDesativar) {
        await supabase
          .from('aparelhos')
          .update({ ativo: false, condicao: 'vendido' })
          .eq('id', item.id);
      }

      toast.success(`⚡ Estoque restaurado com sucesso para o backup de ${backupSelecionado.dataHora}!`, { id: toastId, duration: 5000 });
      await onEstoqueAtualizado();
      onClose();
    } catch (err: any) {
      console.error("Erro ao restaurar backup:", err);
      toast.error(`Erro ao restaurar backup: ${err.message || 'Falha no banco'}`, { id: toastId });
    } finally {
      setExecutandoRestauração(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-start p-2 sm:p-4 pt-2 sm:pt-4 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
      <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl p-3.5 sm:p-6 shadow-2xl space-y-4 text-white max-h-[96vh] flex flex-col my-0 shrink-0">
        
        {/* CABEÇALHO */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold border border-emerald-500/30">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg text-white">Restaurar Ponto de Backup do Estoque</h3>
              <p className="text-xs text-slate-400">
                Visualize as alterações antes de restaurar o estoque para um ponto de backup salvo
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleCriarNovoBackupManual}
              className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 font-bold text-xs rounded-xl gap-1.5 cursor-pointer h-9"
            >
              <Save className="w-3.5 h-3.5" /> Criar Ponto Agora
            </Button>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* SELEÇÃO DE PONTO DE BACKUP */}
        {backups.length === 0 ? (
          <div className="p-8 text-center bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
            <History className="w-10 h-10 text-slate-600 mx-auto" />
            <p className="text-sm font-bold text-slate-300">Nenhum Ponto de Backup salvo encontrado.</p>
            <p className="text-xs text-slate-500">Clique no botão "Criar Ponto Agora" acima para gerar um backup do seu estoque atual.</p>
          </div>
        ) : (
          <div className="space-y-3 flex-1 flex flex-col min-h-0">
            
            <div className="flex items-center gap-2 overflow-x-auto pb-1 shrink-0 scrollbar-none">
              <span className="text-xs font-bold text-slate-400 shrink-0">Pontos Salvos:</span>
              {backups.map((bkp) => (
                <button
                  key={bkp.id}
                  onClick={() => setBackupSelecionado(bkp)}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 border cursor-pointer",
                    backupSelecionado?.id === bkp.id
                      ? "bg-emerald-500 text-slate-950 border-emerald-400 shadow-md shadow-emerald-950/40"
                      : "bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800"
                  )}
                >
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
                  <span className="font-bold text-white">Backup Selecionado: </span>
                  <span className="text-emerald-400 font-semibold">{backupSelecionado.motivo}</span>
                  <span className="text-slate-500 ml-2">({backupSelecionado.dataHora})</span>
                </div>
                <span className="font-mono text-slate-400">Total: {backupSelecionado.totalAparelhos} aparelhos</span>
              </div>
            )}

            {/* RELATÓRIO DE DIVERGÊNCIAS (DIFF) */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 min-h-0 max-h-[46vh]">
              
              {/* 🟢 APARELHOS A SEREM REATIVADOS */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 space-y-2">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <span className="font-bold text-xs text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> 1. Aparelhos a Reativar / Restaurar ({relatorioDiff.paraReativar.length})
                  </span>
                  <span className="text-[10px] text-slate-400">Itens que foram desativados e voltarão ao estoque</span>
                </div>

                {relatorioDiff.paraReativar.length === 0 ? (
                  <p className="text-xs text-slate-500 py-1">Nenhum aparelho desativado pendente de restauração.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    {relatorioDiff.paraReativar.map((item) => (
                      <div key={item.id} className="p-2.5 rounded-xl bg-slate-950 border border-emerald-500/30 text-xs flex items-center justify-between">
                        <div>
                          <div className="font-bold text-white">{item.modelo}</div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {item.capacidade} · {item.cor} · IMEI/Cod: {item.codigo || item.imei || item.numeroSerie || item.id}
                          </div>
                        </div>
                        <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[9px]">
                          + Reativar
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 🟡 ALTERAÇÕES DE VALORES E CAMPOS */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 space-y-2">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <span className="font-bold text-xs text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" /> 2. Alterações de Preço / Valores a Reverter ({relatorioDiff.comAlteracao.length})
                  </span>
                  <span className="text-[10px] text-slate-400">Itens com valores modificados que retornarão ao valor do backup</span>
                </div>

                {relatorioDiff.comAlteracao.length === 0 ? (
                  <p className="text-xs text-slate-500 py-1">Nenhuma divergência de valor detectada.</p>
                ) : (
                  <div className="space-y-2 pt-1">
                    {relatorioDiff.comAlteracao.map((item) => (
                      <div key={item.aparelhoBackup.id} className="p-2.5 rounded-xl bg-slate-950 border border-amber-500/30 text-xs flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-white">{item.aparelhoBackup.modelo} ({item.aparelhoBackup.cor || ''})</div>
                          <div className="text-[10px] text-amber-300 font-mono mt-0.5">
                            {item.camposDiferentes.join(' | ')}
                          </div>
                        </div>
                        <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-[9px] shrink-0">
                          Reverter Valor
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 🔴 NOVOS APARELHOS A DESATIVAR */}
              {relatorioDiff.novosParaDesativar.length > 0 && (
                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <span className="font-bold text-xs text-rose-400 flex items-center gap-1.5">
                      <X className="w-4 h-4" /> 3. Aparelhos Adicionados Após o Backup ({relatorioDiff.novosParaDesativar.length})
                    </span>
                    <span className="text-[10px] text-slate-400">Itens cadastrados após este backup que serão desativados</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    {relatorioDiff.novosParaDesativar.map((item) => (
                      <div key={item.id} className="p-2 rounded-xl bg-slate-950 border border-rose-500/30 text-xs flex items-center justify-between">
                        <div>
                          <div className="font-bold text-white">{item.modelo}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{item.capacidade} · {item.cor}</div>
                        </div>
                        <Badge className="bg-rose-500/20 text-rose-300 border-rose-500/30 text-[9px]">
                          Desativar
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>

            {/* RODAPÉ E AÇÃO */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-between shrink-0">
              <span className="text-xs text-slate-400">
                {relatorioDiff.paraReativar.length + relatorioDiff.comAlteracao.length} alteração(ões) será(ão) aplicada(s) ao banco
              </span>

              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={onClose} className="text-xs text-slate-400 hover:text-white">
                  Cancelar
                </Button>

                <Button
                  onClick={handleConfirmarRestauracao}
                  disabled={executandoRestauração || !backupSelecionado}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs gap-2 px-5 py-2.5 rounded-xl shadow-lg shadow-emerald-950/40 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" /> Confirmar Restauração para o Backup
                </Button>
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
