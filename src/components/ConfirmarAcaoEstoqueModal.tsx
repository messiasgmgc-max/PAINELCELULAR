'use client';

import { ReactNode, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, ShieldAlert, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ModalPortal } from '@/components/ModalPortal';
import { cn } from '@/lib/utils';

/**
 * Confirmação para operações que mexem em muitos aparelhos de uma vez.
 *
 * Substitui o `confirm()` genérico que protegia (sem proteger) as baixas em
 * massa. A regra aqui é mostrar números reais antes de qualquer escrita, e,
 * para o que é irreversível, exigir que a pessoa digite algo (ex.: o nome da
 * loja) em vez de só clicar.
 */

export interface LinhaResumo {
  rotulo: string;
  valor: ReactNode;
  tom?: 'neutro' | 'positivo' | 'aviso' | 'perigo';
}

export interface AcaoConfirmacao {
  rotulo: string;
  onClick: () => void | Promise<void>;
  variante?: 'primaria' | 'perigo' | 'secundaria';
  desabilitada?: boolean;
  /** Mostra spinner neste botão e trava os demais. */
  carregando?: boolean;
  /** Exige a digitação de `textoConfirmacao` para habilitar. */
  exigeDigitacao?: boolean;
}

interface Props {
  aberto: boolean;
  titulo: string;
  descricao?: ReactNode;
  tom?: 'aviso' | 'perigo';
  resumo?: LinhaResumo[];
  /** Mensagem de bloqueio (ex.: trava de sanidade). Aparece em destaque vermelho. */
  bloqueio?: string | null;
  detalhes?: ReactNode;
  acoes: AcaoConfirmacao[];
  /** Texto que precisa ser digitado para liberar ações com `exigeDigitacao`. */
  textoConfirmacao?: string;
  onFechar: () => void;
}

const CORES_RESUMO: Record<NonNullable<LinhaResumo['tom']>, string> = {
  neutro: 'text-slate-200',
  positivo: 'text-emerald-300',
  aviso: 'text-amber-300',
  perigo: 'text-rose-300',
};

export function ConfirmarAcaoEstoqueModal({
  aberto,
  titulo,
  descricao,
  tom = 'aviso',
  resumo = [],
  bloqueio,
  detalhes,
  acoes,
  textoConfirmacao,
  onFechar,
}: Props) {
  const [digitado, setDigitado] = useState('');

  useEffect(() => {
    if (aberto) setDigitado('');
  }, [aberto]);

  if (!aberto) return null;

  const algumCarregando = acoes.some((a) => a.carregando);
  const normalizar = (s: string) => s.trim().toLocaleLowerCase('pt-BR');
  const digitacaoOk = !textoConfirmacao || normalizar(digitado) === normalizar(textoConfirmacao);
  const precisaDigitar = Boolean(textoConfirmacao) && acoes.some((a) => a.exigeDigitacao);
  const Icone = tom === 'perigo' ? ShieldAlert : AlertTriangle;

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[10050] flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md overflow-y-auto">
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirmar-acao-estoque-titulo"
          className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-5 shadow-2xl space-y-4 text-white my-auto"
        >
          <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-3">
            <div className="flex items-center gap-2.5">
              <Icone className={cn('h-5 w-5 shrink-0', tom === 'perigo' ? 'text-rose-400' : 'text-amber-400')} />
              <h3 id="confirmar-acao-estoque-titulo" className="text-base font-bold leading-tight">
                {titulo}
              </h3>
            </div>
            <button
              type="button"
              onClick={onFechar}
              disabled={algumCarregando}
              className="text-slate-400 hover:text-white disabled:opacity-40"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {descricao && <div className="text-sm text-slate-300 leading-relaxed">{descricao}</div>}

          {resumo.length > 0 && (
            <dl className="rounded-2xl border border-white/10 bg-white/5 divide-y divide-white/5">
              {resumo.map((linha) => (
                <div key={linha.rotulo} className="flex items-center justify-between gap-4 px-3.5 py-2.5 text-sm">
                  <dt className="text-slate-400">{linha.rotulo}</dt>
                  <dd className={cn('font-bold tabular-nums text-right', CORES_RESUMO[linha.tom || 'neutro'])}>
                    {linha.valor}
                  </dd>
                </div>
              ))}
            </dl>
          )}

          {bloqueio && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">
              <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-rose-400" />
              <span>{bloqueio}</span>
            </div>
          )}

          {detalhes}

          {precisaDigitar && (
            <label className="block space-y-1.5">
              <span className="text-xs text-slate-400">
                Para confirmar, digite <strong className="text-white">{textoConfirmacao}</strong>
              </span>
              <input
                value={digitado}
                onChange={(e) => setDigitado(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-rose-500"
              />
            </label>
          )}

          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-1">
            {acoes.map((acao) => {
              const bloqueadaPorDigitacao = acao.exigeDigitacao && !digitacaoOk;
              return (
                <Button
                  key={acao.rotulo}
                  type="button"
                  onClick={acao.onClick}
                  disabled={acao.desabilitada || bloqueadaPorDigitacao || (algumCarregando && !acao.carregando)}
                  variant={acao.variante === 'secundaria' ? 'secondary' : undefined}
                  className={cn(
                    'font-bold',
                    acao.variante === 'perigo' && 'bg-rose-600 hover:bg-rose-500 text-white',
                    acao.variante === 'primaria' && 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  )}
                >
                  {acao.carregando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {acao.rotulo}
                </Button>
              );
            })}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
