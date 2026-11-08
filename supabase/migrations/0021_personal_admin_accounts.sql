begin;

-- Private administrator credentials.
create table if not exists public.admin_credentials (
  profile_id uuid primary key
    references public.profiles(id) on delete cascade,
  password_hash text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_credentials enable row level security;

revoke all on public.admin_credentials
from public, anon, authenticated;

-- Owner-only promotion.
-- Creates a missing profile using the registered Auth account metadata.
create or replace function public.owner_promote_admin(
  p_profile_id uuid,
  p_password_hash text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_metadata jsonb;
begin
  if auth.uid() is null
     or not public.current_user_is_owner() then
    raise exception 'Owner privileges required'
      using errcode = '42501';
  end if;

  if p_profile_id is null
     or p_profile_id = auth.uid() then
    raise exception 'Invalid administrator account';
  end if;

  if p_password_hash is null
     or p_password_hash !~ '^scrypt[$][0-9a-f]{32}[$][0-9a-f]{128}$' then
    raise exception 'Invalid password hash';
  end if;

  if exists (
    select 1
    from public.profile_roles
    where profile_id = p_profile_id
      and role = 'OWNER'::public.app_role
  ) then
    raise exception 'Owner accounts cannot be administrators';
  end if;

  select u.raw_user_meta_data
  into v_metadata
  from auth.users u
  where u.id = p_profile_id;

  if not found then
    raise exception 'Registered account not found';
  end if;

  insert into public.profiles (
    id,
    full_name,
    avatar_url
  )
  values (
    p_profile_id,
    v_metadata ->> 'full_name',
    v_metadata ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  insert into public.profile_roles (profile_id, role)
  values (p_profile_id, 'ADMIN'::public.app_role)
  on conflict (profile_id, role) do nothing;

  -- Reset permissions to the explicitly approved initial capability.
  delete from public.admin_permissions
  where profile_id = p_profile_id;

  insert into public.admin_permissions (
    profile_id,
    capability,
    granted_by
  )
  values (
    p_profile_id,
    'games.create',
    auth.uid()
  );

  insert into public.admin_credentials (
    profile_id,
    password_hash,
    created_by,
    updated_at
  )
  values (
    p_profile_id,
    p_password_hash,
    auth.uid(),
    now()
  )
  on conflict (profile_id) do update
  set password_hash = excluded.password_hash,
      created_by = excluded.created_by,
      updated_at = now();
end;
$function$;

revoke all on function public.owner_promote_admin(uuid, text)
from public, anon;

grant execute on function public.owner_promote_admin(uuid, text)
to authenticated;

-- Owner-only revocation.
create or replace function public.owner_revoke_admin(
  p_profile_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null
     or not public.current_user_is_owner() then
    raise exception 'Owner privileges required'
      using errcode = '42501';
  end if;

  if p_profile_id is null
     or p_profile_id = auth.uid() then
    raise exception 'Invalid administrator account';
  end if;

  if exists (
    select 1
    from public.profile_roles
    where profile_id = p_profile_id
      and role = 'OWNER'::public.app_role
  ) then
    raise exception 'Owner accounts cannot be revoked as administrators';
  end if;

  delete from public.admin_credentials
  where profile_id = p_profile_id;

  delete from public.admin_permissions
  where profile_id = p_profile_id;

  delete from public.profile_roles
  where profile_id = p_profile_id
    and role = 'ADMIN'::public.app_role;
end;
$function$;

revoke all on function public.owner_revoke_admin(uuid)
from public, anon;

grant execute on function public.owner_revoke_admin(uuid)
to authenticated;


-- Admin-only game creation.
-- This function is callable only through the trusted service-role backend.
-- It does not modify or weaken the existing create_game RPC.

create or replace function public.create_game_as_admin(
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
set search_path = ''
as $function$
declare
  v_booking public.bookings;
  v_game public.games;
  v_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not authorized'
      using errcode = '42501';
  end if;

  if p_host_user_id is null
     or not exists (
       select 1
       from public.profile_roles
       where profile_id = p_host_user_id
         and role = 'ADMIN'::public.app_role
     ) then
    raise exception 'Administrator access has been revoked'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.admin_permissions
    where profile_id = p_host_user_id
      and capability = 'games.create'
  ) then
    raise exception 'Game creation permission required'
      using errcode = '42501';
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

revoke all on function public.create_game_as_admin(
  uuid, uuid, timestamptz, timestamptz, integer, numeric, numeric
) from public, anon, authenticated;

grant execute on function public.create_game_as_admin(
  uuid, uuid, timestamptz, timestamptz, integer, numeric, numeric
) to service_role;


commit;
