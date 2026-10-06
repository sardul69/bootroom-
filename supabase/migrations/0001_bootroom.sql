create extension if not exists btree_gist;

create type public.app_role as enum ('PLAYER','OWNER','ADMIN');
create type public.booking_status as enum ('HELD','PAYMENT_PENDING','CONFIRMED','EXPIRED','CANCELLED','REFUND_PENDING','REFUNDED','FAILED');
create type public.payment_status as enum ('CREATED','AUTHORIZED','CAPTURED','FAILED','REFUNDED','PENDING');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  avatar_url text,
  locality text,
  position text,
  skill text,
  preferred_foot text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profile_roles (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null,
  primary key(profile_id, role)
);

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id),
  name text not null,
  locality text not null,
  address text not null,
  lat double precision,
  lng double precision,
  google_place_id text,
  description text,
  verified boolean not null default false,
  active boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.turfs (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  name text not null,
  format text not null,
  surface text not null,
  indoor boolean not null default false,
  floodlights boolean not null default false,
  starting_price numeric(10,2),
  description text,
  active boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  public_reference text not null unique default upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),
  turf_id uuid not null references public.turfs(id),
  user_id uuid not null references auth.users(id),
  slot_start timestamptz not null,
  slot_end timestamptz not null,
  slot_range tstzrange generated always as (tstzrange(slot_start, slot_end, '[)')) stored,
  total_amount numeric(10,2) not null check (total_amount >= 0),
  status public.booking_status not null default 'HELD',
  hold_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (slot_end > slot_start)
);

alter table public.bookings add constraint bookings_no_overlap exclude using gist (
  turf_id with =,
  slot_range with &&
) where (status in ('HELD','PAYMENT_PENDING','CONFIRMED'));

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  provider text not null,
  provider_order_id text unique,
  provider_payment_id text unique,
  amount numeric(10,2) not null,
  status public.payment_status not null default 'CREATED',
  signature text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique(provider, provider_event_id)
);

create or replace function public.create_booking_hold(p_turf_id uuid, p_user_id uuid, p_start timestamptz, p_end timestamptz)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare v_turf public.turfs; v_booking public.bookings; v_hours numeric; v_total numeric;
begin
  if p_end <= p_start then raise exception 'Invalid slot'; end if;
  select * into v_turf from public.turfs where id=p_turf_id and active=true;
  if not found then raise exception 'Turf unavailable'; end if;
  if p_start < now() then raise exception 'Slot is in the past'; end if;
  v_hours := extract(epoch from (p_end-p_start))/3600.0;
  v_total := coalesce(v_turf.starting_price,0) * v_hours;
  insert into public.bookings(turf_id,user_id,slot_start,slot_end,total_amount,status,hold_expires_at)
  values(p_turf_id,p_user_id,p_start,p_end,v_total,'HELD',now()+interval '10 minutes')
  returning * into v_booking;
  return v_booking;
exception when exclusion_violation then
  raise exception 'That slot is no longer available';
end;
$$;

create or replace function public.finalize_paid_booking(p_booking_id uuid, p_provider_payment_id text, p_signature text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_booking public.bookings;
begin
  select * into v_booking from public.bookings where id=p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if v_booking.user_id <> auth.uid() and auth.role() <> 'service_role' then raise exception 'Not authorized'; end if;
  if v_booking.status='CONFIRMED' then return; end if;
  if v_booking.hold_expires_at is not null and v_booking.hold_expires_at < now() then raise exception 'Booking hold expired'; end if;
  update public.bookings set status='CONFIRMED', updated_at=now() where id=p_booking_id;
  update public.payments set status='CAPTURED', provider_payment_id=p_provider_payment_id, signature=p_signature, updated_at=now() where booking_id=p_booking_id;
end;
$$;

alter table public.profiles enable row level security;
alter table public.profile_roles enable row level security;
alter table public.venues enable row level security;
alter table public.turfs enable row level security;
alter table public.bookings enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;

create policy "public active turfs" on public.turfs for select using (active=true);
create policy "public active venues" on public.venues for select using (active=true and verified=true);
create policy "users read own profile" on public.profiles for select using (auth.uid()=id);
create policy "users update own profile" on public.profiles for update using (auth.uid()=id);
create policy "users read own bookings" on public.bookings for select using (auth.uid()=user_id);
create policy "users read own payments" on public.payments for select using (auth.uid()=user_id);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into public.profiles(id,full_name,avatar_url) values(new.id,new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'avatar_url') on conflict do nothing; insert into public.profile_roles(profile_id,role) values(new.id,'PLAYER') on conflict do nothing; return new; end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

revoke all on function public.create_booking_hold(uuid,uuid,timestamptz,timestamptz) from public;
grant execute on function public.create_booking_hold(uuid,uuid,timestamptz,timestamptz) to authenticated;
revoke all on function public.finalize_paid_booking(uuid,text,text) from public;
grant execute on function public.finalize_paid_booking(uuid,text,text) to authenticated, service_role;
