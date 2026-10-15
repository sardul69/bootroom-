
begin;

create or replace function public.admin_list_player_cards()
returns table (
  profile_id uuid,
  full_name text,
  position text,
  preferred_foot text,
  locality text,
  overall_rating integer,
  pace integer,
  shooting integer,
  passing integer,
  dribbling integer,
  defending integer,
  physical integer,
  attack integer,
  composure integer,
  appearances integer,
  goals integer,
  assists integer,
  average_rating numeric,
  is_verified boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not exists (
    select 1
    from public.profile_roles pr
    where pr.profile_id = (select auth.uid())
      and pr.role in (
        'OWNER'::public.app_role,
        'ADMIN'::public.app_role
      )
  ) then
    raise exception 'Not authorized'
      using errcode = '42501';
  end if;

  return query
  select
    p.id,
    p.full_name,
    p.position,
    p.preferred_foot,
    p.locality,
    c.overall_rating,
    c.pace,
    c.shooting,
    c.passing,
    c.dribbling,
    c.defending,
    c.physical,
    c.attack,
    c.composure,
    c.appearances,
    c.goals,
    c.assists,
    c.average_rating,
    c.is_verified
  from public.profiles p
  join public.player_cards c on c.profile_id = p.id
  order by p.full_name nulls last, p.id;
end;
$function$;

revoke all on function public.admin_list_player_cards()
from public, anon;

grant execute on function public.admin_list_player_cards()
to authenticated;

commit;
