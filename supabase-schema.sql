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

-- ── Sistema de amigos ────────────────────────────────────────────────────────
-- user_profiles carrega SÓ o que é público (nome, bio, cor). O resto (mais
-- ouvidas, recordes, moedas) continua privado no sync_profiles e só será
-- exposto por RPC quando o dono autorizar (Etapa 2 em diante).
create table if not exists public.user_profiles (
  uid uuid primary key references auth.users(id) on delete cascade,
  code text not null unique,
  name text not null default '',
  bio text not null default '',
  accent text not null default '',
  avatar text not null default '',
  -- "Viu o app há 2 horas": atualizado só quando a pessoa entra. Ajuda a saber
  -- se o amigo está por perto, e é leve (uma coluna).
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Para quem já tinha a tabela sem a coluna.
alter table public.user_profiles add column if not exists last_seen_at timestamptz not null default now();

-- A lista de amigos acompanha mudanças no perfil por este carimbo. Ele precisa
-- mudar sozinho quando o nome, a bio, a cor ou a FOTO mudam — sem isso, trocar
-- só a foto é invisível para a lista (a foto continua preenchida, o nome igual,
-- e o carimbo congelado no valor da criação), e o amigo via a foto antiga.
-- Só mexe no carimbo quando o que a lista mostra de fato mudou: o "viu o app"
-- acontece a cada 5 min e não pode virar motivo de recarregar a lista sempre.
create or replace function public.user_profiles_tocar_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.name is distinct from old.name
     or new.bio is distinct from old.bio
     or new.accent is distinct from old.accent
     or new.avatar is distinct from old.avatar then
    new.updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists user_profiles_tocar_updated_at on public.user_profiles;
create trigger user_profiles_tocar_updated_at
before update on public.user_profiles
for each row execute function public.user_profiles_tocar_updated_at();

-- A lista de amigos acompanha a foto/nome dos amigos pelo carimbo do perfil.
-- Sem índice, isso vira leitura de tabela inteira a cada ciclo.
create index if not exists user_profiles_name_idx on public.user_profiles (lower(name));

alter table public.user_profiles enable row level security;

-- Qualquer usuário logado pode ler perfis públicos (é isso que o torna
-- encontrável pelo código). Insere/atualiza: só o dono.
drop policy if exists "user_profiles_select_any" on public.user_profiles;
create policy "user_profiles_select_any"
  on public.user_profiles for select
  using (auth.uid() is not null);

drop policy if exists "user_profiles_insert_own" on public.user_profiles;
create policy "user_profiles_insert_own"
  on public.user_profiles for insert
  with check (auth.uid() = uid);

drop policy if exists "user_profiles_update_own" on public.user_profiles;
create policy "user_profiles_update_own"
  on public.user_profiles for update
  using (auth.uid() = uid);

-- Uma linha por amizade: requester pede, addressee decide. 'ativo' só quando
-- o addressee aceita; 'recusado' deixa espaço para tentar de novo depois.
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pendente' check (status in ('pendente', 'ativo', 'recusado')),
  -- O que a pessoa escreveu junto do pedido ("quer ser meu amigo?"). Aparece
  -- para quem recebeu, e some se a amizade for desfeita.
  message text not null default '',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (requester_id, addressee_id)
);

-- Para quem já tinha a tabela sem a coluna da mensagem.
alter table public.friendships add column if not exists message text not null default '';

-- Índice do pedido pendente de cada pessoa: é a consulta mais frequente da tela
-- (abrir a lista), e sem isso o banco examina a tabela toda.
create index if not exists friendships_pendentes_idx
  on public.friendships (addressee_id, status)
  where status = 'pendente';

-- A lista de amigos pergunta nos DOIS lados de uma vez:
--   or=(requester_id.eq.eu, addressee_id.eq.eu)
-- O índice acima é parcial (só 'pendente'), então ele não serve para o outro
-- tipo de lista: o de quem já é amigo ('ativo'). Sem este índice, o Postgres
-- examina a tabela `friendships` inteira toda vez que a tela de amigos abre, e
-- a lista fica lenta conforme o app cresce.
create index if not exists friendships_addressee_idx
  on public.friendships (addressee_id, status);

alter table public.friendships enable row level security;

-- Cada linha tem dois donos: quem pediu e quem recebeu. Ambos enxergam, só o
-- pedinte cria, só quem recebeu responde (aceita/recusa) e só o pedinte cancela
-- (delete). Reenvio após recusa passa pela função reenviar_pedido, no fim.
drop policy if exists "friendships_select_participant" on public.friendships;
create policy "friendships_select_participant"
  on public.friendships for select
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- Só o pedinte cria, e SÓ como pedido pendente: sem isso dava para inserir a
-- linha já com status 'ativo' e inventar uma amizade com quem não aceitou.
drop policy if exists "friendships_insert_requester" on public.friendships;
create policy "friendships_insert_requester"
  on public.friendships for insert
  with check (
    auth.uid() = requester_id
    and requester_id <> addressee_id
    and status = 'pendente'
  );

-- ATENÇÃO: não crie uma policy de UPDATE separada para o reenvio.
-- O reenvio de pedido recusado passa pela função reenviar_pedido
-- (security definer, mais abaixo), que roda com os privilégios do dono da
-- tabela e por isso não depende de policy. A policy de update que vale é
-- `friendships_update_respond`, abaixo, e ela cobre tanto aceitar/recusar
-- quanto reenviar — com a trava de que requester_id/addressee_id não mudam.

-- Responder (aceitar/recusar) é privilege de QUEM RECEBEU, e a linha não pode
-- ser reescrita: o `with check` garante que depois do update a dupla continue
-- sendo (requester, quem recebeu) e que ninguém se aproveite para apontar a
-- amizade para um terceiro ou se aceitar sozinho. O pedinte cancela com DELETE.
drop policy if exists "friendships_update_participant" on public.friendships;
drop policy if exists "friendships_update_respond" on public.friendships;
create policy "friendships_update_respond"
  on public.friendships for update
  using (auth.uid() = addressee_id)
  with check (
    auth.uid() = addressee_id
    and requester_id is not null
    and requester_id <> addressee_id
    and requester_id <> auth.uid()
    and status in ('ativo', 'recusado')
  );

drop policy if exists "friendships_delete_requester" on public.friendships;
create policy "friendships_delete_requester"
  on public.friendships for delete
  using (auth.uid() = requester_id);

-- Trava por COLUNA: passando pelo RLS, só status e responded_at podem mudar.
-- requester_id/addressee_id ficam congelados — é o que impede forjar uma
-- amizade com um terceiro. A função reenviar_pedido (security definer, logo
-- abaixo) não é afetada: ela roda com os privilégios do dono da tabela.
revoke update on public.friendships from anon, authenticated;
grant update (status, responded_at) on public.friendships to authenticated;
grant select (id, requester_id, addressee_id, status, message, created_at, responded_at) on public.friendships to authenticated;

-- INSERT: o app manda `requester_id, addressee_id, status, message` ao criar
-- o pedido. Sem este grant, o PostgREST responde 401/403 "permission denied for
-- table friendships" e o botão "Enviar" falha sem mostrar nada na tela — era o
-- bug do pedido que não saía. A policy abaixo (friendships_insert_requester)
-- continua sendo a que decide QUEM pode inserir; o grant é só o privilégio de
-- coluna que o RLS pressupõe existir.
revoke insert on public.friendships from anon;
grant insert (requester_id, addressee_id, status, message) on public.friendships to authenticated;

-- user_profiles: a pessoa escreve só os campos de apresentação do PRÓPRIO
-- perfil. Sem travar por coluna, um PATCH livre também gravaria `code` (o
-- identificador que o app usa para ser encontrado) e `last_seen_at`.
revoke update on public.user_profiles from anon, authenticated;
grant update (name, bio, accent, avatar) on public.user_profiles to authenticated;
grant update (last_seen_at) on public.user_profiles to authenticated;

-- Policies são somadas com OU. Se este arquivo rodar duas vezes num banco que
-- já tinha uma policy de escrita permissiva, a restritiva nova não cancela a
-- velha — a permissiva continua valendo. Por isso as antigas caem antes.
drop policy if exists "user_profiles_update_any" on public.user_profiles;
drop policy if exists "user_profiles_update_all" on public.user_profiles;
drop policy if exists "user_profiles_insert_any" on public.user_profiles;
drop policy if exists "user_profiles_delete_any" on public.user_profiles;

-- Tentar de novo depois de uma recusa. Precisa ser função porque a policy de
-- update acima é só de quem recebeu, e aqui quem reenvia é o pedinte anterior
-- virando a linha para a direção certa. SECURITY DEFINER para poder escrever
-- essa linha; o corpo é minúsculo e só toca a linha recusada entre os dois
-- próprios usuários (nada de terceiros).
create or replace function public.reenviar_pedido(p_destinatario uuid, p_mensagem text default '')
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  meu uuid := auth.uid();
begin
  if meu is null or p_destinatario is null or meu = p_destinatario then
    return false;
  end if;

  update public.friendships
     set requester_id  = meu,
         addressee_id  = p_destinatario,
         status        = 'pendente',
         message       = coalesce(p_mensagem, ''),
         created_at    = now(),
         responded_at  = null
   where status = 'recusado'
     and (
          (requester_id = meu and addressee_id = p_destinatario)
       or (requester_id = p_destinatario and addressee_id = meu)
     );

  return found;
end;
$$;

drop function if exists public.reenviar_pedido(uuid);
revoke all on function public.reenviar_pedido(uuid, text) from public;
grant execute on function public.reenviar_pedido(uuid, text) to authenticated;

-- ── Etapa 2: perfil do amigo e as estatísticas dele ───────────────────────────
-- Quer ver o perfil de alguém? Chame amigos_perfil(uid) só se for amigo. Na
-- prática essa checagem acontece DENTRO da função: assim, mesmo que a tela
-- mande o uid de qualquer um, as estatísticas só saem para amigos de verdade.
-- SECURITY DEFINER porque as estatísticas moram no sync_profiles, que é
-- privado (RLS só deixa o dono ler). A função é a única ponte, e ela entrega
-- só números derivados + as 5 mais tocadas: nada de inventário, moedas, diário
-- ou qualquer coisa privada.

-- números de um jsonb, sem quebrar se o valor vier sujo ("abc" em vez de 12)
create or replace function public.amigos_numero(v jsonb, k text)
returns int
language plpgsql
immutable
as $$
declare
  t text;
begin
  if v is null or v -> k is null then
    return 0;
  end if;
  t := v ->> k;
  if t is null or t !~ '^-?[0-9]+$' then
    return 0;
  end if;
  return t::int;
exception
  when others then return 0;
end;
$$;

-- Perfil público + estatísticas. Devolve null se o uid não existe; devolve o
-- perfil SEM estatísticas se não são amigos.
create or replace function public.amigos_perfil(p_uid uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  eu       uuid := auth.uid();
  nome     text;
  bio      text;
  cor      text;
  foto     text;
  codigo   text;
  criado   timestamptz;
  sao_amigos boolean;
  dados    jsonb;
  musicas  jsonb;
  top5     jsonb;
  n_plays  int := 0;
  n_mus    int := 0;
  n_favs   int := 0;
  n_dias   int := 0;
  pet      jsonb;
begin
  if eu is null or p_uid is null or eu = p_uid then
    return null;
  end if;

  select up.name, up.bio, up.accent, up.avatar, up.code, up.last_seen_at
    into nome, bio, cor, foto, codigo, criado
    from public.user_profiles up
   where up.uid = p_uid;

  if codigo is null then
    return null;
  end if;

  select exists (
           select 1 from public.friendships f
            where f.status = 'ativo'
              and (
                   (f.requester_id = eu and f.addressee_id = p_uid)
                or (f.requester_id = p_uid and f.addressee_id = eu)
              )
         )
    into sao_amigos;

  -- Sem amizade: só o que é público (é o que o código de amigo já mostra).
  if not sao_amigos then
    return jsonb_build_object(
      'uid', p_uid, 'codigo', codigo, 'nome', nome, 'bio', bio,
      'cor', cor, 'foto', foto, 'amigo', false, 'estatisticas', null
    );
  end if;

  -- Amigo: deriva os números da nuvem do dono. `dados` pode não existir ainda
  -- (conta nova que nunca sincronizou) — nesse caso tudo fica em zero, sem erro.
  select sp.data into dados from public.sync_profiles sp where sp.uid = p_uid;
  dados := coalesce(dados, '{}'::jsonb);
  musicas := coalesce(dados -> 'library', '[]'::jsonb);
  if jsonb_typeof(musicas) <> 'array' then
    musicas := '[]'::jsonb;
  end if;

  select coalesce(sum(amigos_numero(t, 'plays')), 0)::int,
         count(*)::int,
         count(*) filter (where t ->> 'fav' = 'true')::int
    into n_plays, n_mus, n_favs
    from jsonb_array_elements(musicas) as t;

  -- Um dia conta uma vez só, mesmo que ele tenha tocado 50 músicas.
  select count(distinct d)::int
    into n_dias
    from jsonb_array_elements(musicas) as t,
         lateral jsonb_object_keys(
           case when jsonb_typeof(t -> 'playDays') = 'object' then t -> 'playDays' else '{}'::jsonb end
         ) as d;

  -- Top 5 mais tocadas. Só o que dá pra ver: título, artista, plays, capa.
  -- playDays/sid NÃO vêm: são dados internos.
  select coalesce(jsonb_agg(x.item order by x.plays desc), '[]'::jsonb)
    into top5
    from (
      select jsonb_build_object(
               'titulo', coalesce(t ->> 'title', 'Sem título'),
               'artista', coalesce(t ->> 'artist', ''),
               'plays', amigos_numero(t, 'plays'),
               'fav', (t ->> 'fav' = 'true'),
               'cores', t -> 'cover',
               -- A capa que dá para compartilhar é a `coverRemote` (link do
               -- iTunes) ou, quando a capa veio do próprio arquivo, a
               -- `coverShare`: uma miniatura de 64px que o aparelho manda como
               -- data URL. O `coverUrl` é um blob do aparelho e nunca chega
               -- em outro celular.
               'capa', coalesce(nullif(t ->> 'coverRemote', ''), nullif(t ->> 'coverShare', ''))
             ) as item,
             amigos_numero(t, 'plays') as plays
        from jsonb_array_elements(musicas) as t
       where amigos_numero(t, 'plays') > 0
       order by amigos_numero(t, 'plays') desc
       limit 5
    ) as x;

  pet := coalesce(dados -> 'petstats', '{}'::jsonb);
  if jsonb_typeof(pet) <> 'object' then
    pet := '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'uid', p_uid, 'codigo', codigo, 'nome', nome, 'bio', bio,
    'cor', cor, 'foto', foto, 'amigo', true,
    -- Carimbo de "viu o app": last_seen_at, não updated_at (esse muda toda vez
    -- que a pessoa mexe no perfil, o que daria um "viu" falso).
    'atualizado', criado,
    'estatisticas', jsonb_build_object(
      'plays', n_plays,
      'musicas', n_mus,
      'favoritas', n_favs,
      'dias', n_dias,
      'toques', amigos_numero(pet, 'touches'),
      'sonhos', amigos_numero(pet, 'sleeps'),
      'coracoes', amigos_numero(pet, 'hearts'),
      'compras', amigos_numero(pet, 'buys'),
      'brinquedos', case
                       when jsonb_typeof(dados -> 'toys') = 'array'
                         then jsonb_array_length(dados -> 'toys')
                       else 0
                     end,
      -- Tipos de banho que a pessoa tem (valor > 0). `jsonb_each_text` traz
      -- duas colunas: key e value — tem que ler `value`, senão conta a chave
      -- ('shampoo') em vez do número e dá zero sempre.
      'banhos', case
                  when jsonb_typeof(dados -> 'bath') = 'object' then (
                    select count(*)::int
                      from jsonb_each_text(dados -> 'bath') as b
                     where coalesce(b.value, '0') ~ '^-?[0-9]+$'
                       and b.value::int > 0
                  )
                  else 0
                end,
      'top', top5
    )
  );
end;
$$;

-- Desfazer uma amizade, não importa quem pediu. A policy de delete é só do
-- pedinte, mas isso prenderia quem ACEITOU o pedido: ele não conseguiria
-- remover ninguém. Mesma ideia da reenviar_pedido — função pequena, que só
-- apaga a linha entre os dois próprios usuários.
create or replace function public.remover_amizade(p_outro uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  eu uuid := auth.uid();
begin
  if eu is null or p_outro is null or eu = p_outro then
    return false;
  end if;

  delete from public.friendships
   where (
          (requester_id = eu and addressee_id = p_outro)
       or (requester_id = p_outro and addressee_id = eu)
        );

  return found;
end;
$$;

revoke all on function public.amigos_numero(jsonb, text) from public;
revoke all on function public.amigos_perfil(uuid) from public;
revoke all on function public.remover_amizade(uuid) from public;
grant execute on function public.amigos_numero(jsonb, text) to authenticated;
grant execute on function public.amigos_perfil(uuid) to authenticated;
grant execute on function public.remover_amizade(uuid) to authenticated;

-- ── Etapa 3: busca por nome, mensagem do pedido e último acesso ──────────────
-- Buscar por nome. Antes só dava para achar alguém pelo código, e ninguém
-- decora código de amigo: no uso real, a busca por nome é o caminho principal.
-- Casa o termo em QUALQUER parte do nome ("beto" acha "Ana beto").
-- Devolve quem já está na sua lista primeiro (pedido pendente, depois amigo) e
-- nunca a si mesmo. O RLS de user_profiles já garante que só há dados públicos
-- nessas linhas. O limite de 20 evita arrastar a tabela inteira.
-- SECURITY DEFINER porque precisa cruzar as minhas amizades, que são privadas.
create or replace function public.amigos_buscar(p_termo text)
returns table (
  uid      uuid,
  codigo   text,
  nome     text,
  foto     text,
  cor      text,
  status   text,
  criado   timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  eu     uuid := auth.uid();
  termo  text := btrim(coalesce(p_termo, ''));
begin
  -- Menos de 2 letras traria metade do mundo. E sem sessão não há lista.
  if eu is null or length(termo) < 2 then
    return;
  end if;

  return query
  select up.uid, up.code, up.name, up.avatar, up.accent,
         coalesce(f.status, '')                     as status,
         coalesce(f.created_at, up.last_seen_at)    as criado
    from public.user_profiles up
    left join lateral (
      select fr.status, fr.created_at
        from public.friendships fr
       where (fr.requester_id = eu and fr.addressee_id = up.uid)
          or (fr.addressee_id = eu and fr.requester_id = up.uid)
       order by case fr.status when 'pendente' then 0 else 1 end,
                fr.created_at desc
       limit 1
    ) f on true
   where up.uid <> eu
     -- `%termo%` e não `termo%`: quem procura "beto" tem que achar "Ana beto",
     -- não só quem tem o nome começando por beto. O índice é de `name`, então
     -- o `termo%` do App serve para o caso comum (digitar do começo), e este é
     -- o plano de reserva para achar no meio do nome.
     and lower(up.name) like ('%' || lower(termo) || '%')
   order by
     case coalesce(f.status, '') when 'pendente' then 0 when 'ativo' then 1 else 2 end,
     lower(up.name)
   limit 20;
end;
$$;

revoke all on function public.amigos_buscar(text) from public;
grant execute on function public.amigos_buscar(text) to authenticated;
