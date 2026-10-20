-- TURFZY: Keep legacy and multi-slot capacity checks consistent.
-- Preserve confirmed legacy players when they retry joining.

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

  -- Serialize this reservation against other capacity-aware functions.
  select *
  into v_game
  from public.games
  where id = p_game_id
  for update;

  if not found then
    raise exception 'Game not found';
  end if;

  if v_game.status <> 'OPEN' then
    -- Allow an idempotent retry for an existing confirmed player.
    select *
    into v_player
    from public.game_players
    where game_id = p_game_id
      and user_id = p_user_id;

    if found and v_player.status = 'CONFIRMED' then
      return v_player;
    end if;

    raise exception 'Game is no longer open';
  end if;

  if v_game.slot_start <= now() then
    raise exception 'Game has already started';
  end if;

  -- Preserve an existing confirmed player; never downgrade them to pending.
  select *
  into v_player
  from public.game_players
  where game_id = p_game_id
    and user_id = p_user_id
  for update;

  if found and v_player.status = 'CONFIRMED' then
    return v_player;
  end if;

  -- Expire stale multi-slot holds before checking capacity.
  update public.game_slot_bookings
  set status = 'FAILED',
      updated_at = now()
  where game_id = p_game_id
    and status = 'PENDING'
    and hold_expires_at <= now();

  -- Count confirmed legacy players, confirmed multi-slots,
  -- and all still-active multi-slot holds.
  select
    (select count(*)
     from public.game_players gp
     where gp.game_id = p_game_id
       and gp.status = 'CONFIRMED')
    +
    (select count(*)
     from public.game_slot_bookings sb
     where sb.game_id = p_game_id
       and sb.status = 'CONFIRMED')
    +
    (select count(*)
     from public.game_slot_bookings sb
     where sb.game_id = p_game_id
       and sb.status = 'PENDING'
       and sb.hold_expires_at > now())
  into v_count;

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
    status = case
      when public.game_players.status = 'CONFIRMED'
        then 'CONFIRMED'
      else 'PENDING'
    end,
    updated_at = now()
  returning *
  into v_player;

  return v_player;
end;
$$;
