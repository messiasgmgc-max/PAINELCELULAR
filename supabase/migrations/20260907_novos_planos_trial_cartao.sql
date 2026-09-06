-- ==============================================================================
-- Migration: 20260907_novos_planos_trial_cartao.sql
-- Description:
--   1. Novos níveis de planos: 'entrada' (R$99,90), 'intermediario' (R$189,00), 'avancado' (R$299,00)
--   2. Controle de período de faturamento ('mensal', 'trimestral', 'anual') com descontos
--   3. Suporte a Período de Teste Gratuito (Trial de 3 dias para novos clientes ou upgrade de plano)
--   4. Suporte a Cartão de Crédito e Mercado Pago Checkout / Preferences com parcelamento
--   5. Campos de dados cadastrais da loja para onboarding self-service (cidade, estado, instagram)
-- ==============================================================================

-- 1. ADICIONAR COLUNAS NA TABELA 'lojas'
ALTER TABLE public.lojas
  ADD COLUMN IF NOT EXISTS plano_tipo TEXT DEFAULT 'entrada',
  ADD COLUMN IF NOT EXISTS plano_trial_ate TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS plano_trial_usado BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS trial_planos_usados JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS periodo_cobranca TEXT DEFAULT 'mensal',
  ADD COLUMN IF NOT EXISTS api_key TEXT,
  ADD COLUMN IF NOT EXISTS cidade TEXT,
  ADD COLUMN IF NOT EXISTS estado TEXT,
  ADD COLUMN IF NOT EXISTS instagram TEXT;

-- Garantir restrição de tipos de planos válidos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lojas_plano_tipo_check'
  ) THEN
    ALTER TABLE public.lojas
      ADD CONSTRAINT lojas_plano_tipo_check
      CHECK (plano_tipo IN ('entrada', 'intermediario', 'avancado'));
  END IF;
END $$;

-- Garantir restrição de periodicidade de cobrança
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lojas_periodo_cobranca_check'
  ) THEN
    ALTER TABLE public.lojas
      ADD CONSTRAINT lojas_periodo_cobranca_check
      CHECK (periodo_cobranca IN ('mensal', 'trimestral', 'anual'));
  END IF;
END $$;

-- Inicializar plano_tipo para lojas antigas caso estejam nulas
UPDATE public.lojas
SET plano_tipo = 'entrada'
WHERE plano_tipo IS NULL;

-- 2. ADICIONAR COLUNAS NA TABELA 'historico_pagamentos_planos'
ALTER TABLE public.historico_pagamentos_planos
  ADD COLUMN IF NOT EXISTS metodo_pagamento TEXT DEFAULT 'pix',
  ADD COLUMN IF NOT EXISTS cartao_ultimos_digitos TEXT,
  ADD COLUMN IF NOT EXISTS cartao_bandeira TEXT,
  ADD COLUMN IF NOT EXISTS parcelas INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS plano_contratado TEXT DEFAULT 'entrada',
  ADD COLUMN IF NOT EXISTS periodo_contratado TEXT DEFAULT 'mensal',
  ADD COLUMN IF NOT EXISTS mp_preference_id TEXT;

-- 3. ÍNDICES DE PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_lojas_plano_tipo ON public.lojas(plano_tipo);
CREATE INDEX IF NOT EXISTS idx_lojas_plano_trial_ate ON public.lojas(plano_trial_ate);
CREATE INDEX IF NOT EXISTS idx_lojas_api_key ON public.lojas(api_key);
CREATE INDEX IF NOT EXISTS idx_hist_pagamentos_mp_pref ON public.historico_pagamentos_planos(mp_preference_id);

-- 4. FUNÇÃO RPC PARA ATIVAÇÃO SEGURA DE TRIAL DE 3 DIAS
CREATE OR REPLACE FUNCTION public.solicitar_trial_plano(
  p_loja_id UUID,
  p_novo_plano TEXT,
  p_dias INTEGER DEFAULT 3
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_loja RECORD;
  v_trial_usados JSONB;
  v_data_fim TIMESTAMPTZ;
  v_novo_vencimento DATE;
BEGIN
  -- Validar plano
  IF p_novo_plano NOT IN ('entrada', 'intermediario', 'avancado') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Plano solicitado inválido');
  END IF;

  -- Buscar loja
  SELECT id, plano_tipo, plano_status, data_vencimento, plano_trial_ate, trial_planos_usados
  INTO v_loja
  FROM public.lojas
  WHERE id = p_loja_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Loja não encontrada');
  END IF;

  v_trial_usados := COALESCE(v_loja.trial_planos_usados, '[]'::jsonb);

  -- Verificar se já utilizou o trial desse plano específico
  IF v_trial_usados ? p_novo_plano THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Você já utilizou o período de teste de 3 dias para o plano ' || UPPER(p_novo_plano) || '.'
    );
  END IF;

  -- Calcular vencimento do teste (p_dias a partir de agora)
  v_data_fim := NOW() + (p_dias || ' days')::INTERVAL;
  v_novo_vencimento := (v_data_fim)::DATE;

  -- Se a loja já tinha vencimento posterior, mantém o maior vencimento
  IF v_loja.data_vencimento IS NOT NULL AND v_loja.data_vencimento > v_novo_vencimento THEN
    v_novo_vencimento := v_loja.data_vencimento;
  END IF;

  -- Adicionar plano à lista de trials já usados
  v_trial_usados := v_trial_usados || to_jsonb(p_novo_plano);

  -- Atualizar loja com o trial ativo
  UPDATE public.lojas
  SET 
    plano_tipo = p_novo_plano,
    plano_status = 'ativo',
    ativo = TRUE,
    plano_trial_ate = v_data_fim,
    plano_trial_usado = TRUE,
    trial_planos_usados = v_trial_usados,
    data_vencimento = v_novo_vencimento,
    updated_at = NOW()
  WHERE id = p_loja_id;

  -- Registrar no histórico
  INSERT INTO public.historico_pagamentos_planos (
    loja_id,
    valor,
    status,
    forma_pagamento,
    metodo_pagamento,
    plano_contratado,
    observacao
  ) VALUES (
    p_loja_id,
    0.00,
    'aprovado',
    'trial_gratis',
    'trial_3_dias',
    p_novo_plano,
    'Período de teste gratuito (3 dias) ativado para o plano ' || UPPER(p_novo_plano) || ' até ' || to_char(v_data_fim, 'DD/MM/YYYY HH24:MI')
  );

  RETURN jsonb_build_object(
    'success', true,
    'plano', p_novo_plano,
    'trial_ate', v_data_fim,
    'novo_vencimento', v_novo_vencimento,
    'mensagem', 'Teste de ' || p_dias || ' dias ativado com sucesso!'
  );
END;
$$;

-- 5. COMENTÁRIOS EXPLICATIVOS
COMMENT ON COLUMN public.lojas.plano_tipo IS 'Nível do plano: entrada (R$99,90), intermediario (R$189,00) ou avancado (R$299,00)';
COMMENT ON COLUMN public.lojas.periodo_cobranca IS 'Ciclo de faturamento: mensal, trimestral (desconto) ou anual (desconto maior)';
COMMENT ON COLUMN public.lojas.plano_trial_ate IS 'Timestamp limite do período de teste gratuito de 3 dias';
COMMENT ON COLUMN public.lojas.trial_planos_usados IS 'Array JSONB com os planos que já tiveram o teste de 3 dias resgatado';
COMMENT ON COLUMN public.lojas.api_key IS 'Chave de API segura para integrações externas e bots próprios (disponível no plano avançado)';
