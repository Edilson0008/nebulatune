-- NebulaTune — configuração do banco de dados (Supabase)
-- Cole tudo isto no SQL Editor do Supabase e clique em RUN (uma vez só).

-- 1) Cria o espaço de backups (privado). Cada usuário terá a própria pasta.
insert into storage.buckets (id, name, public)
values ('backups', 'backups', false)
on conflict (id) do nothing;

-- 2) Regras de acesso: cada pessoa só pode ler/escrever a própria pasta.
drop policy if exists "backups_select_own" on storage.objects;
drop policy if exists "backups_insert_own" on storage.objects;
drop policy if exists "backups_update_own" on storage.objects;
drop policy if exists "backups_delete_own" on storage.objects;

create policy "backups_select_own"
on storage.objects for select to authenticated
using (bucket_id = 'backups' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "backups_insert_own"
on storage.objects for insert to authenticated
with check (bucket_id = 'backups' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "backups_update_own"
on storage.objects for update to authenticated
using (bucket_id = 'backups' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'backups' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "backups_delete_own"
on storage.objects for delete to authenticated
using (bucket_id = 'backups' and (storage.foldername(name))[1] = auth.uid()::text);
