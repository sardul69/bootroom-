begin;

create or replace function public.finalize_marketplace_order_webhook(
  p_order_id uuid,
  p_razorpay_order_id text,
  p_razorpay_payment_id text,
  p_amount_paise bigint,
  p_currency text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_item record;
  v_product record;
  v_reserved integer;
begin
  if p_order_id is null
     or p_razorpay_order_id is null
     or p_razorpay_payment_id is null
     or p_razorpay_order_id !~ '^order_[A-Za-z0-9]+$'
     or p_razorpay_payment_id !~ '^pay_[A-Za-z0-9]+$'
     or p_amount_paise is null
     or p_amount_paise <= 0
     or upper(coalesce(p_currency, '')) <> 'INR'
  then
    return jsonb_build_object('ok', false, 'reason', 'INVALID_PAYMENT_DATA');
  end if;

  select *
  into v_order
  from public.marketplace_orders
  where id = p_order_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'ORDER_NOT_FOUND');
  end if;

  if v_order.razorpay_order_id is distinct from p_razorpay_order_id
     or v_order.total_paise is distinct from p_amount_paise
     or upper(v_order.currency) <> 'INR'
  then
    return jsonb_build_object('ok', false, 'reason', 'PAYMENT_MISMATCH');
  end if;

  -- Idempotency: never deduct stock twice for the same captured payment.
  if v_order.status = 'PAID' then
    if v_order.razorpay_payment_id = p_razorpay_payment_id then
      return jsonb_build_object('ok', true, 'already_finalized', true);
    end if;

    return jsonb_build_object('ok', false, 'reason', 'PAYMENT_ID_CONFLICT');
  end if;

  if v_order.status = 'RECONCILIATION_REQUIRED' then
    return jsonb_build_object(
      'ok', false,
      'reason', 'RECONCILIATION_REQUIRED'
    );
  end if;

  if v_order.status = 'EXPIRED'
     or (
       v_order.status = 'PENDING'
       and v_order.hold_expires_at <= now()
     ) then
    update public.marketplace_orders
    set status = 'RECONCILIATION_REQUIRED',
        razorpay_payment_id = p_razorpay_payment_id,
        paid_at = now()
    where id = p_order_id;

    return jsonb_build_object(
      'ok', false,
      'reason', 'PAYMENT_AFTER_RESERVATION_EXPIRY'
    );
  end if;

  if v_order.status <> 'PENDING' then
    return jsonb_build_object('ok', false, 'reason', 'ORDER_NOT_PAYABLE');
  end if;

  -- Lock products in deterministic order to avoid concurrent stock races.
  for v_item in
    select i.product_id, sum(i.quantity)::integer as quantity
    from public.marketplace_order_items i
    where i.order_id = p_order_id
    group by i.product_id
    order by i.product_id
  loop
    select p.id, p.stock_quantity
    into v_product
    from public.shop_products p
    where p.id = v_item.product_id
    for update;

    if not found or v_product.stock_quantity < v_item.quantity then
      update public.marketplace_orders
      set status = 'RECONCILIATION_REQUIRED',
          razorpay_payment_id = p_razorpay_payment_id,
          paid_at = now()
      where id = p_order_id;

      return jsonb_build_object(
        'ok', false,
        'reason', 'STOCK_RECONCILIATION_REQUIRED'
      );
    end if;

    -- Other active reservations must remain protected.
    select coalesce(sum(i.quantity), 0)::integer
    into v_reserved
    from public.marketplace_order_items i
    join public.marketplace_orders o on o.id = i.order_id
    where i.product_id = v_item.product_id
      and o.id <> p_order_id
      and o.status = 'PENDING'
      and o.hold_expires_at > now();

    if v_product.stock_quantity - v_reserved < v_item.quantity then
      update public.marketplace_orders
      set status = 'RECONCILIATION_REQUIRED',
          razorpay_payment_id = p_razorpay_payment_id,
          paid_at = now()
      where id = p_order_id;

      return jsonb_build_object(
        'ok', false,
        'reason', 'STOCK_RECONCILIATION_REQUIRED'
      );
    end if;
  end loop;

  -- All products passed validation. Deduct stock exactly once.
  for v_item in
    select i.product_id, sum(i.quantity)::integer as quantity
    from public.marketplace_order_items i
    where i.order_id = p_order_id
    group by i.product_id
    order by i.product_id
  loop
    update public.shop_products
    set stock_quantity = stock_quantity - v_item.quantity
    where id = v_item.product_id;
  end loop;

  update public.marketplace_orders
  set status = 'PAID',
      razorpay_payment_id = p_razorpay_payment_id,
      paid_at = now()
  where id = p_order_id;

  return jsonb_build_object('ok', true, 'already_finalized', false);
end;
$$;

revoke all on function public.finalize_marketplace_order_webhook(
  uuid, text, text, bigint, text
) from public, anon, authenticated;

grant execute on function public.finalize_marketplace_order_webhook(
  uuid, text, text, bigint, text
) to service_role;

commit;
