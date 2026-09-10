-- ====================================================================
-- MIGRATION: backups de estoque no banco + RLS em whatsapp_logs
-- Itens 5 e 6 do roteiro de correção da baixa em massa de 10/09/2026.
--
-- NÃO recria nada do que já foi aplicado (data_saida, motivo_saida,
-- updated_at + trigger em aparelhos; tabela movimentacoes_estoque).
-- ====================================================================


-- --------------------------------------------------------------------
-- 5. backups_estoque
-- --------------------------------------------------------------------
-- Os pontos de backup viviam só no localStorage do navegador: não existiam
-- em outro dispositivo e sumiam ao limpar o cache — ou seja, falhavam
-- justamente quando mais se precisava deles.
create table if not exists public.backups_estoque (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete cascade,
  motivo text not null,
  criado_em timestamptz not null default now(),
  total_aparelhos integer not null default 0,
  criado_por text,
  payload jsonb not null
);

create index if not exists idx_backups_estoque_loja_criado
  on public.backups_estoque (loja_id, criado_em desc);

alter table public.backups_estoque enable row level security;

-- A loja lê e cria os próprios backups. Não há policy de UPDATE nem DELETE
-- para clientes: um backup que o próprio painel consegue alterar ou apagar
-- não protege contra um bug do painel. Limpeza de backups antigos, se um dia
-- for necessária, roda com service role.
drop policy if exists "Backups: leitura da propria loja" on public.backups_estoque;
create policy "Backups: leitura da propria loja"
  on public.backups_estoque
  for select
  using (loja_id = get_user_loja_id());

drop policy if exists "Backups: criacao na propria loja" on public.backups_estoque;
create policy "Backups: criacao na propria loja"
  on public.backups_estoque
  for insert
  with check (loja_id = get_user_loja_id());


-- --------------------------------------------------------------------
-- 6. whatsapp_logs sem RLS
-- --------------------------------------------------------------------
-- Com RLS desligado, qualquer um com a chave anon lia e escrevia todas as
-- linhas (628 em 10/09/2026, todas com loja_id preenchido).
--
-- Habilitar RLS sem policy bloqueia todo acesso, então a policy vem na
-- mesma migration, espelhando "Isolamento por Loja" de aparelhos.
--
-- Impacto conhecido:
--  - WhatsappTab (painel) lê e escuta em tempo real com sessão autenticada:
--    continua vendo só a própria loja.
--  - Webhook do bot e /api/atacado/notificar-venda gravam com service role,
--    que ignora RLS. ATENÇÃO: o webhook cai para a chave anon se
--    SUPABASE_SERVICE_ROLE_KEY não estiver definida no ambiente — nesse caso
--    as inserções de log do bot passam a ser recusadas (sem derrubar o bot).
alter table public.whatsapp_logs enable row level security;

drop policy if exists "Isolamento por Loja" on public.whatsapp_logs;
create policy "Isolamento por Loja"
  on public.whatsapp_logs
  for all
  using (loja_id = get_user_loja_id())
  with check (loja_id = get_user_loja_id());


-- --------------------------------------------------------------------
-- Fora do roteiro, mesma falha: cópia do estoque exposta
-- --------------------------------------------------------------------
-- backup_aparelhos_20260910 foi criada durante a restauração do incidente e
-- tem as 317 linhas do estoque, legíveis por qualquer um com a chave anon
-- (o advisor de segurança do Supabase acusa como ERROR).
--
-- RLS sem nenhuma policy deixa a tabela acessível só para service role
-- (SQL Editor, scripts de restauração), que é o uso de um backup.
-- Se a tabela já não for necessária, apagá-la resolve igualmente.
alter table public.backup_aparelhos_20260910 enable row level security;
