-- ====================================================================
-- RLS POR LOJA — ETAPA 2B: motoboys, avaliacoes_upgrade, vistorias_upgrade
--
-- As páginas públicas /avaliar e /coleta passaram a usar
-- /api/publico/upgrade/[lojaId] (service_role, campos limitados). Com isso a
-- chave anon deixa de ler e alterar avaliações, vistorias (fotos, assinatura,
-- endereço do cliente) e motoboys (chave Pix) de todas as lojas.
-- Aplicar DEPOIS de publicar o código que usa a rota.
-- ====================================================================

do $$
declare
  r record;
begin
  for r in
    select tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and tablename = any (array['motoboys', 'avaliacoes_upgrade', 'vistorias_upgrade'])
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array['motoboys', 'avaliacoes_upgrade', 'vistorias_upgrade']
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
