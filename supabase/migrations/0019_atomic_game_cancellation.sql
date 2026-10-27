
-- BOOTROOM: Cancel a game and release its linked turf booking atomically.
-- Payment and booking history are preserved. No refund is issued.

begin;

create or replace function public.cancel_game_and_release_booking(
  p_game_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_game public.games%rowtype;
begin
  -- This function is called only by the authorized server API
  -- using the Supabase service-role client.
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not authorized';
  end if;

  select *
    into v_game
  from public.games
  where id = p_game_id
  for update;

  if not found then
    raise exception 'Game not found';
  end if;

  if v_game.status = 'COMPLETED' then
    raise exception 'Completed games cannot be cancelled here';
  end if;

  -- Release any active booking linked to this game.
  -- The booking row and payment history are retained.
  if v_game.booking_id is not null then
    update public.bookings
    set status = 'CANCELLED',
        hold_expires_at = null,
        updated_at = now()
    where id = v_game.booking_id
      and status in ('HELD', 'PAYMENT_PENDING', 'CONFIRMED');
  end if;

  -- Cancel the game after releasing its linked booking.
  if v_game.status <> 'CANCELLED' then
    update public.games
    set status = 'CANCELLED',
        updated_at = now()
    where id = p_game_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'message',
      'Game cancelled and linked booking released. Payment history preserved; no refund issued.'
  );
end;
$function$;

revoke all on function public.cancel_game_and_release_booking(uuid)
  from public, anon, authenticated;

grant execute on function public.cancel_game_and_release_booking(uuid)
  to service_role;

commit;
