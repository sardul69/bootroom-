begin;

alter table public.marketplace_orders
  add column if not exists fulfillment_status text
    not null default 'UNFULFILLED',
  add column if not exists shipping_carrier text,
  add column if not exists tracking_number text,
  add column if not exists shipped_at timestamptz,
  add column if not exists delivered_at timestamptz;

alter table public.marketplace_orders
  drop constraint if exists marketplace_orders_fulfillment_status_check;

alter table public.marketplace_orders
  add constraint marketplace_orders_fulfillment_status_check
  check (
    fulfillment_status in (
      'UNFULFILLED',
      'PROCESSING',
      'SHIPPED',
      'DELIVERED'
    )
  );

create or replace function public.update_marketplace_fulfillment(
  p_order_id uuid,
  p_next_status text,
  p_shipping_carrier text,
  p_tracking_number text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
begin
  if p_order_id is null
     or p_next_status not in ('PROCESSING', 'SHIPPED', 'DELIVERED')
  then
    return jsonb_build_object('ok', false, 'reason', 'INVALID_INPUT');
  end if;

  select id, status, fulfillment_status
  into v_order
  from public.marketplace_orders
  where id = p_order_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'ORDER_NOT_FOUND');
  end if;

  if v_order.status <> 'PAID' then
    return jsonb_build_object('ok', false, 'reason', 'ORDER_NOT_PAID');
  end if;

  if v_order.fulfillment_status = p_next_status then
    return jsonb_build_object(
      'ok', true,
      'already_updated', true,
      'status', v_order.fulfillment_status
    );
  end if;

  if not (
    (v_order.fulfillment_status = 'UNFULFILLED' AND p_next_status = 'PROCESSING')
    OR
    (v_order.fulfillment_status = 'PROCESSING' AND p_next_status = 'SHIPPED')
    OR
    (v_order.fulfillment_status = 'SHIPPED' AND p_next_status = 'DELIVERED')
  ) then
    return jsonb_build_object('ok', false, 'reason', 'INVALID_TRANSITION');
  end if;

  if p_next_status = 'SHIPPED'
     and (
       nullif(trim(coalesce(p_shipping_carrier, '')), '') is null
       or nullif(trim(coalesce(p_tracking_number, '')), '') is null
     )
  then
    return jsonb_build_object(
      'ok', false,
      'reason', 'SHIPPING_DETAILS_REQUIRED'
    );
  end if;

  update public.marketplace_orders
  set fulfillment_status = p_next_status,
      shipping_carrier = case
        when p_shipping_carrier is not null
          and trim(p_shipping_carrier) <> ''
        then left(trim(p_shipping_carrier), 100)
        else shipping_carrier
      end,
      tracking_number = case
        when p_tracking_number is not null
          and trim(p_tracking_number) <> ''
        then left(trim(p_tracking_number), 150)
        else tracking_number
      end,
      shipped_at = case
        when p_next_status = 'SHIPPED' then now()
        else shipped_at
      end,
      delivered_at = case
        when p_next_status = 'DELIVERED' then now()
        else delivered_at
      end
  where id = p_order_id;

  return jsonb_build_object(
    'ok', true,
    'already_updated', false,
    'status', p_next_status
  );
end;
$$;

revoke all on function public.update_marketplace_fulfillment(
  uuid, text, text, text
) from public, anon, authenticated;

grant execute on function public.update_marketplace_fulfillment(
  uuid, text, text, text
) to service_role;

commit;
