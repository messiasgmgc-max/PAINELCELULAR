CREATE TABLE IF NOT EXISTS taxas_maquininha (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  loja_id UUID NOT NULL REFERENCES lojas(id) ON DELETE CASCADE,
  nome TEXT,
  parcelas INTEGER NOT NULL DEFAULT 1,
  porcentagem DECIMAL(5,2) NOT NULL,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_taxas_maquininha_loja_id ON taxas_maquininha(loja_id);
CREATE INDEX IF NOT EXISTS idx_taxas_maquininha_ativo ON taxas_maquininha(ativo);
CREATE INDEX IF NOT EXISTS idx_taxas_maquininha_parcelas ON taxas_maquininha(parcelas);
