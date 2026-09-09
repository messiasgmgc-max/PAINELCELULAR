-- ====================================================================
-- MIGRATION: AÇÃO PENDENTE DO BOT (slot filling e confirmação)
-- ====================================================================

-- Quando falta um dado ("vendi o 13 pro pro Lucas" sem o valor), o bot
-- perguntava e DESCARTAVA o plano: a resposta "2500" chegava como mensagem
-- solta e ele não sabia do que se tratava. Aqui a ação fica guardada por alguns
-- minutos para ser completada — ou confirmada, no caso de valores altos.
CREATE TABLE IF NOT EXISTS public.whatsapp_acoes_pendentes (
  chave TEXT PRIMARY KEY,                 -- remoteJid:telefone do autor
  loja_id UUID REFERENCES public.lojas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('faltando_dados', 'confirmacao')),
  action TEXT NOT NULL,                   -- capacidade a executar
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  resumo TEXT,                            -- texto mostrado ao pedir confirmação
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wpp_acoes_pendentes_data
  ON public.whatsapp_acoes_pendentes (criado_em);

ALTER TABLE public.whatsapp_acoes_pendentes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir tudo whatsapp_acoes_pendentes" ON public.whatsapp_acoes_pendentes;
CREATE POLICY "Permitir tudo whatsapp_acoes_pendentes"
  ON public.whatsapp_acoes_pendentes FOR ALL USING (true) WITH CHECK (true);

-- Limpeza sugerida (cron do Supabase):
-- DELETE FROM public.whatsapp_acoes_pendentes WHERE criado_em < NOW() - INTERVAL '1 hour';
