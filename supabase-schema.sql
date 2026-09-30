create table if not exists public.sync_profiles (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null unique references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.sync_profiles enable row level security;

drop policy if exists "sync_profiles_select_own" on public.sync_profiles;
create policy "sync_profiles_select_own"
  on public.sync_profiles for select
  using (auth.uid() = uid);

drop policy if exists "sync_profiles_insert_own" on public.sync_profiles;
create policy "sync_profiles_insert_own"
  on public.sync_profiles for insert
  with check (auth.uid() = uid);

drop policy if exists "sync_profiles_update_own" on public.sync_profiles;
create policy "sync_profiles_update_own"
  on public.sync_profiles for update
  using (auth.uid() = uid);
