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

create table if not exists public.catalogues (
  id text primary key,
  submitter_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  brand text not null,
  category text not null,
  season text not null default '',
  product_count integer check (product_count is null or product_count between 1 and 10000),
  description text not null,
  email text not null,
  files jsonb not null default '[]'::jsonb check (jsonb_typeof(files) = 'array'),
  created_at timestamptz not null default now()
);

alter table public.products enable row level security;
alter table public.product_admins enable row level security;
alter table public.catalogues enable row level security;

grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;
grant select on public.product_admins to authenticated;
grant insert, select, delete on public.catalogues to authenticated;

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

drop policy if exists "Vendors can submit their own catalogues" on public.catalogues;
create policy "Vendors can submit their own catalogues"
  on public.catalogues for insert
  to authenticated
  with check ((select auth.uid()) = submitter_id);

drop policy if exists "Vendors and admins can read catalogues" on public.catalogues;
create policy "Vendors and admins can read catalogues"
  on public.catalogues for select
  to authenticated
  using (
    (select auth.uid()) = submitter_id
    or (select auth.uid()) in (select user_id from public.product_admins)
  );

drop policy if exists "Product admins can delete catalogues" on public.catalogues;
create policy "Product admins can delete catalogues"
  on public.catalogues for delete
  to authenticated
  using (
    (select auth.uid()) in (select user_id from public.product_admins)
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'catalogues',
  'catalogues',
  false,
  20971520,
  array['application/pdf', 'image/jpeg', 'image/png', 'application/zip', 'application/x-zip-compressed']
)
on conflict (id) do update
set public = false,
    file_size_limit = 20971520,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Vendors can upload their own catalogue files" on storage.objects;
create policy "Vendors can upload their own catalogue files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'catalogues'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Vendors and admins can read catalogue files" on storage.objects;
create policy "Vendors and admins can read catalogue files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'catalogues'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select auth.uid()) in (select user_id from public.product_admins)
    )
  );

drop policy if exists "Vendors and admins can delete catalogue files" on storage.objects;
create policy "Vendors and admins can delete catalogue files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'catalogues'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select auth.uid()) in (select user_id from public.product_admins)
    )
  );

insert into public.products (id, name, category, price, image, badge, sort_order)
values
  ('mineral-face-wash', 'Mineral Face Wash', 'wellness', 28, 'https://images.unsplash.com/photo-1556228578-8c89e6adf883?auto=format&fit=crop&w=700&q=85', 'Bestseller', 10),
  ('stoneware-mug', 'Stoneware Mug', 'home', 34, 'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=700&q=85', '', 20),
  ('canvas-tote', 'Canvas Tote', 'carry', 42, 'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=700&q=85', 'New', 30),
  ('botanical-hand-balm', 'Botanical Hand Balm', 'wellness', 24, 'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?auto=format&fit=crop&w=700&q=85', '', 40)
on conflict (id) do nothing;
