ALTER TABLE vendas
ADD COLUMN IF NOT EXISTS pagamentos jsonb NOT NULL DEFAULT '[]'::jsonb;
