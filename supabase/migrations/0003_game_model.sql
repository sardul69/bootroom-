-- BOOTROOM GAME-FIRST MODEL

do $$
begin
  create type public.game_status as enum (
    'OPEN',
    'FULL',
    'CANCELLED',
    'COMPLETED'
  );
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  turf_id uuid not null references public.turfs(id) on delete restrict,
  host_user_id uuid not null references auth.users(id),
  booking_id uuid unique references public.bookings(id) on delete restrict,
  slot_start timestamptz not null,
  slot_end timestamptz not null,
  player_capacity integer not null check (player_capacity > 1),
  player_fee numeric(10,2) not null check (player_fee >= 0),
  status public.game_status not null default 'OPEN',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (slot_end > slot_start)
);

create table if not exists public.game_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  status text not null default 'PENDING'
    check (status in ('PENDING','CONFIRMED','CANCELLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(game_id, user_id)
);

create table if not exists public.game_payments (
  id uuid primary key default gen_random_uuid(),
  game_player_id uuid not null unique
    references public.game_players(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  provider text not null,
  provider_order_id text unique,
  provider_payment_id text unique,
  amount numeric(10,2) not null check (amount >= 0),
  status public.payment_status not null default 'CREATED',
  signature text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.games enable row level security;
alter table public.game_players enable row level security;
alter table public.game_payments enable row level security;

drop policy if exists "public open games" on public.games;
create policy "public open games"
on public.games
for select
using (status in ('OPEN','FULL'));

drop policy if exists "users read own game players" on public.game_players;
create policy "users read own game players"
on public.game_players
for select
using (auth.uid() = user_id);

create or replace function public.create_game(
  p_turf_id uuid,
  p_host_user_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_player_capacity integer,
  p_player_fee numeric
)
returns public.games
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_game public.games;
  v_count integer;
begin
  if auth.uid() is null or auth.uid() <> p_host_user_id then
    raise exception 'Not authorized';
  end if;

  if p_player_capacity <= 1 then
    raise exception 'Invalid player capacity';
  end if;

  if p_player_fee < 0 then
    raise exception 'Invalid player fee';
  end if;

  if p_end <= p_start then
    raise exception 'Invalid game time';
  end if;

  if p_start < now() then
    raise exception 'Game is in the past';
  end if;

  select count(*)
  into v_count
  from public.games
  where turf_id = p_turf_id
    and slot_start = p_start
    and slot_end = p_end
    and status in ('OPEN','FULL');

  if v_count > 0 then
    raise exception 'A game already exists for this slot';
  end if;

  select *
  into v_booking
  from public.create_booking_hold(
    p_turf_id,
    p_host_user_id,
    p_start,
    p_end
  );

  update public.bookings
  set status = 'CONFIRMED',
      hold_expires_at = null,
      updated_at = now()
  where id = v_booking.id;

  insert into public.games (
    turf_id,
    host_user_id,
    booking_id,
    slot_start,
    slot_end,
    player_capacity,
    player_fee,
    status
  )
  values (
    p_turf_id,
    p_host_user_id,
    v_booking.id,
    p_start,
    p_end,
    p_player_capacity,
    p_player_fee,
    'OPEN'
  )
  returning *
  into v_game;

  return v_game;

exception
  when exclusion_violation then
    raise exception 'That slot is no longer available';
end;
$$;


create or replace function public.join_game(
  p_game_id uuid,
  p_user_id uuid
)
returns public.game_players
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.games;
  v_player public.game_players;
  v_count integer;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'Not authorized';
  end if;

  select *
  into v_game
  from public.games
  where id = p_game_id
  for update;

  if not found then
    raise exception 'Game not found';
  end if;

  if v_game.status <> 'OPEN' then
    raise exception 'Game is no longer open';
  end if;

  if v_game.slot_start < now() then
    raise exception 'Game has already started';
  end if;

  select count(*)
  into v_count
  from public.game_players
  where game_id = p_game_id
    and status = 'CONFIRMED';

  if v_count >= v_game.player_capacity then
    update public.games
    set status = 'FULL',
        updated_at = now()
    where id = p_game_id;

    raise exception 'Game is full';
  end if;

  insert into public.game_players (
    game_id,
    user_id,
    status
  )
  values (
    p_game_id,
    p_user_id,
    'PENDING'
  )
  on conflict (game_id, user_id)
  do update set
    status = 'PENDING',
    updated_at = now()
  returning *
  into v_player;

  return v_player;
end;
$$;


create or replace function public.finalize_game_payment(
  p_game_player_id uuid,
  p_provider_payment_id text,
  p_signature text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player public.game_players;
  v_game public.games;
  v_count integer;
begin
  select *
  into v_player
  from public.game_players
  where id = p_game_player_id
  for update;

  if not found then
    raise exception 'Game player not found';
  end if;

  if v_player.user_id <> auth.uid()
     and auth.role() <> 'service_role' then
    raise exception 'Not authorized';
  end if;

  if v_player.status = 'CONFIRMED' then
    return;
  end if;

  select *
  into v_game
  from public.games
  where id = v_player.game_id
  for update;

  if v_game.status not in ('OPEN','FULL') then
    raise exception 'Game is not joinable';
  end if;

  update public.game_players
  set status = 'CONFIRMED',
      updated_at = now()
  where id = p_game_player_id;

  update public.game_payments
  set status = 'CAPTURED',
      provider_payment_id = p_provider_payment_id,
      signature = p_signature,
      updated_at = now()
  where game_player_id = p_game_player_id;

  select count(*)
  into v_count
  from public.game_players
  where game_id = v_game.id
    and status = 'CONFIRMED';

  if v_count >= v_game.player_capacity then
    update public.games
    set status = 'FULL',
        updated_at = now()
    where id = v_game.id;
  end if;
end;
$$;grant execute on function public.create_game(
  uuid, uuid, timestamptz, timestamptz, integer, numeric
) to authenticated;

grant execute on function public.join_game(
  uuid, uuid
) to authenticated;

grant execute on function public.finalize_game_payment(
  uuid, text, text
) to authenticated, service_role;