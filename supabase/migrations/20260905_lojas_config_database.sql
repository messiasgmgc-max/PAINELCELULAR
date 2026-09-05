-- ====================================================================
-- MIGRATION: CONFIGURAÇÕES DA LOJA NA DATABASE & PIX MERCADO PAGO
-- ====================================================================

-- 1. Colunas para personalização persistida no banco (sem LocalStorage)
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS cor_tema TEXT DEFAULT 'padrao';
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS ordem_abas JSONB DEFAULT '[]'::jsonb;

-- 2. Credenciais Mercado Pago para PIX Automático por Loja / SuperAdmin
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS mp_access_token TEXT;
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS mp_public_key TEXT;

-- 3. Tabela de Logs do Sistema (garantir que existe e tem índice)
CREATE TABLE IF NOT EXISTS public.logs_sistema (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id UUID REFERENCES public.lojas(id) ON DELETE CASCADE,
  usuario_id UUID,
  usuario_email TEXT,
  usuario_nome TEXT,
  tipo_evento TEXT NOT NULL DEFAULT 'info', -- 'login', 'venda', 'os', 'estoque', 'equipe', 'plano', 'cliente', 'garantia'
  acao TEXT NOT NULL,
  detalhes TEXT,
  ip TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_logs_sistema_loja_id ON public.logs_sistema (loja_id);
CREATE INDEX IF NOT EXISTS idx_logs_sistema_created_at ON public.logs_sistema (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_sistema_tipo ON public.logs_sistema (tipo_evento);

ALTER TABLE public.logs_sistema ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir leitura e insercao em logs_sistema" ON public.logs_sistema;
CREATE POLICY "Permitir leitura e insercao em logs_sistema" ON public.logs_sistema FOR ALL USING (true) WITH CHECK (true);

-- 4. Coluna para tracking de transação PIX no historico_pagamentos_planos
ALTER TABLE public.historico_pagamentos_planos ADD COLUMN IF NOT EXISTS mp_payment_id TEXT;
ALTER TABLE public.historico_pagamentos_planos ADD COLUMN IF NOT EXISTS qr_code TEXT;
ALTER TABLE public.historico_pagamentos_planos ADD COLUMN IF NOT EXISTS qr_code_base64 TEXT;
ALTER TABLE public.historico_pagamentos_planos ADD COLUMN IF NOT EXISTS expira_em TIMESTAMP WITH TIME ZONE;
