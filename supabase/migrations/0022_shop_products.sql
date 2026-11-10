begin;

-- Shop merchandise catalog.
create table if not exists public.shop_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  category text not null default 'JERSEY',
  price_paise integer not null,
  image_url text not null,
  sizes text[] not null default '{}',
  stock_quantity integer not null default 0,
  active boolean not null default false,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint shop_products_category_check
    check (category = any (array['JERSEY', 'APPAREL', 'ACCESSORY']::text[])),
  constraint shop_products_price_paise_check
    check (price_paise >= 0),
  constraint shop_products_stock_quantity_check
    check (stock_quantity >= 0)
);

-- Public users may only read published products.
alter table public.shop_products enable row level security;

revoke all on public.shop_products
from public, anon, authenticated;

grant select on public.shop_products
to anon, authenticated;

drop policy if exists "Public can view published shop products"
on public.shop_products;

create policy "Public can view published shop products"
on public.shop_products
for select
to anon, authenticated
using (active = true);

-- Public product image bucket.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'shop-products',
  'shop-products',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Public read access is restricted to the Shop image bucket.
drop policy if exists "Public can view shop product images"
on storage.objects;

create policy "Public can view shop product images"
on storage.objects
for select
to public
using (bucket_id = 'shop-products');

commit;
