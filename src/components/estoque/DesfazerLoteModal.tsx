'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Loader2, Undo2, User, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ModalPortal } from '@/components/ModalPortal';
import { ConfirmarAcaoEstoqueModal } from '@/components/ConfirmarAcaoEstoqueModal';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/hooks/useAuth';
import { registrarLog } from '@/lib/logger';
import { cn } from '@/lib/utils';
import {
  ROTULOS_TIPO,
  carregarPlanoDesfazer,
  executarDesfazerLote,
  listarLotesRecentes,
  type PlanoDesfazer,
  type ResumoLote,
} from '@/lib/estoque/desfazerLote';
import { toast } from 'sonner';

/**
 * "Desfazer operação em massa": lista os lotes das últimas 24 h e devolve cada
 * aparelho ao estado anterior. Toda a regra está em src/lib/estoque/desfazerLote.ts;
 * aqui só a tela.
 */

interface Props {
  aberto: boolean;
  lojaId: string | null;
  onFechar: () => void;
  onEstoqueAtualizado: () => Promise<void> | void;
}

const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

function descreverAparelho(a: Record<string, unknown> | undefined, id: string): string {
  if (!a) return id.slice(0, 8);
  const partes = [a.marca, a.modelo, a.capacidade].filter(Boolean).join(' ');
  const codigo = a.codigo || a.imei || a.numeroSerie;
  return `${partes || 'Aparelho'}${codigo ? ` · ${codigo}` : ''}`;
}

export function DesfazerLoteModal({ aberto, lojaId, onFechar, onEstoqueAtualizado }: Props) {
  const { usuario } = useAuth();
  const [lotes, setLotes] = useState<ResumoLote[]>([]);
  const [carregandoLotes, setCarregandoLotes] = useState(false);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const [plano, setPlano] = useState<PlanoDesfazer | null>(null);
  const [aparelhosDoLote, setAparelhosDoLote] = useState<Map<string, Record<string, unknown>>>(new Map());
  const [carregandoPlano, setCarregandoPlano] = useState(false);
  const [executando, setExecutando] = useState(false);

  const carregarLotes = useCallback(async () => {
    if (!lojaId) return;
    setCarregandoLotes(true);
    setErroLista(null);
    try {
      setLotes(await listarLotesRecentes(supabase, lojaId));
    } catch (erro: any) {
      setErroLista(erro?.message || 'Não foi possível listar as operações.');
    } finally {
      setCarregandoLotes(false);
    }
  }, [lojaId]);

  useEffect(() => {
    if (!aberto) return;
    setPlano(null);
    void carregarLotes();
  }, [aberto, carregarLotes]);

  if (!aberto) return null;

  const abrirPlano = async (lote: ResumoLote) => {
    if (!lojaId) return;
    setCarregandoPlano(true);
    try {
      const r = await carregarPlanoDesfazer(supabase, lojaId, lote.loteId);
      setPlano(r.plano);
      setAparelhosDoLote(r.aparelhos);
    } catch (erro: any) {
      toast.error(erro?.message || 'Não foi possível analisar a operação.');
    } finally {
      setCarregandoPlano(false);
    }
  };

  const confirmarDesfazer = async () => {
    if (!plano || !lojaId) return;
    setExecutando(true);
    const toastId = toast.loading(`Desfazendo ${plano.reverter.length} aparelho(s)...`);
    try {
      const r = await executarDesfazerLote(supabase, plano, {
        lojaId,
        usuarioId: usuario?.id || null,
        usuarioNome: usuario?.nome || null,
      });

      await registrarLog({
        loja_id: lojaId,
        usuario_id: usuario?.id || null,
        usuario_nome: usuario?.nome || null,
        tipo_evento: 'estoque',
        acao: 'Operação em massa desfeita',
        detalhes:
          `Lote ${r.loteId} desfaz o lote ${plano.loteId} (${plano.rotulo}): ${r.revertidos} aparelho(s) revertidos, ` +
          `${plano.conflitos.length} conflito(s) não tocados` +
          (r.ignoradosNaHora.length ? `, ${r.ignoradosNaHora.length} mudaram durante a confirmação` : '') +
          '.',
        valor_anterior: { lote_original: plano.loteId, origem: plano.origem, previstos: plano.reverter.length },
        valor_novo: { lote_id: r.loteId, revertidos: r.revertidos, conflitos: plano.conflitos.map((c) => c.aparelhoId) },
      });

      toast.success(`${r.revertidos} aparelho(s) de volta ao estado anterior.`, { id: toastId, duration: 6000 });
      if (r.ignoradosNaHora.length) {
        toast.warning(`${r.ignoradosNaHora.length} aparelho(s) mudaram enquanto você confirmava e ficaram de fora.`);
      }
      if (!r.auditoriaRegistrada) {
        toast.warning('Reversão aplicada, mas a auditoria não foi gravada inteira. Avise o suporte.');
      }
      setPlano(null);
      await onEstoqueAtualizado();
      await carregarLotes();
    } catch (erro: any) {
      toast.error(`Erro ao desfazer: ${erro?.message || 'falha no banco'}`, { id: toastId });
    } finally {
      setExecutando(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md overflow-y-auto">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl space-y-4 text-white max-h-[92dvh] overflow-y-auto my-auto flex flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-300 flex items-center justify-center border border-amber-500/30">
                <Undo2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base sm:text-lg">Desfazer operação em massa</h3>
                <p className="text-xs text-slate-400">
                  Operações das últimas 24 horas. Cada aparelho volta ao estado anterior; quem mudou depois não é tocado.
                </p>
              </div>
            </div>
            <button type="button" onClick={onFechar} disabled={executando} className="text-slate-400 hover:text-white disabled:opacity-40" aria-label="Fechar">
              <X className="h-5 w-5" />
            </button>
          </div>

          {carregandoLotes ? (
            <div className="p-8 text-center text-sm text-slate-400 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Procurando operações recentes...
            </div>
          ) : erroLista ? (
            <p className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl p-3">{erroLista}</p>
          ) : lotes.length === 0 ? (
            <div className="p-8 text-center bg-slate-950 rounded-2xl border border-slate-800">
              <p className="text-sm font-bold text-slate-300">Nenhuma operação em massa nas últimas 24 horas.</p>
              <p className="text-xs text-slate-500 mt-1">Remontagens, baixas em massa, conferências e restaurações aparecem aqui.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {lotes.map((lote) => {
                const tipos = Object.entries(lote.porTipo)
                  .map(([tipo, n]) => `${n} ${ROTULOS_TIPO[tipo] || tipo}`)
                  .join(', ');
                return (
                  <li
                    key={lote.loteId}
                    className={cn(
                      'rounded-2xl border p-3.5 flex flex-col sm:flex-row sm:items-center gap-3',
                      lote.desfeito ? 'border-slate-800 bg-slate-950/60 opacity-70' : 'border-slate-700 bg-slate-950'
                    )}
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm">{lote.rotulo}</span>
                        <span className="text-xs font-bold tabular-nums text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2 py-0.5">
                          {lote.quantidade} aparelho(s)
                        </span>
                        {lote.desfeito && <span className="text-[10px] uppercase font-bold text-emerald-300">já desfeita</span>}
                      </div>
                      <div className="text-xs text-slate-400 flex flex-wrap gap-x-3 gap-y-0.5">
                        <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> {dataHora(lote.inicio)}</span>
                        <span className="inline-flex items-center gap-1"><User className="w-3 h-3" /> {lote.usuarioNome || 'usuário não identificado'}</span>
                        <span>{tipos}</span>
                      </div>
                      <div className="text-[10px] font-mono text-slate-500 truncate">lote {lote.loteId}</div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => abrirPlano(lote)}
                      disabled={carregandoPlano || lote.desfeito}
                      className="bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border border-amber-500/30 font-bold text-xs rounded-xl shrink-0"
                    >
                      {carregandoPlano ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Undo2 className="w-3.5 h-3.5 mr-1.5" />}
                      Desfazer
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {plano && (
        <ConfirmarAcaoEstoqueModal
          aberto
          tom="perigo"
          titulo={`Desfazer: ${plano.rotulo}`}
          descricao={
            plano.expirado
              ? 'O prazo de 24 horas para desfazer esta operação acabou.'
              : `${plano.reverter.length} aparelho(s) voltam ao estado anterior à operação de ${plano.inicio ? dataHora(plano.inicio) : '—'}. A reversão fica registrada como nova operação.`
          }
          resumo={[
            { rotulo: 'Voltam ao estado anterior', valor: plano.reverter.length, tom: 'positivo' },
            { rotulo: 'Conflitos (não serão tocados)', valor: plano.conflitos.length, tom: plano.conflitos.length ? 'aviso' : 'neutro' },
            { rotulo: 'Já estavam como antes', valor: plano.semAlteracao.length },
          ]}
          bloqueio={plano.expirado ? 'Operação com mais de 24 horas não pode ser desfeita por aqui.' : null}
          quantidadeConfirmacao={plano.reverter.length || undefined}
          rotuloQuantidade="aparelhos que serão revertidos"
          detalhes={
            <>
              {plano.conflitos.length > 0 && (
                <details className="rounded-xl border border-amber-500/30 bg-amber-500/5 text-xs">
                  <summary className="cursor-pointer px-3 py-2 text-amber-200 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" /> Ver os {plano.conflitos.length} conflito(s)
                  </summary>
                  <ul className="max-h-40 overflow-y-auto divide-y divide-white/5 px-3 pb-2">
                    {plano.conflitos.map((c) => (
                      <li key={c.aparelhoId} className="py-1.5">
                        <div className="text-slate-200 truncate">{descreverAparelho(aparelhosDoLote.get(c.aparelhoId), c.aparelhoId)}</div>
                        <div className="text-slate-400">{c.detalhe}</div>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {plano.reverter.length > 0 && (
                <details className="rounded-xl border border-white/10 bg-slate-950/60 text-xs">
                  <summary className="cursor-pointer px-3 py-2 text-slate-300 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Ver os {plano.reverter.length} aparelho(s) que voltam
                  </summary>
                  <ul className="max-h-40 overflow-y-auto divide-y divide-white/5 px-3 pb-2">
                    {plano.reverter.slice(0, 300).map((item) => (
                      <li key={item.aparelhoId} className="py-1.5 flex justify-between gap-3">
                        <span className="text-slate-200 truncate">{descreverAparelho(aparelhosDoLote.get(item.aparelhoId), item.aparelhoId)}</span>
                        <span className="text-slate-500 shrink-0">
                          {item.criadoNoLote ? 'sai do estoque (cadastrado pela operação)' : ROTULOS_TIPO[item.tipo] || item.tipo}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          }
          acoes={[
            { rotulo: 'Cancelar', variante: 'secundaria', onClick: () => setPlano(null), desabilitada: executando },
            {
              rotulo: `Desfazer ${plano.reverter.length}`,
              variante: 'perigo',
              exigeDigitacao: true,
              desabilitada: plano.expirado || plano.reverter.length === 0,
              onClick: confirmarDesfazer,
              carregando: executando,
            },
          ]}
          onFechar={() => {
            if (!executando) setPlano(null);
          }}
        />
      )}
    </ModalPortal>
  );
}
