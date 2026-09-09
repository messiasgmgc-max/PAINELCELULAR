-- ====================================================================
-- MIGRATION: SEGURANÇA, IDEMPOTÊNCIA E MEMÓRIA DO BOT WHATSAPP
-- ====================================================================

-- 1. Deduplicação de mensagens do webhook (idempotência)
--    A Evolution API reentrega o webhook em caso de timeout/erro. Sem esta
--    trava, um retry registra a mesma venda duas vezes.
CREATE TABLE IF NOT EXISTS public.whatsapp_mensagens_processadas (
  message_id TEXT PRIMARY KEY,
  loja_id UUID REFERENCES public.lojas(id) ON DELETE CASCADE,
  remote_jid TEXT,
  processado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wpp_msg_processadas_data
  ON public.whatsapp_mensagens_processadas (processado_em);

ALTER TABLE public.whatsapp_mensagens_processadas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir tudo whatsapp_mensagens_processadas" ON public.whatsapp_mensagens_processadas;
CREATE POLICY "Permitir tudo whatsapp_mensagens_processadas"
  ON public.whatsapp_mensagens_processadas FOR ALL USING (true) WITH CHECK (true);

-- 2. Histórico de conversa persistido
--    Antes vivia num Map em memória, que não sobrevive entre invocações
--    serverless: o bot esquecia o contexto de forma aleatória.
CREATE TABLE IF NOT EXISTS public.whatsapp_conversa_historico (
  chave TEXT PRIMARY KEY,
  mensagens JSONB NOT NULL DEFAULT '[]'::jsonb,
  atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE public.whatsapp_conversa_historico ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir tudo whatsapp_conversa_historico" ON public.whatsapp_conversa_historico;
CREATE POLICY "Permitir tudo whatsapp_conversa_historico"
  ON public.whatsapp_conversa_historico FOR ALL USING (true) WITH CHECK (true);

-- 3. Limpeza: registros antigos não têm utilidade e só fazem a tabela crescer.
--    Rode periodicamente (cron do Supabase) ou manualmente:
--    DELETE FROM public.whatsapp_mensagens_processadas WHERE processado_em < NOW() - INTERVAL '7 days';
--    DELETE FROM public.whatsapp_conversa_historico   WHERE atualizado_em < NOW() - INTERVAL '1 day';
