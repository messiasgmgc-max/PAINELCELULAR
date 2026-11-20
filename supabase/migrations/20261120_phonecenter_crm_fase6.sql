-- ============================================================================
-- PhoneCenterCRM — Fase 6: Reservas com Sinal Pix & Multi-Loja SaaS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.crm_reservas_pix (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
  protocolo TEXT NOT NULL,
  aparelho_id UUID,
  aparelho_modelo TEXT NOT NULL,
  cliente_nome TEXT NOT NULL DEFAULT 'Cliente',
  cliente_telefone TEXT DEFAULT '',
  valor_sinal NUMERIC(12,2) NOT NULL DEFAULT 0,
  provedor TEXT NOT NULL DEFAULT 'estatico_emv'
    CHECK (provedor IN ('estatico_emv', 'asaas', 'mercadopago')),
  provedor_charge_id TEXT DEFAULT '',
  pix_copia_cola TEXT NOT NULL,
  link_pagamento TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'pago', 'cancelado', 'expirado')),
  pago_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_reservas_pix_loja_created
  ON public.crm_reservas_pix (loja_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_reservas_pix_charge
  ON public.crm_reservas_pix (provedor_charge_id);

CREATE TABLE IF NOT EXISTS public.crm_tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  frontend_domain TEXT NOT NULL UNIQUE,
  api_domain TEXT NOT NULL UNIQUE,
  coolify_service_uuid TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'planejado'
    CHECK (status IN ('planejado', 'provisionando', 'ativo', 'suspenso', 'erro')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_tenants_loja ON public.crm_tenants (loja_id);

ALTER TABLE public.crm_reservas_pix ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_tenants ENABLE ROW LEVEL SECURITY;
