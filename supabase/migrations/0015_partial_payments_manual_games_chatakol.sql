
-- TURFZY / BOOTROOM migration 0014
-- Partial payments, game details/location fields, and Chatakol Turf.
-- Does not delete existing booking or payment history.

begin;

-- 1. Track the amount due and the amount collected for a booking batch.
alter table public.game_payment_batches
  add column if not exists total_due numeric(10,2),
  add column if not exists payment_mode text not null default 'FULL';

update public.game_payment_batches
set total_due = amount
where total_due is null;

alter table public.game_payment_batches
  alter column total_due set not null;

alter table public.game_payment_batches
  drop constraint if exists game_payment_batches_payment_mode_check;

alter table public.game_payment_batches
  add constraint game_payment_batches_payment_mode_check
  check (payment_mode in ('FULL', 'PARTIAL'));

alter table public.game_payment_batches
  drop constraint if exists game_payment_batches_total_due_check;

alter table public.game_payment_batches
  add constraint game_payment_batches_total_due_check
  check (total_due > 0 and amount > 0 and amount <= total_due);

-- 2. Track the amount paid per player slot.
alter table public.game_slot_bookings
  add column if not exists amount_due_now numeric(10,2),
  add column if not exists amount_paid numeric(10,2) not null default 0;

update public.game_slot_bookings sb
set amount_due_now = sb.amount,
    amount_paid = case
      when b.status = 'CAPTURED' then sb.amount
      else 0
    end
from public.game_payment_batches b
where b.id = sb.payment_batch_id
  and sb.amount_due_now is null;

alter table public.game_slot_bookings
  alter column amount_due_now set not null;

alter table public.game_slot_bookings
  drop constraint if exists game_slot_bookings_amount_paid_check;

alter table public.game_slot_bookings
  add constraint game_slot_bookings_amount_paid_check
  check (
    amount_due_now > 0
    and amount_due_now <= amount
    and amount_paid >= 0
    and amount_paid <= amount
  );

-- 3. When Razorpay has been verified and a batch is marked CAPTURED,
-- record the actual collected amount against each slot in that batch.
create or replace function public.apply_batch_payment_to_slots()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'CAPTURED'
     and old.status is distinct from 'CAPTURED' then
    update public.game_slot_bookings
    set amount_paid = amount_due_now,
        updated_at = now()
    where payment_batch_id = new.id
      and status in ('PENDING', 'CONFIRMED');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_apply_batch_payment_to_slots
  on public.game_payment_batches;

create trigger trg_apply_batch_payment_to_slots
after update of status on public.game_payment_batches
for each row
execute function public.apply_batch_payment_to_slots();

-- 4. New atomic reservation function supporting FULL or PARTIAL payment.
-- The existing reserve_game_slot_batch function remains untouched.
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
set search_path = public
as $$
declare
  v_game public.games;
  v_batch public.game_payment_batches;
  v_fee numeric(10,2);
  v_total_due numeric(10,2);
  v_per_slot_now numeric(10,2);
  v_total_now numeric(10,2);
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

  if p_payment_mode not in ('FULL', 'PARTIAL') then
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

  -- Serialize competing reservations by locking the game.
  select *
  into v_game
  from public.games
  where id = p_game_id
  for update;

  if not found then
    raise exception 'Game not found';
  end if;

  if v_game.status <> 'OPEN' or v_game.slot_start <= now() then
    raise exception 'Game is not available to join';
  end if;

  -- Expire stale holds.
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
    (select count(*) from public.game_slot_bookings sb
     where sb.game_id = p_game_id
       and sb.status = 'PENDING'
       and sb.hold_expires_at > now())
  into v_occupied;

  if v_occupied + p_quantity > v_game.player_capacity then
    raise exception 'Not enough available slots';
  end if;

  v_fee := round(v_game.player_fee, 2);
  v_total_due := round(v_fee * p_quantity, 2);

  if v_fee <= 0 or v_total_due <= 0 then
    raise exception 'Invalid player fee';
  end if;

  if p_payment_mode = 'PARTIAL' then
    v_per_slot_now := round(v_fee / 2, 2);

    if v_per_slot_now <= 0 or v_per_slot_now >= v_fee then
      raise exception 'Partial payment is not available for this fee';
    end if;
  else
    v_per_slot_now := v_fee;
  end if;

  v_total_now := round(v_per_slot_now * p_quantity, 2);

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
    v_total_now,
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
      v_per_slot_now,
      0
    );
  end loop;

  return jsonb_build_object(
    'batchId', v_batch.id,
    'gameId', p_game_id,
    'quantity', p_quantity,
    'amount', v_total_now,
    'totalDue', v_total_due,
    'paymentMode', p_payment_mode
  );
end;
$$;

revoke all on function public.reserve_game_slot_batch_v2(
  uuid, integer, uuid, text[], text
) from public, anon, authenticated;

grant execute on function public.reserve_game_slot_batch_v2(
  uuid, integer, uuid, text[], text
) to service_role;

-- 5. Store manually entered game details without replacing existing fields.
alter table public.games
  add column if not exists title text,
  add column if not exists description text,
  add column if not exists location_label text,
  add column if not exists maps_url text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

alter table public.games
  drop constraint if exists games_latitude_range_check;

alter table public.games
  add constraint games_latitude_range_check
  check (latitude is null or latitude between -90 and 90);

alter table public.games
  drop constraint if exists games_longitude_range_check;

alter table public.games
  add constraint games_longitude_range_check
  check (longitude is null or longitude between -180 and 180);

-- 6. Register Chatakol Turf, Dum Dum without creating duplicates.
-- The locality is intentionally broad; confirm the exact pin/address
-- before treating the venue as fully verified.
do $$
declare
  v_venue_id uuid;
begin
  select id
  into v_venue_id
  from public.venues
  where lower(trim(name)) = lower('Chatakol Turf')
    and lower(trim(locality)) like '%dum dum%'
  order by created_at
  limit 1;

  if v_venue_id is null then
    insert into public.venues (
      name,
      locality,
      address,
      description,
      verified,
      active
    )
    values (
      'Chatakol Turf',
      'Dum Dum, Kolkata',
      'Dum Dum, Kolkata, West Bengal, India',
      'Football turf. Exact address and map pin to be confirmed.',
      false,
      true
    )
    returning id into v_venue_id;
  end if;

  if not exists (
    select 1
    from public.turfs
    where venue_id = v_venue_id
      and lower(trim(name)) = lower('Chatakol Turf')
  ) then
    insert into public.turfs (
      venue_id,
      name,
      format,
      surface,
      indoor,
      floodlights,
      description,
      active
    )
    values (
      v_venue_id,
      'Chatakol Turf',
      'Football',
      'Artificial Turf',
      false,
      true,
      'Chatakol Turf, Dum Dum. Confirm exact venue details before booking.',
      true
    );
  end if;
end;
$$;

commit;
