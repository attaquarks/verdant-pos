-- Verdant POS core. Requires the standard Supabase auth schema and anon/authenticated roles.
-- No extensions or production business/demo data are installed by this migration.
begin;

create schema pos_private;
revoke all on schema pos_private from public, anon, authenticated;

create table public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 120),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  time_zone text not null,
  created_at timestamptz not null default now()
);
create table public.shop_memberships (
  shop_id uuid not null references public.shops(id),
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('owner','staff')),
  primary key (shop_id,user_id)
);
create index shop_memberships_user_idx on public.shop_memberships(user_id,shop_id);
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  name text not null check (length(btrim(name)) between 1 and 80),
  unique (shop_id,id)
);
create unique index categories_name_idx on public.categories(shop_id,lower(name));
create table public.products (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  category_id uuid,
  name text not null check (length(btrim(name)) between 1 and 160),
  sku text check (length(sku) between 1 and 80),
  barcode text check (length(barcode) between 1 and 80),
  unit text not null check (length(btrim(unit)) between 1 and 24),
  cost_price numeric check (cost_price between 0 and 999999999999.9999 and scale(cost_price)<=4),
  selling_price numeric not null check (selling_price between 0 and 999999999999.99 and scale(selling_price)<=2),
  current_stock numeric not null default 0 check (current_stock between 0 and 999999999.999 and scale(current_stock)<=3),
  low_stock_threshold numeric not null default 0 check (low_stock_threshold between 0 and 999999999.999 and scale(low_stock_threshold)<=3),
  -- Derived filter used by paginated inventory/dashboard queries; never client-writable.
  stock_status text generated always as (case when current_stock=0 then 'out' when current_stock<=low_stock_threshold then 'low' else 'in' end) stored,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id,id),
  foreign key (shop_id,category_id) references public.categories(shop_id,id)
);
create unique index products_sku_idx on public.products(shop_id,lower(sku)) where sku is not null;
create unique index products_barcode_idx on public.products(shop_id,barcode) where barcode is not null;
create index products_inventory_idx on public.products(shop_id,is_active,name,id);
create index products_category_idx on public.products(shop_id,category_id);
create index products_status_idx on public.products(shop_id,is_active,stock_status,current_stock,id);
create table public.sales (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  reference text not null,
  status text not null default 'posted' check (status in ('posted','partially_returned','returned','reversed')),
  payment_method text not null check (payment_method in ('cash','digital','credit')),
  subtotal numeric not null check (subtotal between 0 and 999999999999.99 and scale(subtotal)<=2),
  discount_total numeric not null check (discount_total between 0 and subtotal and scale(discount_total)<=2),
  total numeric not null check (total=subtotal-discount_total and total>=0 and scale(total)<=2),
  customer_name text check (length(customer_name) between 1 and 160),
  customer_contact text check (length(customer_contact) between 1 and 160),
  note text check (length(note)<=500),
  occurred_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  check (payment_method<>'credit' or customer_name is not null),
  unique (shop_id,id),
  unique (shop_id,reference),
  foreign key (shop_id,created_by) references public.shop_memberships(shop_id,user_id)
);
create index sales_date_idx on public.sales(shop_id,occurred_at desc,id);
create index sales_method_date_idx on public.sales(shop_id,payment_method,occurred_at desc);
create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  sale_id uuid not null,
  product_id uuid not null,
  product_name text not null,
  category_name text,
  sku text,
  unit text not null,
  quantity numeric not null check (quantity>0 and quantity<=999999999.999 and scale(quantity)<=3),
  unit_price numeric not null check (unit_price between 0 and 999999999999.99 and scale(unit_price)<=2),
  discount numeric not null check (discount between 0 and round(quantity*unit_price,2) and scale(discount)<=2),
  line_total numeric not null check (line_total=round(quantity*unit_price,2)-discount and line_total between 0 and 999999999999.99 and scale(line_total)<=2),
  unit_cost numeric check (unit_cost between 0 and 999999999999.9999 and scale(unit_cost)<=4),
  cost_total numeric check (cost_total between 0 and 999999999999.99 and scale(cost_total)<=2),
  check ((unit_cost is null and cost_total is null) or (unit_cost is not null and cost_total is not null and cost_total=round(quantity*unit_cost,2))),
  unique (shop_id,id),
  unique (shop_id,sale_id,id),
  unique (shop_id,sale_id,id,product_id),
  unique (sale_id,product_id),
  foreign key (shop_id,sale_id) references public.sales(shop_id,id),
  foreign key (shop_id,product_id) references public.products(shop_id,id)
);
create index sale_items_sale_idx on public.sale_items(shop_id,sale_id);
create index sale_items_product_idx on public.sale_items(shop_id,product_id);
create table public.sale_adjustments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  sale_id uuid not null,
  kind text not null check (kind in ('return','reversal')),
  reason text not null check (length(btrim(reason)) between 3 and 500),
  total numeric not null check (total between 0 and 999999999999.99 and scale(total)<=2),
  discount_total numeric not null check (discount_total between 0 and 999999999999.99 and scale(discount_total)<=2),
  -- Up to 100 lines can each have a full-range cost, even on a zero-price sale.
  cost_total numeric check (cost_total between 0 and 99999999999999.99 and scale(cost_total)<=2),
  occurred_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  unique (shop_id,id),
  unique (shop_id,sale_id,id),
  foreign key (shop_id,sale_id) references public.sales(shop_id,id),
  foreign key (shop_id,created_by) references public.shop_memberships(shop_id,user_id)
);
create index sale_adjustments_sale_idx on public.sale_adjustments(shop_id,sale_id);
create index sale_adjustments_date_idx on public.sale_adjustments(shop_id,occurred_at);
create unique index sale_adjustments_reversal_idx on public.sale_adjustments(shop_id,sale_id) where kind='reversal';
create table public.sale_adjustment_items (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  adjustment_id uuid not null,
  sale_id uuid not null,
  sale_item_id uuid not null,
  product_id uuid not null,
  quantity numeric not null check (quantity>0 and quantity<=999999999.999 and scale(quantity)<=3),
  line_total numeric not null check (line_total between 0 and 999999999999.99 and scale(line_total)<=2),
  discount numeric not null check (discount between 0 and 999999999999.99 and scale(discount)<=2),
  cost_total numeric check (cost_total between 0 and 999999999999.99 and scale(cost_total)<=2),
  restock boolean not null,
  unique (adjustment_id,sale_item_id),
  foreign key (shop_id,sale_id,adjustment_id) references public.sale_adjustments(shop_id,sale_id,id),
  foreign key (shop_id,sale_id,sale_item_id,product_id) references public.sale_items(shop_id,sale_id,id,product_id),
  foreign key (shop_id,product_id) references public.products(shop_id,id)
);
create index sale_adjustment_items_line_idx on public.sale_adjustment_items(shop_id,sale_item_id);
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  sale_id uuid not null,
  adjustment_id uuid,
  method text not null check (method in ('cash','digital')),
  kind text not null check (kind in ('sale','collection','refund')),
  amount numeric not null check (abs(amount)<=999999999999.99 and scale(amount)<=2 and ((kind in ('sale','collection') and amount>0) or (kind='refund' and amount<0))),
  note text check (length(note)<=500),
  occurred_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  check ((kind='refund' and adjustment_id is not null) or (kind<>'refund' and adjustment_id is null)),
  unique (shop_id,id),
  foreign key (shop_id,sale_id) references public.sales(shop_id,id),
  foreign key (shop_id,sale_id,adjustment_id) references public.sale_adjustments(shop_id,sale_id,id),
  foreign key (shop_id,created_by) references public.shop_memberships(shop_id,user_id)
);
create index payments_sale_idx on public.payments(shop_id,sale_id);
create index payments_date_idx on public.payments(shop_id,occurred_at);
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  description text not null check (length(btrim(description)) between 3 and 240),
  category text not null check (length(btrim(category)) between 1 and 80),
  amount numeric not null check (amount>0 and amount<=999999999999.99 and scale(amount)<=2),
  method text not null check (method in ('cash','digital')),
  occurred_at timestamptz not null,
  created_by uuid not null references auth.users(id),
  unique (shop_id,id),
  foreign key (shop_id,created_by) references public.shop_memberships(shop_id,user_id)
);
create index expenses_date_idx on public.expenses(shop_id,occurred_at desc,id);
create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  supplier text check (length(supplier) between 1 and 160),
  payment_method text not null check (payment_method in ('cash','digital','unpaid')),
  note text check (length(note)<=500),
  total numeric not null check (total between 0 and 999999999999.99 and scale(total)<=2),
  occurred_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  unique (shop_id,id),
  foreign key (shop_id,created_by) references public.shop_memberships(shop_id,user_id)
);
create index purchases_date_idx on public.purchases(shop_id,occurred_at desc);
create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  purchase_id uuid not null,
  product_id uuid not null,
  product_name text not null,
  quantity numeric not null check (quantity>0 and quantity<=999999999.999 and scale(quantity)<=3),
  unit_cost numeric not null check (unit_cost between 0 and 999999999999.9999 and scale(unit_cost)<=4),
  total numeric not null check (total=round(quantity*unit_cost,2) and total between 0 and 999999999999.99 and scale(total)<=2),
  foreign key (shop_id,purchase_id) references public.purchases(shop_id,id),
  foreign key (shop_id,product_id) references public.products(shop_id,id)
);
create index purchase_items_purchase_idx on public.purchase_items(shop_id,purchase_id);
create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  product_id uuid not null,
  kind text not null check (kind in ('opening','sale','receipt','correction','damage','missing','return','reversal')),
  quantity_delta numeric not null check (quantity_delta<>0 and abs(quantity_delta)<=999999999.999 and scale(quantity_delta)<=3),
  stock_after numeric not null check (stock_after between 0 and 999999999.999 and scale(stock_after)<=3),
  unit_cost numeric check (unit_cost between 0 and 999999999999.9999 and scale(unit_cost)<=4),
  reference_id uuid,
  sale_id uuid,
  purchase_id uuid,
  adjustment_id uuid,
  note text check (length(note)<=500),
  occurred_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  check ((kind in ('opening','receipt','return','reversal') and quantity_delta>0) or (kind in ('sale','damage','missing') and quantity_delta<0) or kind='correction'),
  check (
    (kind='sale' and reference_id is not null and sale_id is not null and sale_id=reference_id and purchase_id is null and adjustment_id is null) or
    (kind='receipt' and reference_id is not null and purchase_id is not null and purchase_id=reference_id and sale_id is null and adjustment_id is null) or
    (kind in ('return','reversal') and reference_id is not null and adjustment_id is not null and adjustment_id=reference_id and sale_id is null and purchase_id is null) or
    (kind in ('opening','correction','damage','missing') and reference_id is null and sale_id is null and purchase_id is null and adjustment_id is null)
  ),
  foreign key (shop_id,product_id) references public.products(shop_id,id),
  foreign key (shop_id,sale_id) references public.sales(shop_id,id),
  foreign key (shop_id,purchase_id) references public.purchases(shop_id,id),
  foreign key (shop_id,adjustment_id) references public.sale_adjustments(shop_id,id),
  foreign key (shop_id,created_by) references public.shop_memberships(shop_id,user_id)
);
create index inventory_movements_product_date_idx on public.inventory_movements(shop_id,product_id,occurred_at desc,id);
create table public.cashbook_entries (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  kind text not null check (kind in ('sale','credit_collection','refund','supplier_payment','expense','owner_withdrawal','owner_deposit')),
  direction text not null check (direction in ('in','out')),
  description text not null check (length(btrim(description)) between 3 and 240),
  method text not null check (method in ('cash','digital')),
  amount numeric not null check (amount>0 and amount<=999999999999.99 and scale(amount)<=2),
  source_id uuid,
  payment_id uuid,
  purchase_id uuid,
  expense_id uuid,
  occurred_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  check ((kind in ('sale','credit_collection','owner_deposit') and direction='in') or (kind in ('refund','supplier_payment','expense','owner_withdrawal') and direction='out')),
  check (
    (kind in ('sale','credit_collection','refund') and source_id is not null and payment_id is not null and payment_id=source_id and purchase_id is null and expense_id is null) or
    (kind='expense' and source_id is not null and expense_id is not null and expense_id=source_id and payment_id is null and purchase_id is null) or
    (kind='supplier_payment' and payment_id is null and expense_id is null and ((source_id is null and purchase_id is null) or (source_id is not null and purchase_id is not null and purchase_id=source_id))) or
    (kind in ('owner_deposit','owner_withdrawal') and source_id is null and payment_id is null and expense_id is null and purchase_id is null)
  ),
  foreign key (shop_id,payment_id) references public.payments(shop_id,id),
  foreign key (shop_id,purchase_id) references public.purchases(shop_id,id),
  foreign key (shop_id,expense_id) references public.expenses(shop_id,id),
  foreign key (shop_id,created_by) references public.shop_memberships(shop_id,user_id)
);
create index cashbook_date_idx on public.cashbook_entries(shop_id,occurred_at desc,id);
create unique index cashbook_payment_idx on public.cashbook_entries(shop_id,payment_id) where payment_id is not null;
create unique index cashbook_expense_idx on public.cashbook_entries(shop_id,expense_id) where expense_id is not null;
create table public.audit_records (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  user_id uuid not null references auth.users(id),
  action text not null,
  entity_id uuid not null,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  foreign key (shop_id,user_id) references public.shop_memberships(shop_id,user_id)
);
create index audit_records_date_idx on public.audit_records(shop_id,occurred_at desc);
create table public.idempotency_keys (
  shop_id uuid not null references public.shops(id),
  user_id uuid not null references auth.users(id),
  request_id uuid not null,
  operation text not null,
  payload jsonb not null,
  response jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id,request_id),
  foreign key (shop_id,user_id) references public.shop_memberships(shop_id,user_id)
);
create index idempotency_keys_shop_idx on public.idempotency_keys(shop_id,created_at);

create function public.is_shop_member(p_shop_id uuid) returns boolean
language sql stable security definer set search_path=''
as $$ select auth.uid() is not null and exists (
  select 1 from public.shop_memberships m where m.shop_id=p_shop_id and m.user_id=auth.uid()
) $$;

create function pos_private.require_member(p_shop_id uuid, p_owner boolean default false) returns uuid
language plpgsql set search_path=''
as $$
declare v_uid uuid := auth.uid(); v_role text;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select role into v_role from public.shop_memberships where shop_id=p_shop_id and user_id=v_uid;
  if v_role is null or (p_owner and v_role<>'owner') then raise exception 'Shop membership required' using errcode='42501'; end if;
  return v_uid;
end $$;

-- Checks run BEFORE any numeric typmod/coercion could silently round a client value.
create function pos_private.check_number(p_value numeric,p_scale integer,p_min numeric,p_max numeric,p_field text) returns numeric
language plpgsql immutable set search_path=''
as $$ begin
  if p_value is null or p_value::text in ('NaN','Infinity','-Infinity') or scale(p_value)>p_scale or p_value<p_min or p_value>p_max then
    raise exception 'Invalid % (range or decimal precision)',p_field using errcode='22023';
  end if;
  return p_value;
end $$;
create function pos_private.check_text(p_value text,p_min integer,p_max integer,p_field text,p_optional boolean default false) returns text
language plpgsql immutable set search_path=''
as $$ declare v text := nullif(btrim(p_value),''); begin
  if v is null and p_optional then return null; end if;
  if v is null or length(v)<p_min or length(v)>p_max then raise exception 'Invalid %',p_field using errcode='22023'; end if;
  return v;
end $$;
create function pos_private.json_number(p_value jsonb,p_scale integer,p_min numeric,p_max numeric,p_field text) returns numeric
language plpgsql immutable set search_path=''
as $$ begin
  if p_value is null or jsonb_typeof(p_value) not in ('number','string') or (p_value #>> '{}') !~ '^-?[0-9]+(\.[0-9]+)?$' or length(p_value #>> '{}')>40 then
    raise exception 'Invalid %',p_field using errcode='22023';
  end if;
  return pos_private.check_number((p_value #>> '{}')::numeric,p_scale,p_min,p_max,p_field);
end $$;
create function pos_private.json_uuid(p_value jsonb,p_field text,p_optional boolean default false) returns uuid
language plpgsql immutable set search_path=''
as $$ begin
  if (p_value is null or p_value='null'::jsonb) and p_optional then return null; end if;
  if p_value is null or jsonb_typeof(p_value)<>'string' or (p_value #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Invalid %',p_field using errcode='22023';
  end if;
  return (p_value #>> '{}')::uuid;
end $$;
create function pos_private.json_text(p_value jsonb,p_min integer,p_max integer,p_field text,p_optional boolean default false) returns text
language plpgsql immutable set search_path=''
as $$ begin
  if (p_value is null or p_value='null'::jsonb) and p_optional then return null; end if;
  if p_value is null or jsonb_typeof(p_value)<>'string' then raise exception 'Invalid %',p_field using errcode='22023'; end if;
  return pos_private.check_text(p_value #>> '{}',p_min,p_max,p_field,p_optional);
end $$;
create function pos_private.check_object(p_value jsonb,p_keys text[]) returns void
language plpgsql immutable set search_path=''
as $$ begin
  if p_value is null or jsonb_typeof(p_value)<>'object' then raise exception 'Expected an object' using errcode='22023'; end if;
  if exists (select 1 from jsonb_object_keys(p_value) k where not k=any(p_keys)) then raise exception 'Unexpected payload field' using errcode='22023'; end if;
  if not (p_value ?& p_keys) then raise exception 'Missing payload field (nullable fields must be explicit)' using errcode='22023'; end if;
end $$;
create function pos_private.check_array(p_value jsonb,p_max integer,p_field text) returns void
language plpgsql immutable set search_path=''
as $$ begin
  if p_value is null or jsonb_typeof(p_value)<>'array' then raise exception 'Invalid %',p_field using errcode='22023'; end if;
  if jsonb_array_length(p_value)<1 or jsonb_array_length(p_value)>p_max then raise exception 'Invalid % count',p_field using errcode='22023'; end if;
end $$;
create function pos_private.check_method(p_method text,p_credit boolean default false,p_unpaid boolean default false) returns void
language plpgsql immutable set search_path=''
as $$ begin
  if p_method is null or not (p_method in ('cash','digital') or (p_credit and p_method='credit') or (p_unpaid and p_method='unpaid')) then
    raise exception 'Invalid payment method' using errcode='22023';
  end if;
end $$;
create function pos_private.check_shop(p_name text,p_currency text,p_time_zone text) returns void
language plpgsql stable set search_path=''
as $$ begin
  perform pos_private.check_text(p_name,2,120,'shop name');
  if p_currency is null or p_currency <> all(array['AED','AFN','ALL','AMD','ANG','AOA','ARS','AUD','AWG','AZN','BAM','BBD','BDT','BGN','BHD','BIF','BMD','BND','BOB','BRL','BSD','BTN','BWP','BYN','BZD','CAD','CDF','CHF','CLP','CNY','COP','CRC','CUC','CUP','CVE','CZK','DJF','DKK','DOP','DZD','EGP','ERN','ETB','EUR','FJD','FKP','GBP','GEL','GHS','GIP','GMD','GNF','GTQ','GYD','HKD','HNL','HRK','HTG','HUF','IDR','ILS','INR','IQD','IRR','ISK','JMD','JOD','JPY','KES','KGS','KHR','KMF','KPW','KRW','KWD','KYD','KZT','LAK','LBP','LKR','LRD','LSL','LYD','MAD','MDL','MGA','MKD','MMK','MNT','MOP','MRU','MUR','MVR','MWK','MXN','MYR','MZN','NAD','NGN','NIO','NOK','NPR','NZD','OMR','PAB','PEN','PGK','PHP','PKR','PLN','PYG','QAR','RON','RSD','RUB','RWF','SAR','SBD','SCR','SDG','SEK','SGD','SHP','SLE','SLL','SOS','SRD','SSP','STN','SVC','SYP','SZL','THB','TJS','TMT','TND','TOP','TRY','TTD','TWD','TZS','UAH','UGX','USD','UYU','UZS','VES','VND','VUV','WST','XAF','XCD','XCG','XDR','XOF','XPF','XSU','YER','ZAR','ZMW','ZWG','ZWL']) then raise exception 'Invalid currency' using errcode='22023'; end if;
  if p_time_zone is null or length(p_time_zone)>80 or p_time_zone like 'posix/%' or p_time_zone like 'right/%' or not exists (select 1 from pg_catalog.pg_timezone_names where name=p_time_zone) then raise exception 'Invalid time zone' using errcode='22023'; end if;
end $$;

-- INSERT ON CONFLICT waits for an in-flight request in another session. A failed
-- transaction removes the reservation, so failures NEVER consume a key.
create function pos_private.start_request(p_shop_id uuid,p_operation text,p_payload jsonb,p_request_id uuid) returns jsonb
language plpgsql set search_path=''
as $$
declare v_uid uuid; v_key public.idempotency_keys%rowtype; v_inserted integer;
begin
  v_uid := pos_private.require_member(p_shop_id);
  -- Settings serialize against all mutations, preventing a currency-change/post race.
  if p_operation='update_shop' then
    perform id from public.shops where id=p_shop_id for update;
  else
    perform id from public.shops where id=p_shop_id for share;
  end if;
  if p_request_id is null then raise exception 'request_id is required' using errcode='22023'; end if;
  insert into public.idempotency_keys(shop_id,user_id,request_id,operation,payload)
  values(p_shop_id,v_uid,p_request_id,p_operation,p_payload)
  on conflict (user_id,request_id) do nothing;
  get diagnostics v_inserted = row_count;
  select * into strict v_key from public.idempotency_keys where user_id=v_uid and request_id=p_request_id for update;
  if v_key.shop_id is distinct from p_shop_id or v_key.operation is distinct from p_operation or v_key.payload is distinct from p_payload then
    raise exception 'Idempotency key reused with a different payload' using errcode='23505';
  end if;
  if v_inserted=0 and v_key.response is null then raise exception 'Incomplete idempotency record' using errcode='55000'; end if;
  return v_key.response;
end $$;
create function pos_private.finish_request(p_shop_id uuid,p_request_id uuid,p_response jsonb,p_action text,p_entity_id uuid) returns jsonb
language plpgsql set search_path=''
as $$ begin
  update public.idempotency_keys set response=p_response where shop_id=p_shop_id and user_id=auth.uid() and request_id=p_request_id and response is null;
  if not found then raise exception 'Missing idempotency reservation' using errcode='55000'; end if;
  insert into public.audit_records(shop_id,user_id,action,entity_id,details) values(p_shop_id,auth.uid(),p_action,p_entity_id,jsonb_build_object('request_id',p_request_id));
  return p_response;
end $$;

create function pos_private.immutable_row() returns trigger language plpgsql set search_path=''
as $$ begin raise exception 'Posted history is immutable' using errcode='42501'; end $$;
create function pos_private.protect_sale() returns trigger language plpgsql set search_path=''
as $$ begin
  if tg_op='DELETE' then raise exception 'Posted sales cannot be deleted' using errcode='42501'; end if;
  if (to_jsonb(new)-'status') is distinct from (to_jsonb(old)-'status') then raise exception 'Sale snapshots are immutable' using errcode='42501'; end if;
  if new.status is distinct from old.status and not (
    (old.status='posted' and new.status in ('partially_returned','returned','reversed')) or
    (old.status='partially_returned' and new.status='returned') or
    (old.status='partially_returned' and new.status='partially_returned')
  ) then raise exception 'Invalid sale status transition' using errcode='22023'; end if;
  return new;
end $$;
create trigger protect_sales before update or delete on public.sales for each row execute function pos_private.protect_sale();
do $$ declare t text; begin
  foreach t in array array['sale_items','sale_adjustments','sale_adjustment_items','payments','expenses','purchases','purchase_items','inventory_movements','cashbook_entries','audit_records'] loop
    execute format('create trigger immutable_history before update or delete on public.%I for each row execute function pos_private.immutable_row()',t);
  end loop;
end $$;
create function pos_private.protect_currency() returns trigger language plpgsql set search_path=''
as $$ begin
  if new.currency is distinct from old.currency and (
    exists(select 1 from public.sales where shop_id=old.id) or
    exists(select 1 from public.purchases where shop_id=old.id) or
    exists(select 1 from public.cashbook_entries where shop_id=old.id) or
    exists(select 1 from public.expenses where shop_id=old.id)
  ) then raise exception 'Currency cannot change after financial activity' using errcode='23514'; end if;
  return new;
end $$;
create trigger protect_shop_currency before update on public.shops for each row execute function pos_private.protect_currency();

create function public.create_shop(p_name text,p_currency text,p_time_zone text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_uid uuid := auth.uid(); v_id uuid := gen_random_uuid(); v_payload jsonb; v_key public.idempotency_keys%rowtype; v_response jsonb;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_request_id is null then raise exception 'request_id is required' using errcode='22023'; end if;
  -- Bootstrap has no shop yet. The existing auth user row serializes bootstrap for this actor.
  perform id from auth.users where id=v_uid for update;
  if not found then raise exception 'Authenticated user not found' using errcode='42501'; end if;
  v_payload := jsonb_build_object('name',p_name,'currency',p_currency,'time_zone',p_time_zone);
  select * into v_key from public.idempotency_keys where user_id=v_uid and request_id=p_request_id for update;
  if found then
    if v_key.operation<>'create_shop' or v_key.payload is distinct from v_payload then raise exception 'Idempotency key reused with a different payload' using errcode='23505'; end if;
    perform pos_private.require_member(v_key.shop_id,true);
    return v_key.response;
  end if;
  if exists(select 1 from public.shop_memberships where user_id=v_uid) then raise exception 'User already belongs to a shop' using errcode='23505'; end if;
  perform pos_private.check_shop(p_name,p_currency,p_time_zone);
  insert into public.shops(id,name,currency,time_zone) values(v_id,btrim(p_name),p_currency,p_time_zone);
  insert into public.shop_memberships(shop_id,user_id,role) values(v_id,v_uid,'owner');
  v_response := jsonb_build_object('id',v_id);
  insert into public.idempotency_keys(shop_id,user_id,request_id,operation,payload,response) values(v_id,v_uid,p_request_id,'create_shop',v_payload,v_response);
  insert into public.audit_records(shop_id,user_id,action,entity_id,details) values(v_id,v_uid,'create_shop',v_id,jsonb_build_object('request_id',p_request_id));
  return v_response;
end $$;

create function public.update_shop(p_shop_id uuid,p_name text,p_currency text,p_time_zone text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=''
as $$ declare v_result jsonb; begin
  perform pos_private.require_member(p_shop_id,true);
  v_result := pos_private.start_request(p_shop_id,'update_shop',jsonb_build_object('name',p_name,'currency',p_currency,'time_zone',p_time_zone),p_request_id);
  if v_result is not null then return v_result; end if;
  perform pos_private.check_shop(p_name,p_currency,p_time_zone);
  update public.shops set name=btrim(p_name),currency=p_currency,time_zone=p_time_zone where id=p_shop_id;
  return pos_private.finish_request(p_shop_id,p_request_id,jsonb_build_object('id',p_shop_id),'update_shop',p_shop_id);
end $$;

create function public.create_category(p_shop_id uuid,p_name text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=''
as $$ declare v_result jsonb; v_id uuid := gen_random_uuid(); v_name text; begin
  v_result := pos_private.start_request(p_shop_id,'create_category',jsonb_build_object('name',p_name),p_request_id);
  if v_result is not null then return v_result; end if;
  v_name := pos_private.check_text(p_name,1,80,'category name');
  insert into public.categories(id,shop_id,name) values(v_id,p_shop_id,v_name);
  return pos_private.finish_request(p_shop_id,p_request_id,jsonb_build_object('id',v_id),'create_category',v_id);
end $$;

-- Private implementation: only the checked/authorized/idempotent public wrappers can call this.
create function pos_private.save_product_core(p_shop_id uuid,p_product_id uuid,p_product jsonb) returns uuid
language plpgsql set search_path=''
as $$
declare v_id uuid := coalesce(p_product_id,gen_random_uuid()); v_name text; v_cat uuid; v_sku text; v_barcode text; v_unit text;
  v_cost numeric; v_price numeric; v_stock numeric; v_low numeric; v_active boolean; v_now timestamptz := now();
begin
  perform pos_private.check_object(p_product,array['name','category_id','sku','barcode','unit','cost_price','selling_price','opening_stock','low_stock_threshold','is_active']);
  v_name := pos_private.json_text(p_product->'name',1,160,'product name');
  v_cat := pos_private.json_uuid(p_product->'category_id','category_id',true);
  v_sku := pos_private.json_text(p_product->'sku',1,80,'SKU',true);
  v_barcode := pos_private.json_text(p_product->'barcode',1,80,'barcode',true);
  v_unit := pos_private.json_text(p_product->'unit',1,24,'unit');
  if not (p_product ? 'cost_price') then raise exception 'cost_price must be explicit (null means unknown)' using errcode='22023'; end if;
  if p_product->'cost_price'<>'null'::jsonb then v_cost := pos_private.json_number(p_product->'cost_price',4,0,999999999999.9999,'cost_price'); end if;
  v_price := pos_private.json_number(p_product->'selling_price',2,0,999999999999.99,'selling_price');
  v_stock := pos_private.json_number(p_product->'opening_stock',3,0,999999999.999,'opening_stock');
  v_low := pos_private.json_number(p_product->'low_stock_threshold',3,0,999999999.999,'low_stock_threshold');
  if jsonb_typeof(p_product->'is_active') is distinct from 'boolean' then raise exception 'is_active must be boolean' using errcode='22023'; end if;
  v_active := (p_product->>'is_active')::boolean;
  if v_cat is not null and not exists(select 1 from public.categories where shop_id=p_shop_id and id=v_cat) then raise exception 'Category not found in this shop' using errcode='22023'; end if;
  if p_product_id is null then
    insert into public.products(id,shop_id,category_id,name,sku,barcode,unit,cost_price,selling_price,current_stock,low_stock_threshold,is_active,created_at,updated_at)
    values(v_id,p_shop_id,v_cat,v_name,v_sku,v_barcode,v_unit,v_cost,v_price,v_stock,v_low,v_active,v_now,v_now);
    if v_stock>0 then
      insert into public.inventory_movements(shop_id,product_id,kind,quantity_delta,stock_after,unit_cost,created_by)
      values(p_shop_id,v_id,'opening',v_stock,v_stock,v_cost,auth.uid());
    end if;
  else
    if v_stock<>0 then raise exception 'Opening stock is only allowed for new products; use receiving or adjustment' using errcode='22023'; end if;
    perform id from public.products where shop_id=p_shop_id and id=p_product_id for update;
    if not found then raise exception 'Product not found in this shop' using errcode='22023'; end if;
    update public.products set category_id=v_cat,name=v_name,sku=v_sku,barcode=v_barcode,unit=v_unit,cost_price=v_cost,selling_price=v_price,low_stock_threshold=v_low,is_active=v_active,updated_at=v_now
    where shop_id=p_shop_id and id=p_product_id;
  end if;
  return v_id;
end $$;
create function public.save_product(p_shop_id uuid,p_product_id uuid,p_product jsonb,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=''
as $$ declare v_result jsonb; v_id uuid; begin
  v_result := pos_private.start_request(p_shop_id,'save_product',jsonb_build_object('product_id',p_product_id,'product',p_product),p_request_id);
  if v_result is not null then return v_result; end if;
  v_id := pos_private.save_product_core(p_shop_id,p_product_id,p_product);
  return pos_private.finish_request(p_shop_id,p_request_id,jsonb_build_object('id',v_id),'save_product',v_id);
end $$;
create function public.import_products(p_shop_id uuid,p_products jsonb,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=''
as $$ declare v_result jsonb; v_row jsonb; v_name text; v_cat uuid; v_id uuid; v_ids jsonb := '[]'::jsonb; v_import_id uuid := gen_random_uuid(); begin
  v_result := pos_private.start_request(p_shop_id,'import_products',jsonb_build_object('products',p_products),p_request_id);
  if v_result is not null then return v_result; end if;
  perform pos_private.check_array(p_products,500,'products');
  for v_row in select value from jsonb_array_elements(p_products) loop
    perform pos_private.check_object(v_row,array['name','category_name','sku','barcode','unit','cost_price','selling_price','opening_stock','low_stock_threshold','is_active']);
    v_name := pos_private.json_text(v_row->'category_name',1,80,'category_name',true);
    v_cat := null;
    if v_name is not null then
      insert into public.categories(shop_id,name) values(p_shop_id,v_name) on conflict (shop_id,lower(name)) do nothing;
      select id into strict v_cat from public.categories where shop_id=p_shop_id and lower(name)=lower(v_name);
    end if;
    v_id := pos_private.save_product_core(p_shop_id,null,(v_row-'category_name')||jsonb_build_object('category_id',v_cat));
    v_ids := v_ids || jsonb_build_array(v_id);
  end loop;
  return pos_private.finish_request(p_shop_id,p_request_id,jsonb_build_object('id',v_import_id,'count',jsonb_array_length(p_products),'product_ids',v_ids),'import_products',v_import_id);
end $$;

create function public.receive_stock(p_shop_id uuid,p_product_id uuid,p_quantity numeric,p_unit_cost numeric,p_supplier text,p_payment_method text,p_note text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=''
as $$ declare v_result jsonb; v_p public.products%rowtype; v_id uuid := gen_random_uuid(); v_cost numeric; v_stock numeric; v_total numeric; v_supplier text; v_note text; begin
  v_result := pos_private.start_request(p_shop_id,'receive_stock',jsonb_build_object('product_id',p_product_id,'quantity',p_quantity,'unit_cost',p_unit_cost,'supplier',p_supplier,'payment_method',p_payment_method,'note',p_note),p_request_id);
  if v_result is not null then return v_result; end if;
  perform pos_private.check_number(p_quantity,3,0.001,999999999.999,'quantity');
  perform pos_private.check_number(p_unit_cost,4,0,999999999999.9999,'unit_cost');
  perform pos_private.check_method(p_payment_method,false,true);
  v_supplier := pos_private.check_text(p_supplier,1,160,'supplier',true);
  v_note := pos_private.check_text(p_note,1,500,'note',true);
  select * into v_p from public.products where shop_id=p_shop_id and id=p_product_id for update;
  if not found then raise exception 'Product not found in this shop' using errcode='22023'; end if;
  v_stock := pos_private.check_number(v_p.current_stock+p_quantity,3,0,999999999.999,'resulting stock');
  v_total := pos_private.check_number(round(p_quantity*p_unit_cost,2),2,0,999999999999.99,'purchase total');
  -- Never turn unknown cost on existing stock into a fictitious zero cost.
  v_cost := case when v_p.current_stock=0 then p_unit_cost when v_p.cost_price is null then null
    else round((v_p.current_stock*v_p.cost_price+p_quantity*p_unit_cost)/v_stock,4) end;
  update public.products set current_stock=v_stock,cost_price=v_cost,updated_at=now() where shop_id=p_shop_id and id=p_product_id;
  insert into public.purchases(id,shop_id,supplier,payment_method,note,total,created_by) values(v_id,p_shop_id,v_supplier,p_payment_method,v_note,v_total,auth.uid());
  insert into public.purchase_items(shop_id,purchase_id,product_id,product_name,quantity,unit_cost,total) values(p_shop_id,v_id,p_product_id,v_p.name,p_quantity,p_unit_cost,v_total);
  insert into public.inventory_movements(shop_id,product_id,kind,quantity_delta,stock_after,unit_cost,reference_id,purchase_id,note,created_by)
  values(p_shop_id,p_product_id,'receipt',p_quantity,v_stock,p_unit_cost,v_id,v_id,v_note,auth.uid());
  if p_payment_method<>'unpaid' and v_total>0 then
    insert into public.cashbook_entries(shop_id,kind,direction,description,method,amount,source_id,purchase_id,created_by)
    values(p_shop_id,'supplier_payment','out','Stock receipt',p_payment_method,v_total,v_id,v_id,auth.uid());
  end if;
  return pos_private.finish_request(p_shop_id,p_request_id,jsonb_build_object('id',v_id,'total',v_total::text,'current_stock',v_stock::text,'cost_price',v_cost::text),'receive_stock',v_id);
end $$;

create function public.adjust_stock(p_shop_id uuid,p_product_id uuid,p_quantity_delta numeric,p_kind text,p_note text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=''
as $$ declare v_result jsonb; v_p public.products%rowtype; v_stock numeric; v_id uuid := gen_random_uuid(); v_note text; begin
  v_result := pos_private.start_request(p_shop_id,'adjust_stock',jsonb_build_object('product_id',p_product_id,'quantity_delta',p_quantity_delta,'kind',p_kind,'note',p_note),p_request_id);
  if v_result is not null then return v_result; end if;
  perform pos_private.check_number(p_quantity_delta,3,-999999999.999,999999999.999,'quantity_delta');
  if p_quantity_delta=0 or p_kind is null or p_kind not in ('correction','damage','missing') or (p_kind in ('damage','missing') and p_quantity_delta>=0) then raise exception 'Invalid stock adjustment' using errcode='22023'; end if;
  v_note := pos_private.check_text(p_note,3,500,'note');
  select * into v_p from public.products where shop_id=p_shop_id and id=p_product_id for update;
  if not found then raise exception 'Product not found in this shop' using errcode='22023'; end if;
  v_stock := pos_private.check_number(v_p.current_stock+p_quantity_delta,3,0,999999999.999,'resulting stock');
  update public.products set current_stock=v_stock,updated_at=now() where shop_id=p_shop_id and id=p_product_id;
  insert into public.inventory_movements(id,shop_id,product_id,kind,quantity_delta,stock_after,unit_cost,note,created_by)
  values(v_id,p_shop_id,p_product_id,p_kind,p_quantity_delta,v_stock,v_p.cost_price,v_note,auth.uid());
  return pos_private.finish_request(p_shop_id,p_request_id,jsonb_build_object('id',v_id,'current_stock',v_stock::text),'adjust_stock',v_id);
end $$;

create function public.post_sale(p_shop_id uuid,p_items jsonb,p_payment_method text,p_customer_name text,p_customer_contact text,p_note text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_result jsonb; v_line jsonb; v_p public.products%rowtype; v_product_id uuid; v_quantity numeric; v_price numeric; v_discount numeric;
  v_gross numeric; v_subtotal numeric := 0; v_discounts numeric := 0; v_total numeric; v_cost numeric; v_stock numeric;
  v_lines jsonb := '[]'::jsonb; v_id uuid := gen_random_uuid(); v_payment_id uuid := gen_random_uuid(); v_reference text;
  v_customer text; v_contact text; v_note text; v_category text;
begin
  v_result := pos_private.start_request(p_shop_id,'post_sale',jsonb_build_object('items',p_items,'payment_method',p_payment_method,'customer_name',p_customer_name,'customer_contact',p_customer_contact,'note',p_note),p_request_id);
  if v_result is not null then return v_result; end if;
  perform pos_private.check_array(p_items,100,'sale items');
  perform pos_private.check_method(p_payment_method,true);
  v_customer := pos_private.check_text(p_customer_name,1,160,'customer name',true);
  v_contact := pos_private.check_text(p_customer_contact,1,160,'customer contact',true);
  v_note := pos_private.check_text(p_note,1,500,'note',true);
  if p_payment_method='credit' and v_customer is null then raise exception 'Credit requires customer name' using errcode='22023'; end if;
  for v_line in select value from jsonb_array_elements(p_items) loop
    perform pos_private.check_object(v_line,array['product_id','quantity','unit_price','discount']);
    perform pos_private.json_uuid(v_line->'product_id','product_id');
    perform pos_private.json_number(v_line->'quantity',3,0.001,999999999.999,'quantity');
    perform pos_private.json_number(v_line->'unit_price',2,0,999999999999.99,'unit_price');
    perform pos_private.json_number(v_line->'discount',2,0,999999999999.99,'discount');
  end loop;
  if exists(select 1 from jsonb_array_elements(p_items) x group by (x->>'product_id')::uuid having count(*)>1) then raise exception 'Duplicate product in sale' using errcode='22023'; end if;
  -- Every stock-changing routine locks product rows in this same stable UUID order.
  perform p.id from public.products p where p.shop_id=p_shop_id and p.id in (select (x->>'product_id')::uuid from jsonb_array_elements(p_items) x) order by p.id for update;
  for v_line in select value from jsonb_array_elements(p_items) order by (value->>'product_id')::uuid loop
    v_product_id := (v_line->>'product_id')::uuid;
    select * into v_p from public.products where shop_id=p_shop_id and id=v_product_id;
    if not found or not v_p.is_active then raise exception 'Active product not found in this shop' using errcode='22023'; end if;
    v_quantity := (v_line->>'quantity')::numeric; v_price := (v_line->>'unit_price')::numeric; v_discount := (v_line->>'discount')::numeric;
    if v_quantity>v_p.current_stock then raise exception 'Insufficient stock for %',v_p.name using errcode='23514'; end if;
    v_gross := pos_private.check_number(round(v_quantity*v_price,2),2,0,999999999999.99,'line subtotal');
    if v_discount>v_gross then raise exception 'Discount exceeds line subtotal' using errcode='22023'; end if;
    v_cost := case when v_p.cost_price is null then null else pos_private.check_number(round(v_quantity*v_p.cost_price,2),2,0,999999999999.99,'line cost') end;
    select name into v_category from public.categories where shop_id=p_shop_id and id=v_p.category_id;
    v_lines := v_lines||jsonb_build_array(jsonb_build_object('product_id',v_p.id,'product_name',v_p.name,'category_name',v_category,'sku',v_p.sku,'unit',v_p.unit,'quantity',v_quantity,'unit_price',v_price,'discount',v_discount,'line_total',v_gross-v_discount,'unit_cost',v_p.cost_price,'cost_total',v_cost));
    v_subtotal := v_subtotal+v_gross; v_discounts := v_discounts+v_discount;
  end loop;
  perform pos_private.check_number(v_subtotal,2,0,999999999999.99,'sale subtotal');
  v_total := v_subtotal-v_discounts;
  v_reference := 'S-'||upper(replace(v_id::text,'-',''));
  insert into public.sales(id,shop_id,reference,payment_method,subtotal,discount_total,total,customer_name,customer_contact,note,created_by)
  values(v_id,p_shop_id,v_reference,p_payment_method,v_subtotal,v_discounts,v_total,v_customer,v_contact,v_note,auth.uid());
  for v_line in select value from jsonb_array_elements(v_lines) loop
    v_product_id := (v_line->>'product_id')::uuid; v_quantity := (v_line->>'quantity')::numeric;
    insert into public.sale_items(shop_id,sale_id,product_id,product_name,category_name,sku,unit,quantity,unit_price,discount,line_total,unit_cost,cost_total)
    values(p_shop_id,v_id,v_product_id,v_line->>'product_name',v_line->>'category_name',v_line->>'sku',v_line->>'unit',v_quantity,(v_line->>'unit_price')::numeric,(v_line->>'discount')::numeric,(v_line->>'line_total')::numeric,(v_line->>'unit_cost')::numeric,(v_line->>'cost_total')::numeric);
    update public.products set current_stock=current_stock-v_quantity,updated_at=now() where shop_id=p_shop_id and id=v_product_id returning current_stock into v_stock;
    insert into public.inventory_movements(shop_id,product_id,kind,quantity_delta,stock_after,unit_cost,reference_id,sale_id,created_by)
    values(p_shop_id,v_product_id,'sale',-v_quantity,v_stock,(v_line->>'unit_cost')::numeric,v_id,v_id,auth.uid());
  end loop;
  if p_payment_method<>'credit' and v_total>0 then
    insert into public.payments(id,shop_id,sale_id,method,kind,amount,created_by) values(v_payment_id,p_shop_id,v_id,p_payment_method,'sale',v_total,auth.uid());
    insert into public.cashbook_entries(shop_id,kind,direction,description,method,amount,source_id,payment_id,created_by)
    values(p_shop_id,'sale','in','Sale '||v_reference,p_payment_method,v_total,v_payment_id,v_payment_id,auth.uid());
  end if;
  return pos_private.finish_request(p_shop_id,p_request_id,jsonb_build_object('id',v_id,'reference',v_reference,'total',v_total::text),'post_sale',v_id);
end $$;

create function public.collect_payment(p_shop_id uuid,p_sale_id uuid,p_amount numeric,p_method text,p_note text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=''
as $$ declare v_result jsonb; v_sale public.sales%rowtype; v_paid numeric; v_returned numeric; v_due numeric; v_id uuid := gen_random_uuid(); v_note text; begin
  v_result := pos_private.start_request(p_shop_id,'collect_payment',jsonb_build_object('sale_id',p_sale_id,'amount',p_amount,'method',p_method,'note',p_note),p_request_id);
  if v_result is not null then return v_result; end if;
  perform pos_private.check_number(p_amount,2,0.01,999999999999.99,'amount');
  perform pos_private.check_method(p_method);
  v_note := pos_private.check_text(p_note,1,500,'note',true);
  select * into v_sale from public.sales where shop_id=p_shop_id and id=p_sale_id for update;
  if not found or v_sale.payment_method<>'credit' or v_sale.status in ('returned','reversed') then raise exception 'Collectable credit sale not found' using errcode='22023'; end if;
  select coalesce(sum(amount),0) into v_paid from public.payments where shop_id=p_shop_id and sale_id=p_sale_id;
  select coalesce(sum(total),0) into v_returned from public.sale_adjustments where shop_id=p_shop_id and sale_id=p_sale_id;
  v_due := v_sale.total-v_returned-v_paid;
  if p_amount>v_due then raise exception 'Amount exceeds balance due' using errcode='23514'; end if;
  insert into public.payments(id,shop_id,sale_id,method,kind,amount,note,created_by) values(v_id,p_shop_id,p_sale_id,p_method,'collection',p_amount,v_note,auth.uid());
  insert into public.cashbook_entries(shop_id,kind,direction,description,method,amount,source_id,payment_id,created_by)
  values(p_shop_id,'credit_collection','in','Collection '||v_sale.reference,p_method,p_amount,v_id,v_id,auth.uid());
  return pos_private.finish_request(p_shop_id,p_request_id,jsonb_build_object('id',v_id,'balance_due',(v_due-p_amount)::text),'collect_payment',v_id);
end $$;

create function pos_private.return_core(p_shop_id uuid,p_sale_id uuid,p_items jsonb,p_reason text,p_refund_method text,p_reverse boolean) returns jsonb
language plpgsql set search_path=''
as $$
declare v_sale public.sales%rowtype; v_item public.sale_items%rowtype; v_row jsonb; v_items jsonb := p_items; v_lines jsonb := '[]'::jsonb;
  v_id uuid := gen_random_uuid(); v_payment_id uuid := gen_random_uuid(); v_qty numeric; v_prior_qty numeric; v_prior_total numeric; v_prior_discount numeric; v_prior_cost numeric;
  v_line_total numeric; v_line_discount numeric; v_line_cost numeric; v_total numeric := 0; v_discount numeric := 0; v_cost numeric := 0; v_unknown boolean := false;
  v_paid numeric; v_returned numeric; v_refund numeric; v_stock numeric; v_restock boolean; v_kind text := case when p_reverse then 'reversal' else 'return' end; v_status text;
begin
  perform pos_private.check_method(p_refund_method);
  perform pos_private.check_text(p_reason,3,500,'reason');
  -- Sale lock serializes ALL collections, returns and reversals, not just stock updates.
  select * into v_sale from public.sales where shop_id=p_shop_id and id=p_sale_id for update;
  if not found or v_sale.status in ('returned','reversed') then raise exception 'Returnable sale not found' using errcode='22023'; end if;
  if p_reverse then
    if exists(select 1 from public.sale_adjustments where shop_id=p_shop_id and sale_id=p_sale_id) then raise exception 'A sale with prior returns cannot be reversed; return remaining items' using errcode='23514'; end if;
    select jsonb_agg(jsonb_build_object('sale_item_id',id,'quantity',quantity,'restock',true) order by id) into v_items from public.sale_items where shop_id=p_shop_id and sale_id=p_sale_id;
  end if;
  perform pos_private.check_array(v_items,100,'return items');
  for v_row in select value from jsonb_array_elements(v_items) loop
    perform pos_private.check_object(v_row,array['sale_item_id','quantity','restock']);
    perform pos_private.json_uuid(v_row->'sale_item_id','sale_item_id');
    perform pos_private.json_number(v_row->'quantity',3,0.001,999999999.999,'quantity');
    if jsonb_typeof(v_row->'restock') is distinct from 'boolean' then raise exception 'restock must be boolean' using errcode='22023'; end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(v_items) x group by (x->>'sale_item_id')::uuid having count(*)>1) then raise exception 'Duplicate item in return' using errcode='22023'; end if;
  for v_row in select value from jsonb_array_elements(v_items) order by (value->>'sale_item_id')::uuid loop
    select * into v_item from public.sale_items where shop_id=p_shop_id and sale_id=p_sale_id and id=(v_row->>'sale_item_id')::uuid;
    if not found then raise exception 'Sale item not found in this sale and shop' using errcode='22023'; end if;
    v_qty := (v_row->>'quantity')::numeric;
    select coalesce(sum(quantity),0),coalesce(sum(line_total),0),coalesce(sum(discount),0),coalesce(sum(cost_total),0)
    into v_prior_qty,v_prior_total,v_prior_discount,v_prior_cost from public.sale_adjustment_items where shop_id=p_shop_id and sale_item_id=v_item.id;
    if v_prior_qty+v_qty>v_item.quantity then raise exception 'Return exceeds remaining quantity' using errcode='23514'; end if;
    -- Exact cumulative rounding: each event is the new rounded cumulative target
    -- less the amount already returned. The final event exhausts the snapshot exactly.
    v_line_total := round(v_item.line_total*(v_prior_qty+v_qty)/v_item.quantity,2)-v_prior_total;
    v_line_discount := round(v_item.discount*(v_prior_qty+v_qty)/v_item.quantity,2)-v_prior_discount;
    v_line_cost := case when v_item.cost_total is null then null else round(v_item.cost_total*(v_prior_qty+v_qty)/v_item.quantity,2)-v_prior_cost end;
    v_total := v_total+v_line_total; v_discount := v_discount+v_line_discount;
    if v_line_cost is null then v_unknown := true; else v_cost := v_cost+v_line_cost; end if;
    v_lines := v_lines||jsonb_build_array(jsonb_build_object('sale_item_id',v_item.id,'product_id',v_item.product_id,'quantity',v_qty,'line_total',v_line_total,'discount',v_line_discount,'cost_total',v_line_cost,'unit_cost',v_item.unit_cost,'restock',(v_row->>'restock')::boolean));
  end loop;
  perform p.id from public.products p where p.shop_id=p_shop_id and p.id in (
    select (x->>'product_id')::uuid from jsonb_array_elements(v_lines) x where (x->>'restock')::boolean
  ) order by p.id for update;
  insert into public.sale_adjustments(id,shop_id,sale_id,kind,reason,total,discount_total,cost_total,created_by)
  values(v_id,p_shop_id,p_sale_id,v_kind,btrim(p_reason),v_total,v_discount,case when v_unknown then null else v_cost end,auth.uid());
  for v_row in select value from jsonb_array_elements(v_lines) order by (value->>'product_id')::uuid loop
    v_qty := (v_row->>'quantity')::numeric; v_restock := (v_row->>'restock')::boolean;
    insert into public.sale_adjustment_items(shop_id,adjustment_id,sale_id,sale_item_id,product_id,quantity,line_total,discount,cost_total,restock)
    values(p_shop_id,v_id,p_sale_id,(v_row->>'sale_item_id')::uuid,(v_row->>'product_id')::uuid,v_qty,(v_row->>'line_total')::numeric,(v_row->>'discount')::numeric,(v_row->>'cost_total')::numeric,v_restock);
    if v_restock then
      select current_stock into v_stock from public.products where shop_id=p_shop_id and id=(v_row->>'product_id')::uuid;
      v_stock := pos_private.check_number(v_stock+v_qty,3,0,999999999.999,'resulting stock');
      -- Reintroduce known-cost returned inventory at its immutable original cost.
      -- If either existing or returned positive stock has unknown cost, retain unknown.
      update public.products set
        cost_price=case
          when current_stock=0 then (v_row->>'unit_cost')::numeric
          when cost_price is null or v_row->>'unit_cost' is null then null
          else round((current_stock*cost_price+v_qty*(v_row->>'unit_cost')::numeric)/v_stock,4) end,
        current_stock=v_stock,updated_at=now()
      where shop_id=p_shop_id and id=(v_row->>'product_id')::uuid;
      insert into public.inventory_movements(shop_id,product_id,kind,quantity_delta,stock_after,unit_cost,reference_id,adjustment_id,note,created_by)
      values(p_shop_id,(v_row->>'product_id')::uuid,v_kind,v_qty,v_stock,(v_row->>'unit_cost')::numeric,v_id,v_id,btrim(p_reason),auth.uid());
    end if;
  end loop;
  select coalesce(sum(amount),0) into v_paid from public.payments where shop_id=p_shop_id and sale_id=p_sale_id;
  select coalesce(sum(total),0) into v_returned from public.sale_adjustments where shop_id=p_shop_id and sale_id=p_sale_id;
  v_refund := greatest(v_paid-(v_sale.total-v_returned),0);
  if v_refund>0 then
    insert into public.payments(id,shop_id,sale_id,adjustment_id,method,kind,amount,note,created_by)
    values(v_payment_id,p_shop_id,p_sale_id,v_id,p_refund_method,'refund',-v_refund,btrim(p_reason),auth.uid());
    insert into public.cashbook_entries(shop_id,kind,direction,description,method,amount,source_id,payment_id,created_by)
    values(p_shop_id,'refund','out','Refund '||v_sale.reference,p_refund_method,v_refund,v_payment_id,v_payment_id,auth.uid());
  end if;
  v_status := case when p_reverse then 'reversed' when not exists (
    select 1 from public.sale_items si where si.shop_id=p_shop_id and si.sale_id=p_sale_id and si.quantity>(select coalesce(sum(ai.quantity),0) from public.sale_adjustment_items ai where ai.shop_id=p_shop_id and ai.sale_item_id=si.id)
  ) then 'returned' else 'partially_returned' end;
  update public.sales set status=v_status where shop_id=p_shop_id and id=p_sale_id;
  return jsonb_build_object('id',v_id,'sale_id',p_sale_id,'total',v_total::text,'refund',v_refund::text,'status',v_status);
end $$;

create function public.return_sale(p_shop_id uuid,p_sale_id uuid,p_items jsonb,p_reason text,p_refund_method text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=''
as $$ declare v_result jsonb; begin
  v_result := pos_private.start_request(p_shop_id,'return_sale',jsonb_build_object('sale_id',p_sale_id,'items',p_items,'reason',p_reason,'refund_method',p_refund_method),p_request_id);
  if v_result is not null then return v_result; end if;
  v_result := pos_private.return_core(p_shop_id,p_sale_id,p_items,p_reason,p_refund_method,false);
  return pos_private.finish_request(p_shop_id,p_request_id,v_result,'return_sale',(v_result->>'id')::uuid);
end $$;
create function public.reverse_sale(p_shop_id uuid,p_sale_id uuid,p_reason text,p_refund_method text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=''
as $$ declare v_result jsonb; begin
  v_result := pos_private.start_request(p_shop_id,'reverse_sale',jsonb_build_object('sale_id',p_sale_id,'reason',p_reason,'refund_method',p_refund_method),p_request_id);
  if v_result is not null then return v_result; end if;
  v_result := pos_private.return_core(p_shop_id,p_sale_id,null,p_reason,p_refund_method,true);
  return pos_private.finish_request(p_shop_id,p_request_id,v_result,'reverse_sale',(v_result->>'id')::uuid);
end $$;

create function pos_private.local_date(p_shop_id uuid,p_date date) returns timestamptz
language plpgsql stable set search_path=''
as $$ declare v_tz text; begin
  if p_date is null or not isfinite(p_date) or p_date<date '1900-01-01' or p_date>date '9999-12-31' then raise exception 'Invalid occurred_on date' using errcode='22023'; end if;
  select time_zone into strict v_tz from public.shops where id=p_shop_id;
  return p_date::timestamp at time zone v_tz;
end $$;
create function public.record_expense(p_shop_id uuid,p_description text,p_category text,p_amount numeric,p_method text,p_occurred_on date,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=''
as $$ declare v_result jsonb; v_id uuid := gen_random_uuid(); v_description text; v_category text; v_time timestamptz; begin
  v_result := pos_private.start_request(p_shop_id,'record_expense',jsonb_build_object('description',p_description,'category',p_category,'amount',p_amount,'method',p_method,'occurred_on',p_occurred_on),p_request_id);
  if v_result is not null then return v_result; end if;
  perform pos_private.check_number(p_amount,2,0.01,999999999999.99,'amount');
  perform pos_private.check_method(p_method);
  v_description := pos_private.check_text(p_description,3,240,'description');
  v_category := pos_private.check_text(p_category,1,80,'expense category');
  v_time := pos_private.local_date(p_shop_id,p_occurred_on);
  insert into public.expenses(id,shop_id,description,category,amount,method,occurred_at,created_by) values(v_id,p_shop_id,v_description,v_category,p_amount,p_method,v_time,auth.uid());
  insert into public.cashbook_entries(shop_id,kind,direction,description,method,amount,source_id,expense_id,occurred_at,created_by)
  values(p_shop_id,'expense','out',v_description,p_method,p_amount,v_id,v_id,v_time,auth.uid());
  return pos_private.finish_request(p_shop_id,p_request_id,jsonb_build_object('id',v_id),'record_expense',v_id);
end $$;
create function public.record_cash_movement(p_shop_id uuid,p_kind text,p_description text,p_amount numeric,p_method text,p_occurred_on date,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=''
as $$ declare v_result jsonb; v_id uuid := gen_random_uuid(); v_description text; v_time timestamptz; begin
  v_result := pos_private.start_request(p_shop_id,'record_cash_movement',jsonb_build_object('kind',p_kind,'description',p_description,'amount',p_amount,'method',p_method,'occurred_on',p_occurred_on),p_request_id);
  if v_result is not null then return v_result; end if;
  perform pos_private.check_number(p_amount,2,0.01,999999999999.99,'amount');
  perform pos_private.check_method(p_method);
  if p_kind is null or p_kind not in ('supplier_payment','owner_withdrawal','owner_deposit') then raise exception 'Invalid cash movement kind' using errcode='22023'; end if;
  v_description := pos_private.check_text(p_description,3,240,'description');
  v_time := pos_private.local_date(p_shop_id,p_occurred_on);
  insert into public.cashbook_entries(id,shop_id,kind,direction,description,method,amount,occurred_at,created_by)
  values(v_id,p_shop_id,p_kind,case when p_kind='owner_deposit' then 'in' else 'out' end,v_description,p_method,p_amount,v_time,auth.uid());
  return pos_private.finish_request(p_shop_id,p_request_id,jsonb_build_object('id',v_id),'record_cash_movement',v_id);
end $$;

-- Views use the caller's grants and RLS, NEVER the view owner's bypass privileges.
create view public.sale_items_ledger with (security_invoker=true) as
select si.*,coalesce((select sum(ai.quantity) from public.sale_adjustment_items ai where ai.shop_id=si.shop_id and ai.sale_item_id=si.id),0) as returned_quantity
from public.sale_items si;
create view public.sales_ledger with (security_invoker=true) as
select s.*,s.total-coalesce(a.returned_total,0) as net_total,coalesce(a.returned_total,0) as returned_total,
  coalesce(p.collected_total,0) as collected_total,
  greatest(s.total-coalesce(a.returned_total,0)-coalesce(p.collected_total,0),0) as balance_due,
  case when s.status='reversed' then 'reversed' when s.status='returned' then 'refunded'
    when coalesce(p.collected_total,0)>=s.total-coalesce(a.returned_total,0) then 'paid'
    when coalesce(p.collected_total,0)=0 then 'unpaid' else 'partially_paid' end as payment_status,
  coalesce(i.units,0) as units,coalesce(i.product_names,'') as product_names
from public.sales s
left join lateral (select sum(a.total) as returned_total from public.sale_adjustments a where a.shop_id=s.shop_id and a.sale_id=s.id) a on true
left join lateral (select sum(p.amount) as collected_total from public.payments p where p.shop_id=s.shop_id and p.sale_id=s.id) p on true
left join lateral (select sum(i.quantity) as units,string_agg(i.product_name,', ' order by i.product_name,i.id) as product_names from public.sale_items i where i.shop_id=s.shop_id and i.sale_id=s.id) i on true;

create function public.report_shop(p_shop_id uuid,p_from timestamptz,p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path=''
as $$ declare v_tz text; v_report jsonb; begin
  perform pos_private.require_member(p_shop_id);
  if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to) or p_to<=p_from or p_to-p_from>interval '3660 days' then
    raise exception 'Invalid report interval (maximum 3660 days)' using errcode='22023';
  end if;
  select time_zone into strict v_tz from public.shops where id=p_shop_id;
  with events as materialized (
    select si.product_id,si.product_name,si.sku,coalesce(si.category_name,'Uncategorized') as category,
      si.quantity as units,si.line_total as revenue,coalesce(si.cost_total,0) as cost,
      case when si.cost_total is null then 1 else 0 end as unknown_cost,
      case when si.cost_total is null then 0 else si.line_total-si.cost_total end as known_profit,
      s.occurred_at,si.id
    from public.sales s join public.sale_items si on si.shop_id=s.shop_id and si.sale_id=s.id
    where s.shop_id=p_shop_id and s.occurred_at>=p_from and s.occurred_at<p_to
    union all
    select si.product_id,si.product_name,si.sku,coalesce(si.category_name,'Uncategorized'),
      -ai.quantity,-ai.line_total,-coalesce(ai.cost_total,0),case when ai.cost_total is null then 1 else 0 end,
      case when ai.cost_total is null then 0 else -ai.line_total+ai.cost_total end,a.occurred_at,ai.id
    from public.sale_adjustments a
    join public.sale_adjustment_items ai on ai.shop_id=a.shop_id and ai.adjustment_id=a.id
    join public.sale_items si on si.shop_id=ai.shop_id and si.id=ai.sale_item_id
    where a.shop_id=p_shop_id and a.occurred_at>=p_from and a.occurred_at<p_to
  ), event_totals as (
    select coalesce(sum(revenue),0) revenue,coalesce(sum(units),0) units,coalesce(sum(cost),0) cost,
      coalesce(sum(known_profit),0) known_profit,coalesce(sum(unknown_cost),0) unknown_cost from events
  ), expense_totals as (
    select coalesce(sum(amount),0) total from public.expenses where shop_id=p_shop_id and occurred_at>=p_from and occurred_at<p_to
  ), payment_totals as (
    select coalesce(sum(amount) filter(where kind in ('sale','collection') and method='cash'),0) cash,
      coalesce(sum(amount) filter(where kind in ('sale','collection') and method='digital'),0) digital,
      coalesce(-sum(amount) filter(where kind='refund'),0) refunds
    from public.payments where shop_id=p_shop_id and occurred_at>=p_from and occurred_at<p_to
  ), cash_methods as (
    select m.method,coalesce(sum(c.amount) filter(where c.direction='in'),0) inflow,coalesce(sum(c.amount) filter(where c.direction='out'),0) outflow
    from (values ('cash'),('digital')) m(method) left join public.cashbook_entries c on c.shop_id=p_shop_id and c.method=m.method and c.occurred_at>=p_from and c.occurred_at<p_to
    group by m.method
  ), credit_events as (
    select s.total amount from public.sales s where s.shop_id=p_shop_id and s.payment_method='credit' and s.occurred_at>=p_from and s.occurred_at<p_to
    union all
    select -a.total from public.sale_adjustments a join public.sales s on s.shop_id=a.shop_id and s.id=a.sale_id
    where a.shop_id=p_shop_id and s.payment_method='credit' and a.occurred_at>=p_from and a.occurred_at<p_to
  ), product_totals as (
    select product_id,(array_agg(product_name order by occurred_at desc,id desc))[1] name,
      (array_agg(sku order by occurred_at desc,id desc))[1] sku,(array_agg(category order by occurred_at desc,id desc))[1] category,
      sum(units) units,sum(revenue) revenue,sum(cost) cost,sum(unknown_cost) unknown_cost from events group by product_id
  ), category_totals as (
    select category,sum(units) units,sum(revenue) revenue,sum(cost) cost,sum(unknown_cost) unknown_cost from events group by category
  ), date_totals as (
    select (occurred_at at time zone v_tz)::date date,sum(revenue) revenue,sum(units) units from events group by (occurred_at at time zone v_tz)::date
  ), days as (
    select d::date date from generate_series((p_from at time zone v_tz)::date::timestamp,((p_to-interval '1 microsecond') at time zone v_tz)::date::timestamp,interval '1 day') d
  )
  select jsonb_build_object(
    'summary',jsonb_build_object(
      'revenue',e.revenue::text,'units',e.units::text,
      'sales_count',(select count(*) from public.sales where shop_id=p_shop_id and occurred_at>=p_from and occurred_at<p_to),
      'cost_of_goods',e.cost::text,'gross_profit',case when e.unknown_cost>0 then null else (e.revenue-e.cost)::text end,
      'known_gross_profit',e.known_profit::text,'unknown_cost_lines',e.unknown_cost,'expenses',x.total::text,
      'estimated_net_profit',case when e.unknown_cost>0 then null else (e.revenue-e.cost-x.total)::text end,
      'cash_received',p.cash::text,'digital_received',p.digital::text,
      'credit_sales',(select coalesce(sum(amount),0)::text from credit_events),'refunds',p.refunds::text,
      'net_cash_movement',(select sum(inflow-outflow)::text from cash_methods)),
    'trend',(select coalesce(jsonb_agg(jsonb_build_object('date',d.date::text,'revenue',coalesce(t.revenue,0)::text,'units',coalesce(t.units,0)::text) order by d.date),'[]'::jsonb) from days d left join date_totals t using(date)),
    'products',(select coalesce(jsonb_agg(jsonb_build_object('product_id',product_id,'name',name,'sku',sku,'category',category,'units',units::text,'revenue',revenue::text,'cost',cost::text,'gross_profit',case when unknown_cost>0 then null else (revenue-cost)::text end,'unknown_cost_lines',unknown_cost) order by revenue desc,product_id),'[]'::jsonb) from product_totals),
    'categories',(select coalesce(jsonb_agg(jsonb_build_object('category',category,'units',units::text,'revenue',revenue::text,'gross_profit',case when unknown_cost>0 then null else (revenue-cost)::text end) order by revenue desc,category),'[]'::jsonb) from category_totals),
    'payment_methods',(select jsonb_agg(jsonb_build_object('method',method,'inflow',inflow::text,'outflow',outflow::text,'net',(inflow-outflow)::text) order by method) from cash_methods)
  ) into v_report from event_totals e cross join expense_totals x cross join payment_totals p;
  return v_report;
end $$;

-- Additional read-only aggregate used by the application's paginated cashbook.
create function public.cashbook_totals(p_shop_id uuid,p_from timestamptz,p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path=''
as $$ declare v_result jsonb; begin
  perform pos_private.require_member(p_shop_id);
  if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to) or p_to<=p_from or p_to-p_from>interval '3660 days' then
    raise exception 'Invalid report interval (maximum 3660 days)' using errcode='22023';
  end if;
  select jsonb_build_object('inflow',coalesce(sum(amount) filter(where direction='in'),0)::text,
    'outflow',coalesce(sum(amount) filter(where direction='out'),0)::text,
    'net',coalesce(sum(case when direction='in' then amount else -amount end),0)::text)
  into v_result from public.cashbook_entries where shop_id=p_shop_id and occurred_at>=p_from and occurred_at<p_to;
  return v_result;
end $$;

-- SELECT-only RLS. No INSERT/UPDATE/DELETE policy exists for application roles.
do $$ declare t text; begin
  foreach t in array array['shops','shop_memberships','categories','products','sales','sale_items','inventory_movements','payments','sale_adjustments','sale_adjustment_items','expenses','purchases','purchase_items','cashbook_entries','audit_records','idempotency_keys'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from public, anon, authenticated',t);
    execute format('grant select on table public.%I to authenticated',t);
    if t='shops' then
      execute 'create policy member_read on public.shops for select to authenticated using (public.is_shop_member(id))';
    elsif t='idempotency_keys' then
      execute 'create policy member_read on public.idempotency_keys for select to authenticated using (public.is_shop_member(shop_id) and user_id=auth.uid())';
    else
      execute format('create policy member_read on public.%I for select to authenticated using (public.is_shop_member(shop_id))',t);
    end if;
  end loop;
end $$;
revoke all on public.sales_ledger,public.sale_items_ledger from public,anon,authenticated;
grant select on public.sales_ledger,public.sale_items_ledger to authenticated;
-- Revoke default PUBLIC execution on ALL functions created here, including private helpers.
revoke all on all functions in schema pos_private from public,anon,authenticated;
do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=any(array['is_shop_member','create_shop','update_shop','create_category','save_product','import_products','receive_stock','adjust_stock','post_sale','collect_payment','return_sale','reverse_sale','record_expense','record_cash_movement','report_shop','cashbook_totals'])
  loop
    execute format('revoke all on function %s from public, anon, authenticated',f.signature);
    execute format('grant execute on function %s to authenticated',f.signature);
  end loop;
end $$;
commit;
