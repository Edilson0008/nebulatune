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
  offset     real not null default 0,
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

do $$
declare t text;
begin
  foreach t in array array['user_settings','tracks','playlists','playlist_tracks','pet_stats','lyric_sync'] loop
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