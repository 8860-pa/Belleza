create table if not exists public.products (
  id text primary key,
  name text not null,
  category text not null check (category in ('home', 'wellness', 'carry')),
  price numeric(12, 2) not null check (price > 0),
  image text not null,
  badge text not null default '',
  sort_order integer not null default 100
);

create table if not exists public.product_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.products enable row level security;
alter table public.product_admins enable row level security;

grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;
grant select on public.product_admins to authenticated;

drop policy if exists "Products are publicly readable" on public.products;
create policy "Products are publicly readable"
  on public.products for select
  to anon, authenticated
  using (true);

drop policy if exists "Product admins can insert products" on public.products;
create policy "Product admins can insert products"
  on public.products for insert
  to authenticated
  with check (
    (select auth.uid()) in (select user_id from public.product_admins)
  );

drop policy if exists "Product admins can update products" on public.products;
create policy "Product admins can update products"
  on public.products for update
  to authenticated
  using (
    (select auth.uid()) in (select user_id from public.product_admins)
  )
  with check (
    (select auth.uid()) in (select user_id from public.product_admins)
  );

drop policy if exists "Product admins can delete products" on public.products;
create policy "Product admins can delete products"
  on public.products for delete
  to authenticated
  using (
    (select auth.uid()) in (select user_id from public.product_admins)
  );

drop policy if exists "Users can read their own product admin membership" on public.product_admins;
create policy "Users can read their own product admin membership"
  on public.product_admins for select
  to authenticated
  using ((select auth.uid()) = user_id);

insert into public.products (id, name, category, price, image, badge, sort_order)
values
  ('mineral-face-wash', 'Mineral Face Wash', 'wellness', 28, 'https://images.unsplash.com/photo-1556228578-8c89e6adf883?auto=format&fit=crop&w=700&q=85', 'Bestseller', 10),
  ('stoneware-mug', 'Stoneware Mug', 'home', 34, 'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=700&q=85', '', 20),
  ('canvas-tote', 'Canvas Tote', 'carry', 42, 'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=700&q=85', 'New', 30),
  ('botanical-hand-balm', 'Botanical Hand Balm', 'wellness', 24, 'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?auto=format&fit=crop&w=700&q=85', '', 40)
on conflict (id) do nothing;
