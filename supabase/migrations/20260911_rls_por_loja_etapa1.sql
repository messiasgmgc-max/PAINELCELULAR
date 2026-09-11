-- ====================================================================
-- RLS POR LOJA — ETAPA 1
--
-- Várias tabelas tinham políticas "USING (true)" para o papel public, que
-- inclui a chave anon publicada no navegador. Na prática qualquer pessoa:
--   * trocava o próprio papel para super_admin em perfis (tomada de conta);
--   * lia e alterava todas as lojas (token do Mercado Pago, dados fiscais,
--     plano e vencimento);
--   * lia os clientes, pagamentos, logs e sessões de WhatsApp de todas as lojas.
--
-- Regra desta etapa:
--   * usuário logado vê e altera só a própria loja;
--   * o administrador da plataforma (eh_super_admin) vê e altera tudo;
--   * a chave anon não vê nada nessas tabelas;
--   * rotas do servidor e o bot usam service_role, que não passa pela RLS.
--
-- Fica para a etapa 2 (depende de confirmar que o bot usa service_role e de
-- mover as páginas públicas para rotas do servidor): motoboys,
-- avaliacoes_upgrade, vistorias_upgrade e as tabelas usadas só pelo bot
-- (whatsapp_permissoes, whatsapp_acoes_pendentes, whatsapp_conversa_historico,
-- whatsapp_mensagens_processadas, acoes_pendentes_aprovacao,
-- historico_abatimentos, historico_cobrancas_atacado).
-- ====================================================================

-- --------------------------------------------------------------------
-- Quem é o administrador da plataforma. Espelha checkIsSuperAdmin
-- (src/lib/utils.ts): papel super_admin ou o e-mail mestre.
-- SECURITY DEFINER para ler perfis sem depender das políticas de perfis.
-- --------------------------------------------------------------------
create or replace function public.eh_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    lower(coalesce(auth.email(), '')) = 'guiguigamer125@gmail.com'
    or exists (
      select 1
        from public.perfis p
       where p.role = 'super_admin'
         and (p.id = auth.uid() or lower(p.email) = lower(auth.email()))
    ),
    false
  );
$$;

revoke all on function public.eh_super_admin() from public;
grant execute on function public.eh_super_admin() to anon, authenticated, service_role;

-- --------------------------------------------------------------------
-- Remove as políticas atuais das tabelas desta etapa (as abertas e as
-- duplicadas) para recriar um conjunto único e legível.
-- --------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and tablename = any (array[
         'perfis', 'lojas', 'clientes', 'taxas_maquininha', 'tecnicos', 'garantias',
         'ordens_servico', 'agendamentos', 'compradores_frequentes', 'lojistas_devedores',
         'notas_fiscais', 'whatsapp_sessions', 'historico_pagamentos_planos', 'logs_sistema'
       ])
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- --------------------------------------------------------------------
-- Tabelas com loja_id: isolamento simples por loja.
-- --------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'clientes', 'taxas_maquininha', 'tecnicos', 'garantias', 'ordens_servico', 'agendamentos',
    'compradores_frequentes', 'lojistas_devedores', 'notas_fiscais', 'whatsapp_sessions'
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

-- --------------------------------------------------------------------
-- perfis: cada um vê o próprio e os da sua loja; só o administrador da
-- plataforma cria, altera papel/loja ou remove. O cadastro automático
-- (handle_new_user) e as rotas do servidor não passam pela RLS.
-- --------------------------------------------------------------------
alter table public.perfis enable row level security;

create policy "Perfis: ver o próprio e os da loja"
  on public.perfis for select to authenticated
  using (
    id = auth.uid()
    or lower(email) = lower(auth.email())
    or loja_id = public.get_user_loja_id()
    or public.eh_super_admin()
  );

create policy "Perfis: só o administrador da plataforma altera"
  on public.perfis for all to authenticated
  using (public.eh_super_admin())
  with check (public.eh_super_admin());

-- --------------------------------------------------------------------
-- lojas: ver e editar a própria; criar e apagar só o administrador.
-- --------------------------------------------------------------------
alter table public.lojas enable row level security;

create policy "Lojas: ver a própria"
  on public.lojas for select to authenticated
  using (id = public.get_user_loja_id() or public.eh_super_admin());

create policy "Lojas: editar a própria"
  on public.lojas for update to authenticated
  using (id = public.get_user_loja_id() or public.eh_super_admin())
  with check (id = public.get_user_loja_id() or public.eh_super_admin());

create policy "Lojas: criar e apagar só o administrador da plataforma"
  on public.lojas for all to authenticated
  using (public.eh_super_admin())
  with check (public.eh_super_admin());

-- A loja edita nome, endereço, Pix, tabela de upgrade etc., mas não o próprio
-- plano. Plano, vencimento e liberação mudam pelo pagamento (servidor) ou
-- pelo administrador. Duas exceções que o painel já usa: marcar o plano como
-- vencido quando a data passou e pedir liberação enviando comprovante.
create or replace function public.proteger_plano_da_loja()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role'
     or auth.uid() is null and current_user in ('postgres', 'supabase_admin')
     or public.eh_super_admin() then
    return new;
  end if;

  if new.plano_status is distinct from old.plano_status and new.plano_status is distinct from 'vencido' then
    raise exception 'PLANO_PROTEGIDO: o status do plano só muda pelo pagamento ou pelo suporte.' using errcode = '42501';
  end if;

  if new.data_vencimento is distinct from old.data_vencimento
     or new.valor_mensalidade is distinct from old.valor_mensalidade
     or new.plano_tipo is distinct from old.plano_tipo
     or new.periodo_cobranca is distinct from old.periodo_cobranca
     or new.plano_trial_ate is distinct from old.plano_trial_ate
     or new.plano_trial_usado is distinct from old.plano_trial_usado
     or new.trial_planos_usados is distinct from old.trial_planos_usados
     or new.ativo is distinct from old.ativo
     or new.api_key is distinct from old.api_key
     or (new.solicitacao_liberacao_status is distinct from old.solicitacao_liberacao_status
         and new.solicitacao_liberacao_status is distinct from 'pendente_aprovacao') then
    raise exception 'PLANO_PROTEGIDO: plano, vencimento e liberação só mudam pelo pagamento ou pelo suporte.' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_lojas_proteger_plano on public.lojas;
create trigger trg_lojas_proteger_plano
  before update on public.lojas
  for each row execute function public.proteger_plano_da_loja();

-- Páginas públicas (/avaliar, /coleta, /motoboy) leem só isto da loja.
create or replace function public.loja_publica(p_loja_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', l.id,
    'nome', l.nome,
    'logo', l.logo_url,
    'logo_url', l.logo_url,
    'telefone', l.telefone,
    'tabela_upgrade', l.tabela_upgrade,
    'regras_upgrade', l.regras_upgrade,
    'upgrade_ativo', l.upgrade_ativo,
    'upgrade_mensagem_whatsapp', l.upgrade_mensagem_whatsapp
  )
    from public.lojas l
   where l.id = p_loja_id
     and l.ativo is distinct from false;
$$;

revoke all on function public.loja_publica(uuid) from public;
grant execute on function public.loja_publica(uuid) to anon, authenticated, service_role;

-- --------------------------------------------------------------------
-- historico_pagamentos_planos: a loja vê os seus e envia comprovante
-- (pendente); aprovar ou alterar é do servidor ou do administrador.
-- --------------------------------------------------------------------
alter table public.historico_pagamentos_planos enable row level security;

create policy "Pagamentos: ver os da própria loja"
  on public.historico_pagamentos_planos for select to authenticated
  using (loja_id = public.get_user_loja_id() or public.eh_super_admin());

create policy "Pagamentos: loja envia comprovante"
  on public.historico_pagamentos_planos for insert to authenticated
  with check (
    (loja_id = public.get_user_loja_id() and coalesce(status, '') in ('pendente_aprovacao', 'pendente'))
    or public.eh_super_admin()
  );

create policy "Pagamentos: só o administrador da plataforma altera"
  on public.historico_pagamentos_planos for all to authenticated
  using (public.eh_super_admin())
  with check (public.eh_super_admin());

-- --------------------------------------------------------------------
-- logs_sistema: ver os da própria loja; registrar na própria loja.
-- --------------------------------------------------------------------
alter table public.logs_sistema enable row level security;

create policy "Logs: ver os da própria loja"
  on public.logs_sistema for select to authenticated
  using (loja_id = public.get_user_loja_id() or public.eh_super_admin());

create policy "Logs: registrar na própria loja"
  on public.logs_sistema for insert to authenticated
  with check (loja_id is null or loja_id = public.get_user_loja_id() or public.eh_super_admin());

create policy "Logs: só o administrador da plataforma apaga"
  on public.logs_sistema for delete to authenticated
  using (public.eh_super_admin());
