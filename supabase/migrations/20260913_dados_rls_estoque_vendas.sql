-- ====================================================================
-- RLS POR LOJA — ESTOQUE, VENDAS, PEÇAS, MOVIMENTAÇÕES E BACKUPS
--
-- Estas tabelas já tinham RLS ligada em produção, mas as políticas foram
-- criadas à mão (não estavam versionadas) e fugiam do padrão da etapa 1
-- (20260911_rls_por_loja_etapa1.sql):
--   * "Isolamento por Loja" for all to public using (loja_id = get_user_loja_id());
--   * sem acesso do administrador da plataforma: o Super Admin via só a própria
--     loja ao somar vendas e aparelhos de todas as lojas;
--   * backups_estoque com políticas próprias de insert/select.
--
-- Conferido antes de escrever:
--   * nenhuma linha com loja_id nulo (aparelhos 367, vendas 2390, peças 1);
--   * nenhuma página pública (/avaliar, /coleta, /motoboy, /recibo, /upgrade)
--     lê essas tabelas com a chave anon; o recibo público e o bot passam por
--     rotas do servidor (service_role, que não passa pela RLS);
--   * SuperAdminTab lê vendas e aparelhos com a sessão do usuário: passa a
--     enxergar todas as lojas via eh_super_admin().
--
-- Regra (igual à etapa 1):
--   * usuário logado vê e altera só a própria loja;
--   * o administrador da plataforma vê e altera tudo;
--   * a chave anon não vê nada.
-- Idempotente: remove as políticas existentes dessas tabelas e recria.
-- ====================================================================

do $$
declare
  r record;
begin
  for r in
    select tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and tablename = any (array['aparelhos', 'vendas', 'pecas', 'movimentacoes_estoque', 'backups_estoque'])
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- --------------------------------------------------------------------
-- Tabelas do dia a dia: isolamento simples por loja.
-- --------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['aparelhos', 'vendas', 'pecas', 'movimentacoes_estoque']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "Isolamento por loja" on public.%I for all to authenticated
         using (loja_id = public.get_user_loja_id() or public.eh_super_admin())
         with check (loja_id = public.get_user_loja_id() or public.eh_super_admin())',
      t
    );
  end loop;
end $$;

-- --------------------------------------------------------------------
-- backups_estoque: a loja cria e consulta os próprios backups; alterar ou
-- apagar um backup (que é a rede de segurança do estoque) só o administrador
-- da plataforma. Mantém o que as políticas antigas permitiam.
-- --------------------------------------------------------------------
alter table public.backups_estoque enable row level security;

create policy "Backups: ver os da própria loja"
  on public.backups_estoque for select to authenticated
  using (loja_id = public.get_user_loja_id() or public.eh_super_admin());

create policy "Backups: criar na própria loja"
  on public.backups_estoque for insert to authenticated
  with check (loja_id = public.get_user_loja_id() or public.eh_super_admin());

create policy "Backups: só o administrador da plataforma altera ou apaga"
  on public.backups_estoque for all to authenticated
  using (public.eh_super_admin())
  with check (public.eh_super_admin());
