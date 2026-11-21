-- ============================================================================
-- PhoneCenterCRM — Configurações Multi-Loja por Instância (Supabase)
-- Cada loja/instância guarda sua própria Chave Pix, Evolution API instance,
-- URLs/Token do CRM, Mercado Pago/Asaas e Meta CAPI — zero conflito global!
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.crm_loja_configs (
  loja_id UUID PRIMARY KEY REFERENCES public.lojas(id) ON DELETE CASCADE,
  crm_ativo BOOLEAN NOT NULL DEFAULT true,
  crm_frontend_url TEXT NOT NULL DEFAULT 'https://crm.phonecenter.tech',
  crm_api_url TEXT NOT NULL DEFAULT 'https://api-crm.phonecenter.tech',
  crm_access_token TEXT DEFAULT '',
  evolution_instance_name TEXT DEFAULT '',
  espelhar_webhook_crm BOOLEAN NOT NULL DEFAULT false,
  pix_key TEXT DEFAULT '',
  pix_city TEXT DEFAULT 'BRASIL',
  pix_provedor TEXT NOT NULL DEFAULT 'estatico_emv'
    CHECK (pix_provedor IN ('estatico_emv', 'mercadopago', 'asaas')),
  mercadopago_access_token TEXT DEFAULT '',
  asaas_api_key TEXT DEFAULT '',
  asaas_customer_id TEXT DEFAULT '',
  meta_pixel_id TEXT DEFAULT '',
  meta_capi_access_token TEXT DEFAULT '',
  whatsapp_bio_numero TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_loja_configs_evolution_instance
  ON public.crm_loja_configs (evolution_instance_name)
  WHERE evolution_instance_name <> '';

ALTER TABLE public.crm_loja_configs ENABLE ROW LEVEL SECURITY;
