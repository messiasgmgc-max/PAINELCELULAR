-- ====================================================================
-- ESTOQUE — bucket privado `backups` para a cópia diária de cada loja
--
-- A rota /api/cron/backup-diario (Vercel Cron, 06:00 UTC) grava o backup de
-- cada loja ativa em `backups/<loja_id>/<AAAA-MM-DD>.json.gz` e apaga os
-- arquivos com mais de 30 dias. Ela usa a service role, que não passa pela RLS.
--
-- Regras:
--   * bucket PRIVADO: nada de URL pública; o download é por URL assinada
--     gerada no servidor (/api/backup/snapshots);
--   * usuário logado só LÊ a pasta da própria loja (o administrador da
--     plataforma lê todas);
--   * não há policy de INSERT/UPDATE/DELETE para usuários: um backup que o
--     próprio painel consegue apagar não protege contra um bug do painel.
--
-- Idempotente.
-- ====================================================================

insert into storage.buckets (id, name, public)
values ('backups', 'backups', false)
on conflict (id) do update set public = false;

drop policy if exists "Snapshots de backup: leitura da propria loja" on storage.objects;
create policy "Snapshots de backup: leitura da propria loja"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'backups'
    and (
      (storage.foldername(name))[1] = public.get_user_loja_id()::text
      or public.eh_super_admin()
    )
  );
