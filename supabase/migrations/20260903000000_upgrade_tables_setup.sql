-- ====================================================================
-- ESTRUTURA PARA CALCULADORA DE UPGRADE E VISTORIAS DE MOTOBOYS
-- ====================================================================

-- 1. Colunas na tabela de lojas para tabela de precos e regras customizadas
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS tabela_upgrade JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS regras_upgrade JSONB DEFAULT '{}'::jsonb;

-- 2. Tabela de Avaliacoes / Propostas de Upgrade
CREATE TABLE IF NOT EXISTS public.avaliacoes_upgrade (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  loja_id UUID REFERENCES public.lojas(id) ON DELETE CASCADE,
  protocolo TEXT,
  cliente_nome TEXT NOT NULL,
  cliente_telefone TEXT,
  cliente_email TEXT,
  cliente_cidade TEXT,
  modelo TEXT NOT NULL,
  capacidade TEXT NOT NULL,
  valor_base NUMERIC(10,2) DEFAULT 0,
  total_deducoes NUMERIC(10,2) DEFAULT 0,
  valor_avaliado NUMERIC(10,2) DEFAULT 0,
  valor_aprovado NUMERIC(10,2),
  status TEXT DEFAULT 'pendente',
  detalhes_condicao JSONB DEFAULT '{}'::jsonb,
  deducoes_aplicadas JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Tabela de Vistorias / Coletas Realizadas por Motoboys
CREATE TABLE IF NOT EXISTS public.vistorias_upgrade (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  loja_id UUID REFERENCES public.lojas(id) ON DELETE CASCADE,
  proposta_id UUID REFERENCES public.avaliacoes_upgrade(id) ON DELETE SET NULL,
  motoboy_id UUID REFERENCES public.motoboys(id) ON DELETE SET NULL,
  motoboy_nome TEXT,
  cliente_nome TEXT,
  cliente_telefone TEXT,
  endereco_coleta TEXT,
  modelo TEXT NOT NULL,
  capacidade TEXT NOT NULL,
  cor TEXT,
  imei TEXT,
  bateria_saude INTEGER DEFAULT 85,
  detalhes_checklist JSONB DEFAULT '{}'::jsonb,
  valor_avaliado NUMERIC(10,2) DEFAULT 0,
  valor_acordado NUMERIC(10,2) DEFAULT 0,
  fotos TEXT[] DEFAULT '{}',
  observacoes_motoboy TEXT,
  status_coleta TEXT DEFAULT 'coletado',
  assinatura_cliente TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Permissoes de Leitura e Escrita
ALTER TABLE public.avaliacoes_upgrade ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vistorias_upgrade ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir leitura total de avaliacoes" ON public.avaliacoes_upgrade;
CREATE POLICY "Permitir leitura total de avaliacoes" ON public.avaliacoes_upgrade FOR SELECT USING (true);

DROP POLICY IF EXISTS "Permitir insercao de avaliacoes" ON public.avaliacoes_upgrade;
CREATE POLICY "Permitir insercao de avaliacoes" ON public.avaliacoes_upgrade FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir atualizacao de avaliacoes" ON public.avaliacoes_upgrade;
CREATE POLICY "Permitir atualizacao de avaliacoes" ON public.avaliacoes_upgrade FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir leitura total de vistorias" ON public.vistorias_upgrade;
CREATE POLICY "Permitir leitura total de vistorias" ON public.vistorias_upgrade FOR SELECT USING (true);

DROP POLICY IF EXISTS "Permitir insercao de vistorias" ON public.vistorias_upgrade;
CREATE POLICY "Permitir insercao de vistorias" ON public.vistorias_upgrade FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir atualizacao de vistorias" ON public.vistorias_upgrade;
CREATE POLICY "Permitir atualizacao de vistorias" ON public.vistorias_upgrade FOR UPDATE USING (true) WITH CHECK (true);
