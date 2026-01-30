-- Create vendas table
CREATE TABLE IF NOT EXISTS vendas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  osId UUID REFERENCES ordens_servico(id) ON DELETE SET NULL,
  osNumero INTEGER,
  clienteId UUID REFERENCES clientes(id) ON DELETE CASCADE,
  clienteNome TEXT NOT NULL,
  aparelhoDescricao TEXT NOT NULL,
  valor INTEGER NOT NULL,
  custo INTEGER NOT NULL,
  lucro INTEGER NOT NULL,
  percentualLucro DECIMAL(5,2) DEFAULT 0,
  dataPagamento TIMESTAMP NOT NULL,
  status TEXT CHECK (status IN ('pendente', 'pago', 'cancelado')) DEFAULT 'pendente',
  metodo TEXT CHECK (metodo IN ('dinheiro', 'cartao_credito', 'cartao_debito', 'pix', 'boleto')) DEFAULT 'dinheiro',
  descricao TEXT,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_vendas_cliente ON vendas(clienteId);
CREATE INDEX idx_vendas_data ON vendas(dataPagamento);
CREATE INDEX idx_vendas_status ON vendas(status);
CREATE INDEX idx_vendas_metodo ON vendas(metodo);
CREATE INDEX idx_vendas_ativo ON vendas(ativo);
