-- ====================================================================
-- ESTOQUE — estado anterior completo na auditoria (desfazer operação em massa)
--
-- movimentacoes_estoque guardava em valor_anterior/valor_novo só os campos
-- do ciclo de vida (e alguns auditados). Para "Desfazer operação" (até 24 h
-- depois) é preciso saber como o aparelho estava inteiro antes do lote.
--
-- A partir desta migration, aplicarMudancaEstoque (src/lib/estoque/movimentacoes.ts)
-- grava em `antes` a linha completa do aparelho lida logo antes da escrita.
-- Linhas antigas e as gravadas pela função registrar_venda_atomica ficam com
-- null: a reversão usa valor_anterior nesses casos.
--
-- Idempotente. Os índices usados pela tela (loja_id + created_at, lote_id e
-- aparelho_id + created_at) já existem: idx_mov_estoque_loja_data,
-- idx_mov_estoque_lote e idx_mov_estoque_aparelho.
-- ====================================================================

alter table public.movimentacoes_estoque
  add column if not exists antes jsonb;

comment on column public.movimentacoes_estoque.antes is
  'Linha completa do aparelho antes da mudança. Usada para desfazer operações em massa (src/lib/estoque/desfazerLote.ts).';

-- O cliente PostgREST guarda o esquema em cache: sem recarregar, o insert com
-- a coluna nova é recusado (PGRST204) até o cache expirar.
notify pgrst, 'reload schema';
