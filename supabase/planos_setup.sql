-- ====================================================================
-- SCRIPT DE CONFIGURAÇÃO DE PLANOS, MENSALIDADES E BLOQUEIO DE LOJAS
-- Execute este script no SQL Editor do Supabase
-- ====================================================================

-- Adiciona campos de plano e cobrança na tabela de lojas
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS plano_status TEXT DEFAULT 'ativo';
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS valor_mensalidade NUMERIC(10,2) DEFAULT 99.90;
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS data_vencimento DATE DEFAULT (CURRENT_DATE + INTERVAL '30 days');
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS chave_pix_cobranca TEXT DEFAULT 'financeiro@phonecenter.com.br';
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS comprovante_url TEXT;
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS solicitacao_liberacao_status TEXT DEFAULT 'nenhuma';
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS solicitacao_liberacao_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS observacao_plano TEXT;

-- Tabela de Histórico de Pagamentos de Planos
CREATE TABLE IF NOT EXISTS public.historico_pagamentos_planos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id UUID REFERENCES public.lojas(id) ON DELETE CASCADE,
  valor NUMERIC(10,2) NOT NULL DEFAULT 99.90,
  data_pagamento TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT DEFAULT 'pendente',
  comprovante_url TEXT,
  observacao TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Garantir RLS habilitado
ALTER TABLE public.historico_pagamentos_planos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir leitura de historico_pagamentos para autenticados" ON public.historico_pagamentos_planos;
CREATE POLICY "Permitir leitura de historico_pagamentos para autenticados"
ON public.historico_pagamentos_planos FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Permitir inserção de historico_pagamentos para autenticados" ON public.historico_pagamentos_planos;
CREATE POLICY "Permitir inserção de historico_pagamentos para autenticados"
ON public.historico_pagamentos_planos FOR INSERT
WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir atualização de historico_pagamentos para autenticados" ON public.historico_pagamentos_planos;
CREATE POLICY "Permitir atualização de historico_pagamentos para autenticados"
ON public.historico_pagamentos_planos FOR UPDATE
USING (true)
WITH CHECK (true);
