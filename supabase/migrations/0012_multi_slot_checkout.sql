
-- TURFZY: Multi-slot checkout safety foundations
-- Migration: 0012_multi_slot_checkout.sql
-- Does not delete or reset existing payment records.

begin;

-- 1. All new reservations use a four-minute hold.
alter table public.game_slot_bookings
  alter column hold_expires_at
  set default (now() + interval '4 minutes');

-- 2. Ensure legacy pending player holds also default to four minutes.
-- This column is introduced by migration 0010.
alter table public.game_players
  add column if not exists hold_expires_at timestamptz;

alter table public.game_players
  alter column hold_expires_at
  set default (now() + interval '4 minutes');

-- 3. Ensure there is a reconciliation ledger for captured payments
-- that could not be safely finalized.
create table if not exists public.payment_reconciliation (
  id uuid primary key default gen_random_uuid(),
  payment_kind text not null
    check (payment_kind in ('SINGLE', 'BATCH')),
  internal_id uuid not null,
  game_id uuid not null references public.games(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  provider_order_id text not null,
  provider_payment_id text not null,
  amount numeric(10,2) not null check (amount > 0),
  reason text not null,
  status text not null default 'REVIEW_REQUIRED'
    check (status in ('REVIEW_REQUIRED', 'RESOLVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payment_reconciliation_status_created_idx
  on public.payment_reconciliation(status, created_at desc);

create index if not exists payment_reconciliation_game_idx
  on public.payment_reconciliation(game_id, created_at desc);

alter table public.payment_reconciliation enable row level security;

revoke all on public.payment_reconciliation from anon, authenticated;
grant select, insert, update on public.payment_reconciliation to service_role;

-- 4. Combined occupancy function.
-- Counts confirmed legacy players, active legacy holds,
-- confirmed batch slots, and active batch holds.
create or replace function public.get_combined_player_count(
  p_game_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  select
    (
      select count(*)
      from public.game_players gp
      where gp.game_id = p_game_id
        and (
          gp.status = 'CONFIRMED'
          or (
            gp.status = 'PENDING'
            and gp.hold_expires_at > now()
          )
        )
    )
    +
    (
      select count(*)
      from public.game_slot_bookings sb
      where sb.game_id = p_game_id
        and (
          sb.status = 'CONFIRMED'
          or (
            sb.status = 'PENDING'
            and sb.hold_expires_at > now()
          )
        )
    )
  into v_count;

  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.get_combined_player_count(uuid)
  from public;

grant execute on function public.get_combined_player_count(uuid)
  to anon, authenticated, service_role;

commit;
