-- ==============================================================================
-- Migration: 20260929_add_data_nascimento_clientes.sql
-- Description:
--   Adiciona a coluna opcional data_nascimento na tabela clientes para armazenar
--   a data de nascimento do cliente, sem qualquer obrigatoriedade.
-- ==============================================================================

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS data_nascimento TEXT;

COMMENT ON COLUMN public.clientes.data_nascimento IS 'Data de nascimento do cliente (campo totalmente opcional, ex: DD/MM/YYYY ou YYYY-MM-DD)';
