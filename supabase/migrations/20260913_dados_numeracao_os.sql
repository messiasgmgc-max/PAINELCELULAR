-- ====================================================================
-- NUMERAÇÃO SEQUENCIAL DE OS POR LOJA
--
-- A coluna real é ordens_servico."numeroOS" (integer not null). Em produção o
-- default é uma sequência global (ordens_servico_numeroOS_seq): a OS de uma
-- loja pulava números por causa das outras lojas. O repositório ainda dizia
-- default 0 (20260731120000_agendamentos_garantias.sql), e o app remove
-- numeroOS antes do insert (src/hooks/useOrdensServico.ts).
--
-- Agora:
--   * contadores_loja guarda o último número de cada loja;
--   * trigger BEFORE INSERT numera a OS com update ... returning no contador
--     (a linha fica travada até o fim da transação: duas OS simultâneas da
--     mesma loja nunca recebem o mesmo número);
--   * backfill das OS existentes na ordem de entrada ("dataEntrada"; a tabela
--     não tem created_at), só na primeira vez;
--   * índice único (loja_id, "numeroOS");
--   * o número não muda por edição do painel.
-- ====================================================================

create table if not exists public.contadores_loja (
  loja_id uuid not null references public.lojas (id) on delete cascade,
  chave text not null,
  ultimo bigint not null default 0,
  atualizado_em timestamptz not null default now(),
  primary key (loja_id, chave)
);

comment on table public.contadores_loja is
  'Contadores sequenciais por loja (ex.: chave ordens_servico). Escrita só pelas funções proximo_numero_loja e numerar_ordem_servico.';

alter table public.contadores_loja enable row level security;

drop policy if exists "Contadores: ver os da própria loja" on public.contadores_loja;
create policy "Contadores: ver os da própria loja"
  on public.contadores_loja for select to authenticated
  using (loja_id = public.get_user_loja_id() or public.eh_super_admin());

revoke all on public.contadores_loja from anon;
revoke insert, update, delete, truncate on public.contadores_loja from authenticated;

-- --------------------------------------------------------------------
-- Próximo número de um contador da loja.
-- --------------------------------------------------------------------
create or replace function public.proximo_numero_loja(p_loja_id uuid, p_chave text)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_numero bigint;
begin
  if p_loja_id is null or coalesce(btrim(p_chave), '') = '' then
    raise exception 'CONTADOR_INVALIDO: loja e chave são obrigatórias.';
  end if;

  update public.contadores_loja
     set ultimo = ultimo + 1,
         atualizado_em = now()
   where loja_id = p_loja_id
     and chave = p_chave
  returning ultimo into v_numero;

  if v_numero is null then
    insert into public.contadores_loja as c (loja_id, chave, ultimo)
    values (p_loja_id, p_chave, 1)
    on conflict (loja_id, chave) do update
       set ultimo = c.ultimo + 1,
           atualizado_em = now()
    returning ultimo into v_numero;
  end if;

  return v_numero;
end;
$$;

revoke all on function public.proximo_numero_loja(uuid, text) from public, anon, authenticated;
grant execute on function public.proximo_numero_loja(uuid, text) to service_role;

-- --------------------------------------------------------------------
-- Backfill (só se o contador de OS nunca foi criado): renumera por loja na
-- ordem de entrada e inicia os contadores no maior número.
-- --------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from public.contadores_loja where chave = 'ordens_servico') then
    perform set_config('app.origem', 'migracao_numeracao_os', true);

    with ordem as (
      select id,
             row_number() over (partition by loja_id order by "dataEntrada" asc nulls last, id) as numero
        from public.ordens_servico
       where loja_id is not null
    )
    update public.ordens_servico o
       set "numeroOS" = ordem.numero
      from ordem
     where ordem.id = o.id
       and o."numeroOS" is distinct from ordem.numero;

    insert into public.contadores_loja as c (loja_id, chave, ultimo)
    select loja_id, 'ordens_servico', max("numeroOS")
      from public.ordens_servico
     where loja_id is not null
     group by loja_id
    on conflict (loja_id, chave) do update
       set ultimo = greatest(c.ultimo, excluded.ultimo),
           atualizado_em = now();
  end if;
end $$;

create unique index if not exists uq_ordens_servico_loja_numero
  on public.ordens_servico (loja_id, "numeroOS");

-- --------------------------------------------------------------------
-- BEFORE INSERT: número da loja. OS sem loja (não deveria existir: a coluna
-- tem default) fica com o valor da sequência antiga.
-- --------------------------------------------------------------------
create or replace function public.numerar_ordem_servico()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.loja_id is null then
    return new;
  end if;

  -- Loja sem contador (ex.: OS criada antes desta migration em outra base):
  -- começa depois da maior OS que a loja já tem.
  if not exists (
    select 1 from public.contadores_loja
     where loja_id = new.loja_id and chave = 'ordens_servico'
  ) then
    insert into public.contadores_loja (loja_id, chave, ultimo)
    select new.loja_id, 'ordens_servico', coalesce(max(o."numeroOS"), 0)
      from public.ordens_servico o
     where o.loja_id = new.loja_id
    on conflict (loja_id, chave) do nothing;
  end if;

  new."numeroOS" := public.proximo_numero_loja(new.loja_id, 'ordens_servico');
  return new;
end;
$$;

revoke all on function public.numerar_ordem_servico() from public, anon, authenticated;

drop trigger if exists trg_ordens_servico_numerar on public.ordens_servico;
create trigger trg_ordens_servico_numerar
  before insert on public.ordens_servico
  for each row execute function public.numerar_ordem_servico();

-- --------------------------------------------------------------------
-- BEFORE UPDATE: o número não muda pelo painel. Servidor, administrador da
-- plataforma e manutenção direta no banco podem corrigir.
-- SECURITY INVOKER para current_user ser quem executa.
-- --------------------------------------------------------------------
create or replace function public.proteger_numero_ordem_servico()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new."numeroOS" is distinct from old."numeroOS"
     and coalesce(auth.role(), '') <> 'service_role'
     and not (auth.uid() is null and current_user in ('postgres', 'supabase_admin'))
     and not public.eh_super_admin() then
    new."numeroOS" := old."numeroOS";
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ordens_servico_proteger_numero on public.ordens_servico;
create trigger trg_ordens_servico_proteger_numero
  before update on public.ordens_servico
  for each row execute function public.proteger_numero_ordem_servico();
