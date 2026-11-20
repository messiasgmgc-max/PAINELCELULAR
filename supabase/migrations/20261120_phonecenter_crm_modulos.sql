-- ============================================================================
-- PhoneCenterCRM — Fase 5: Propostas Comerciais, Leads de Anúncio (CTWA/ROAS)
-- e Chat Interno da Equipe
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.crm_propostas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
  protocolo TEXT NOT NULL,
  token_publico TEXT NOT NULL UNIQUE,
  cliente_nome TEXT NOT NULL DEFAULT 'Cliente',
  cliente_telefone TEXT DEFAULT '',
  vendedor_nome TEXT DEFAULT 'Equipe Loja',
  modelo_novo TEXT NOT NULL,
  valor_aparelho NUMERIC(12,2) NOT NULL DEFAULT 0,
  troca_modelo TEXT DEFAULT '',
  troca_capacidade TEXT DEFAULT '',
  valor_troca NUMERIC(12,2) NOT NULL DEFAULT 0,
  entrada_pix NUMERIC(12,2) NOT NULL DEFAULT 0,
  saldo_financiar NUMERIC(12,2) NOT NULL DEFAULT 0,
  parcelamento JSONB NOT NULL DEFAULT '[]'::jsonb,
  texto_whatsapp TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'enviada'
    CHECK (status IN ('enviada', 'visualizada', 'aceita', 'recusada', 'expirada')),
  validade_ate TIMESTAMPTZ DEFAULT (now() + interval '48 hours'),
  aceita_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_propostas_loja_created
  ON public.crm_propostas (loja_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_propostas_token
  ON public.crm_propostas (token_publico);

CREATE TABLE IF NOT EXISTS public.crm_leads_anuncio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
  origem TEXT NOT NULL DEFAULT 'meta_ctwa',
  ctwa_clid TEXT DEFAULT '',
  source_id TEXT DEFAULT '',
  campaign_name TEXT DEFAULT '',
  ad_headline TEXT DEFAULT '',
  ad_body TEXT DEFAULT '',
  source_url TEXT DEFAULT '',
  contato_nome TEXT DEFAULT '',
  contato_telefone TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'novo'
    CHECK (status IN ('novo', 'atendimento', 'proposta', 'convertido', 'perdido')),
  valor_venda NUMERIC(12,2) DEFAULT 0,
  capi_enviado BOOLEAN NOT NULL DEFAULT false,
  capi_enviado_em TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_leads_anuncio_loja_created
  ON public.crm_leads_anuncio (loja_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_leads_anuncio_source
  ON public.crm_leads_anuncio (loja_id, source_id);

CREATE TABLE IF NOT EXISTS public.crm_chat_interno (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
  canal TEXT NOT NULL DEFAULT 'geral',
  autor_nome TEXT NOT NULL,
  autor_cargo TEXT DEFAULT 'vendedor',
  mensagem TEXT NOT NULL,
  referencia_ticket TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_chat_interno_loja_canal
  ON public.crm_chat_interno (loja_id, canal, created_at DESC);

-- Habilita RLS (acesso server-side via supabaseAdmin bypassa RLS)
ALTER TABLE public.crm_propostas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_leads_anuncio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_chat_interno ENABLE ROW LEVEL SECURITY;
