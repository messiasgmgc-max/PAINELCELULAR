'use client';

import { useEffect, useCallback } from 'react';
import {
  useStoreContext,
  DEFAULT_PLAN,
  type StorePlanData,
} from '@/contexts/StoreContext';
import type { TipoPlano, PeriodoFaturamento } from '@/lib/planos-config';
import type { AcaoAssinatura } from '@/lib/planos/assinatura';

export type { StorePlanData };

interface UseStorePlanOptions {
  /** Carrega histórico de pagamentos automaticamente (usar apenas onde o histórico é exibido). */
  autoLoadHistorico?: boolean;
}

export function useStorePlan(options?: UseStorePlanOptions) {
  const ctx = useStoreContext();
  const autoLoadHistorico = options?.autoLoadHistorico ?? false;

  const lojaId = ctx?.planData.lojaId ?? ctx?.lojaId ?? null;
  const fetchHistorico = ctx?.fetchHistorico;

  useEffect(() => {
    if (autoLoadHistorico && lojaId && fetchHistorico) {
      fetchHistorico();
    }
  }, [autoLoadHistorico, lojaId, fetchHistorico]);

  const refetchPlan = useCallback(async () => {
    await ctx?.fetchStore(true);
  }, [ctx]);

  const refetchHistorico = useCallback(async () => {
    await ctx?.fetchHistorico();
  }, [ctx]);

  const enviarSolicitacaoLiberacao = useCallback(
    async (comprovanteBase64?: string, observacao?: string) => {
      if (!ctx) throw new Error('Loja não encontrada');
      return ctx.enviarSolicitacaoLiberacao(comprovanteBase64, observacao);
    },
    [ctx]
  );

  const solicitarTrial = useCallback(
    async (novoPlano: TipoPlano) => {
      if (!ctx) throw new Error('Loja não identificada');
      return ctx.solicitarTrial(novoPlano);
    },
    [ctx]
  );

  const iniciarCheckoutCartao = useCallback(
    async (plano?: TipoPlano, periodo?: PeriodoFaturamento) => {
      if (!ctx) throw new Error('Loja não identificada');
      return ctx.iniciarCheckoutCartao(plano, periodo);
    },
    [ctx]
  );

  const alterarAssinatura = useCallback(
    async (acao: AcaoAssinatura, motivo?: string) => {
      if (!ctx) throw new Error('Loja não identificada');
      return ctx.alterarAssinatura(acao, motivo);
    },
    [ctx]
  );

  return {
    planData: ctx?.planData ?? DEFAULT_PLAN,
    loading: ctx?.isLoadingPlan ?? false,
    refetchPlan,
    historicoPagamentos: ctx?.historicoPagamentos ?? [],
    loadingHistorico: ctx?.loadingHistorico ?? false,
    refetchHistorico,
    enviarSolicitacaoLiberacao,
    solicitarTrial,
    iniciarCheckoutCartao,
    alterarAssinatura,
  };
}
