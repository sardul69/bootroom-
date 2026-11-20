begin;

-- =========================================================
-- BOOTROOM MARKETPLACE CHECKOUT
-- Separate from game bookings, payments and rewards.
-- Does not alter the existing shop_products schema.
-- =========================================================

create table if not exists public.marketplace_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,
  delivery_address text not null,
  delivery_city text not null,
  delivery_state text not null,
  delivery_postal_code text not null,
  delivery_country text not null default 'India',
  delivery_note text not null default '',
  subtotal_paise integer not null check (subtotal_paise > 0),
  shipping_paise integer not null default 0 check (shipping_paise >= 0),
  total_paise integer not null check (total_paise > 0),
  currency text not null default 'INR' check (currency = 'INR'),
  status text not null default 'PENDING'
    check (status in (
      'PENDING',
      'PAID',
      'EXPIRED',
      'RECONCILIATION_REQUIRED'
    )),
  razorpay_order_id text unique,
  razorpay_payment_id text unique,
  razorpay_signature text,
  hold_expires_at timestamptz not null
    default (now() + interval '20 minutes'),
  notification_claimed_at timestamptz,
  notification_sent_at timestamptz,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists marketplace_orders_status_expiry_idx
  on public.marketplace_orders(status, hold_expires_at);

create index if not exists marketplace_orders_created_idx
  on public.marketplace_orders(created_at desc);

create table if not exists public.marketplace_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null
    references public.marketplace_orders(id) on delete cascade,
  product_id uuid not null
    references public.shop_products(id) on delete restrict,
  product_name text not null,
  product_image_url text not null,
  selected_size text not null default '',
  quantity integer not null check (quantity between 1 and 10),
  unit_price_paise integer not null check (unit_price_paise > 0),
  line_total_paise integer not null check (line_total_paise > 0),
  created_at timestamptz not null default now()
);

create index if not exists marketplace_order_items_order_idx
  on public.marketplace_order_items(order_id);

alter table public.marketplace_orders enable row level security;
alter table public.marketplace_order_items enable row level security;

revoke all on public.marketplace_orders
  from public, anon, authenticated;
revoke all on public.marketplace_order_items
  from public, anon, authenticated;

grant all on public.marketplace_orders to service_role;
grant all on public.marketplace_order_items to service_role;

-- Expire abandoned checkout reservations.
-- Pending orders reserve stock logically for 20 minutes.
-- No stock column is modified.
create or replace function public.release_expired_marketplace_orders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.marketplace_orders
  set status = 'EXPIRED'
  where status = 'PENDING'
    and hold_expires_at <= now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Create order using database prices and product details.
-- The browser cannot set prices, totals or product snapshots.
create or replace function public.create_marketplace_order(
  p_order_number text,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_delivery_address text,
  p_delivery_city text,
  p_delivery_state text,
  p_delivery_postal_code text,
  p_delivery_note text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_product public.shop_products%rowtype;
  v_order_id uuid;
  v_product_id uuid;
  v_quantity integer;
  v_size text;
  v_subtotal bigint := 0;
  v_line_total bigint;
  v_reserved bigint;
begin
  if p_order_number is null
     or length(p_order_number) > 40
     or p_customer_name is null
     or length(trim(p_customer_name)) not between 2 and 100
     or p_customer_email is null
     or length(trim(p_customer_email)) not between 5 and 254
     or p_customer_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
     or p_customer_phone is null
     or length(trim(p_customer_phone)) not between 7 and 20
     or p_delivery_address is null
     or length(trim(p_delivery_address)) not between 5 and 500
     or p_delivery_city is null
     or length(trim(p_delivery_city)) not between 2 and 100
     or p_delivery_state is null
     or length(trim(p_delivery_state)) not between 2 and 100
     or p_delivery_postal_code is null
     or length(trim(p_delivery_postal_code)) not between 3 and 20
     or length(coalesce(p_delivery_note, '')) > 500
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) not between 1 and 20
  then
    raise exception 'Invalid marketplace checkout details';
  end if;

  perform public.release_expired_marketplace_orders();

  -- Permit the same product in different sizes, but reject
  -- duplicate product-and-size cart lines.
  if exists (
    select 1
    from jsonb_array_elements(p_items) e
    group by
      (e->>'product_id')::uuid,
      coalesce(e->>'size', '')
    having count(*) > 1
  ) then
    raise exception 'Combine duplicate product and size cart lines';
  end if;

  -- Lock products in a stable order. This serializes competing checkouts.
  for v_item in
    select e
    from jsonb_array_elements(p_items) e
    order by (e->>'product_id')::uuid
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;
    v_size := coalesce(v_item->>'size', '');

    if v_quantity is null or v_quantity not between 1 and 10 then
      raise exception 'Invalid product quantity';
    end if;

    select * into v_product
    from public.shop_products
    where id = v_product_id
      and active = true
    for update;

    if not found then
      raise exception 'A product is unavailable';
    end if;

    if v_product.price_paise <= 0 then
      raise exception 'A product has an invalid price';
    end if;

    if cardinality(v_product.sizes) > 0
       and not (v_size = any(v_product.sizes)) then
      raise exception 'Selected size is unavailable';
    end if;

    if cardinality(v_product.sizes) = 0 and v_size <> '' then
      raise exception 'This product does not use sizes';
    end if;

    -- Count stock held by all other unexpired pending orders.
    select coalesce(sum(i.quantity), 0)
    into v_reserved
    from public.marketplace_order_items i
    join public.marketplace_orders o on o.id = i.order_id
    where i.product_id = v_product_id
      and o.status = 'PENDING'
      and o.hold_expires_at > now();

    -- Aggregate every size variant of this product before checking
    -- available stock, so one checkout cannot reserve the same stock twice.
    if v_product.stock_quantity - v_reserved < (
      select coalesce(sum((e2->>'quantity')::integer), 0)
      from jsonb_array_elements(p_items) e2
      where (e2->>'product_id')::uuid = v_product_id
    ) then
      raise exception 'Insufficient stock for a selected product';
    end if;

    v_line_total := v_product.price_paise::bigint * v_quantity;

    if v_line_total > 2000000000
       or v_subtotal > 2000000000 - v_line_total then
      raise exception 'Order total is too large';
    end if;

    v_subtotal := v_subtotal + v_line_total;
  end loop;

  insert into public.marketplace_orders (
    order_number,
    customer_name,
    customer_email,
    customer_phone,
    delivery_address,
    delivery_city,
    delivery_state,
    delivery_postal_code,
    delivery_note,
    subtotal_paise,
    shipping_paise,
    total_paise
  )
  values (
    p_order_number,
    trim(p_customer_name),
    lower(trim(p_customer_email)),
    trim(p_customer_phone),
    trim(p_delivery_address),
    trim(p_delivery_city),
    trim(p_delivery_state),
    trim(p_delivery_postal_code),
    coalesce(trim(p_delivery_note), ''),
    v_subtotal::integer,
    0,
    v_subtotal::integer
  )
  returning id into v_order_id;

  for v_item in select e from jsonb_array_elements(p_items) e
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;
    v_size := coalesce(v_item->>'size', '');

    select * into v_product
    from public.shop_products
    where id = v_product_id;

    insert into public.marketplace_order_items (
      order_id,
      product_id,
      product_name,
      product_image_url,
      selected_size,
      quantity,
      unit_price_paise,
      line_total_paise
    )
    values (
      v_order_id,
      v_product_id,
      v_product.name,
      v_product.image_url,
      v_size,
      v_quantity,
      v_product.price_paise,
      (v_product.price_paise::bigint * v_quantity)::integer
    );
  end loop;

  return jsonb_build_object(
    'ok', true,
    'order_id', v_order_id,
    'order_number', p_order_number,
    'subtotal_paise', v_subtotal,
    'shipping_paise', 0,
    'total_paise', v_subtotal,
    'hold_expires_at', now() + interval '20 minutes'
  );
end;
$$;

-- Attach Razorpay order created by trusted server code.
create or replace function public.attach_marketplace_razorpay_order(
  p_order_id uuid,
  p_razorpay_order_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.marketplace_orders
  set razorpay_order_id = p_razorpay_order_id
  where id = p_order_id
    and status = 'PENDING'
    and hold_expires_at > now()
    and razorpay_order_id is null;

  return found;
end;
$$;

-- Finalize only after the server verifies Razorpay signature,
-- order, captured payment, amount and currency.
create or replace function public.finalize_marketplace_order_payment(
  p_order_id uuid,
  p_razorpay_order_id text,
  p_razorpay_payment_id text,
  p_razorpay_signature text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.marketplace_orders%rowtype;
  v_item record;
  v_product public.shop_products%rowtype;
begin
  select * into v_order
  from public.marketplace_orders
  where id = p_order_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'ORDER_NOT_FOUND');
  end if;

  if nullif(trim(p_razorpay_order_id), '') is null
     or nullif(trim(p_razorpay_payment_id), '') is null
     or p_razorpay_signature is null
     or p_razorpay_signature !~ '^[a-fA-F0-9]{64}$' then
    return jsonb_build_object('ok', false, 'reason', 'INVALID_PAYMENT_CREDENTIALS');
  end if;

  if v_order.status = 'PAID' then
    return jsonb_build_object(
      'ok',
      v_order.razorpay_payment_id = p_razorpay_payment_id
      and v_order.razorpay_order_id = p_razorpay_order_id
      and v_order.razorpay_signature = p_razorpay_signature,
      'already_paid', true
    );
  end if;

  if v_order.status = 'RECONCILIATION_REQUIRED' then
    return jsonb_build_object(
      'ok', false,
      'reason', 'PAYMENT_REQUIRES_RECONCILIATION'
    );
  end if;

  if v_order.razorpay_order_id is distinct from p_razorpay_order_id then
    return jsonb_build_object('ok', false, 'reason', 'ORDER_MISMATCH');
  end if;

  -- A captured payment for an expired reservation must remain recorded
  -- for manual reconciliation; never silently discard the payment.
  if v_order.status = 'EXPIRED'
     or (v_order.status = 'PENDING' and v_order.hold_expires_at <= now()) then
    update public.marketplace_orders
    set status = 'RECONCILIATION_REQUIRED',
        razorpay_payment_id = p_razorpay_payment_id,
        razorpay_signature = p_razorpay_signature,
        paid_at = now()
    where id = p_order_id;

    return jsonb_build_object(
      'ok', false,
      'reason', 'PAYMENT_REQUIRES_RECONCILIATION'
    );
  end if;

  if v_order.status <> 'PENDING' then
    return jsonb_build_object('ok', false, 'reason', 'ORDER_NOT_PAYABLE');
  end if;

  -- Lock every product in stable order and recheck stock.
  for v_item in
    select i.product_id, sum(i.quantity)::integer as quantity
    from public.marketplace_order_items i
    where i.order_id = p_order_id
    group by i.product_id
    order by i.product_id
  loop
    select * into v_product
    from public.shop_products
    where id = v_item.product_id
    for update;

    if not found or v_product.stock_quantity < v_item.quantity then
      update public.marketplace_orders
      set status = 'RECONCILIATION_REQUIRED',
          razorpay_payment_id = p_razorpay_payment_id,
          razorpay_signature = p_razorpay_signature,
          paid_at = now()
      where id = p_order_id;

      return jsonb_build_object(
        'ok', false,
        'reason', 'STOCK_RECONCILIATION_REQUIRED'
      );
    end if;
  end loop;

  -- Deduct stock only after every item passes validation.
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
      razorpay_signature = p_razorpay_signature,
      paid_at = now()
  where id = p_order_id;

  return jsonb_build_object('ok', true, 'already_paid', false);
end;
$$;

-- Prevent duplicate private order notification attempts.
create or replace function public.claim_marketplace_order_notification(
  p_order_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.marketplace_orders
  set notification_claimed_at = now()
  where id = p_order_id
    and status = 'PAID'
    and notification_sent_at is null
    and (
      notification_claimed_at is null
      or notification_claimed_at < now() - interval '10 minutes'
    );

  return found;
end;
$$;

create or replace function public.mark_marketplace_order_notification_sent(
  p_order_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.marketplace_orders
  set notification_sent_at = now()
  where id = p_order_id
    and status = 'PAID'
    and notification_sent_at is null;

  return found;
end;
$$;

-- No browser role can execute these order-management functions.
revoke all on function public.release_expired_marketplace_orders()
  from public, anon, authenticated;
revoke all on function public.create_marketplace_order(
  text,text,text,text,text,text,text,text,text,jsonb
) from public, anon, authenticated;
revoke all on function public.attach_marketplace_razorpay_order(uuid,text)
  from public, anon, authenticated;
revoke all on function public.finalize_marketplace_order_payment(
  uuid,text,text,text
) from public, anon, authenticated;
revoke all on function public.claim_marketplace_order_notification(uuid)
  from public, anon, authenticated;
revoke all on function public.mark_marketplace_order_notification_sent(uuid)
  from public, anon, authenticated;

grant execute on function public.release_expired_marketplace_orders()
  to service_role;
grant execute on function public.create_marketplace_order(
  text,text,text,text,text,text,text,text,text,jsonb
) to service_role;
grant execute on function public.attach_marketplace_razorpay_order(uuid,text)
  to service_role;
grant execute on function public.finalize_marketplace_order_payment(
  uuid,text,text,text
) to service_role;
grant execute on function public.claim_marketplace_order_notification(uuid)
  to service_role;
grant execute on function public.mark_marketplace_order_notification_sent(uuid)
  to service_role;

commit;
