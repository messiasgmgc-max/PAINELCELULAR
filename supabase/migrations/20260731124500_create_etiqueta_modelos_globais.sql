CREATE TABLE IF NOT EXISTS etiqueta_modelos_globais (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  colunas INTEGER NOT NULL DEFAULT 3,
  largura_pagina_mm NUMERIC(10,2) NOT NULL DEFAULT 210,
  altura_pagina_mm NUMERIC(10,2) NOT NULL DEFAULT 297,
  margem_mm NUMERIC(10,2) NOT NULL DEFAULT 8,
  espacamento_mm NUMERIC(10,2) NOT NULL DEFAULT 4,
  altura_minima_etiqueta_mm NUMERIC(10,2) NOT NULL DEFAULT 32,
  fonte_titulo_px INTEGER NOT NULL DEFAULT 12,
  fonte_texto_px INTEGER NOT NULL DEFAULT 10,
  fonte_preco_px INTEGER NOT NULL DEFAULT 13,
  mostrar_capacidade BOOLEAN NOT NULL DEFAULT true,
  mostrar_condicao BOOLEAN NOT NULL DEFAULT true,
  mostrar_imei BOOLEAN NOT NULL DEFAULT true,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'etiqueta_modelos_globais_colunas_chk'
  ) THEN
    ALTER TABLE etiqueta_modelos_globais
      ADD CONSTRAINT etiqueta_modelos_globais_colunas_chk CHECK (colunas BETWEEN 1 AND 3);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'etiqueta_modelos_globais_largura_chk'
  ) THEN
    ALTER TABLE etiqueta_modelos_globais
      ADD CONSTRAINT etiqueta_modelos_globais_largura_chk CHECK (largura_pagina_mm > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'etiqueta_modelos_globais_altura_chk'
  ) THEN
    ALTER TABLE etiqueta_modelos_globais
      ADD CONSTRAINT etiqueta_modelos_globais_altura_chk CHECK (altura_pagina_mm > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'etiqueta_modelos_globais_margem_chk'
  ) THEN
    ALTER TABLE etiqueta_modelos_globais
      ADD CONSTRAINT etiqueta_modelos_globais_margem_chk CHECK (margem_mm >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'etiqueta_modelos_globais_espacamento_chk'
  ) THEN
    ALTER TABLE etiqueta_modelos_globais
      ADD CONSTRAINT etiqueta_modelos_globais_espacamento_chk CHECK (espacamento_mm >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'etiqueta_modelos_globais_altura_etiqueta_chk'
  ) THEN
    ALTER TABLE etiqueta_modelos_globais
      ADD CONSTRAINT etiqueta_modelos_globais_altura_etiqueta_chk CHECK (altura_minima_etiqueta_mm > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'etiqueta_modelos_globais_fontes_chk'
  ) THEN
    ALTER TABLE etiqueta_modelos_globais
      ADD CONSTRAINT etiqueta_modelos_globais_fontes_chk CHECK (fonte_titulo_px > 0 AND fonte_texto_px > 0 AND fonte_preco_px > 0);
  END IF;
END $$;

ALTER TABLE etiqueta_modelos_globais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS etiqueta_modelos_globais_select_authenticated ON etiqueta_modelos_globais;
CREATE POLICY etiqueta_modelos_globais_select_authenticated
  ON etiqueta_modelos_globais
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS etiqueta_modelos_globais_insert_authenticated ON etiqueta_modelos_globais;
CREATE POLICY etiqueta_modelos_globais_insert_authenticated
  ON etiqueta_modelos_globais
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS etiqueta_modelos_globais_update_authenticated ON etiqueta_modelos_globais;
CREATE POLICY etiqueta_modelos_globais_update_authenticated
  ON etiqueta_modelos_globais
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_etiqueta_modelos_globais_ativo
  ON etiqueta_modelos_globais (ativo);

CREATE INDEX IF NOT EXISTS idx_etiqueta_modelos_globais_nome
  ON etiqueta_modelos_globais (nome);

CREATE OR REPLACE FUNCTION set_etiqueta_modelos_globais_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_etiqueta_modelos_globais_updated_at ON etiqueta_modelos_globais;
CREATE TRIGGER trg_set_etiqueta_modelos_globais_updated_at
  BEFORE UPDATE ON etiqueta_modelos_globais
  FOR EACH ROW
  EXECUTE FUNCTION set_etiqueta_modelos_globais_updated_at();

INSERT INTO etiqueta_modelos_globais (
  nome,
  colunas,
  largura_pagina_mm,
  altura_pagina_mm,
  margem_mm,
  espacamento_mm,
  altura_minima_etiqueta_mm,
  fonte_titulo_px,
  fonte_texto_px,
  fonte_preco_px,
  mostrar_capacidade,
  mostrar_condicao,
  mostrar_imei,
  ativo
)
VALUES
  ('A4 3 colunas', 3, 210, 297, 8, 4, 32, 12, 10, 13, true, true, true, true),
  ('A4 2 colunas', 2, 210, 297, 8, 4, 38, 13, 11, 14, true, true, true, true),
  ('A4 1 coluna', 1, 210, 297, 8, 5, 46, 15, 12, 16, true, true, true, true)
ON CONFLICT (nome) DO UPDATE
SET
  colunas = EXCLUDED.colunas,
  largura_pagina_mm = EXCLUDED.largura_pagina_mm,
  altura_pagina_mm = EXCLUDED.altura_pagina_mm,
  margem_mm = EXCLUDED.margem_mm,
  espacamento_mm = EXCLUDED.espacamento_mm,
  altura_minima_etiqueta_mm = EXCLUDED.altura_minima_etiqueta_mm,
  fonte_titulo_px = EXCLUDED.fonte_titulo_px,
  fonte_texto_px = EXCLUDED.fonte_texto_px,
  fonte_preco_px = EXCLUDED.fonte_preco_px,
  mostrar_capacidade = EXCLUDED.mostrar_capacidade,
  mostrar_condicao = EXCLUDED.mostrar_condicao,
  mostrar_imei = EXCLUDED.mostrar_imei,
  ativo = EXCLUDED.ativo;
