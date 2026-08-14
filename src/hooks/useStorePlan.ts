'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/hooks/useAuth';

export interface StorePlanData {
  lojaId: string | null;
  nomeLoja: string;
  planoStatus: 'ativo' | 'pendente' | 'vencido' | 'bloqueado';
  valorMensalidade: number;
  dataVencimento: string | null;
  chavePixCobranca: string;
  comprovanteUrl: string | null;
  solicitacaoStatus: 'nenhuma' | 'pendente_aprovacao' | 'aprovado' | 'rejeitado';
  solicitacaoAt: string | null;
  observacaoPlano: string | null;
  diasParaVencer: number;
  isBloqueado: boolean;
}

const DEFAULT_PLAN: StorePlanData = {
  lojaId: null,
  nomeLoja: 'Phone Center',
  planoStatus: 'ativo',
  valorMensalidade: 99.90,
  dataVencimento: null,
  chavePixCobranca: 'financeiro@phonecenter.com.br',
  comprovanteUrl: null,
  solicitacaoStatus: 'nenhuma',
  solicitacaoAt: null,
  observacaoPlano: null,
  diasParaVencer: 30,
  isBloqueado: false,
};

export function useStorePlan() {
  const { usuario } = useAuth();
  const [planData, setPlanData] = useState<StorePlanData>(DEFAULT_PLAN);
  const [loading, setLoading] = useState(true);

  const fetchPlanData = useCallback(async () => {
    try {
      setLoading(true);
      let targetLojaId = usuario?.lojaId;

      if (!targetLojaId) {
        const { data: firstStore } = await supabase
          .from('lojas')
          .select('id')
          .limit(1)
          .maybeSingle();
        targetLojaId = firstStore?.id || null;
      }

      if (!targetLojaId) {
        setPlanData(DEFAULT_PLAN);
        return;
      }

      const { data: loja, error } = await supabase
        .from('lojas')
        .select('*')
        .eq('id', targetLojaId)
        .maybeSingle();

      if (error || !loja) {
        console.warn('Erro ao buscar plano da loja:', error?.message);
        setPlanData(DEFAULT_PLAN);
        return;
      }

      // Calcular dias para vencer
      let diasParaVencer = 30;
      if (loja.data_vencimento) {
        const venc = new Date(loja.data_vencimento);
        const hoje = new Date();
        const diffTime = venc.getTime() - hoje.getTime();
        diasParaVencer = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      }

      const status = (loja.plano_status || 'ativo').toLowerCase() as StorePlanData['planoStatus'];
      const isBloqueado = status === 'bloqueado' || status === 'vencido' || (diasParaVencer < 0 && status !== 'ativo');

      setPlanData({
        lojaId: loja.id,
        nomeLoja: loja.nome || 'Phone Center',
        planoStatus: status,
        valorMensalidade: Number(loja.valor_mensalidade) || 99.90,
        dataVencimento: loja.data_vencimento || null,
        chavePixCobranca: loja.chave_pix_cobranca || 'financeiro@phonecenter.com.br',
        comprovanteUrl: loja.comprovante_url || null,
        solicitacaoStatus: (loja.solicitacao_liberacao_status || 'nenhuma') as StorePlanData['solicitacaoStatus'],
        solicitacaoAt: loja.solicitacao_liberacao_at || null,
        observacaoPlano: loja.observacao_plano || null,
        diasParaVencer,
        isBloqueado,
      });
    } catch (err) {
      console.error('Erro ao carregar dados do plano:', err);
    } finally {
      setLoading(false);
    }
  }, [usuario?.lojaId]);

  useEffect(() => {
    fetchPlanData();
  }, [fetchPlanData]);

  // Solicitar liberação / Enviar comprovante
  const enviarSolicitacaoLiberacao = async (comprovanteBase64?: string, observacao?: string) => {
    if (!planData.lojaId) throw new Error('Loja não encontrada');

    try {
      const now = new Date().toISOString();
      const updates: any = {
        solicitacao_liberacao_status: 'pendente_aprovacao',
        solicitacao_liberacao_at: now,
      };

      if (comprovanteBase64) {
        updates.comprovante_url = comprovanteBase64;
      }
      if (observacao) {
        updates.observacao_plano = observacao;
      }

      const { error } = await supabase
        .from('lojas')
        .update(updates)
        .eq('id', planData.lojaId);

      if (error) throw error;

      // Grava no histórico de pagamentos de planos
      await supabase.from('historico_pagamentos_planos').insert({
        loja_id: planData.lojaId,
        valor: planData.valorMensalidade,
        status: 'pendente_aprovacao',
        comprovante_url: comprovanteBase64 || null,
        observacao: observacao || 'Solicitação de liberação enviada pelo lojista',
      });

      await fetchPlanData();
      return true;
    } catch (err: any) {
      console.error('Erro ao enviar solicitação de liberação:', err);
      throw err;
    }
  };

  return {
    planData,
    loading,
    refetchPlan: fetchPlanData,
    enviarSolicitacaoLiberacao,
  };
}
