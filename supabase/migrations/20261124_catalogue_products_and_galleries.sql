begin;

alter table public.products
  add column if not exists images jsonb not null default '[]'::jsonb;
alter table public.products
  add column if not exists vendor_id uuid references auth.users(id) on delete set null;
update public.products
set images = jsonb_build_array(jsonb_build_object('url', image, 'path', null))
where images = '[]'::jsonb;
alter table public.products drop constraint if exists products_images_array_check;
alter table public.products add constraint products_images_array_check
  check (jsonb_typeof(images) = 'array');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = true,
    file_size_limit = 10485760,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Product images are publicly readable" on storage.objects;
create policy "Product images are publicly readable"
  on storage.objects for select
  to public
  using (bucket_id = 'product-images');

drop policy if exists "Authenticated users can upload their own product images" on storage.objects;
create policy "Authenticated users can upload their own product images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Product admins and owners can delete product images" on storage.objects;
create policy "Product admins and owners can delete product images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'product-images'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select auth.uid()) in (select user_id from public.product_admins)
    )
  );

create or replace function public.submit_catalogue_with_products(
  p_catalogue jsonb,
  p_products jsonb
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_product jsonb;
  v_catalogue_id text;
  v_images jsonb;
begin
  if v_user_id is null then
    raise exception 'Sign in before submitting a catalogue.';
  end if;
  if jsonb_typeof(p_catalogue) is distinct from 'object' then
    raise exception 'Catalogue details are invalid.';
  end if;
  if jsonb_typeof(p_products) is distinct from 'array' then
    raise exception 'Product details must be a list.';
  end if;
  if jsonb_array_length(p_products) < 1
    or jsonb_array_length(p_products) > 50 then
    raise exception 'Submit between 1 and 50 products.';
  end if;
  if nullif(btrim(p_catalogue->>'id'), '') is null
    or nullif(btrim(p_catalogue->>'title'), '') is null
    or nullif(btrim(p_catalogue->>'brand'), '') is null
    or nullif(btrim(p_catalogue->>'category'), '') is null
    or nullif(btrim(p_catalogue->>'description'), '') is null
    or nullif(btrim(p_catalogue->>'email'), '') is null then
    raise exception 'Complete all required catalogue details.';
  end if;

  v_catalogue_id := p_catalogue->>'id';
  insert into public.catalogues (
    id, submitter_id, title, brand, category, season, product_count, description, email, files
  ) values (
    v_catalogue_id,
    v_user_id,
    btrim(p_catalogue->>'title'),
    btrim(p_catalogue->>'brand'),
    btrim(p_catalogue->>'category'),
    coalesce(p_catalogue->>'season', ''),
    jsonb_array_length(p_products),
    btrim(p_catalogue->>'description'),
    btrim(p_catalogue->>'email'),
    coalesce(p_catalogue->'files', '[]'::jsonb)
  );

  for v_product in select value from jsonb_array_elements(p_products)
  loop
    if jsonb_typeof(v_product) is distinct from 'object'
      or nullif(btrim(v_product->>'id'), '') is null
      or nullif(btrim(v_product->>'name'), '') is null
      or nullif(btrim(v_product->>'category'), '') is null
      or nullif(v_product->>'price', '') is null
      or nullif(v_product->>'image', '') is null then
      raise exception 'Each product needs a name, category, price, and photos.';
    end if;
    v_images := v_product->'images';
    if jsonb_typeof(v_images) is distinct from 'array' then
      raise exception 'Each product needs a photo list.';
    end if;
    if jsonb_array_length(v_images) < 1
      or jsonb_array_length(v_images) > 8 then
      raise exception 'Each product needs between 1 and 8 photos.';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(v_images) as image_entry(image)
      where jsonb_typeof(image_entry.image) is distinct from 'object'
        or nullif(image_entry.image->>'url', '') is null
        or nullif(image_entry.image->>'path', '') is null
        or image_entry.image->>'path' not like v_user_id::text || '/%'
    ) then
      raise exception 'Product photos must be uploaded to your own product image folder.';
    end if;
    if v_product->>'image' is distinct from v_images->0->>'url' then
      raise exception 'The primary product photo must match the first gallery photo.';
    end if;

    insert into public.products (
      id, name, category, price, image, images, vendor_id, badge
    ) values (
      v_product->>'id',
      btrim(v_product->>'name'),
      v_product->>'category',
      (v_product->>'price')::numeric,
      v_product->>'image',
      v_images,
      v_user_id,
      coalesce(v_product->>'badge', '')
    );
  end loop;

  return v_catalogue_id;
end;
$$;

revoke all on function public.submit_catalogue_with_products(jsonb, jsonb) from public, anon;
grant execute on function public.submit_catalogue_with_products(jsonb, jsonb) to authenticated;

commit;
