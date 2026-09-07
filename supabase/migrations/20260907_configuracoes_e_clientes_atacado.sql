-- ==============================================================================
-- Migration: 20260907_configuracoes_e_clientes_atacado.sql
-- Description:
--   1. Configurações de Atacado e disparo automático de cobrança pelo Bot no WhatsApp
--   2. Criação / Enriquecimento da tabela lojistas_devedores (Clientes Atacado)
--   3. Histórico de auditoria de disparos de cobrança automática e manual
-- ==============================================================================

-- 1. ADICIONAR COLUNA config_atacado NA TABELA lojas
ALTER TABLE public.lojas
  ADD COLUMN IF NOT EXISTS config_atacado JSONB DEFAULT '{
    "ativo": true,
    "horario_disparo": "10:00",
    "dias_semana": [1, 2, 3, 4, 5],
    "dias_carencia": 1,
    "mensagem_template": "Olá {nome}! Tudo bem? Passando para lembrar sobre os pagamentos pendentes das suas retiradas de atacado na {nome_loja}.\n\n*Saldo em aberto: {valor}*\n\nChave Pix para quitação: {chave_pix}\n\nSe já realizou a transferência, por favor nos envie o comprovante!",
    "enviar_somente_dias_uteis": true,
    "notificar_dono": true,
    "chave_pix": ""
  }'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 2. GARANTIR A CRIAÇÃO DA TABELA lojistas_devedores (CLIENTES ATACADO)
CREATE TABLE IF NOT EXISTS public.lojistas_devedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  telefone TEXT,
  whatsapp TEXT,
  limite_credito NUMERIC(12,2) DEFAULT 0,
  saldo_devedor NUMERIC(12,2) NOT NULL DEFAULT 0,
  cpf_cnpj TEXT,
  cidade TEXT,
  observacoes TEXT,
  chave_pix TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  ultimo_disparo_cobranca TIMESTAMPTZ,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Garantir colunas mesmo se a tabela já existia anteriormente
ALTER TABLE public.lojistas_devedores
  ADD COLUMN IF NOT EXISTS whatsapp TEXT,
  ADD COLUMN IF NOT EXISTS limite_credito NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cpf_cnpj TEXT,
  ADD COLUMN IF NOT EXISTS cidade TEXT,
  ADD COLUMN IF NOT EXISTS observacoes TEXT,
  ADD COLUMN IF NOT EXISTS chave_pix TEXT,
  ADD COLUMN IF NOT EXISTS ultimo_disparo_cobranca TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT true;

-- Habilitar RLS e criar política de acesso
ALTER TABLE public.lojistas_devedores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir tudo lojistas_devedores" ON public.lojistas_devedores;
CREATE POLICY "Permitir tudo lojistas_devedores" ON public.lojistas_devedores FOR ALL USING (true) WITH CHECK (true);

-- Sincronizar campo whatsapp com telefone caso telefone já estivesse preenchido
UPDATE public.lojistas_devedores
SET whatsapp = telefone
WHERE whatsapp IS NULL AND telefone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lojistas_devedores_loja ON public.lojistas_devedores (loja_id);
CREATE INDEX IF NOT EXISTS idx_lojistas_devedores_whatsapp ON public.lojistas_devedores (whatsapp);
CREATE INDEX IF NOT EXISTS idx_lojistas_devedores_saldo ON public.lojistas_devedores (saldo_devedor);

-- 3. TABELA DE AUDITORIA E HISTÓRICO DE DISPAROS DE COBRANÇA
CREATE TABLE IF NOT EXISTS public.historico_cobrancas_atacado (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
  lojista_id UUID REFERENCES public.lojistas_devedores(id) ON DELETE SET NULL,
  lojista_nome TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  valor_cobrado NUMERIC(12,2) NOT NULL,
  mensagem_enviada TEXT NOT NULL,
  status TEXT DEFAULT 'enviado', -- 'enviado', 'falha', 'simulacao'
  origem TEXT DEFAULT 'automatico', -- 'automatico', 'manual_lote', 'manual_unitario'
  detalhes_erro TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hist_cobrancas_loja ON public.historico_cobrancas_atacado (loja_id);
CREATE INDEX IF NOT EXISTS idx_hist_cobrancas_created ON public.historico_cobrancas_atacado (created_at DESC);

ALTER TABLE public.historico_cobrancas_atacado ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir tudo historico_cobrancas_atacado" ON public.historico_cobrancas_atacado;
CREATE POLICY "Permitir tudo historico_cobrancas_atacado" ON public.historico_cobrancas_atacado FOR ALL USING (true) WITH CHECK (true);

-- 4. COMENTÁRIOS EXPLICATIVOS
COMMENT ON COLUMN public.lojas.config_atacado IS 'Configurações de horário, dias da semana e template do bot de cobrança do atacado';
COMMENT ON TABLE public.lojistas_devedores IS 'Cadastro e controle de limites e débitos de lojistas parceiros do atacado';
COMMENT ON TABLE public.historico_cobrancas_atacado IS 'Histórico de mensagens de cobrança disparadas pelo bot de WhatsApp para lojistas';
