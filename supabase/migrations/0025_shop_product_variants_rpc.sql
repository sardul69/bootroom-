
create or replace function public.replace_shop_product_variants(
  p_product_id uuid,
  p_variants jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product_type text;
  v_item jsonb;
  v_size text;
  v_sku text;
  v_stock integer;
  v_price integer;
  v_active boolean;
  v_sort_order integer;
  v_total_stock bigint := 0;
  v_result jsonb;
  v_index integer := 0;
  v_seen_sizes text[] := array[]::text[];
  v_seen_skus text[] := array[]::text[];
  v_raw_value text;
begin
  -- Validate top-level input.
  if p_product_id is null then
    raise exception 'Product ID is required.';
  end if;

  if p_variants is null
     or jsonb_typeof(p_variants) is distinct from 'array'
     or jsonb_array_length(p_variants) > 20 then
    raise exception
      'Variants must be an array containing at most 20 entries.';
  end if;

  -- Lock the parent product to serialize variant replacement.
  select product_type
    into v_product_type
  from public.shop_products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'Product not found.';
  end if;

  if v_product_type is distinct from 'VARIABLE' then
    raise exception
      'Variants can only be assigned to variable products.';
  end if;

  -- Validate every item before deleting existing variants.
  for v_item in
    select value
    from jsonb_array_elements(p_variants)
  loop
    v_index := v_index + 1;

    if jsonb_typeof(v_item) is distinct from 'object' then
      raise exception
        'Invalid variant at position %.', v_index;
    end if;

    -- Size.
    if jsonb_typeof(v_item->'size') is distinct from 'string' then
      raise exception
        'Variant size is required at position %.', v_index;
    end if;

    v_size := upper(trim(v_item->>'size'));

    if length(v_size) < 1 or length(v_size) > 24 then
      raise exception
        'Invalid variant size at position %.', v_index;
    end if;

    if v_size = any(v_seen_sizes) then
      raise exception
        'Duplicate variant size: %.', v_size;
    end if;

    v_seen_sizes := array_append(v_seen_sizes, v_size);

    -- Stock quantity.
    if jsonb_typeof(v_item->'stock_quantity') is distinct from 'number' then
      raise exception
        'Invalid stock quantity at position %.', v_index;
    end if;

    v_raw_value := v_item->>'stock_quantity';

    if v_raw_value !~ '^[0-9]+$'
       or length(v_raw_value) > 6 then
      raise exception
        'Invalid stock quantity at position %.', v_index;
    end if;

    v_stock := v_raw_value::integer;

    if v_stock < 0 or v_stock > 100000 then
      raise exception
        'Stock quantity is out of range at position %.', v_index;
    end if;

    -- Optional variant price, in paise.
    v_price := null;

    if v_item ? 'price_paise'
       and v_item->'price_paise' <> 'null'::jsonb then

      if jsonb_typeof(v_item->'price_paise') is distinct from 'number' then
        raise exception
          'Invalid variant price at position %.', v_index;
      end if;

      v_raw_value := v_item->>'price_paise';

      if v_raw_value !~ '^[0-9]+$'
         or length(v_raw_value) > 9 then
        raise exception
          'Invalid variant price at position %.', v_index;
      end if;

      v_price := v_raw_value::integer;

      if v_price < 0 or v_price > 100000000 then
        raise exception
          'Variant price is out of range at position %.', v_index;
      end if;
    end if;

    -- Optional SKU.
    if v_item ? 'sku'
       and jsonb_typeof(v_item->'sku') not in ('string', 'null') then
      raise exception
        'Invalid SKU at position %.', v_index;
    end if;

    v_sku := nullif(trim(coalesce(v_item->>'sku', '')), '');

    if v_sku is not null then
      if length(v_sku) > 80 then
        raise exception
          'SKU is too long at position %.', v_index;
      end if;

      if lower(v_sku) = any(v_seen_skus) then
        raise exception
          'Duplicate variant SKU: %.', v_sku;
      end if;

      v_seen_skus := array_append(
        v_seen_skus,
        lower(v_sku)
      );
    end if;

    -- Optional active status.
    if v_item ? 'active'
       and jsonb_typeof(v_item->'active') is distinct from 'boolean' then
      raise exception
        'Invalid active status at position %.', v_index;
    end if;

    -- Optional sort order.
    if v_item ? 'sort_order' then
      if jsonb_typeof(v_item->'sort_order') is distinct from 'number' then
        raise exception
          'Invalid sort order at position %.', v_index;
      end if;

      v_raw_value := v_item->>'sort_order';

      if v_raw_value !~ '^-?[0-9]+$'
         or length(v_raw_value) > 8 then
        raise exception
          'Invalid sort order at position %.', v_index;
      end if;

      v_sort_order := v_raw_value::integer;

      if v_sort_order < -1000000
         or v_sort_order > 1000000 then
        raise exception
          'Sort order is out of range at position %.', v_index;
      end if;
    end if;
  end loop;

  -- All validation has passed. Replace variants atomically.
  delete from public.shop_product_variants
  where product_id = p_product_id;

  v_index := 0;
  v_total_stock := 0;

  for v_item in
    select value
    from jsonb_array_elements(p_variants)
  loop
    v_index := v_index + 1;

    v_size := upper(trim(v_item->>'size'));

    v_sku := nullif(
      trim(coalesce(v_item->>'sku', '')),
      ''
    );

    v_stock := (v_item->>'stock_quantity')::integer;

    v_price := case
      when v_item->'price_paise' is null
        or v_item->'price_paise' = 'null'::jsonb
      then null
      else (v_item->>'price_paise')::integer
    end;

    v_active := coalesce(
      (v_item->>'active')::boolean,
      true
    );

    v_sort_order := coalesce(
      (v_item->>'sort_order')::integer,
      v_index - 1
    );

    insert into public.shop_product_variants (
      product_id,
      size,
      sku,
      stock_quantity,
      price_paise,
      active,
      sort_order
    )
    values (
      p_product_id,
      v_size,
      v_sku,
      v_stock,
      v_price,
      v_active,
      v_sort_order
    );

    if v_active then
      v_total_stock := v_total_stock + v_stock;
    end if;
  end loop;

  -- Keep parent stock synchronized with active variants.
  if v_total_stock > 2147483647 then
    raise exception 'Total product stock exceeds the supported limit.';
  end if;

  update public.shop_products
  set
    stock_quantity = v_total_stock::integer,
    updated_at = now()
  where id = p_product_id;

  -- Return the saved variants.
  select coalesce(
    jsonb_agg(
      to_jsonb(pv)
      order by pv.sort_order, pv.size
    ),
    '[]'::jsonb
  )
  into v_result
  from public.shop_product_variants pv
  where pv.product_id = p_product_id;

  return v_result;
end;
$$;

-- Restrict execution to trusted server-side service-role calls.
revoke all on function public.replace_shop_product_variants(uuid, jsonb)
  from public, anon, authenticated;

grant execute on function public.replace_shop_product_variants(uuid, jsonb)
  to service_role;
