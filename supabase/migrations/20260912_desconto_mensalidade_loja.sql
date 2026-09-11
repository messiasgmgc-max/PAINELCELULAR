-- ====================================================================
-- DESCONTO NA MENSALIDADE POR LOJA
--
-- O administrador da plataforma escolhe lojas e dá um percentual de desconto,
-- com prazo opcional. O PIX e o cartão (src/lib/planos/desconto.ts) aplicam o
-- desconto na cobrança. A própria loja não consegue alterar esses campos.
-- ====================================================================

alter table public.lojas
  add column if not exists desconto_percentual numeric(5,2) not null default 0,
  add column if not exists desconto_valido_ate date,
  add column if not exists desconto_motivo text;

alter table public.lojas drop constraint if exists lojas_desconto_percentual_faixa;
alter table public.lojas
  add constraint lojas_desconto_percentual_faixa check (desconto_percentual >= 0 and desconto_percentual <= 90);

-- Mesma função da etapa 1 da RLS, agora protegendo também o desconto.
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
     or new.desconto_percentual is distinct from old.desconto_percentual
     or new.desconto_valido_ate is distinct from old.desconto_valido_ate
     or new.desconto_motivo is distinct from old.desconto_motivo
     or (new.solicitacao_liberacao_status is distinct from old.solicitacao_liberacao_status
         and new.solicitacao_liberacao_status is distinct from 'pendente_aprovacao') then
    raise exception 'PLANO_PROTEGIDO: plano, vencimento, desconto e liberação só mudam pelo pagamento ou pelo suporte.' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function public.proteger_plano_da_loja() from public, anon, authenticated;
