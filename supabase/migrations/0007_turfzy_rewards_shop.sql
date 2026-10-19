
-- TURFZY REWARDS & MARKETPLACE
-- Migration 0007
-- Run once in the Supabase SQL Editor after reviewing this file.
-- Never expose service-role credentials to the browser.

begin;

create extension if not exists pgcrypto;

-- 1. Platform reward settings
create table if not exists public.reward_platform_settings (
  id integer primary key default 1 check (id = 1),
  admins_may_complete_games boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.reward_platform_settings (id)
values (1)
on conflict (id) do nothing;

-- 2. One wallet per player
create table if not exists public.reward_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance bigint not null default 0 check (balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Immutable-style ledger: every balance change has a record
create table if not exists public.reward_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  amount bigint not null check (amount <> 0),
  balance_after bigint not null check (balance_after >= 0),
  transaction_type text not null check (
    transaction_type in (
      'GAME_REWARD',
      'COUPON_PURCHASE',
      'ADMIN_ADJUSTMENT',
      'REFUND'
    )
  ),
  reference_id uuid,
  description text not null,
  created_at timestamptz not null default now()
);

create index if not exists reward_transactions_user_created_idx
  on public.reward_transactions (user_id, created_at desc);

-- Prevent duplicate game rewards for the same player and game.
create unique index if not exists reward_transactions_unique_game_reward_idx
  on public.reward_transactions (user_id, reference_id)
  where transaction_type = 'GAME_REWARD';

-- 4. Coupon catalogue
create table if not exists public.reward_coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  description text not null default '',
  coin_cost bigint not null check (coin_cost > 0),
  discount_paise integer not null check (discount_paise > 0),
  is_free_game boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed values are illustrative launch prices. Adjust before enabling sales.
insert into public.reward_coupons
  (code, title, description, coin_cost, discount_paise, is_free_game, sort_order)
values
  ('SAVE10', '₹10 OFF', 'Save ₹10 on your player fee.', 100, 1000, false, 1),
  ('SAVE20', '₹20 OFF', 'Save ₹20 on your player fee.', 200, 2000, false, 2),
  ('SAVE25', '₹25 OFF', 'Save ₹25 on your player fee.', 250, 2500, false, 3),
  ('SAVE40', '₹40 OFF', 'Save ₹40 on your player fee.', 400, 4000, false, 4),
  ('SAVE50', '₹50 OFF', 'Save ₹50 on your player fee.', 500, 5000, false, 5),
  ('FREEGAME', 'FREE PLAYER FEE', 'Redeem against an eligible player fee.', 1000, 100000, true, 6)
on conflict (code) do nothing;

-- 5. Coupons owned by a player
create table if not exists public.player_coupons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  coupon_id uuid not null references public.reward_coupons(id) on delete restrict,
  status text not null default 'AVAILABLE'
    check (status in ('AVAILABLE', 'RESERVED', 'REDEEMED')),
  reserved_game_player_id uuid references public.game_players(id) on delete restrict,
  reserved_at timestamptz,
  redeemed_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (status = 'AVAILABLE' and reserved_game_player_id is null)
    or
    (status in ('RESERVED', 'REDEEMED')
      and reserved_game_player_id is not null)
  )
);

create index if not exists player_coupons_user_status_idx
  on public.player_coupons (user_id, status, created_at desc);

-- One coupon reservation per game-player checkout.
create unique index if not exists player_coupons_unique_active_checkout_idx
  on public.player_coupons (reserved_game_player_id)
  where status in ('RESERVED', 'REDEEMED');

-- 6. Per-game reward settings, controlled by the game host.
create table if not exists public.game_reward_settings (
  game_id uuid primary key references public.games(id) on delete cascade,
  coins_per_player integer not null default 0
    check (coins_per_player between 0 and 100000),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);

-- 7. Track the one-time reward distribution for each game.
create table if not exists public.game_reward_awards (
  game_id uuid primary key references public.games(id) on delete restrict,
  coins_per_player integer not null check (coins_per_player >= 0),
  awarded_by uuid not null references auth.users(id),
  awarded_at timestamptz not null default now()
);

-- 8. Row-level security: browser clients cannot edit balances or the ledger.
alter table public.reward_platform_settings enable row level security;
alter table public.reward_wallets enable row level security;
alter table public.reward_transactions enable row level security;
alter table public.reward_coupons enable row level security;
alter table public.player_coupons enable row level security;
alter table public.game_reward_settings enable row level security;
alter table public.game_reward_awards enable row level security;

drop policy if exists "Players read own reward wallet"
  on public.reward_wallets;
create policy "Players read own reward wallet"
  on public.reward_wallets for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Players read own reward transactions"
  on public.reward_transactions;
create policy "Players read own reward transactions"
  on public.reward_transactions for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Players read active coupon catalogue"
  on public.reward_coupons;
create policy "Players read active coupon catalogue"
  on public.reward_coupons for select
  to authenticated
  using (active = true);

drop policy if exists "Players read own coupons"
  on public.player_coupons;
create policy "Players read own coupons"
  on public.player_coupons for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Hosts read game reward settings"
  on public.game_reward_settings;
create policy "Hosts read game reward settings"
  on public.game_reward_settings for select
  to authenticated
  using (
    exists (
      select 1 from public.games g
      where g.id = game_id
        and g.host_user_id = (select auth.uid())
    )
  );

-- All mutations will go through carefully validated server-side functions.
revoke insert, update, delete on public.reward_wallets
  from anon, authenticated;
revoke insert, update, delete on public.reward_transactions
  from anon, authenticated;
revoke insert, update, delete on public.reward_coupons
  from anon, authenticated;
revoke insert, update, delete on public.player_coupons
  from anon, authenticated;
revoke insert, update, delete on public.game_reward_settings
  from anon, authenticated;
revoke insert, update, delete on public.game_reward_awards
  from anon, authenticated;
revoke insert, update, delete on public.reward_platform_settings
  from anon, authenticated;

grant select on public.reward_wallets to authenticated;
grant select on public.reward_transactions to authenticated;
grant select on public.reward_coupons to authenticated;
grant select on public.player_coupons to authenticated;
grant select on public.game_reward_settings to authenticated;

commit;
