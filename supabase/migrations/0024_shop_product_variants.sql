begin;

create table if not exists public.shop_product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.shop_products(id) on delete cascade,
  size text not null,
  sku text,
  stock_quantity integer not null default 0,
  price_paise integer,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shop_product_variants_size_check
    check (length(trim(size)) between 1 and 24),
  constraint shop_product_variants_stock_check
    check (stock_quantity >= 0),
  constraint shop_product_variants_price_check
    check (price_paise is null or price_paise >= 0)
);

create unique index if not exists shop_product_variants_product_size_unique
  on public.shop_product_variants(product_id, lower(trim(size)));

create unique index if not exists shop_product_variants_sku_unique
  on public.shop_product_variants(lower(trim(sku)))
  where sku is not null and length(trim(sku)) > 0;

create index if not exists shop_product_variants_product_active_idx
  on public.shop_product_variants(product_id, active, sort_order);

create or replace function public.set_shop_product_variant_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_shop_product_variant_updated_at
  on public.shop_product_variants;

create trigger set_shop_product_variant_updated_at
before update on public.shop_product_variants
for each row
execute function public.set_shop_product_variant_updated_at();

alter table public.shop_product_variants enable row level security;

revoke all on public.shop_product_variants from public, anon, authenticated;
grant select on public.shop_product_variants to anon, authenticated;

drop policy if exists "Public can view variants of published products"
  on public.shop_product_variants;

create policy "Public can view variants of published products"
  on public.shop_product_variants
  for select
  to anon, authenticated
  using (
    active = true
    and exists (
      select 1
      from public.shop_products p
      where p.id = shop_product_variants.product_id
        and p.active = true
        and p.publication_status = 'PUBLISHED'
    )
  );

commit;
