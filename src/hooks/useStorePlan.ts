'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/hooks/useAuth';
import { TipoPlano, PeriodoFaturamento, obterPlanoPorTipo } from '@/lib/planos-config';

export interface StorePlanData {
  lojaId: string | null;
  nomeLoja: string;
  planoTipo: TipoPlano;
  periodoFaturamento: PeriodoFaturamento;
  planoStatus: 'ativo' | 'pendente' | 'vencido' | 'bloqueado';
  valorMensalidade: number;
  dataVencimento: string | null;
  planoTrialAte: string | null;
  isTrialAtivo: boolean;
  trialPlanosUsados: string[];
  apiKey: string | null;
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
  planoTipo: 'entrada',
  periodoFaturamento: 'mensal',
  planoStatus: 'ativo',
  valorMensalidade: 99.90,
  dataVencimento: null,
  planoTrialAte: null,
  isTrialAtivo: false,
  trialPlanosUsados: [],
  apiKey: null,
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

      // Calcular dias para vencer considerando fim do dia local
      let diasParaVencer = 30;
      let isVencidoPorData = false;

      if (loja.data_vencimento) {
        const parts = String(loja.data_vencimento).split('T')[0].split('-');
        if (parts.length === 3) {
          const year = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10) - 1;
          const day = parseInt(parts[2], 10);
          const venc = new Date(year, month, day, 23, 59, 59, 999);
          const diffTime = venc.getTime() - Date.now();
          diasParaVencer = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          isVencidoPorData = diffTime < 0;
        }
      }

      const rawStatus = (loja.plano_status || 'ativo').toLowerCase();
      let status: StorePlanData['planoStatus'] = 'ativo';
      if (!loja.ativo || rawStatus === 'bloqueado') {
        status = 'bloqueado';
      } else if (rawStatus === 'vencido' || isVencidoPorData) {
        status = 'vencido';
      } else if (rawStatus === 'pendente') {
        status = 'pendente';
      } else {
        status = 'ativo';
      }

      const isBloqueado = status === 'bloqueado' || status === 'vencido';

      // Checar se o trial de 3 dias está ativo
      let isTrialAtivo = false;
      if (loja.plano_trial_ate) {
        const trialEnd = new Date(loja.plano_trial_ate).getTime();
        isTrialAtivo = trialEnd > Date.now();
      }

      // Sincroniza no banco se constava como ativo mas a data já venceu
      if (isVencidoPorData && loja.plano_status === 'ativo' && !isTrialAtivo) {
        supabase.from('lojas').update({ plano_status: 'vencido' }).eq('id', loja.id).then();
      }

      const planoTipo = (loja.plano_tipo || 'entrada') as TipoPlano;
      const periodoFaturamento = (loja.periodo_cobranca || 'mensal') as PeriodoFaturamento;
      const trialPlanosUsados = Array.isArray(loja.trial_planos_usados) ? loja.trial_planos_usados : [];

      setPlanData({
        lojaId: loja.id,
        nomeLoja: loja.nome || 'Phone Center',
        planoTipo,
        periodoFaturamento,
        planoStatus: status,
        valorMensalidade: Number(loja.valor_mensalidade) || obterPlanoPorTipo(planoTipo).precos.mensal.valorMensal,
        dataVencimento: loja.data_vencimento || null,
        planoTrialAte: loja.plano_trial_ate || null,
        isTrialAtivo,
        trialPlanosUsados,
        apiKey: loja.api_key || null,
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

  const [historicoPagamentos, setHistoricoPagamentos] = useState<any[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState(false);

  const fetchHistorico = useCallback(async () => {
    const targetLojaId = planData.lojaId || usuario?.lojaId;
    if (!targetLojaId) return;

    try {
      setLoadingHistorico(true);
      const { data, error } = await supabase
        .from('historico_pagamentos_planos')
        .select('*')
        .eq('loja_id', targetLojaId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setHistoricoPagamentos(data || []);
    } catch (err) {
      console.error('Erro ao buscar histórico de pagamentos:', err);
    } finally {
      setLoadingHistorico(false);
    }
  }, [planData.lojaId, usuario?.lojaId]);

  useEffect(() => {
    fetchPlanData();
  }, [fetchPlanData]);

  useEffect(() => {
    if (planData.lojaId) {
      fetchHistorico();
    }
  }, [planData.lojaId, fetchHistorico]);

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
        forma_pagamento: 'comprovante_pix',
      });

      await fetchPlanData();
      await fetchHistorico();
      return true;
    } catch (err: any) {
      console.error('Erro ao enviar solicitação de liberação:', err);
      throw err;
    }
  };

  // Solicitar 3 Dias de Teste Gratuito de um Plano
  const solicitarTrial = async (novoPlano: TipoPlano) => {
    if (!planData.lojaId) throw new Error('Loja não identificada');

    const res = await fetch('/api/planos/solicitar-trial', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lojaId: planData.lojaId,
        novoPlano
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao ativar teste');
    }

    await fetchPlanData();
    await fetchHistorico();
    return data;
  };

  // Iniciar Checkout com Cartão de Crédito Mercado Pago
  const iniciarCheckoutCartao = async (
    plano: TipoPlano = planData.planoTipo,
    periodo: PeriodoFaturamento = planData.periodoFaturamento
  ) => {
    if (!planData.lojaId) throw new Error('Loja não identificada');

    const res = await fetch('/api/planos/pagar-cartao', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lojaId: planData.lojaId,
        plano,
        periodo,
        email: usuario?.email,
        nome: usuario?.nome || planData.nomeLoja
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao gerar checkout');
    }

    return data;
  };

  return {
    planData,
    loading,
    refetchPlan: fetchPlanData,
    historicoPagamentos,
    loadingHistorico,
    refetchHistorico: fetchHistorico,
    enviarSolicitacaoLiberacao,
    solicitarTrial,
    iniciarCheckoutCartao
  };
}
