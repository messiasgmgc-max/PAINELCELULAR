-- ====================================================================
-- SUPER ADMIN SETUP & FULL PERMISSIONS MIGRATION FOR PHONE CENTER
-- Execute este script no SQL Editor do Supabase para liberar total acesso do SuperAdmin
-- ====================================================================

-- 1. Garante colunas na tabela de lojas
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS subtitulo TEXT;
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS assinatura_url TEXT;
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS plano TEXT DEFAULT 'pro';
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT true;

-- 2. Garante colunas na tabela de perfis
ALTER TABLE public.perfis ADD COLUMN IF NOT EXISTS nome TEXT;
ALTER TABLE public.perfis ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'admin';
ALTER TABLE public.perfis ADD COLUMN IF NOT EXISTS loja_id UUID REFERENCES public.lojas(id) ON DELETE SET NULL;

-- 3. Desativa RLS estrito ou cria políticas sem restrições para super_admin
ALTER TABLE public.lojas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;

-- Remove políticas antigas se existirem para evitar duplicidade
DROP POLICY IF EXISTS "SuperAdmin pode fazer tudo em lojas" ON public.lojas;
DROP POLICY IF EXISTS "Permitir leitura de lojas" ON public.lojas;
DROP POLICY IF EXISTS "SuperAdmin pode fazer tudo em perfis" ON public.perfis;
DROP POLICY IF EXISTS "Permitir leitura de perfis" ON public.perfis;

-- Política permissiva total para lojas
CREATE POLICY "SuperAdmin pode fazer tudo em lojas" 
ON public.lojas FOR ALL 
USING (true) 
WITH CHECK (true);

-- Política permissiva total para perfis
CREATE POLICY "SuperAdmin pode fazer tudo em perfis" 
ON public.perfis FOR ALL 
USING (true) 
WITH CHECK (true);

-- Política permissiva total para aparelhos, vendas, peças, clientes, garantias, agendamentos, ordens
DO $$ 
BEGIN
  -- Habilita políticas ALL em aparelhos
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'aparelhos') THEN
    ALTER TABLE public.aparelhos ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Acesso total aparelhos" ON public.aparelhos;
    CREATE POLICY "Acesso total aparelhos" ON public.aparelhos FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- Habilita políticas ALL em vendas
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'vendas') THEN
    ALTER TABLE public.vendas ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Acesso total vendas" ON public.vendas;
    CREATE POLICY "Acesso total vendas" ON public.vendas FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- Habilita políticas ALL em pecas
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'pecas') THEN
    ALTER TABLE public.pecas ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Acesso total pecas" ON public.pecas;
    CREATE POLICY "Acesso total pecas" ON public.pecas FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- Habilita políticas ALL em clientes
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'clientes') THEN
    ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Acesso total clientes" ON public.clientes;
    CREATE POLICY "Acesso total clientes" ON public.clientes FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 4. Função auxiliar para sincronizar novos registros de auth.users com public.perfis
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.perfis (id, email, nome, role, loja_id)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data->>'role', 'admin'),
    (new.raw_user_meta_data->>'lojaId')::uuid
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      nome = COALESCE(EXCLUDED.nome, public.perfis.nome),
      role = COALESCE(EXCLUDED.role, public.perfis.role),
      loja_id = COALESCE(EXCLUDED.loja_id, public.perfis.loja_id);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger ao criar usuário na auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Notificação de conclusão
SELECT 'Setup do SuperAdmin executado com sucesso! Permissões e RLS atualizados.' as status;
