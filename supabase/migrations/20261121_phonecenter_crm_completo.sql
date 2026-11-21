-- ============================================================================
-- PhoneCenterCRM — Migration Completa (Segurança por Loja, Pós-Venda IA,
-- Rodízio Avançado, Campanhas Anti-Ban, Telefonia, Metas, Kanban Grupos & Academy)
-- Idempotente: segura para executar múltiplas vezes no Supabase SQL Editor.
-- ============================================================================

-- 1. Expansão de crm_loja_configs (Tokens isolados por loja, SLA, Pós-Venda, Telefonia)
ALTER TABLE public.crm_loja_configs
  ADD COLUMN IF NOT EXISTS bridge_token TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS webhook_token TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS modo_tenant TEXT NOT NULL DEFAULT 'compartilhado',
  ADD COLUMN IF NOT EXISTS evo_team_id INTEGER,
  ADD COLUMN IF NOT EXISTS evo_inbox_id INTEGER,
  ADD COLUMN IF NOT EXISTS google_review_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS pos_venda_ativo BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS telefonia_ativo BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS telefonia_provedor TEXT NOT NULL DEFAULT 'click_to_call',
  ADD COLUMN IF NOT EXISTS telefonia_ramal_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS sla_alerta_minutos INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS sla_critico_minutos INTEGER NOT NULL DEFAULT 120;

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_loja_configs_bridge_token
  ON public.crm_loja_configs (bridge_token)
  WHERE bridge_token <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_loja_configs_webhook_token
  ON public.crm_loja_configs (webhook_token)
  WHERE webhook_token <> '';

-- 2. Modo de provisionamento em crm_tenants
ALTER TABLE public.crm_tenants
  ADD COLUMN IF NOT EXISTS modo TEXT NOT NULL DEFAULT 'compartilhado';

-- 3. Réguas do Motor de Pós-Venda Automático ("PhoneCenter Turbo")
CREATE TABLE IF NOT EXISTS public.crm_pos_venda_regras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (
    tipo IN (
      'pos_venda_d0',
      'satisfacao_d7',
      'upgrade_d90',
      'upgrade_d180',
      'upgrade_d300',
      'garantia_d15',
      'aniversario',
      'proposta_24h',
      'os_status'
    )
  ),
  ativo BOOLEAN NOT NULL DEFAULT false,
  dias_apos INTEGER NOT NULL DEFAULT 0,
  template_mensagem TEXT NOT NULL DEFAULT '',
  incluir_avaliacao_upgrade BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (loja_id, tipo)
);

CREATE INDEX IF NOT EXISTS idx_crm_pos_venda_regras_loja
  ON public.crm_pos_venda_regras (loja_id);

-- 4. Log idempotente de disparos do Pós-Venda Automático
CREATE TABLE IF NOT EXISTS public.crm_pos_venda_disparos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
  regra_tipo TEXT NOT NULL,
  referencia_id TEXT NOT NULL,
  cliente_nome TEXT DEFAULT '',
  cliente_telefone TEXT DEFAULT '',
  mensagem TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'enviado' CHECK (status IN ('enviado', 'erro', 'simulado')),
  erro TEXT DEFAULT '',
  enviado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (loja_id, regra_tipo, referencia_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_pos_venda_disparos_loja_created
  ON public.crm_pos_venda_disparos (loja_id, created_at DESC);

-- 5. Metas e Comissões por Vendedor (Ranking & Minha Evolução)
CREATE TABLE IF NOT EXISTS public.crm_metas_vendedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
  mes_referencia TEXT NOT NULL,
  vendedor_nome TEXT NOT NULL,
  meta_faturamento NUMERIC(12,2) NOT NULL DEFAULT 0,
  meta_quantidade INTEGER NOT NULL DEFAULT 0,
  comissao_percentual NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (loja_id, mes_referencia, vendedor_nome)
);

CREATE INDEX IF NOT EXISTS idx_crm_metas_vendedores_loja_mes
  ON public.crm_metas_vendedores (loja_id, mes_referencia);

-- 6. Regras de Rodízio Inteligente por Setor
CREATE TABLE IF NOT EXISTS public.crm_rodizio_regras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
  setor TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  estrategia TEXT NOT NULL DEFAULT 'round_robin',
  limite_simultaneo INTEGER NOT NULL DEFAULT 8,
  respeitar_online BOOLEAN NOT NULL DEFAULT true,
  horario_inicio TEXT NOT NULL DEFAULT '09:00',
  horario_fim TEXT NOT NULL DEFAULT '19:00',
  dias_semana JSONB NOT NULL DEFAULT '[1,2,3,4,5,6]'::jsonb,
  agentes JSONB NOT NULL DEFAULT '[]'::jsonb,
  ultimo_indice INTEGER NOT NULL DEFAULT -1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (loja_id, setor)
);

CREATE INDEX IF NOT EXISTS idx_crm_rodizio_regras_loja
  ON public.crm_rodizio_regras (loja_id);

-- 7. Campanhas Segmentadas com Regras Anti-Ban
CREATE TABLE IF NOT EXISTS public.crm_campanhas_antiban (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  segmento TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  delay_min_seg INTEGER NOT NULL DEFAULT 25,
  delay_max_seg INTEGER NOT NULL DEFAULT 65,
  limite_diario INTEGER NOT NULL DEFAULT 80,
  janela_inicio TEXT NOT NULL DEFAULT '09:00',
  janela_fim TEXT NOT NULL DEFAULT '19:00',
  status TEXT NOT NULL DEFAULT 'rascunho',
  total_alvo INTEGER NOT NULL DEFAULT 0,
  total_enviados INTEGER NOT NULL DEFAULT 0,
  total_erros INTEGER NOT NULL DEFAULT 0,
  ultimo_disparo_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_campanhas_antiban_loja_created
  ON public.crm_campanhas_antiban (loja_id, created_at DESC);

-- 8. Telefonia / CRM Phone (Chamadas, Popup Cliente 360º & Anotações)
CREATE TABLE IF NOT EXISTS public.crm_chamadas_telefonia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
  direcao TEXT NOT NULL DEFAULT 'entrada' CHECK (direcao IN ('entrada', 'saida')),
  telefone TEXT NOT NULL,
  cliente_id UUID,
  cliente_nome TEXT DEFAULT '',
  agente_nome TEXT DEFAULT '',
  ramal TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'tocando' CHECK (status IN ('tocando', 'em_andamento', 'finalizada', 'perdida')),
  duracao_seg INTEGER NOT NULL DEFAULT 0,
  anotacoes TEXT DEFAULT '',
  gravacao_url TEXT DEFAULT '',
  protocolo_externo TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_chamadas_telefonia_loja_created
  ON public.crm_chamadas_telefonia (loja_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_chamadas_telefonia_protocolo
  ON public.crm_chamadas_telefonia (loja_id, protocolo_externo)
  WHERE protocolo_externo <> '';

-- 9. Kanban de Grupos WhatsApp (Atacado & Fornecedores)
CREATE TABLE IF NOT EXISTS public.crm_kanban_grupos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
  grupo_jid TEXT NOT NULL,
  grupo_nome TEXT NOT NULL,
  coluna TEXT NOT NULL DEFAULT 'fornecedores' CHECK (coluna IN ('fornecedores', 'atacado_vip', 'cotacao_dia', 'fechados')),
  notas TEXT DEFAULT '',
  ultimo_disparo_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (loja_id, grupo_jid)
);

CREATE INDEX IF NOT EXISTS idx_crm_kanban_grupos_loja
  ON public.crm_kanban_grupos (loja_id);

-- 10. CRM Academy (Playbooks & Treinamentos da Equipe)
CREATE TABLE IF NOT EXISTS public.crm_academy_conteudos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'vendas',
  tipo TEXT NOT NULL DEFAULT 'guia',
  duracao TEXT NOT NULL DEFAULT '5 min',
  video_url TEXT DEFAULT '',
  conteudo_markdown TEXT DEFAULT '',
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_academy_conteudos_loja
  ON public.crm_academy_conteudos (loja_id, ordem ASC);

-- Habilita RLS em todas as novas tabelas (acesso server-side via supabaseAdmin)
ALTER TABLE public.crm_pos_venda_regras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_pos_venda_disparos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_metas_vendedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_rodizio_regras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_campanhas_antiban ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_chamadas_telefonia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_kanban_grupos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_academy_conteudos ENABLE ROW LEVEL SECURITY;
