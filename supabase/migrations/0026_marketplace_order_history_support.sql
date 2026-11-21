begin;

create table if not exists public.marketplace_order_messages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.marketplace_orders(id) on delete cascade,
  author_user_id uuid references auth.users(id) on delete set null,
  author_role text not null check (author_role in ('CUSTOMER', 'STAFF')),
  message text not null check (char_length(trim(message)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists marketplace_order_messages_order_created_idx
  on public.marketplace_order_messages(order_id, created_at);

alter table public.marketplace_order_messages enable row level security;
revoke all on public.marketplace_order_messages from public, anon, authenticated;
grant all on public.marketplace_order_messages to service_role;

commit;
