-- ====================================================================
-- TRILHA DE AUDITORIA NO BANCO
--
-- logs_sistema é escrito pelo aplicativo: quando uma tela esquece de registrar
-- (ou grava direto no Supabase), a mudança some sem rastro. Aqui cada INSERT,
-- UPDATE e DELETE em aparelhos, vendas, clientes, ordens_servico e
-- lojistas_devedores vira uma linha em public.auditoria, gravada por trigger:
-- antes, depois, campos alterados, quem, de onde e quando.
--
-- Contexto opcional (definido na mesma transação com set_config(..., true)):
--   app.origem        -> ex.: 'pdv', 'bot', 'importacao' (senão 'servidor' para
--                        service_role e 'web' para os demais)
--   app.lote_id       -> agrupa as linhas de uma operação em massa
--   app.usuario_id    -> quem pediu, quando a escrita vem do servidor
--   app.usuario_email
--
-- Ninguém insere, altera ou apaga pelo cliente: só o trigger grava.
-- ====================================================================

create table if not exists public.auditoria (
  id bigserial primary key,
  loja_id uuid,
  tabela text not null,
  registro_id text,
  operacao text not null,
  antes jsonb,
  depois jsonb,
  campos_alterados text[],
  usuario_id uuid,
  usuario_email text,
  origem text,
  lote_id text,
  criado_em timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'auditoria_operacao_check'
       and conrelid = 'public.auditoria'::regclass
  ) then
    alter table public.auditoria
      add constraint auditoria_operacao_check check (operacao in ('INSERT', 'UPDATE', 'DELETE'));
  end if;
end $$;

comment on table public.auditoria is
  'Trilha de auditoria preenchida só por trigger (registrar_auditoria). Ver 20260913_dados_auditoria.sql.';

-- Linha do tempo da loja e de um registro.
create index if not exists idx_auditoria_loja_criado on public.auditoria (loja_id, criado_em desc);
create index if not exists idx_auditoria_tabela_registro on public.auditoria (tabela, registro_id);
-- Busca por IMEI, inclusive de aparelho já apagado.
create index if not exists idx_auditoria_imei_depois on public.auditoria ((depois ->> 'imei')) where depois ->> 'imei' is not null;
create index if not exists idx_auditoria_imei_antes on public.auditoria ((antes ->> 'imei')) where antes ->> 'imei' is not null;

-- --------------------------------------------------------------------
-- Função do trigger. SECURITY DEFINER para gravar em auditoria sem dar
-- permissão de escrita a ninguém; search_path fixo.
-- --------------------------------------------------------------------
create or replace function public.registrar_auditoria()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_antes jsonb;
  v_depois jsonb;
  v_linha jsonb;
  v_campos text[];
  v_origem text;
  v_usuario_id uuid;
  v_usuario_email text;
  v_texto text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_antes := to_jsonb(old);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_depois := to_jsonb(new);
  end if;
  v_linha := coalesce(v_depois, v_antes);

  if tg_op = 'UPDATE' then
    -- updated_at muda em todo UPDATE (trigger touch_updated_at): não é mudança real.
    select array_agg(diferenca.chave order by diferenca.chave)
      into v_campos
      from (
        select coalesce(d.key, a.key) as chave
          from jsonb_each(v_depois) d
          full join jsonb_each(v_antes) a on a.key = d.key
         where d.value is distinct from a.value
      ) diferenca
     where diferenca.chave <> all (array['updated_at']);

    if v_campos is null then
      return null;
    end if;
  end if;

  v_origem := nullif(current_setting('app.origem', true), '');
  if v_origem is null then
    v_origem := case when coalesce(auth.role(), '') = 'service_role' then 'servidor' else 'web' end;
  end if;

  v_usuario_id := auth.uid();
  if v_usuario_id is null then
    v_texto := nullif(current_setting('app.usuario_id', true), '');
    if v_texto ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_usuario_id := v_texto::uuid;
    end if;
  end if;
  v_usuario_email := coalesce(nullif(auth.email(), ''), nullif(current_setting('app.usuario_email', true), ''));

  -- Falha na auditoria não pode derrubar a venda ou o cadastro: vira aviso no log do banco.
  begin
    insert into public.auditoria (
      loja_id, tabela, registro_id, operacao, antes, depois, campos_alterados,
      usuario_id, usuario_email, origem, lote_id
    ) values (
      case when v_linha ? 'loja_id' then (v_linha ->> 'loja_id')::uuid end,
      tg_table_name,
      v_linha ->> 'id',
      tg_op,
      v_antes,
      v_depois,
      v_campos,
      v_usuario_id,
      v_usuario_email,
      v_origem,
      nullif(current_setting('app.lote_id', true), '')
    );
  exception when others then
    raise warning 'auditoria: falha ao registrar % em %: %', tg_op, tg_table_name, sqlerrm;
  end;

  return null;
end;
$$;

revoke all on function public.registrar_auditoria() from public, anon, authenticated;

-- --------------------------------------------------------------------
-- Triggers nas tabelas auditadas.
-- --------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['aparelhos', 'vendas', 'clientes', 'ordens_servico', 'lojistas_devedores']
  loop
    execute format('drop trigger if exists trg_auditoria on public.%I', t);
    execute format(
      'create trigger trg_auditoria after insert or update or delete on public.%I
         for each row execute function public.registrar_auditoria()',
      t
    );
  end loop;
end $$;

-- --------------------------------------------------------------------
-- RLS: ler só a da própria loja (ou tudo, o administrador da plataforma).
-- Sem política de escrita e sem permissão de escrita para os papéis da API.
-- --------------------------------------------------------------------
alter table public.auditoria enable row level security;

drop policy if exists "Auditoria: ver a da própria loja" on public.auditoria;
create policy "Auditoria: ver a da própria loja"
  on public.auditoria for select to authenticated
  using (loja_id = public.get_user_loja_id() or public.eh_super_admin());

revoke all on public.auditoria from anon;
revoke insert, update, delete, truncate on public.auditoria from authenticated, service_role;
grant select on public.auditoria to authenticated, service_role;
revoke all on sequence public.auditoria_id_seq from anon, authenticated, service_role;

-- --------------------------------------------------------------------
-- Retenção (opcional, não agendada): apaga o que passou de p_dias.
-- Rodar manualmente ou por cron do servidor: select public.limpar_auditoria_antiga();
-- --------------------------------------------------------------------
create or replace function public.limpar_auditoria_antiga(p_dias integer default 400)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_apagados bigint;
begin
  if p_dias is null or p_dias < 90 then
    raise exception 'RETENCAO_INVALIDA: guarde pelo menos 90 dias de auditoria.';
  end if;

  delete from public.auditoria
   where criado_em < now() - make_interval(days => p_dias);
  get diagnostics v_apagados = row_count;
  return v_apagados;
end;
$$;

revoke all on function public.limpar_auditoria_antiga(integer) from public, anon, authenticated;
grant execute on function public.limpar_auditoria_antiga(integer) to service_role;
