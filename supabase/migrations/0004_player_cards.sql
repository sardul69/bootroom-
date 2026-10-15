
-- ============================================================
-- TURFZY PLAYER CARDS — MIGRATION 0004
-- ============================================================
-- Features:
--   1. One card per profile
--   2. Public read-only card access
--   3. OWNER / ADMIN-only writes
--   4. Automatic cards for new profiles
--   5. Backfill for existing profiles
--   6. Database-managed audit fields
--   7. Validation for ratings and statistics
--
-- IMPORTANT:
-- This migration does not grant or assign elevated roles.
-- OWNER / ADMIN membership must be managed separately through
-- a trusted administrative process.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. PLAYER CARD TABLE
-- ------------------------------------------------------------

create table if not exists public.player_cards (
  profile_id uuid primary key
    references public.profiles(id) on delete cascade,

  -- Core card rating
  overall_rating integer not null default 50
    check (overall_rating between 0 and 99),

  -- Football attributes
  pace integer not null default 50
    check (pace between 0 and 99),

  shooting integer not null default 50
    check (shooting between 0 and 99),

  passing integer not null default 50
    check (passing between 0 and 99),

  dribbling integer not null default 50
    check (dribbling between 0 and 99),

  defending integer not null default 50
    check (defending between 0 and 99),

  physical integer not null default 50
    check (physical between 0 and 99),

  -- Additional attributes
  attack integer not null default 50
    check (attack between 0 and 99),

  composure integer not null default 50
    check (composure between 0 and 99),

  -- Performance statistics
  appearances integer not null default 0
    check (appearances >= 0),

  goals integer not null default 0
    check (goals >= 0),

  assists integer not null default 0
    check (assists >= 0),

  average_rating numeric(3,2)
    check (average_rating between 0 and 10),

  -- False until a manager verifies the card
  is_verified boolean not null default false,

  -- Audit fields
  updated_at timestamptz not null default now(),

  updated_by uuid
    references auth.users(id) on delete set null
);

comment on table public.player_cards is
  'Official Turfzy player ratings and performance statistics.';

comment on column public.player_cards.is_verified is
  'True only after an authorized manager verifies this card.';

comment on column public.player_cards.average_rating is
  'Average performance rating on a scale from 0.00 to 10.00.';

-- ------------------------------------------------------------
-- 2. DATABASE AUTHORIZATION HELPER
-- ------------------------------------------------------------
-- This function checks the existing trusted role table.
-- It does not accept a user ID or role from the client.
-- ------------------------------------------------------------

create or replace function public.can_manage_player_cards()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.profile_roles as pr
    where pr.profile_id = (select auth.uid())
      and pr.role in (
        'OWNER'::public.app_role,
        'ADMIN'::public.app_role
      )
  );
$function$;

revoke all
on function public.can_manage_player_cards()
from public, anon;

grant execute
on function public.can_manage_player_cards()
to authenticated;

-- ------------------------------------------------------------
-- 3. AUTOMATIC AUDIT FIELDS
-- ------------------------------------------------------------
-- Clients cannot choose the timestamp or editor identity.
-- ------------------------------------------------------------

create or replace function public.stamp_player_card_update()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();

  return new;
end;
$function$;

revoke all
on function public.stamp_player_card_update()
from public, anon, authenticated;

drop trigger if exists player_card_stamp_update
on public.player_cards;

create trigger player_card_stamp_update
before insert or update
on public.player_cards
for each row
execute function public.stamp_player_card_update();

-- ------------------------------------------------------------
-- 4. AUTOMATIC CARD CREATION FOR NEW PROFILES
-- ------------------------------------------------------------

create or replace function public.create_player_card_for_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.player_cards (profile_id)
  values (new.id)
  on conflict (profile_id) do nothing;

  return new;
end;
$function$;

revoke all
on function public.create_player_card_for_profile()
from public, anon, authenticated;

drop trigger if exists create_player_card_after_profile
on public.profiles;

create trigger create_player_card_after_profile
after insert
on public.profiles
for each row
execute function public.create_player_card_for_profile();

-- ------------------------------------------------------------
-- 5. BACKFILL EXISTING PROFILES
-- ------------------------------------------------------------
-- Creates default cards without overwriting existing cards.
-- ------------------------------------------------------------

insert into public.player_cards (profile_id)
select p.id
from public.profiles as p
on conflict (profile_id) do nothing;

-- ------------------------------------------------------------
-- 6. ENABLE ROW LEVEL SECURITY
-- ------------------------------------------------------------

alter table public.player_cards enable row level security;

-- ------------------------------------------------------------
-- 7. REPLACE PLAYER CARD POLICIES ONLY
-- ------------------------------------------------------------

drop policy if exists "player cards are publicly readable"
on public.player_cards;

drop policy if exists "managers insert player cards"
on public.player_cards;

drop policy if exists "managers update player cards"
on public.player_cards;

drop policy if exists "managers delete player cards"
on public.player_cards;

create policy "player cards are publicly readable"
on public.player_cards
for select
to anon, authenticated
using (true);

create policy "managers insert player cards"
on public.player_cards
for insert
to authenticated
with check (public.can_manage_player_cards());

create policy "managers update player cards"
on public.player_cards
for update
to authenticated
using (public.can_manage_player_cards())
with check (public.can_manage_player_cards());

create policy "managers delete player cards"
on public.player_cards
for delete
to authenticated
using (public.can_manage_player_cards());

-- ------------------------------------------------------------
-- 8. TABLE PRIVILEGES
-- ------------------------------------------------------------
-- RLS policies and SQL grants work together.
-- ------------------------------------------------------------

revoke all
on table public.player_cards
from public, anon, authenticated;

grant select
on table public.player_cards
to anon, authenticated;

grant insert, update, delete
on table public.player_cards
to authenticated;

commit;

-- ============================================================
-- END OF MIGRATION 0004
-- ============================================================
