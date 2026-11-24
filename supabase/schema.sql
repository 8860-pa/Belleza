create table if not exists public.products (
  id text primary key,
  name text not null,
  category text not null check (category in (
    'accessories', 'mobile-accessories', 'charger-case', 'key-chain',
    'humidifier', 'massager', 't-shirts'
  )),
  price numeric(12, 2) not null check (price > 0),
  image text not null,
  badge text not null default '',
  sort_order integer not null default 100
);

alter table public.products drop constraint if exists products_category_check;
update public.products
set category = 'accessories'
where category in ('home', 'wellness', 'carry');
alter table public.products add constraint products_category_check
  check (category in (
    'accessories', 'mobile-accessories', 'charger-case', 'key-chain',
    'humidifier', 'massager', 't-shirts'
  ));

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
  ('mineral-face-wash', 'Mineral Face Wash', 'accessories', 28, 'https://images.unsplash.com/photo-1556228578-8c89e6adf883?auto=format&fit=crop&w=700&q=85', 'Bestseller', 10),
  ('stoneware-mug', 'Stoneware Mug', 'accessories', 34, 'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=700&q=85', '', 20),
  ('canvas-tote', 'Canvas Tote', 'accessories', 42, 'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=700&q=85', 'New', 30),
  ('botanical-hand-balm', 'Botanical Hand Balm', 'accessories', 24, 'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?auto=format&fit=crop&w=700&q=85', '', 40)
on conflict (id) do nothing;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,
  delivery_address text not null,
  delivery_city text not null,
  delivery_state text not null,
  delivery_postal_code text not null,
  delivery_notes text not null default '',
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  subtotal numeric(12, 2) not null check (subtotal > 0),
  payment_method text not null default 'cash_on_delivery' check (payment_method in ('cash_on_delivery', 'razorpay')),
  payment_status text not null default 'due' check (payment_status in ('due', 'pending', 'paid', 'failed', 'refunded')),
  razorpay_order_id text,
  razorpay_payment_id text,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled')),
  created_at timestamptz not null default now()
);

alter table public.orders add column if not exists razorpay_order_id text;
alter table public.orders add column if not exists razorpay_payment_id text;
alter table public.orders drop constraint if exists orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check
  check (payment_method in ('cash_on_delivery', 'razorpay'));
alter table public.orders drop constraint if exists orders_payment_status_check;
alter table public.orders add constraint orders_payment_status_check
  check (payment_status in ('due', 'pending', 'paid', 'failed', 'refunded'));

create index if not exists orders_created_at_idx on public.orders (created_at desc);
create unique index if not exists orders_razorpay_order_id_idx
  on public.orders (razorpay_order_id) where razorpay_order_id is not null;
create unique index if not exists orders_razorpay_payment_id_idx
  on public.orders (razorpay_payment_id) where razorpay_payment_id is not null;

alter table public.orders enable row level security;
grant select, update on public.orders to authenticated;

drop policy if exists "Product admins can read orders" on public.orders;
create policy "Product admins can read orders"
  on public.orders for select
  to authenticated
  using ((select auth.uid()) in (select user_id from public.product_admins));

drop policy if exists "Product admins can update orders" on public.orders;
create policy "Product admins can update orders"
  on public.orders for update
  to authenticated
  using ((select auth.uid()) in (select user_id from public.product_admins))
  with check ((select auth.uid()) in (select user_id from public.product_admins));

create or replace function public.create_order(
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_delivery_address text,
  p_delivery_city text,
  p_delivery_state text,
  p_delivery_postal_code text,
  p_delivery_notes text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_item jsonb;
  v_product public.products%rowtype;
  v_quantity_text text;
  v_quantity integer;
  v_lines jsonb := '[]'::jsonb;
  v_subtotal numeric(12, 2) := 0;
  v_order_id uuid;
begin
  if nullif(btrim(p_customer_name), '') is null or char_length(btrim(p_customer_name)) > 120 then
    raise exception 'Enter a name of 1 to 120 characters.';
  end if;
  if p_customer_email is null or char_length(p_customer_email) > 254 or p_customer_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+[.][A-Z]{2,}$' then
    raise exception 'Enter a valid email address.';
  end if;
  if p_customer_phone is null or btrim(p_customer_phone) !~ '^[+0-9() -]{10,18}$' then
    raise exception 'Enter a valid phone number.';
  end if;
  if nullif(btrim(p_delivery_address), '') is null or char_length(btrim(p_delivery_address)) > 500 then
    raise exception 'Enter a delivery address of 1 to 500 characters.';
  end if;
  if nullif(btrim(p_delivery_city), '') is null or char_length(btrim(p_delivery_city)) > 100 then
    raise exception 'Enter a city.';
  end if;
  if nullif(btrim(p_delivery_state), '') is null or char_length(btrim(p_delivery_state)) > 100 then
    raise exception 'Enter a state.';
  end if;
  if p_delivery_postal_code is null or p_delivery_postal_code !~ '^[0-9]{6}$' then
    raise exception 'Enter a valid 6-digit PIN code.';
  end if;
  if char_length(coalesce(p_delivery_notes, '')) > 500 then
    raise exception 'Delivery instructions must be 500 characters or fewer.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Your cart must contain between 1 and 30 products.';
  end if;
  if jsonb_array_length(p_items) not between 1 and 30 then
    raise exception 'Your cart must contain between 1 and 30 products.';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) <> 'object' or coalesce(v_item->>'id', '') = '' then
      raise exception 'The cart contains an invalid product.';
    end if;
    v_quantity_text := coalesce(v_item->>'quantity', '');
    if v_quantity_text !~ '^[1-9][0-9]?$' then
      raise exception 'Product quantities must be between 1 and 99.';
    end if;
    v_quantity := v_quantity_text::integer;

    select * into v_product
    from public.products
    where id = v_item->>'id';
    if not found then
      raise exception 'A product in your cart is no longer available.';
    end if;

    v_subtotal := v_subtotal + (v_product.price * v_quantity);
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'id', v_product.id,
      'name', v_product.name,
      'unit_price', v_product.price,
      'quantity', v_quantity
    ));
  end loop;

  insert into public.orders (
    customer_name, customer_email, customer_phone,
    delivery_address, delivery_city, delivery_state, delivery_postal_code,
    delivery_notes, items, subtotal
  )
  values (
    btrim(p_customer_name), lower(btrim(p_customer_email)), btrim(p_customer_phone),
    btrim(p_delivery_address), btrim(p_delivery_city), btrim(p_delivery_state), btrim(p_delivery_postal_code),
    btrim(coalesce(p_delivery_notes, '')), v_lines, v_subtotal
  )
  returning id into v_order_id;

  return jsonb_build_object('order_id', v_order_id, 'subtotal', v_subtotal);
end;
$$;

revoke all on function public.create_order(text, text, text, text, text, text, text, text, jsonb) from public;
grant execute on function public.create_order(text, text, text, text, text, text, text, text, jsonb) to anon, authenticated;
