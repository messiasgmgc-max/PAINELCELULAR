-- ====================================================================
-- Migration: 20260907_equipe_whatsapp_acessos.sql
-- Description:
--   1. Enriquecimento da tabela tecnicos com telefone/WhatsApp e cargo
--   2. Sincronização e índices em whatsapp_permissoes para identificação rápida do lojista
--   3. Registro de telefone do dono da loja em lojas
-- ====================================================================

-- 1. ASSEGURAR COLUNAS NA TABELA tecnicos (EQUIPE DA LOJA)
ALTER TABLE public.tecnicos
  ADD COLUMN IF NOT EXISTS telefone TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS cargo TEXT DEFAULT 'vendedor',
  ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT true;

-- Normalizar campo whatsapp se telefone já estiver preenchido
UPDATE public.tecnicos
SET whatsapp = telefone
WHERE whatsapp IS NULL AND telefone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tecnicos_telefone ON public.tecnicos (telefone);
CREATE INDEX IF NOT EXISTS idx_tecnicos_whatsapp ON public.tecnicos (whatsapp);
CREATE INDEX IF NOT EXISTS idx_tecnicos_loja_id ON public.tecnicos (loja_id);

-- 2. ASSEGURAR COLUNAS NA TABELA lojas (DONO DA LOJA)
ALTER TABLE public.lojas
  ADD COLUMN IF NOT EXISTS dono_whatsapp TEXT;

UPDATE public.lojas
SET dono_whatsapp = telefone
WHERE dono_whatsapp IS NULL AND telefone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lojas_telefone ON public.lojas (telefone);
CREATE INDEX IF NOT EXISTS idx_lojas_dono_whatsapp ON public.lojas (dono_whatsapp);

-- 3. ASSEGURAR TABELA whatsapp_permissoes
CREATE TABLE IF NOT EXISTS public.whatsapp_permissoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
  telefone TEXT NOT NULL,
  nome TEXT,
  papel TEXT NOT NULL DEFAULT 'staff',
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Garantir que todas as colunas existem mesmo se a tabela já existia antes
ALTER TABLE public.whatsapp_permissoes
  ADD COLUMN IF NOT EXISTS nome TEXT,
  ADD COLUMN IF NOT EXISTS papel TEXT DEFAULT 'staff',
  ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Assegurar restrição única (loja_id, telefone)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'uq_whatsapp_permissoes_loja_telefone' OR conname = 'uq_whatsapp_permissao'
  ) THEN
    ALTER TABLE public.whatsapp_permissoes
      ADD CONSTRAINT uq_whatsapp_permissoes_loja_telefone UNIQUE(loja_id, telefone);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_whatsapp_permissoes_telefone ON public.whatsapp_permissoes (telefone);
CREATE INDEX IF NOT EXISTS idx_whatsapp_permissoes_loja ON public.whatsapp_permissoes (loja_id, telefone);

ALTER TABLE public.whatsapp_permissoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir tudo whatsapp_permissoes" ON public.whatsapp_permissoes;
CREATE POLICY "Permitir tudo whatsapp_permissoes" ON public.whatsapp_permissoes FOR ALL USING (true) WITH CHECK (true);

-- 4. POVOAR whatsapp_permissoes AUTOMATICAMENTE COM OS DONOS DAS LOJAS
INSERT INTO public.whatsapp_permissoes (loja_id, telefone, nome, papel, ativo)
SELECT 
  id AS loja_id,
  REGEXP_REPLACE(telefone, '\D', '', 'g') AS telefone,
  COALESCE(nome, 'Proprietário') AS nome,
  'owner' AS papel,
  true AS ativo
FROM public.lojas
WHERE telefone IS NOT NULL 
  AND LENGTH(REGEXP_REPLACE(telefone, '\D', '', 'g')) >= 10
ON CONFLICT (loja_id, telefone) DO UPDATE 
SET papel = 'owner', ativo = true;

-- 5. POVOAR whatsapp_permissoes COM OS MEMBROS DA EQUIPE
INSERT INTO public.whatsapp_permissoes (loja_id, telefone, nome, papel, ativo)
SELECT 
  loja_id,
  REGEXP_REPLACE(COALESCE(whatsapp, telefone), '\D', '', 'g') AS telefone,
  nome,
  CASE 
    WHEN LOWER(cargo) IN ('owner', 'dono', 'administrador', 'admin') THEN 'owner'
    WHEN LOWER(cargo) IN ('motoboy', 'entregador') THEN 'motoboy'
    ELSE 'staff'
  END AS papel,
  COALESCE(ativo, true) AS ativo
FROM public.tecnicos
WHERE loja_id IS NOT NULL 
  AND COALESCE(whatsapp, telefone) IS NOT NULL
  AND LENGTH(REGEXP_REPLACE(COALESCE(whatsapp, telefone), '\D', '', 'g')) >= 10
ON CONFLICT (loja_id, telefone) DO UPDATE 
SET nome = EXCLUDED.nome, papel = EXCLUDED.papel, ativo = EXCLUDED.ativo;
