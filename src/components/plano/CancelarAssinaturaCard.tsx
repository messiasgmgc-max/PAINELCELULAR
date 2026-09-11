'use client';

import { useState } from 'react';
import { CalendarX2, Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { MOTIVOS_CANCELAMENTO, type AcaoAssinatura, type EstadoAssinatura } from '@/lib/planos/assinatura';

interface Props {
  assinatura: EstadoAssinatura;
  dataVencimento: string | null;
  podeGerenciar: boolean;
  formatarData: (data?: string | null) => string;
  onAlterar: (acao: AcaoAssinatura, motivo?: string) => Promise<unknown>;
}

/** Cancelamento sem fidelidade, como a página de assinatura promete. */
export function CancelarAssinaturaCard({ assinatura, dataVencimento, podeGerenciar, formatarData, onAlterar }: Props) {
  const [confirmando, setConfirmando] = useState(false);
  const [motivo, setMotivo] = useState<string>('');
  const [detalhe, setDetalhe] = useState('');
  const [salvando, setSalvando] = useState(false);

  const alterar = async (acao: AcaoAssinatura) => {
    setSalvando(true);
    try {
      const motivoFinal = [motivo, detalhe.trim()].filter(Boolean).join(': ');
      await onAlterar(acao, motivoFinal || undefined);
      toast.success(
        acao === 'cancelar'
          ? `Assinatura cancelada. A loja continua liberada até ${formatarData(dataVencimento)}.`
          : 'Cancelamento desfeito. A assinatura segue normalmente.'
      );
      setConfirmando(false);
      setMotivo('');
      setDetalhe('');
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : 'Não foi possível alterar a assinatura.');
    } finally {
      setSalvando(false);
    }
  };

  if (assinatura.cancelada) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1 text-xs">
          <p className="flex items-center gap-1.5 text-sm font-bold text-amber-300">
            <CalendarX2 className="h-4 w-4" /> Assinatura cancelada
          </p>
          <p className="text-slate-400">
            Cancelada em {formatarData(assinatura.canceladaEm)}
            {assinatura.canceladaPor ? ` por ${assinatura.canceladaPor}` : ''}. A loja fica liberada até{' '}
            <strong className="text-slate-200">{formatarData(assinatura.acessoAte || dataVencimento)}</strong> e não será
            cobrada de novo. Se você pagar outro período, a assinatura volta sozinha.
          </p>
        </div>
        {podeGerenciar && (
          <button
            type="button"
            onClick={() => void alterar('reativar')}
            disabled={salvando}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 text-xs font-bold text-slate-100 hover:bg-slate-800 disabled:opacity-60"
          >
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            Desfazer cancelamento
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-xs">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-slate-400">
          Sem fidelidade nem multa. Se cancelar, a loja continua liberada até{' '}
          <strong className="text-slate-200">{formatarData(dataVencimento)}</strong> e não é cobrada de novo.
        </p>
        {podeGerenciar && !confirmando && (
          <button
            type="button"
            onClick={() => setConfirmando(true)}
            className="h-9 shrink-0 rounded-xl px-3 text-xs font-semibold text-red-300 hover:bg-red-500/10"
          >
            Cancelar assinatura
          </button>
        )}
      </div>

      {!podeGerenciar && <p className="text-slate-500">Só o dono ou um gerente da loja pode cancelar a assinatura.</p>}

      {confirmando && (
        <div className="space-y-3 rounded-xl border border-red-500/30 bg-red-500/5 p-3">
          <p className="font-semibold text-slate-200">Por que você está cancelando? (opcional)</p>
          <div className="flex flex-wrap gap-2">
            {MOTIVOS_CANCELAMENTO.map((opcao) => (
              <button
                key={opcao}
                type="button"
                aria-pressed={motivo === opcao}
                onClick={() => setMotivo(motivo === opcao ? '' : opcao)}
                className={
                  motivo === opcao
                    ? 'rounded-full border border-red-400 bg-red-500/20 px-3 py-1.5 font-semibold text-red-200'
                    : 'rounded-full border border-slate-700 px-3 py-1.5 text-slate-300 hover:bg-slate-800'
                }
              >
                {opcao}
              </button>
            ))}
          </div>
          <textarea
            value={detalhe}
            onChange={(e) => setDetalhe(e.target.value)}
            rows={2}
            maxLength={400}
            placeholder="Conte o que faltou. Isso ajuda a melhorar o sistema."
            className="w-full resize-y rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-slate-100 placeholder:text-slate-500"
          />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              disabled={salvando}
              className="h-10 rounded-xl border border-slate-700 px-4 font-semibold text-slate-200 hover:bg-slate-800"
            >
              Manter assinatura
            </button>
            <button
              type="button"
              onClick={() => void alterar('cancelar')}
              disabled={salvando}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 font-bold text-white hover:bg-red-700 disabled:opacity-60"
            >
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar cancelamento
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
