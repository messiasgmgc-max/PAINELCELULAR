-- ====================================================================
-- MIGRATION: EMISSÃO FISCAL NFC-e (MOD. 65) E NF-e (MOD. 55) MULTI-TENANT
-- ====================================================================

-- 1. Dados fiscais e certificado digital persistidos na tabela lojas por tenant
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS dados_fiscais JSONB DEFAULT '{}'::jsonb;

-- 2. Tabela de histórico e controle de notas fiscais emitidas
CREATE TABLE IF NOT EXISTS public.notas_fiscais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id UUID REFERENCES public.lojas(id) ON DELETE CASCADE,
  venda_id TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'nfce', -- 'nfce' (mod 65 varejo) ou 'nfe' (mod 55 atacado/empresa)
  status TEXT NOT NULL DEFAULT 'pendente', -- 'pendente', 'processando', 'autorizada', 'erro_autorizacao', 'cancelada'
  numero INTEGER,
  serie TEXT DEFAULT '1',
  chave_acesso TEXT,
  protocolo TEXT,
  mensagem_sefaz TEXT,
  url_danfe TEXT,
  url_xml TEXT,
  caminho_danfe TEXT,
  caminho_xml_nota TEXT,
  xml_conteudo TEXT,
  valor_total NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  destinatario_nome TEXT,
  destinatario_documento TEXT,
  tentativas INTEGER DEFAULT 0,
  dados_emissao JSONB DEFAULT '{}'::jsonb,
  retorno_sefaz JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Índices para consultas rápidas por loja, venda e status
CREATE INDEX IF NOT EXISTS idx_notas_fiscais_loja_id ON public.notas_fiscais (loja_id);
CREATE INDEX IF NOT EXISTS idx_notas_fiscais_venda_id ON public.notas_fiscais (venda_id);
CREATE INDEX IF NOT EXISTS idx_notas_fiscais_status ON public.notas_fiscais (status);
CREATE INDEX IF NOT EXISTS idx_notas_fiscais_chave ON public.notas_fiscais (chave_acesso);
CREATE INDEX IF NOT EXISTS idx_notas_fiscais_created_at ON public.notas_fiscais (created_at DESC);

-- 4. Row Level Security (RLS)
ALTER TABLE public.notas_fiscais ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir operacoes em notas_fiscais" ON public.notas_fiscais;
CREATE POLICY "Permitir operacoes em notas_fiscais" ON public.notas_fiscais FOR ALL USING (true) WITH CHECK (true);
