-- ====================================================================
-- MIGRATION: WHATSAPP WEBHOOK ENHANCEMENTS & MULTI-TENANT ARCHITECTURE
-- ====================================================================

-- 1. Coluna de configuracoes persistidas em formato JSONB na tabela lojas
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS configuracoes JSONB DEFAULT '{}'::jsonb;

-- 2. Tabela de Permissões por WhatsApp
CREATE TABLE IF NOT EXISTS public.whatsapp_permissoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
  telefone TEXT NOT NULL,
  papel TEXT NOT NULL DEFAULT 'staff' CHECK (papel IN ('owner', 'staff', 'motoboy', 'nenhum')),
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT uq_whatsapp_permissoes_loja_telefone UNIQUE(loja_id, telefone)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_permissoes_loja_tel ON public.whatsapp_permissoes (loja_id, telefone);
ALTER TABLE public.whatsapp_permissoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir tudo whatsapp_permissoes" ON public.whatsapp_permissoes;
CREATE POLICY "Permitir tudo whatsapp_permissoes" ON public.whatsapp_permissoes FOR ALL USING (true) WITH CHECK (true);

-- 3. Extensões estruturadas para logs_sistema (Auditoria Precisa)
ALTER TABLE public.logs_sistema ADD COLUMN IF NOT EXISTS ator_telefone TEXT;
ALTER TABLE public.logs_sistema ADD COLUMN IF NOT EXISTS ator_papel TEXT;
ALTER TABLE public.logs_sistema ADD COLUMN IF NOT EXISTS valor_anterior JSONB;
ALTER TABLE public.logs_sistema ADD COLUMN IF NOT EXISTS valor_novo JSONB;

-- 4. Tabela de Ações Pendentes de Aprovação (Vendas acima do limite)
CREATE TABLE IF NOT EXISTS public.acoes_pendentes_aprovacao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL, -- 'venda', 'preco', etc.
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'rejeitado')),
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  criado_por_telefone TEXT,
  aprovado_em TIMESTAMP WITH TIME ZONE,
  aprovado_por TEXT
);

CREATE INDEX IF NOT EXISTS idx_acoes_pendentes_loja ON public.acoes_pendentes_aprovacao (loja_id, status);
ALTER TABLE public.acoes_pendentes_aprovacao ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir tudo acoes_pendentes_aprovacao" ON public.acoes_pendentes_aprovacao;
CREATE POLICY "Permitir tudo acoes_pendentes_aprovacao" ON public.acoes_pendentes_aprovacao FOR ALL USING (true) WITH CHECK (true);

-- 5. Gestão de Fiado / Atacado (Lojistas Devedores e Abatimentos)
CREATE TABLE IF NOT EXISTS public.lojistas_devedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  telefone TEXT,
  saldo_devedor NUMERIC(12,2) NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lojistas_devedores_loja ON public.lojistas_devedores (loja_id);
CREATE INDEX IF NOT EXISTS idx_lojistas_devedores_telefone ON public.lojistas_devedores (telefone);
ALTER TABLE public.lojistas_devedores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir tudo lojistas_devedores" ON public.lojistas_devedores;
CREATE POLICY "Permitir tudo lojistas_devedores" ON public.lojistas_devedores FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.historico_abatimentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
  lojista_id UUID NOT NULL REFERENCES public.lojistas_devedores(id) ON DELETE CASCADE,
  valor NUMERIC(12,2) NOT NULL,
  data TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ator_telefone TEXT,
  observacao TEXT
);

CREATE INDEX IF NOT EXISTS idx_historico_abatimentos_lojista ON public.historico_abatimentos (lojista_id);
ALTER TABLE public.historico_abatimentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir tudo historico_abatimentos" ON public.historico_abatimentos;
CREATE POLICY "Permitir tudo historico_abatimentos" ON public.historico_abatimentos FOR ALL USING (true) WITH CHECK (true);

-- 6. Cache de Anti-Flood Persistido (Prontidão para Cluster/VPS)
CREATE TABLE IF NOT EXISTS public.whatsapp_antiflood_cache (
  chave TEXT PRIMARY KEY,
  timestamp BIGINT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
