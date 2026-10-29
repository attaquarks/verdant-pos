-- Mixed-return FK locks and non-destructive staff offboarding.
begin;

alter table public.shop_memberships add column is_active boolean not null default true;
alter table public.shop_memberships add column revoked_at timestamptz;
alter table public.shop_memberships add constraint membership_revocation_state check (
  (is_active and revoked_at is null) or (not is_active and revoked_at is not null)
);
create index shop_memberships_active_idx on public.shop_memberships(user_id,shop_id) where is_active;

-- Retain inactive memberships so historical actor FKs never have to be deleted.
create or replace function public.is_shop_member(p_shop_id uuid) returns boolean
language sql stable security definer set search_path=''
as $$ select auth.uid() is not null and exists (
  select 1 from public.shop_memberships m where m.shop_id=p_shop_id and m.user_id=auth.uid() and m.is_active
) $$;

create or replace function pos_private.require_member(p_shop_id uuid,p_owner boolean default false) returns uuid
language plpgsql set search_path=''
as $$
declare v_uid uuid := auth.uid(); v_role text;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select role into v_role from public.shop_memberships where shop_id=p_shop_id and user_id=v_uid and is_active;
  if v_role is null or (p_owner and v_role<>'owner') then raise exception 'Active shop membership required' using errcode='42501'; end if;
  return v_uid;
end $$;

-- Mutations hold a membership SHARE lock until commit. Revocation waits for
-- an in-flight write to finish; later writes recheck the inactive predicate.
-- Read-only STABLE reports use require_member without attempting row locks.
create function pos_private.lock_member(p_shop_id uuid,p_owner boolean default false) returns uuid
language plpgsql set search_path=''
as $$
declare v_uid uuid := auth.uid(); v_role text;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select role into v_role from public.shop_memberships where shop_id=p_shop_id and user_id=v_uid and is_active for share;
  if v_role is null or (p_owner and v_role<>'owner') then raise exception 'Active shop membership required' using errcode='42501'; end if;
  return v_uid;
end $$;

create or replace function pos_private.start_request(p_shop_id uuid,p_operation text,p_payload jsonb,p_request_id uuid) returns jsonb
language plpgsql set search_path=''
as $$
declare v_uid uuid; v_key public.idempotency_keys%rowtype; v_inserted integer;
begin
  v_uid := pos_private.lock_member(p_shop_id,p_operation in ('update_shop','revoke_staff'));
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
create or replace function pos_private.return_core(p_shop_id uuid,p_sale_id uuid,p_items jsonb,p_reason text,p_refund_method text,p_reverse boolean) returns jsonb
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
  -- Lock every referenced product, including non-restocked items: their FK
  -- inserts acquire KEY SHARE locks and must obey the same global order.
  perform p.id from public.products p where p.shop_id=p_shop_id and p.id in (
    select (x->>'product_id')::uuid from jsonb_array_elements(v_lines) x
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

-- A revoked user may read only their own membership tombstone so the app can
-- show an explicit access-revoked screen. This confers no shop/data access.
alter policy member_read on public.shop_memberships
using (user_id=auth.uid() or public.is_shop_member(shop_id));

create function public.revoke_staff(p_shop_id uuid,p_user_id uuid,p_reason text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_result jsonb; v_member public.shop_memberships%rowtype; v_reason text;
begin
  perform pos_private.require_member(p_shop_id,true);
  v_result := pos_private.start_request(p_shop_id,'revoke_staff',jsonb_build_object('user_id',p_user_id,'reason',p_reason),p_request_id);
  if v_result is not null then return v_result; end if;
  v_reason := pos_private.check_text(p_reason,3,500,'revocation reason');
  if p_user_id is null or p_user_id=auth.uid() then raise exception 'Cannot revoke your own owner membership' using errcode='22023'; end if;
  select * into v_member from public.shop_memberships where shop_id=p_shop_id and user_id=p_user_id for update;
  if not found or v_member.role<>'staff' then raise exception 'Staff member not found in this shop' using errcode='22023'; end if;
  if not v_member.is_active then raise exception 'Staff access is already revoked' using errcode='23514'; end if;
  update public.shop_memberships set is_active=false,revoked_at=now() where shop_id=p_shop_id and user_id=p_user_id;
  v_result := jsonb_build_object('id',p_user_id,'is_active',false);
  -- Finish and audit atomically. The retained actor/membership rows stay valid.
  update public.idempotency_keys set response=v_result where shop_id=p_shop_id and user_id=auth.uid() and request_id=p_request_id and response is null;
  if not found then raise exception 'Missing idempotency reservation' using errcode='55000'; end if;
  insert into public.audit_records(shop_id,user_id,action,entity_id,details)
  values(p_shop_id,auth.uid(),'revoke_staff',p_user_id,jsonb_build_object('request_id',p_request_id,'reason',v_reason,'was_active',true,'is_active',false));
  return v_result;
end $$;

revoke all on function public.is_shop_member(uuid) from public,anon,authenticated;
grant execute on function public.is_shop_member(uuid) to authenticated;
revoke all on function public.revoke_staff(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.revoke_staff(uuid,uuid,text,uuid) to authenticated;
revoke all on all functions in schema pos_private from public,anon,authenticated;

commit;
