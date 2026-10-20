
-- TURFZY Golden Ticket booking serials
-- Requires game_players and game_slot_bookings to exist.

begin;

create sequence if not exists public.turfzy_booking_serial_seq
  start with 1
  increment by 1
  no cycle;

alter table public.game_players
  add column if not exists booking_serial bigint;

alter table public.game_slot_bookings
  add column if not exists booking_serial bigint;

-- Backfill existing bookings without deleting or replacing any records.
with numbered as (
  select id,
         nextval('public.turfzy_booking_serial_seq') as serial
  from public.game_players
  where booking_serial is null
  order by created_at, id
)
update public.game_players gp
set booking_serial = numbered.serial
from numbered
where gp.id = numbered.id;

with numbered as (
  select id,
         nextval('public.turfzy_booking_serial_seq') as serial
  from public.game_slot_bookings
  where booking_serial is null
  order by created_at, id
)
update public.game_slot_bookings sb
set booking_serial = numbered.serial
from numbered
where sb.id = numbered.id;

alter table public.game_players
  alter column booking_serial
  set default nextval('public.turfzy_booking_serial_seq');

alter table public.game_slot_bookings
  alter column booking_serial
  set default nextval('public.turfzy_booking_serial_seq');

alter table public.game_players
  alter column booking_serial set not null;

alter table public.game_slot_bookings
  alter column booking_serial set not null;

create unique index if not exists
  game_players_booking_serial_unique
  on public.game_players (booking_serial);

create unique index if not exists
  game_slot_bookings_booking_serial_unique
  on public.game_slot_bookings (booking_serial);

commit;
