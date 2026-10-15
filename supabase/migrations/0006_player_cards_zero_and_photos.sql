
-- ============================================================
-- BOOTROOM | Migration 0006
-- Player rating gate, zero-rating defaults, photo storage
-- Designed to be safely rerun.
-- ============================================================

begin;

-- 1. New player cards start with zero ratings.
alter table public.player_cards
  alter column overall_rating set default 0,
  alter column pace set default 0,
  alter column shooting set default 0,
  alter column passing set default 0,
  alter column dribbling set default 0,
  alter column defending set default 0,
  alter column physical set default 0,
  alter column attack set default 0,
  alter column composure set default 0;

-- 2. Normalize existing ratings to zero.
-- Match statistics and player identity are preserved.
update public.player_cards
set overall_rating = 0,
    pace = 0,
    shooting = 0,
    passing = 0,
    dribbling = 0,
    defending = 0,
    physical = 0,
    attack = 0,
    composure = 0;

-- 3. Enforce the 50-appearance overall-rating rule.
alter table public.player_cards
  drop constraint if exists player_cards_50_game_rating_gate;

alter table public.player_cards
  add constraint player_cards_50_game_rating_gate
  check (
    overall_rating is not null
    and (
      coalesce(appearances, 0) >= 50
      or overall_rating = 0
    )
  );

-- The database, not just the UI, enforces the rating gate.
create or replace function public.enforce_player_card_rating_gate()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if coalesce(new.appearances, 0) < 50 then
    new.overall_rating := 0;
  end if;

  return new;
end;
$function$;

drop trigger if exists enforce_player_card_rating_gate
  on public.player_cards;

create trigger enforce_player_card_rating_gate
before insert or update on public.player_cards
for each row
execute function public.enforce_player_card_rating_gate();

-- 4. Create/update the player photo bucket.
-- Photos are publicly viewable; uploads are restricted below.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'player-photos',
  'player-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- 5. Public photo viewing.
drop policy if exists "Player photos are publicly viewable"
  on storage.objects;

create policy "Player photos are publicly viewable"
on storage.objects
for select
to public
using (bucket_id = 'player-photos');

-- 6. Users may upload only inside their own UID folder.
drop policy if exists "Users upload their own player photos"
  on storage.objects;

create policy "Users upload their own player photos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'player-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- 7. Users may update only their own photos.
drop policy if exists "Users update their own player photos"
  on storage.objects;

create policy "Users update their own player photos"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'player-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'player-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- 8. Users may delete only their own photos.
drop policy if exists "Users delete their own player photos"
  on storage.objects;

create policy "Users delete their own player photos"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'player-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

commit;
