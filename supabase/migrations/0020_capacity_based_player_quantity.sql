-- BOOTROOM / TURFZY
-- Migration 0020: allow capacity-based multi-slot bookings.
-- The reservation function still locks the game row and atomically checks
-- occupied slots against games.player_capacity.

begin;

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

  if p_quantity is null or p_quantity < 1 then
    raise exception 'Quantity must be at least 1';
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
