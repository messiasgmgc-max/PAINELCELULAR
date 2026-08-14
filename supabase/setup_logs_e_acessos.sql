-- ====================================================================
-- SCRIPT COMPLETO: E-MAILS DE EQUIPE, PRIMEIRO ACESSO E LOGS DE AUDITORIA
-- Execute este script no SQL Editor do Supabase (supabase.com)
-- ====================================================================

-- 1. Assegurar colunas na tabela 'tecnicos'
ALTER TABLE public.tecnicos ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.tecnicos ADD COLUMN IF NOT EXISTS loja_id UUID REFERENCES public.lojas(id) ON DELETE CASCADE;
ALTER TABLE public.tecnicos ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'tecnico';
ALTER TABLE public.tecnicos ADD COLUMN IF NOT EXISTS status_conta TEXT DEFAULT 'pendente_senha'; -- 'pendente_senha' | 'ativo'

-- Index para buscas rápidas por e-mail na equipe
CREATE INDEX IF NOT EXISTS idx_tecnicos_email ON public.tecnicos (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_tecnicos_loja_id ON public.tecnicos (loja_id);

-- 2. Assegurar colunas na tabela 'perfis'
ALTER TABLE public.perfis ADD COLUMN IF NOT EXISTS loja_id UUID REFERENCES public.lojas(id) ON DELETE CASCADE;
ALTER TABLE public.perfis ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'admin';
ALTER TABLE public.perfis ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT true;

-- 3. Tabela de Logs e Auditoria do Sistema
CREATE TABLE IF NOT EXISTS public.logs_sistema (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id UUID REFERENCES public.lojas(id) ON DELETE CASCADE,
  usuario_id UUID,
  usuario_email TEXT,
  usuario_nome TEXT,
  tipo_evento TEXT NOT NULL DEFAULT 'info', -- 'login', 'venda', 'os', 'estoque', 'equipe', 'plano', 'sistema'
  acao TEXT NOT NULL,
  detalhes TEXT,
  ip TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index para otimizar pesquisas de logs por loja e data
CREATE INDEX IF NOT EXISTS idx_logs_sistema_loja_id ON public.logs_sistema (loja_id);
CREATE INDEX IF NOT EXISTS idx_logs_sistema_created_at ON public.logs_sistema (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_sistema_tipo ON public.logs_sistema (tipo_evento);

-- 4. Permissões e RLS (Row Level Security)
ALTER TABLE public.tecnicos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir leitura e escrita em tecnicos" ON public.tecnicos;
CREATE POLICY "Permitir leitura e escrita em tecnicos" ON public.tecnicos FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.logs_sistema ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir leitura e insercao em logs_sistema" ON public.logs_sistema;
CREATE POLICY "Permitir leitura e insercao em logs_sistema" ON public.logs_sistema FOR ALL USING (true) WITH CHECK (true);

-- Notificação de execução concluída com sucesso
SELECT 'Script de Primeiro Acesso e Logs executado com sucesso!' AS resultado;
