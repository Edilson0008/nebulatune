-- NebulaTune — NOVO sistema de dados (tabelas + RLS)
-- Cole TUDO isto no SQL Editor do Supabase e clique em RUN (uma vez só).
-- É seguro rodar de novo se der erro: usa IF NOT EXISTS / drop policy.

-- 1) Bucket privado para os ARQUIVOS DE SOM/CAPA (o texto fica nas tabelas).
insert into storage.buckets (id, name, public)
values ('backups', 'backups', false)
on conflict (id) do nothing;

-- 2) TABELAS --------------------------------------------------------------

-- Ajustes do usuário (tema, nome, bio, avatar, velocidade…) + equalizador.
create table if not exists public.user_settings (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  settings  jsonb not null default '{}'::jsonb,
  equalizer jsonb,
  updated_at timestamptz not null default now()
);

-- Biblioteca: cada música é UMA LINHA. Excluir a música = apagar a linha
-- (a exclusão vale em todos os aparelhos, sem "ressuscitar").
create table if not exists public.tracks (
  user_id     uuid not null references auth.users(id) on delete cascade,
  id          text not null,
  title       text not null default '',
  artist      text not null default '',
  album       text not null default '',
  duration    integer not null default 0,
  cover       jsonb,
  cover_remote text,
  added_at    bigint not null default 0,
  plays       integer not null default 0,
  play_days   jsonb not null default '{}'::jsonb,
  fav         boolean not null default false,
  audio_key   text,
  cover_key   text,
  has_audio   boolean not null default false,
  has_cover   boolean not null default false,
  updated_at  timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.playlists (
  user_id    uuid not null references auth.users(id) on delete cascade,
  id         text not null,
  name       text not null default '',
  created_at bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- Músicas de cada playlist (tirar música da playlist = apagar a linha).
create table if not exists public.playlist_tracks (
  user_id     uuid not null references auth.users(id) on delete cascade,
  playlist_id text not null,
  track_id    text not null,
  position    integer not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (user_id, playlist_id, track_id)
);

create table if not exists public.pet_stats (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  touches    integer not null default 0,
  hearts     integer not null default 0,
  sleeps     integer not null default 0,
  scares     integer not null default 0,
  meows      integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.lyric_sync (
  user_id    uuid not null references auth.users(id) on delete cascade,
  track_id   text not null,
  "offset"   real not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, track_id)
);

-- Letras salvas MANUALMENTE (busca manual do usuário). Guarda o resultado para
-- que os OUTROS aparelhos não precisem buscar a letra de novo.
create table if not exists public.lyrics (
  user_id    uuid not null references auth.users(id) on delete cascade,
  track_id   text not null,
  data       jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, track_id)
);

-- 3) SEGURANÇA (RLS): cada usuário só vê/altera as SUAS linhas -------------

alter table public.user_settings enable row level security;
alter table public.tracks enable row level security;
alter table public.playlists enable row level security;
alter table public.playlist_tracks enable row level security;
alter table public.pet_stats enable row level security;
alter table public.lyric_sync enable row level security;
alter table public.lyrics enable row level security;

do $$
declare t text;
begin
  foreach t in array array['user_settings','tracks','playlists','playlist_tracks','pet_stats','lyric_sync','lyrics'] loop
    execute format('drop policy if exists "%s_select_own" on public.%s', t, t);
    execute format('drop policy if exists "%s_insert_own" on public.%s', t, t);
    execute format('drop policy if exists "%s_update_own" on public.%s', t, t);
    execute format('drop policy if exists "%s_delete_own" on public.%s', t, t);
    execute format('create policy "%s_select_own" on public.%s for select to authenticated using (user_id = auth.uid())', t, t);
    execute format('create policy "%s_insert_own" on public.%s for insert to authenticated with check (user_id = auth.uid())', t, t);
    execute format('create policy "%s_update_own" on public.%s for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t, t);
    execute format('create policy "%s_delete_own" on public.%s for delete to authenticated using (user_id = auth.uid())', t, t);
  end loop;
end $$;

-- 4) POLÍTICAS DO STORAGE (arquivos de som/capa: cada um só a sua pasta) ---
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

-- 5) TABELA DE DADOS DO USUÁRIO (perfil genérico: tudo que for só do dono) ---
-- user_id é a chave; a linha é criada AUTOMATICAMENTE no cadastro (trigger).
create table if not exists public.user_data (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  payload   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 6) TRIGGER: quando um usuário é criado via auth.signUp (e-mail/senha),
-- cria a linha inicial em user_data e em user_settings automaticamente. -----
-- security definer: roda como dona da função (postgres), então não é barrado
-- pelo RLS no momento do cadastro (o usuário ainda nem tem sessão plena).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_data (user_id, payload)
  values (new.id, '{}'::jsonb)
  on conflict (user_id) do nothing;

  insert into public.user_settings (user_id, settings)
  values (new.id, '{}'::jsonb)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- 7) RLS da user_data + políticas (dono só enxerga/edita as próprias linhas) ----
alter table public.user_data enable row level security;

do $$
begin
  execute format('drop policy if exists "user_data_select_own" on public.user_data');
  execute format('drop policy if exists "user_data_insert_own" on public.user_data');
  execute format('drop policy if exists "user_data_update_own" on public.user_data');
  execute format('drop policy if exists "user_data_delete_own" on public.user_data');
  execute format('create policy "user_data_select_own" on public.user_data for select to authenticated using (user_id = auth.uid())');
  execute format('create policy "user_data_insert_own" on public.user_data for insert to authenticated with check (user_id = auth.uid())');
  execute format('create policy "user_data_update_own" on public.user_data for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())');
  execute format('create policy "user_data_delete_own" on public.user_data for delete to authenticated using (user_id = auth.uid())');
end $$;

-- 8) REALTIME: habilita o canal em tempo real para as tabelas do usuário ------
-- Com isso, o app atualiza NA HORA (sem esperar os 15s do ciclo) quando outra
-- tela/aparelho grava dados. Seguro rodar de novo: ignora tabelas já incluídas
-- e não quebra se o Realtime estiver desativado no projeto.
do $$
declare t text; pub_exists boolean;
begin
  select exists (select 1 from pg_publication where pubname = 'supabase_realtime') into pub_exists;
  if not pub_exists then
    raise notice 'Realtime nao ativo no projeto; pule esta etapa (sem erro).';
    return;
  end if;
  foreach t in array array['user_settings','tracks','playlists','playlist_tracks','pet_stats','lyric_sync','lyrics','user_data'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then null;
    end;
  end loop;
end $$;