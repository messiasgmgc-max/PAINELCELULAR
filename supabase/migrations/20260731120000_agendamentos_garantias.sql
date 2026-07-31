create extension if not exists pgcrypto;

create table if not exists public.agendamentos (
  id uuid primary key default gen_random_uuid(),
  "clienteId" uuid,
  "clienteNome" text not null default '',
  telefone text not null default '',
  data timestamptz not null,
  descricao text not null default '',
  "tecnicoId" uuid,
  "tecnicoNome" text,
  "aparelhoId" uuid,
  "aparelhoDescricao" text,
  status text not null default 'agendado',
  observacoes text default '',
  "dataCadastro" timestamptz not null default now(),
  ativo boolean not null default true,
  loja_id uuid
);

create table if not exists public.garantias (
  id uuid primary key default gen_random_uuid(),
  "osId" uuid,
  "osNumero" integer not null default 0,
  "clienteId" uuid,
  "clienteNome" text not null default '',
  "aparelhoDescricao" text not null default '',
  "dataInicio" date not null,
  "diasGarantia" integer not null default 30,
  descricao text default '',
  historico jsonb not null default '[]'::jsonb,
  ativo boolean not null default true,
  "dataCadastro" timestamptz not null default now(),
  loja_id uuid
);

alter table public.agendamentos enable row level security;
alter table public.garantias enable row level security;

drop policy if exists "agendamentos_authenticated_all" on public.agendamentos;
drop policy if exists "garantias_authenticated_all" on public.garantias;

create policy "agendamentos_authenticated_all"
  on public.agendamentos
  for all
  to authenticated
  using (true)
  with check (true);

create policy "garantias_authenticated_all"
  on public.garantias
  for all
  to authenticated
  using (true)
  with check (true);

-- Políticas adicionais para os demais módulos usados pelas abas
create table if not exists public.ordens_servico (
  id uuid primary key default gen_random_uuid(),
  "numeroOS" integer not null default 0,
  "clienteId" uuid,
  "clienteNome" text not null default '',
  "aparelhoId" uuid,
  "aparelhoMarca" text default '',
  "aparelhoModelo" text default '',
  defeito text default '',
  status text default 'em_andamento',
  "dataEntrada" timestamptz default now(),
  "precoVenda" numeric default 0,
  lucro numeric default 0,
  ativo boolean default true,
  loja_id uuid
);

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text,
  telefone text,
  ativo boolean default true,
  "dataCadastro" timestamptz default now(),
  loja_id uuid
);

create table if not exists public.tecnicos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text,
  ativo boolean default true,
  "dataCadastro" timestamptz default now(),
  loja_id uuid
);

alter table public.ordens_servico enable row level security;
alter table public.clientes enable row level security;
alter table public.tecnicos enable row level security;

drop policy if exists "ordens_servico_authenticated_all" on public.ordens_servico;
drop policy if exists "clientes_authenticated_all" on public.clientes;
drop policy if exists "tecnicos_authenticated_all" on public.tecnicos;

create policy "ordens_servico_authenticated_all"
  on public.ordens_servico
  for all
  to authenticated
  using (true)
  with check (true);

create policy "clientes_authenticated_all"
  on public.clientes
  for all
  to authenticated
  using (true)
  with check (true);

create policy "tecnicos_authenticated_all"
  on public.tecnicos
  for all
  to authenticated
  using (true)
  with check (true);
