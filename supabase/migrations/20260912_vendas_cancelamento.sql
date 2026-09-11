-- ====================================================================
-- VENDA CANCELADA EM VEZ DE APAGADA
--
-- Desfazer venda, estornar atacado e devolver o único aparelho de uma venda
-- apagavam o registro. Agora a venda fica com status 'cancelado' e estes campos
-- dizem quando, quem e por quê (src/lib/vendas/situacao.ts).
-- ====================================================================

alter table public.vendas
  add column if not exists cancelada_em timestamptz,
  add column if not exists cancelada_por text,
  add column if not exists motivo_cancelamento text;
