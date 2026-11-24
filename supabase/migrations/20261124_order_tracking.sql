create or replace function public.track_order(
  p_order_id text,
  p_customer_email text,
  p_customer_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_phone text;
begin
  if p_order_id is null or p_order_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  if p_customer_email is null or char_length(btrim(p_customer_email)) not between 1 and 254 then
    return null;
  end if;

  v_phone := regexp_replace(coalesce(p_customer_phone, ''), '[^0-9]', '', 'g');
  if char_length(v_phone) not between 10 and 15 then
    return null;
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id::uuid
    and customer_email = lower(btrim(p_customer_email))
    and regexp_replace(customer_phone, '[^0-9]', '', 'g') = v_phone;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_order.id,
    'delivery_address', v_order.delivery_address,
    'delivery_city', v_order.delivery_city,
    'delivery_state', v_order.delivery_state,
    'delivery_postal_code', v_order.delivery_postal_code,
    'items', v_order.items,
    'subtotal', v_order.subtotal,
    'payment_method', v_order.payment_method,
    'payment_status', v_order.payment_status,
    'status', v_order.status,
    'created_at', v_order.created_at
  );
end;
$$;

revoke all on function public.track_order(text, text, text) from public;
grant execute on function public.track_order(text, text, text) to anon, authenticated;
