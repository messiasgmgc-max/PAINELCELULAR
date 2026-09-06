-- ==============================================================================
-- Migration: 20260907_configuracoes_e_clientes_atacado.sql
-- Description:
--   1. Configurações de Atacado e disparo automático de cobrança pelo Bot no WhatsApp
--   2. Enriquecimento da gestão de Clientes Atacado / Lojistas Devedores com WhatsApp
--   3. Histórico de auditoria de disparos de cobrança automática e manual
-- ==============================================================================

-- 1. ADICIONAR COLUNA config_atacado NA TABELA lojas
ALTER TABLE public.lojas
  ADD COLUMN IF NOT EXISTS config_atacado JSONB DEFAULT '{
    "cobranca_automatica_ativa": false,
    "horario_disparo": "10:00",
    "dias_semana": [1, 2, 3, 4, 5],
    "modelo_mensagem": "Olá {nome}! Tudo bem? Passando para lembrar sobre seu saldo em aberto de R$ {valor} no {nome_loja}.\n\nChave PIX para pagamento: {chave_pix}\n\nQualquer dúvida estamos à disposição!",
    "incluir_chave_pix": true,
    "notificar_dono": true
  }'::jsonb;

-- 2. ENRIQUECER TABELA lojistas_devedores PARA GESTÃO COMPLETA DE CLIENTES ATACADO
ALTER TABLE public.lojistas_devedores
  ADD COLUMN IF NOT EXISTS whatsapp TEXT,
  ADD COLUMN IF NOT EXISTS limite_credito NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cpf_cnpj TEXT,
  ADD COLUMN IF NOT EXISTS cidade TEXT,
  ADD COLUMN IF NOT EXISTS observacoes TEXT,
  ADD COLUMN IF NOT EXISTS chave_pix TEXT,
  ADD COLUMN IF NOT EXISTS ultimo_disparo_cobranca TIMESTAMPTZ;

-- Sincronizar campo whatsapp com telefone caso telefone já esteja preenchido
UPDATE public.lojistas_devedores
SET whatsapp = telefone
WHERE whatsapp IS NULL AND telefone IS NOT NULL;

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
COMMENT ON COLUMN public.lojas.config_atacado IS 'Configurações de agendamento e template do bot de cobrança do atacado';
COMMENT ON COLUMN public.lojistas_devedores.whatsapp IS 'Número de WhatsApp com DDD para envio de mensagens automáticas de cobrança';
COMMENT ON COLUMN public.lojistas_devedores.limite_credito IS 'Limite máximo de fiado concedido a este cliente de atacado';
COMMENT ON TABLE public.historico_cobrancas_atacado IS 'Registro de disparos de lembretes de cobrança enviados aos lojistas devedores';
