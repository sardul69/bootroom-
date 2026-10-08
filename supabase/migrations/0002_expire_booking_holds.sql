create or replace function public.create_booking_hold(
  p_turf_id uuid,
  p_user_id uuid,
  p_start timestamptz,
  p_end timestamptz
)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_turf public.turfs;
  v_booking public.bookings;
  v_hours numeric;
  v_total numeric;
begin
  if p_end <= p_start then
    raise exception 'Invalid slot';
  end if;

  -- Release old booking holds before checking availability.
  update public.bookings
  set status = 'EXPIRED', updated_at = now()
  where status in ('HELD', 'PAYMENT_PENDING')
    and hold_expires_at is not null
    and hold_expires_at < now();

  select *
  into v_turf
  from public.turfs
  where id = p_turf_id
    and active = true;

  if not found then
    raise exception 'Turf unavailable';
  end if;

  if p_start < now() then
    raise exception 'Slot is in the past';
  end if;

  v_hours := extract(epoch from (p_end - p_start)) / 3600.0;
  v_total := coalesce(v_turf.starting_price, 0) * v_hours;

  insert into public.bookings(
    turf_id,
    user_id,
    slot_start,
    slot_end,
    total_amount,
    status,
    hold_expires_at
  )
  values(
    p_turf_id,
    p_user_id,
    p_start,
    p_end,
    v_total,
    'HELD',
    now() + interval '10 minutes'
  )
  returning * into v_booking;

  return v_booking;

exception
  when exclusion_violation then
    raise exception 'That slot is no longer available';
end;
$$;
