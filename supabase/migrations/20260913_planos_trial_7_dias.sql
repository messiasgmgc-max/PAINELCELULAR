-- ==============================================================================
-- Migration: 20260913_planos_trial_7_dias.sql
-- Descrição:
--   O teste grátis passa de 3 para 7 dias.
--
--   Quem concede o teste hoje:
--     - /api/lojas/criar-com-adesao  (cadastro pela /assinar)      -> usa DIAS_TESTE_GRATIS
--     - /api/planos/solicitar-trial   (teste de outro plano no painel) -> usa DIAS_TESTE_GRATIS
--     - public.solicitar_trial_plano  (função RPC, só service_role)  -> esta migration
--   As rotas já gravam 7 dias pelo código (src/lib/planos-config.ts). Esta
--   migration deixa a função do banco com o mesmo padrão, para ninguém voltar a
--   conceder 3 dias por ela.
--
-- Idempotente: CREATE OR REPLACE (mudar o valor padrão de um parâmetro é
-- permitido; a assinatura uuid, text, integer é a mesma) e COMMENT.
-- Não mexe em dados de lojas.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.solicitar_trial_plano(
  p_loja_id UUID,
  p_novo_plano TEXT,
  p_dias INTEGER DEFAULT 7
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- Duração do teste: 1 a 30 dias (padrão 7).
  IF p_dias IS NULL OR p_dias < 1 OR p_dias > 30 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Duração do teste inválida');
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

  -- Verificar se já utilizou o teste desse plano específico
  IF v_trial_usados ? p_novo_plano THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Você já utilizou o período de teste grátis do plano ' || UPPER(p_novo_plano) || '.'
    );
  END IF;

  -- Calcular fim do teste (p_dias a partir de agora)
  v_data_fim := NOW() + make_interval(days => p_dias);
  v_novo_vencimento := (v_data_fim)::DATE;

  -- Se a loja já tinha vencimento posterior, mantém o maior vencimento
  IF v_loja.data_vencimento IS NOT NULL AND v_loja.data_vencimento > v_novo_vencimento THEN
    v_novo_vencimento := v_loja.data_vencimento;
  END IF;

  -- Adicionar plano à lista de testes já usados
  v_trial_usados := v_trial_usados || to_jsonb(p_novo_plano);

  -- Atualizar loja com o teste ativo
  UPDATE public.lojas
  SET
    plano_tipo = p_novo_plano,
    plano_status = 'ativo',
    ativo = TRUE,
    plano_trial_ate = v_data_fim,
    plano_trial_usado = TRUE,
    trial_planos_usados = v_trial_usados,
    data_vencimento = v_novo_vencimento
  WHERE id = p_loja_id;

  -- Registrar no histórico (metodo_pagamento no mesmo formato das rotas: trial_7_dias)
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
    'trial_' || p_dias || '_dias',
    p_novo_plano,
    'Período de teste gratuito (' || p_dias || ' dias) ativado para o plano ' || UPPER(p_novo_plano) || ' até ' || to_char(v_data_fim, 'DD/MM/YYYY HH24:MI')
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

-- Continua liberada só para o servidor (repetido para a migration valer sozinha).
REVOKE ALL ON FUNCTION public.solicitar_trial_plano(UUID, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.solicitar_trial_plano(UUID, TEXT, INTEGER) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solicitar_trial_plano(UUID, TEXT, INTEGER) TO service_role;

COMMENT ON FUNCTION public.solicitar_trial_plano(UUID, TEXT, INTEGER) IS
  'Ativa o teste grátis de um plano (padrão 7 dias, uma vez por plano). Só service_role.';
COMMENT ON COLUMN public.lojas.plano_trial_ate IS 'Fim do período de teste grátis (7 dias desde 13/09/2026; antes eram 3)';
COMMENT ON COLUMN public.lojas.trial_planos_usados IS 'Array JSONB com os planos que já tiveram o teste grátis resgatado';

-- ------------------------------------------------------------------------------
-- OPCIONAL (não roda): dar os dias que faltam a quem está no teste de 3 dias.
-- Em 11/09/2026 havia 0 lojas com teste ativo. Se houver alguma quando aplicar e
-- a decisão for estender, descomente:
--
-- UPDATE public.lojas
-- SET plano_trial_ate = plano_trial_ate + INTERVAL '4 days',
--     data_vencimento = GREATEST(data_vencimento, (plano_trial_ate + INTERVAL '4 days')::DATE)
-- WHERE plano_trial_ate > NOW()
--   AND plano_status = 'ativo';
-- ------------------------------------------------------------------------------
