-- =============================================
-- Migration: Compradores Frequentes + Vendas melhorias
-- Data: 2026-09-05
-- =============================================

-- 1. Tabela de compradores frequentes (lojistas e clientes recorrentes)
--    Serve como fonte de autocomplete persistente no banco
CREATE TABLE IF NOT EXISTS compradores_frequentes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  tipo TEXT CHECK (tipo IN ('lojista', 'cliente')) DEFAULT 'lojista',
  telefone TEXT,
  total_compras INTEGER DEFAULT 1,
  ultimo_compra TIMESTAMP DEFAULT now(),
  loja_id UUID,
  created_at TIMESTAMP DEFAULT now()
);

-- Unique index para evitar duplicatas por nome+loja (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_compradores_nome_loja
  ON compradores_frequentes (LOWER(nome), loja_id);

-- Índice para busca rápida por tipo
CREATE INDEX IF NOT EXISTS idx_compradores_tipo ON compradores_frequentes(tipo);
CREATE INDEX IF NOT EXISTS idx_compradores_loja ON compradores_frequentes(loja_id);

-- 2. Novas colunas em vendas (idempotente com IF NOT EXISTS)
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS "tipoEntrega" TEXT DEFAULT 'Retirada';
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS vendedor TEXT;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS garantia TEXT DEFAULT '90 dias';
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS "descontoTotal" NUMERIC DEFAULT 0;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS itens JSONB DEFAULT '[]'::jsonb;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS loja_id UUID;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS "saldoDevedor" NUMERIC DEFAULT 0;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS "valorPago" NUMERIC DEFAULT 0;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS "dataVencimento" TIMESTAMP;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS "historicoAbatimentos" JSONB DEFAULT '[]'::jsonb;

-- 3. Flag para vendas que ainda não tiveram dados do cliente preenchidos
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS dados_cliente_pendente BOOLEAN DEFAULT false;

-- 4. Índices de performance para os novos filtros
CREATE INDEX IF NOT EXISTS idx_vendas_dados_pendente ON vendas(dados_cliente_pendente) WHERE dados_cliente_pendente = true;
CREATE INDEX IF NOT EXISTS idx_vendas_tipo_entrega ON vendas("tipoEntrega");
CREATE INDEX IF NOT EXISTS idx_vendas_loja ON vendas(loja_id);

-- 5. Aceitar métodos adicionais na coluna metodo de vendas
ALTER TABLE vendas DROP CONSTRAINT IF EXISTS vendas_metodo_check;
ALTER TABLE vendas ADD CONSTRAINT vendas_metodo_check
  CHECK (metodo IN ('dinheiro', 'cartao_credito', 'cartao_debito', 'pix', 'boleto', 'fiado', 'troca', 'trade_in'));

-- 6. Aceitar status 'parcial' em vendas
ALTER TABLE vendas DROP CONSTRAINT IF EXISTS vendas_status_check;
ALTER TABLE vendas ADD CONSTRAINT vendas_status_check
  CHECK (status IN ('pendente', 'pago', 'parcial', 'cancelado'));

-- 7. RLS para a nova tabela
ALTER TABLE compradores_frequentes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for compradores_frequentes" ON compradores_frequentes;
CREATE POLICY "Allow all for compradores_frequentes" ON compradores_frequentes
  FOR ALL USING (true) WITH CHECK (true);
