-- BOOTROOM / TURFZY
-- Migration 0016: owner-configured fixed booking amount.
-- Preserves existing booking and payment records.

begin;

-- 1. Add the fixed booking amount.
alter table public.games
  add column if not exists booking_amount numeric(10,2);

-- Existing games initially retain full-payment behavior.
update public.games
set booking_amount = player_fee
where booking_amount is null
  and player_fee > 0;

alter table public.games
  drop constraint if exists games_booking_amount_check;

alter table public.games
  add constraint games_booking_amount_check
  check (
    booking_amount is null
    or (
      booking_amount > 0
      and player_fee > 0
      and booking_amount <= player_fee
    )
  );

-- 2. Keep the old six-argument RPC compatible.
-- Old callers use the full fee as the booking amount.
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
set search_path to ''
as $function$
begin
  return public.create_game(
    p_turf_id,
    p_host_user_id,
    p_start,
    p_end,
    p_player_capacity,
    p_player_fee,
    p_player_fee
  );
end;
$function$;

-- 3. New RPC accepts both prices.
create or replace function public.create_game(
  p_turf_id uuid,
  p_host_user_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_player_capacity integer,
  p_player_fee numeric,
  p_booking_amount numeric
)
returns public.games
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_booking public.bookings;
  v_game public.games;
  v_count integer;
begin
  if auth.uid() is null
     or auth.uid() <> p_host_user_id then
    raise exception 'Not authorized';
  end if;

  if not public.current_user_has_capability('games.create') then
    raise exception 'You do not have permission to create games';
  end if;

  if p_player_capacity is null or p_player_capacity <= 1 then
    raise exception 'Invalid player capacity';
  end if;

  if p_player_fee is null or p_player_fee <= 0 then
    raise exception 'Invalid player fee';
  end if;

  if p_booking_amount is null
     or p_booking_amount <= 0
     or p_booking_amount > p_player_fee then
    raise exception
      'Booking amount must be positive and cannot exceed the full player fee';
  end if;

  if p_start is null or p_end is null or p_end <= p_start then
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
    and status in ('OPEN', 'FULL');

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
    booking_amount,
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
    p_booking_amount,
    'OPEN'
  )
  returning * into v_game;

  return v_game;

exception
  when exclusion_violation then
    raise exception 'That slot is no longer available';
end;
$function$;

revoke all on function public.create_game(
  uuid, uuid, timestamptz, timestamptz, integer, numeric, numeric
) from public, anon;

grant execute on function public.create_game(
  uuid, uuid, timestamptz, timestamptz, integer, numeric, numeric
) to authenticated, service_role;

-- 4. Reservation RPC: PARTIAL now means the fixed booking amount.
-- FULL means the complete player fee.
create or replace function public.reserve_game_slot_batch_v2(
  p_game_id uuid,
  p_quantity integer,
  p_payer_user_id uuid,
  p_participant_names text[] default null,
  p_payment_mode text default 'FULL'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_game public.games;
  v_batch public.game_payment_batches;
  v_fee numeric(10,2);
  v_booking_amount numeric(10,2);
  v_total_due numeric(10,2);
  v_pay_per_slot numeric(10,2);
  v_pay_now numeric(10,2);
  v_occupied integer;
  v_slot integer;
  v_names_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not authorized';
  end if;

  if p_payer_user_id is null then
    raise exception 'Payer is required';
  end if;

  if p_quantity is null or p_quantity < 1 or p_quantity > 10 then
    raise exception 'Quantity must be between 1 and 10';
  end if;

  if p_payment_mode is null
     or p_payment_mode not in ('FULL', 'PARTIAL') then
    raise exception 'Invalid payment mode';
  end if;

  v_names_count := coalesce(array_length(p_participant_names, 1), 0);

  if v_names_count > p_quantity then
    raise exception 'Too many participant names';
  end if;

  if p_participant_names is not null and exists (
    select 1
    from unnest(p_participant_names) as n(name)
    where length(trim(coalesce(n.name, ''))) > 100
  ) then
    raise exception 'Participant name is too long';
  end if;

  select *
  into v_game
  from public.games
  where id = p_game_id
  for update;

  if not found then
    raise exception 'Game not found';
  end if;

  if v_game.status <> 'OPEN'
     or v_game.slot_start is null
     or v_game.slot_start <= now() then
    raise exception 'Game is not available to join';
  end if;

  update public.game_slot_bookings
  set status = 'FAILED',
      updated_at = now()
  where game_id = p_game_id
    and status = 'PENDING'
    and hold_expires_at <= now();

  select
    (select count(*) from public.game_players gp
      where gp.game_id = p_game_id and gp.status = 'CONFIRMED')
    +
    (select count(*) from public.game_slot_bookings sb
      where sb.game_id = p_game_id and sb.status = 'CONFIRMED')
    +
    (select count(*) from public.game_players gp
      where gp.game_id = p_game_id and gp.status = 'PENDING'
        and gp.hold_expires_at > now())
    +
    (select count(*) from public.game_slot_bookings sb
      where sb.game_id = p_game_id and sb.status = 'PENDING'
        and sb.hold_expires_at > now())
  into v_occupied;

  if v_occupied + p_quantity > v_game.player_capacity then
    raise exception 'Not enough available slots';
  end if;

  v_fee := round(v_game.player_fee, 2);
  v_booking_amount := round(v_game.booking_amount, 2);

  if v_fee is null or v_fee <= 0 then
    raise exception 'Invalid player fee';
  end if;

  v_total_due := round(v_fee * p_quantity, 2);

  if p_payment_mode = 'PARTIAL' then
    if v_booking_amount is null
       or v_booking_amount <= 0
       or v_booking_amount > v_fee then
      raise exception
        'A valid booking amount has not been configured for this game';
    end if;

    v_pay_per_slot := v_booking_amount;
  else
    v_pay_per_slot := v_fee;
  end if;

  v_pay_now := round(v_pay_per_slot * p_quantity, 2);

  insert into public.game_payment_batches (
    game_id,
    payer_user_id,
    amount,
    total_due,
    payment_mode,
    status
  )
  values (
    p_game_id,
    p_payer_user_id,
    v_pay_now,
    v_total_due,
    p_payment_mode,
    'CREATED'
  )
  returning * into v_batch;

  for v_slot in 1..p_quantity loop
    insert into public.game_slot_bookings (
      game_id,
      payment_batch_id,
      payer_user_id,
      slot_number,
      participant_name,
      amount,
      amount_due_now,
      amount_paid
    )
    values (
      p_game_id,
      v_batch.id,
      p_payer_user_id,
      v_slot,
      nullif(trim(coalesce(p_participant_names[v_slot], '')), ''),
      v_fee,
      v_pay_per_slot,
      0
    );
  end loop;

  return jsonb_build_object(
    'batchId', v_batch.id,
    'gameId', p_game_id,
    'quantity', p_quantity,
    'amount', v_pay_now,
    'totalDue', v_total_due,
    'paymentMode', p_payment_mode
  );
end;
$function$;

revoke all on function public.reserve_game_slot_batch_v2(
  uuid, integer, uuid, text[], text
) from public, anon, authenticated;

grant execute on function public.reserve_game_slot_batch_v2(
  uuid, integer, uuid, text[], text
) to service_role;

commit;