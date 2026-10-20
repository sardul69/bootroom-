-- TURFZY: Multi-slot game bookings
-- Preserves existing game_players and game_payments.
create table if not exists public.game_payment_batches (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete restrict,
  payer_user_id uuid not null references auth.users(id) on delete restrict,
  provider text not null default 'razorpay'
    check (provider = 'razorpay'),
  provider_order_id text unique,
  provider_payment_id text unique,
  amount numeric(10,2) not null check (amount > 0),
  currency text not null default 'INR'
    check (currency = 'INR'),
  status public.payment_status not null default 'CREATED',
  signature text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.game_slot_bookings (
  id uuid primary key default gen_random_uuid(),
  public_reference text not null unique
    default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  game_id uuid not null references public.games(id) on delete restrict,
  payment_batch_id uuid not null
    references public.game_payment_batches(id) on delete restrict,
  payer_user_id uuid not null references auth.users(id) on delete restrict,
  slot_number integer not null check (slot_number > 0),
  participant_name text,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'CONFIRMED', 'FAILED', 'CANCELLED')),
  amount numeric(10,2) not null check (amount > 0),
  hold_expires_at timestamptz not null default (now() + interval '15 minutes'),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payment_batch_id, slot_number)
);
create index if not exists game_slot_bookings_game_status_idx
  on public.game_slot_bookings(game_id, status);
create index if not exists game_slot_bookings_payer_created_idx
  on public.game_slot_bookings(payer_user_id, created_at desc);
create index if not exists game_slot_bookings_batch_idx
  on public.game_slot_bookings(payment_batch_id);
alter table public.game_payment_batches enable row level security;
alter table public.game_slot_bookings enable row level security;
drop policy if exists "Payers read own game payment batches"
  on public.game_payment_batches;
create policy "Payers read own game payment batches"
  on public.game_payment_batches
  for select
  to authenticated
  using (auth.uid() = payer_user_id);
drop policy if exists "Payers read own game slot bookings"
  on public.game_slot_bookings;
create policy "Payers read own game slot bookings"
  on public.game_slot_bookings
  for select
  to authenticated
  using (auth.uid() = payer_user_id);
revoke insert, update, delete
  on public.game_payment_batches from anon, authenticated;
revoke insert, update, delete
  on public.game_slot_bookings from anon, authenticated;
grant select
  on public.game_payment_batches, public.game_slot_bookings
  to authenticated;
  -- Reserve multiple slots atomically before creating a Razorpay order.
-- Only trusted server code may execute this function.
create or replace function public.reserve_game_slot_batch(
  p_game_id uuid,
  p_quantity integer,
  p_payer_user_id uuid,
  p_participant_names text[] default null
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
  v_total numeric(10,2);
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
  -- Lock the game row to serialize competing reservations.
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
  -- Expire old pending holds.
  update public.game_slot_bookings
  set status = 'FAILED',
      updated_at = now()
  where game_id = p_game_id
    and status = 'PENDING'
    and hold_expires_at <= now();
  -- Count legacy confirmed players, confirmed new slots and active holds.
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
  v_total := round(v_fee * p_quantity, 2);
  if v_fee <= 0 or v_total <= 0 then
    raise exception 'Invalid player fee';
  end if;
  insert into public.game_payment_batches (
    game_id, payer_user_id, amount, status
  )
  values (
    p_game_id, p_payer_user_id, v_total, 'CREATED'
  )
  returning * into v_batch;
  for v_slot in 1..p_quantity loop
    insert into public.game_slot_bookings (
      game_id,
      payment_batch_id,
      payer_user_id,
      slot_number,
      participant_name,
      amount
    )
    values (
      p_game_id,
      v_batch.id,
      p_payer_user_id,
      v_slot,
      nullif(trim(coalesce(p_participant_names[v_slot], '')), ''),
      v_fee
    );
  end loop;
  return jsonb_build_object(
    'batchId', v_batch.id,
    'gameId', p_game_id,
    'quantity', p_quantity,
    'amount', v_total
  );
end;
$$;
revoke all on function public.reserve_game_slot_batch(
  uuid, integer, uuid, text[]
) from public, anon, authenticated;
grant execute on function public.reserve_game_slot_batch(
  uuid, integer, uuid, text[]
) to service_role;
-- Attach the Razorpay order after the order is created.
create or replace function public.attach_game_slot_order(
  p_batch_id uuid,
  p_order_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not authorized';
  end if;
  if p_order_id is null or length(trim(p_order_id)) = 0 then
    raise exception 'Invalid provider order ID';
  end if;
  update public.game_payment_batches
  set provider_order_id = p_order_id,
      updated_at = now()
  where id = p_batch_id
    and status = 'CREATED'
    and provider_order_id is null;
  if not found then
    raise exception 'Payment batch cannot be updated';
  end if;
end;
$$;
revoke all on function public.attach_game_slot_order(uuid, text)
  from public, anon, authenticated;
grant execute on function public.attach_game_slot_order(uuid, text)
  to service_role;
  -- Finalize a batch only after the server verifies the captured Razorpay payment.
create or replace function public.finalize_game_slot_batch(
  p_batch_id uuid,
  p_provider_order_id text,
  p_provider_payment_id text,
  p_signature text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.game_payment_batches;
  v_game public.games;
  v_pending integer;
  v_confirmed integer;
  v_occupied integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not authorized';
  end if;
  if p_provider_order_id is null
     or p_provider_payment_id is null
     or p_signature is null then
    raise exception 'Missing payment verification fields';
  end if;
  select *
  into v_batch
  from public.game_payment_batches
  where id = p_batch_id
  for update;
  if not found then
    raise exception 'Payment batch not found';
  end if;
  if v_batch.provider_order_id is distinct from p_provider_order_id then
    raise exception 'Order does not match batch';
  end if;
  if v_batch.provider_payment_id is not null
     and v_batch.provider_payment_id <> p_provider_payment_id then
    raise exception 'Payment ID does not match batch';
  end if;
  -- Make safe retries idempotent.
  if v_batch.status = 'CAPTURED' then
    if v_batch.provider_payment_id = p_provider_payment_id then
      return jsonb_build_object(
        'ok', true,
        'alreadyFinalized', true,
        'batchId', v_batch.id
      );
    end if;
    raise exception 'Batch was captured with a different payment';
  end if;
  if v_batch.status <> 'CREATED' then
    raise exception 'Payment batch is not awaiting confirmation';
  end if;
  -- Serialize finalization against reservations for this game.
  select *
  into v_game
  from public.games
  where id = v_batch.game_id
  for update;
  if not found then
    raise exception 'Game not found';
  end if;
  select count(*)
  into v_pending
  from public.game_slot_bookings
  where payment_batch_id = p_batch_id
    and status = 'PENDING'
    and hold_expires_at > now();
  select count(*)
  into v_confirmed
  from public.game_slot_bookings
  where payment_batch_id = p_batch_id
    and status = 'CONFIRMED';
  if v_pending = 0 and v_confirmed = 0 then
    raise exception 'No valid slots remain in this batch';
  end if;
  -- Do not silently confirm expired slots after a captured payment.
  -- Such payments require explicit reconciliation/refund handling.
  if exists (
    select 1
    from public.game_slot_bookings
    where payment_batch_id = p_batch_id
      and status = 'PENDING'
      and hold_expires_at <= now()
  ) then
    raise exception 'Slot hold expired; manual payment reconciliation required';
  end if;
  -- Recheck capacity before confirming.
  select
    (select count(*) from public.game_players gp
     where gp.game_id = v_game.id and gp.status = 'CONFIRMED')
    +
    (select count(*) from public.game_slot_bookings sb
     where sb.game_id = v_game.id and sb.status = 'CONFIRMED')
    +
    v_pending
  into v_occupied;
  if v_occupied > v_game.player_capacity then
    raise exception 'Capacity conflict; manual reconciliation required';
  end if;
  update public.game_payment_batches
  set status = 'CAPTURED',
      provider_payment_id = p_provider_payment_id,
      signature = p_signature,
      updated_at = now()
  where id = p_batch_id;
  update public.game_slot_bookings
  set status = 'CONFIRMED',
      confirmed_at = now(),
      updated_at = now()
  where payment_batch_id = p_batch_id
    and status = 'PENDING';
  select
    (select count(*) from public.game_players gp
     where gp.game_id = v_game.id and gp.status = 'CONFIRMED')
    +
    (select count(*) from public.game_slot_bookings sb
     where sb.game_id = v_game.id and sb.status = 'CONFIRMED')
  into v_occupied;
  if v_occupied >= v_game.player_capacity then
    update public.games
    set status = 'FULL',
        updated_at = now()
    where id = v_game.id;
  end if;
  return jsonb_build_object(
    'ok', true,
    'alreadyFinalized', false,
    'batchId', p_batch_id
  );
end;
$$;
revoke all on function public.finalize_game_slot_batch(
  uuid, text, text, text
) from public, anon, authenticated;
grant execute on function public.finalize_game_slot_batch(
  uuid, text, text, text
) to service_role;