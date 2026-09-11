-- ====================================================================
-- RLS POR LOJA — ETAPA 2A: tabelas usadas só pelo bot e pelas rotas do servidor
--
-- Confirmado nos logs da API (10/09/2026): o bot grava com service_role,
-- que não passa pela RLS. Nenhuma tela do painel lê essas tabelas direto,
-- então fechar o acesso "USING (true)" não muda nada para o lojista e tira
-- da chave anon a leitura de conversas, permissões e fila de ações do bot.
--
-- Fica para a etapa 2B (páginas públicas passam a usar rotas do servidor):
-- motoboys, avaliacoes_upgrade, vistorias_upgrade.
-- ====================================================================

do $$
declare
  r record;
begin
  for r in
    select tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and tablename = any (array[
         'whatsapp_permissoes', 'whatsapp_acoes_pendentes', 'whatsapp_conversa_historico',
         'whatsapp_mensagens_processadas', 'acoes_pendentes_aprovacao',
         'historico_abatimentos', 'historico_cobrancas_atacado'
       ])
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- Com loja_id: o painel logado vê só a própria loja (hoje nenhuma tela usa).
do $$
declare
  t text;
begin
  foreach t in array array[
    'whatsapp_permissoes', 'whatsapp_acoes_pendentes', 'whatsapp_mensagens_processadas',
    'acoes_pendentes_aprovacao', 'historico_abatimentos', 'historico_cobrancas_atacado'
  ]
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

-- Sem loja_id: só o servidor (service_role) acessa.
alter table public.whatsapp_conversa_historico enable row level security;

-- Funções de gatilho não devem ser chamáveis pela API (/rest/v1/rpc).
revoke execute on function public.proteger_plano_da_loja() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
