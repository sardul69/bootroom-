
begin;

-- Count occupied seats across both booking systems.
-- Active pending reservations occupy seats until their hold expires.
create or replace function public.get_combined_player_count(
  p_game_id uuid
)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
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
    );
$$;

revoke all on function
  public.get_combined_player_count(uuid)
  from public;

grant execute on function
  public.get_combined_player_count(uuid)
  to anon, authenticated, service_role;

commit;
