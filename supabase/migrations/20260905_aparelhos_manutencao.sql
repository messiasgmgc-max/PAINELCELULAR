-- ====================================================================
-- MIGRAÇÃO: CONTROLE DE MANUTENÇÃO E CUSTÓDIA DE APARELHOS COM TÉCNICOS
-- ====================================================================

-- 1. Garante as colunas na tabela 'aparelhos'
ALTER TABLE public.aparelhos ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'disponivel';
ALTER TABLE public.aparelhos ADD COLUMN IF NOT EXISTS tecnico_id TEXT;
ALTER TABLE public.aparelhos ADD COLUMN IF NOT EXISTS tecnico_nome TEXT;
ALTER TABLE public.aparelhos ADD COLUMN IF NOT EXISTS data_manutencao TIMESTAMPTZ;
ALTER TABLE public.aparelhos ADD COLUMN IF NOT EXISTS motivo_manutencao TEXT;
ALTER TABLE public.aparelhos ADD COLUMN IF NOT EXISTS custo_manutencao NUMERIC(10,2) DEFAULT 0;

-- 2. Cria índices para buscas rápidas de aparelhos em manutenção
CREATE INDEX IF NOT EXISTS idx_aparelhos_status ON public.aparelhos(status);
CREATE INDEX IF NOT EXISTS idx_aparelhos_tecnico_id ON public.aparelhos(tecnico_id);
