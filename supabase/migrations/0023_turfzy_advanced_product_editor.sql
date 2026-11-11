begin;

-- Product identity and collection information
alter table public.shop_products
  add column if not exists brand_name text not null default '',
  add column if not exists collection_title text not null default '',
  add column if not exists collection_year integer,
  add column if not exists sku text,
  add column if not exists product_type text not null default 'SIMPLE';

-- Pricing: price_paise remains the compatibility/display price.
alter table public.shop_products
  add column if not exists regular_price_paise integer,
  add column if not exists sale_price_paise integer,
  add column if not exists sale_start_at timestamptz,
  add column if not exists sale_end_at timestamptz;

-- Product images and presentation
alter table public.shop_products
  add column if not exists gallery_urls text[] not null default '{}',
  add column if not exists player_image_url text,
  add column if not exists hero_layout text not null default 'ORIGINAL',
  add column if not exists hero_image_position text not null default '50% 50%',
  add column if not exists player_image_position text not null default '50% 50%',
  add column if not exists player_image_opacity numeric(4,3) not null default 1;

-- Inventory and merchandising
alter table public.shop_products
  add column if not exists allow_preorder boolean not null default false,
  add column if not exists featured boolean not null default false,
  add column if not exists product_tags text[] not null default '{}',
  add column if not exists attributes jsonb not null default '{}'::jsonb,
  add column if not exists dimensions text not null default '',
  add column if not exists weight_kg numeric(8,3);

-- Search metadata
alter table public.shop_products
  add column if not exists seo_title text not null default '',
  add column if not exists seo_description text not null default '';

-- Draft and publishing workflow.
alter table public.shop_products
  add column if not exists publication_status text not null default 'DRAFT';

-- Preserve existing published products.
update public.shop_products
set publication_status = case
  when active = true then 'PUBLISHED'
  else 'DRAFT'
end;

-- Existing prices become regular prices for legacy products.
update public.shop_products
set regular_price_paise = price_paise
where regular_price_paise is null;

-- Validate product fields.
alter table public.shop_products
  add constraint shop_products_regular_price_check
    check (regular_price_paise is null or regular_price_paise >= 0),
  add constraint shop_products_sale_price_check
    check (sale_price_paise is null or sale_price_paise >= 0),
  add constraint shop_products_product_type_check
    check (product_type in ('SIMPLE', 'VARIABLE')),
  add constraint shop_products_hero_layout_check
    check (hero_layout in ('ORIGINAL', 'LAYERED')),
  add constraint shop_products_publication_status_check
    check (publication_status in ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  add constraint shop_products_player_opacity_check
    check (player_image_opacity >= 0 and player_image_opacity <= 1),
  add constraint shop_products_weight_check
    check (weight_kg is null or weight_kg >= 0),
  add constraint shop_products_collection_year_check
    check (collection_year is null or collection_year between 1900 and 2200),
  add constraint shop_products_sale_period_check
    check (
      sale_start_at is null
      or sale_end_at is null
      or sale_end_at > sale_start_at
    ),
  add constraint shop_products_sale_price_vs_regular_check
    check (
      sale_price_paise is null
      or regular_price_paise is null
      or sale_price_paise <= regular_price_paise
    );

-- A SKU must be unique when supplied.
create unique index if not exists shop_products_sku_unique
  on public.shop_products (lower(trim(sku)))
  where sku is not null and length(trim(sku)) > 0;

-- Keep legacy active flag and new publication status synchronized.
create or replace function public.sync_shop_product_publication()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.active = true then
      new.publication_status := 'PUBLISHED';
    else
      new.active := (new.publication_status = 'PUBLISHED');
    end if;
  elsif new.publication_status is distinct from old.publication_status then
    new.active := (new.publication_status = 'PUBLISHED');
  elsif new.active is distinct from old.active then
    new.publication_status := case
      when new.active then 'PUBLISHED'
      else 'DRAFT'
    end;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_shop_product_publication
  on public.shop_products;

create trigger sync_shop_product_publication
before insert or update of active, publication_status
on public.shop_products
for each row
execute function public.sync_shop_product_publication();

-- Keep the existing public-read policy. Drafts and archived products
-- remain inaccessible to public users because active must be true.
drop policy if exists "Public can view published shop products"
  on public.shop_products;

create policy "Public can view published shop products"
  on public.shop_products
  for select
  to anon, authenticated
  using (active = true and publication_status = 'PUBLISHED');

commit;
