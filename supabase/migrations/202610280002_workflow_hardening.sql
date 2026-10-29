-- Application integration hardening. No business records are inserted.
begin;

-- A persisted/forwarded checkout must not post again after the operator changes.
-- Actor-scoped replay responses stay private, but the shop's request UUID is
-- globally unique among its members, so a cross-actor replay conflicts safely.
create unique index idempotency_shop_request_idx on public.idempotency_keys(shop_id,request_id);

-- Restocking reverses COGS. An unsaleable/non-restocked return must retain its
-- original cost expense rather than report a fictitious zero loss.
create or replace function public.report_shop(p_shop_id uuid,p_from timestamptz,p_to timestamptz) returns jsonb
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
      -ai.quantity,-ai.line_total,
      case when ai.restock then -coalesce(ai.cost_total,0) else 0 end,
      case when ai.restock and ai.cost_total is null then 1 else 0 end,
      case when ai.restock and ai.cost_total is null then 0
        else -ai.line_total+case when ai.restock then ai.cost_total else 0 end end,a.occurred_at,ai.id
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


revoke all on function public.report_shop(uuid,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.report_shop(uuid,timestamptz,timestamptz) to authenticated;

-- Prices and cost-bearing opening balances already have a currency context.
-- Freeze currency once a catalog exists, not just after the first sale.
create or replace function pos_private.protect_currency() returns trigger
language plpgsql set search_path=''
as $$ begin
  if new.currency is distinct from old.currency and (
    exists(select 1 from public.products where shop_id=old.id) or
    exists(select 1 from public.sales where shop_id=old.id) or
    exists(select 1 from public.purchases where shop_id=old.id) or
    exists(select 1 from public.cashbook_entries where shop_id=old.id) or
    exists(select 1 from public.expenses where shop_id=old.id)
  ) then raise exception 'Currency cannot change after products or financial activity exist' using errcode='23514'; end if;
  return new;
end $$;

-- The UI intentionally records actual, not scheduled, expenses/cash movements.
create or replace function pos_private.local_date(p_shop_id uuid,p_date date) returns timestamptz
language plpgsql stable set search_path=''
as $$ declare v_tz text; begin
  if p_date is null or not isfinite(p_date) or p_date<date '1900-01-01' or p_date>date '9999-12-31' then raise exception 'Invalid occurred_on date' using errcode='22023'; end if;
  select time_zone into strict v_tz from public.shops where id=p_shop_id;
  if p_date>(now() at time zone v_tz)::date then raise exception 'Future-dated cash movements and expenses are not supported' using errcode='22023'; end if;
  return p_date::timestamp at time zone v_tz;
end $$;

-- Optimistic catalog revision: the frontend always supplies expected_updated_at
-- on edits/deactivation. A stale form cannot overwrite a receipt's new weighted
-- cost, another user's price, or a recently changed product. Trusted direct RPC
-- clients can omit the optional revision for an intentional overwrite.
create or replace function public.save_product(p_shop_id uuid,p_product_id uuid,p_product jsonb,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_result jsonb; v_id uuid; v_before jsonb; v_after jsonb; v_expected timestamptz; v_body jsonb;
begin
  v_result := pos_private.start_request(p_shop_id,'save_product',jsonb_build_object('product_id',p_product_id,'product',p_product),p_request_id);
  if v_result is not null then return v_result; end if;
  v_body := p_product-'expected_updated_at';
  if p_product ? 'expected_updated_at' then
    if jsonb_typeof(p_product->'expected_updated_at') is distinct from 'string' then raise exception 'Invalid expected_updated_at' using errcode='22023'; end if;
    begin v_expected := (p_product->>'expected_updated_at')::timestamptz;
    exception when others then raise exception 'Invalid expected_updated_at' using errcode='22023'; end;
    if not isfinite(v_expected) then raise exception 'Invalid expected_updated_at' using errcode='22023'; end if;
  end if;
  if p_product_id is not null then
    select to_jsonb(p) into v_before from public.products p where p.shop_id=p_shop_id and p.id=p_product_id for update;
    if not found then raise exception 'Product not found in this shop' using errcode='22023'; end if;
    if v_expected is not null and v_expected is distinct from (v_before->>'updated_at')::timestamptz then
      raise exception 'This product changed since the form was opened. Close it, refresh inventory, and try again; no changes were saved' using errcode='23514';
    end if;
  end if;
  v_id := pos_private.save_product_core(p_shop_id,p_product_id,v_body);
  select to_jsonb(p) into strict v_after from public.products p where p.shop_id=p_shop_id and p.id=v_id;
  v_result := jsonb_build_object('id',v_id);
  update public.idempotency_keys set response=v_result where shop_id=p_shop_id and user_id=auth.uid() and request_id=p_request_id and response is null;
  if not found then raise exception 'Missing idempotency reservation' using errcode='55000'; end if;
  insert into public.audit_records(shop_id,user_id,action,entity_id,details)
  values(p_shop_id,auth.uid(),'save_product',v_id,jsonb_build_object('request_id',p_request_id,'before',v_before,'after',v_after));
  return v_result;
end $$;
revoke all on function public.save_product(uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.save_product(uuid,uuid,jsonb,uuid) to authenticated;
revoke all on all functions in schema pos_private from public,anon,authenticated;

commit;
