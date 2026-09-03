-- ====================================================================
-- CORREÇÃO DE COLUNAS DA DADOS DA EMPRESA NA TABELA LOJAS
-- Execute este script no SQL Editor do Supabase se faltar algum campo
-- ====================================================================

ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS nome TEXT;
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS subtitulo TEXT;
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS endereco TEXT;
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS cnpj TEXT;
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS telefone TEXT;
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS assinatura_url TEXT;
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT true;
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS tabela_upgrade JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS regras_upgrade JSONB DEFAULT '{}'::jsonb;

-- Garante permissões de SELECT e UPDATE para os usuários autenticados
ALTER TABLE public.lojas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir leitura de lojas para todos autenticados" ON public.lojas;
CREATE POLICY "Permitir leitura de lojas para todos autenticados"
ON public.lojas FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Permitir atualizacao de lojas para autenticados" ON public.lojas;
CREATE POLICY "Permitir atualizacao de lojas para autenticados"
ON public.lojas FOR UPDATE
USING (true)
WITH CHECK (true);
