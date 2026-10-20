
-- TURFZY: Unified and safer payment finalization
-- Migration 0010
-- Apply only after reviewing this file against the existing schema.

begin;

-- Legacy single-player reservations also need expiring holds.
alter table public.game_players
  add column if not exists hold_expires_at timestamptz
  not null default (now() + interval '15 minutes');

create index if not exists game_players_game_status_hold_idx
  on public.game_players (game_id, status, hold_expires_at);

-- Durable record for captured payments that cannot safely become bookings.
create table if not exists public.payment_reconciliation (
  id uuid primary key default gen_random_uuid(),
  payment_kind text not null
    check (payment_kind in ('SINGLE', 'BATCH')),
  internal_id uuid not null,
  game_id uuid not null,
  user_id uuid not null,
  provider_order_id text not null,
  provider_payment_id text not null,
  amount numeric(10,2) not null check (amount > 0),
  reason text not null,
  status text not null default 'REVIEW_REQUIRED'
    check (status in ('REVIEW_REQUIRED', 'RESOLVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payment_kind, internal_id, provider_payment_id)
);

alter table public.payment_reconciliation enable row level security;
revoke all on public.payment_reconciliation from anon, authenticated;
grant all on public.payment_reconciliation to service_role;

-- Replace the old three-argument function. The current API uses four arguments.
drop function if exists public.finalize_game_payment(uuid, text, text);

create or replace function public.finalize_game_payment(
  p_game_player_id uuid,
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
  v_player public.game_players;
  v_game public.games;
  v_payment public.game_payments;
  v_occupied integer;
  v_reason text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not authorized';
  end if;

  if p_game_player_id is null
     or nullif(trim(p_provider_order_id), '') is null
     or nullif(trim(p_provider_payment_id), '') is null
     or nullif(trim(p_signature), '') is null then
    raise exception 'Missing payment verification fields';
  end if;

  -- Read the game ID first, then lock game before player/payment.
  select gp.game_id
  into v_player.game_id
  from public.game_players gp
  where gp.id = p_game_player_id;

  if not found then
    raise exception 'Game player not found';
  end if;

  select *
  into v_game
  from public.games
  where id = v_player.game_id
  for update;

  if not found then
    raise exception 'Game not found';
  end if;

  select *
  into v_player
  from public.game_players
  where id = p_game_player_id
  for update;

  select *
  into v_payment
  from public.game_payments
  where game_player_id = p_game_player_id
  for update;

  if not found then
    raise exception 'Payment record not found';
  end if;

  if v_payment.user_id <> v_player.user_id then
    raise exception 'Payment user does not match player';
  end if;

  if v_payment.provider <> 'razorpay'
     or v_payment.provider_order_id is distinct from p_provider_order_id then
    raise exception 'Payment order does not match';
  end if;

  if round(v_payment.amount, 2) <> round(v_game.player_fee, 2) then
    raise exception 'Payment amount does not match player fee';
  end if;

  if v_payment.provider_payment_id is not null
     and v_payment.provider_payment_id <> p_provider_payment_id then
    raise exception 'Payment ID does not match stored payment';
  end if;

  -- Safe retries must refer to the same already-confirmed payment.
  if v_payment.status = 'CAPTURED'
     and v_player.status = 'CONFIRMED'
     and v_payment.provider_payment_id = p_provider_payment_id then
    return jsonb_build_object(
      'ok', true,
      'alreadyFinalized', true,
      'gamePlayerId', p_game_player_id
    );
  end if;

  if v_payment.status <> 'CREATED' then
    raise exception 'Payment is not awaiting confirmation';
  end if;

  -- The API must verify the Razorpay signature and provider payment
  -- before invoking this service-role-only function.
  update public.game_payments
  set status = 'CAPTURED',
      provider_payment_id = p_provider_payment_id,
      signature = p_signature,
      updated_at = now()
  where id = v_payment.id;

  -- A captured payment must never be discarded just because the
  -- booking can no longer be confirmed.
  if v_player.status <> 'PENDING' then
    v_reason := 'Player is not in PENDING status';
  elsif v_game.status not in ('OPEN', 'FULL')
     or v_game.slot_start <= now() then
    v_reason := 'Game is no longer joinable';
  else
    select
      (select count(*) from public.game_players gp
       where gp.game_id = v_game.id
         and gp.status = 'CONFIRMED')
      +
      (select count(*) from public.game_slot_bookings sb
       where sb.game_id = v_game.id
         and sb.status = 'CONFIRMED')
      +
      (select count(*) from public.game_players gp
       where gp.game_id = v_game.id
         and gp.status = 'PENDING'
         and gp.id <> p_game_player_id
         and gp.hold_expires_at > now())
      +
      (select count(*) from public.game_slot_bookings sb
       where sb.game_id = v_game.id
         and sb.status = 'PENDING'
         and sb.hold_expires_at > now())
    into v_occupied;

    if v_player.hold_expires_at <= now() then
      v_reason := 'Player reservation hold expired';
    elsif v_occupied >= v_game.player_capacity then
      v_reason := 'Game capacity reached after payment capture';
    end if;
  end if;

  if v_reason is not null then
    insert into public.payment_reconciliation (
      payment_kind, internal_id, game_id, user_id,
      provider_order_id, provider_payment_id, amount, reason
    )
    values (
      'SINGLE', p_game_player_id, v_game.id, v_player.user_id,
      p_provider_order_id, p_provider_payment_id,
      v_payment.amount, v_reason
    )
    on conflict (payment_kind, internal_id, provider_payment_id)
    do nothing;

    return jsonb_build_object(
      'ok', false,
      'reconciliationRequired', true,
      'gamePlayerId', p_game_player_id,
      'reason', v_reason
    );
  end if;

  update public.game_players
  set status = 'CONFIRMED',
      updated_at = now()
  where id = p_game_player_id;

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
    'gamePlayerId', p_game_player_id
  );
end;
$$;

revoke all on function public.finalize_game_payment(
  uuid, text, text, text
) from public, anon, authenticated;

grant execute on function public.finalize_game_payment(
  uuid, text, text, text
) to service_role;

-- Replace the multi-slot finalizer while preserving its existing signature.
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
  v_reason text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not authorized';
  end if;

  if p_batch_id is null
     or nullif(trim(p_provider_order_id), '') is null
     or nullif(trim(p_provider_payment_id), '') is null
     or nullif(trim(p_signature), '') is null then
    raise exception 'Missing payment verification fields';
  end if;

  -- Read batch, lock game first, then lock the batch.
  select *
  into v_batch
  from public.game_payment_batches
  where id = p_batch_id;

  if not found then
    raise exception 'Payment batch not found';
  end if;

  select *
  into v_game
  from public.games
  where id = v_batch.game_id
  for update;

  if not found then
    raise exception 'Game not found';
  end if;

  select *
  into v_batch
  from public.game_payment_batches
  where id = p_batch_id
  for update;

  if v_batch.provider <> 'razorpay'
     or v_batch.provider_order_id is distinct from p_provider_order_id then
    raise exception 'Order does not match batch';
  end if;

  if v_batch.provider_payment_id is not null
     and v_batch.provider_payment_id <> p_provider_payment_id then
    raise exception 'Payment ID does not match batch';
  end if;

  if v_batch.status = 'CAPTURED'
     and v_batch.provider_payment_id = p_provider_payment_id then
    return jsonb_build_object(
      'ok', true,
      'alreadyFinalized', true,
      'batchId', p_batch_id
    );
  end if;

  if v_batch.status <> 'CREATED' then
    raise exception 'Payment batch is not awaiting confirmation';
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

  if exists (
    select 1
    from public.game_slot_bookings
    where payment_batch_id = p_batch_id
      and status = 'PENDING'
      and hold_expires_at <= now()
  ) then
    v_reason := 'One or more slot holds expired';
  elsif v_pending = 0 and v_confirmed = 0 then
    v_reason := 'No valid slots remain in this batch';
  elsif v_game.status not in ('OPEN', 'FULL')
     or v_game.slot_start <= now() then
    v_reason := 'Game is no longer joinable';
  else
    select
      (select count(*) from public.game_players gp
       where gp.game_id = v_game.id
         and gp.status = 'CONFIRMED')
      +
      (select count(*) from public.game_slot_bookings sb
       where sb.game_id = v_game.id
         and sb.status = 'CONFIRMED')
      +
      (select count(*) from public.game_players gp
       where gp.game_id = v_game.id
         and gp.status = 'PENDING'
         and gp.hold_expires_at > now())
      +
      (select count(*) from public.game_slot_bookings sb
       where sb.game_id = v_game.id
         and sb.status = 'PENDING'
         and sb.payment_batch_id <> p_batch_id
         and sb.hold_expires_at > now())
    into v_occupied;

    if v_occupied + v_pending > v_game.player_capacity then
      v_reason := 'Game capacity conflict after payment capture';
    end if;
  end if;

  -- Persist the captured payment and a reconciliation record rather than
  -- raising an exception that would roll back the record.
  if v_reason is not null then
    update public.game_payment_batches
    set status = 'CAPTURED',
        provider_payment_id = p_provider_payment_id,
        signature = p_signature,
        updated_at = now()
    where id = p_batch_id;

    update public.game_slot_bookings
    set status = 'FAILED',
        updated_at = now()
    where payment_batch_id = p_batch_id
      and status = 'PENDING';

    insert into public.payment_reconciliation (
      payment_kind, internal_id, game_id, user_id,
      provider_order_id, provider_payment_id, amount, reason
    )
    values (
      'BATCH', p_batch_id, v_game.id, v_batch.payer_user_id,
      p_provider_order_id, p_provider_payment_id,
      v_batch.amount, v_reason
    )
    on conflict (payment_kind, internal_id, provider_payment_id)
    do nothing;

    return jsonb_build_object(
      'ok', false,
      'reconciliationRequired', true,
      'batchId', p_batch_id,
      'reason', v_reason
    );
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

commit;
