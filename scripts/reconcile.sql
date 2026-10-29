-- Read-only reconciliation after an isolated restore or staging exercise.
-- Run as an authorized database operator. Empty violation result sets are expected.
-- This does not mutate, repair, delete, disable triggers, or bypass application RLS.

-- Stock must agree with the complete append-only movement history.
select p.shop_id,p.id as product_id,p.name,p.current_stock,coalesce(sum(m.quantity_delta),0) as movement_balance
from public.products p left join public.inventory_movements m on m.shop_id=p.shop_id and m.product_id=p.id
group by p.shop_id,p.id,p.name,p.current_stock
having p.current_stock<>coalesce(sum(m.quantity_delta),0) or p.current_stock<0;

-- Original sale header values must agree with original immutable lines.
select s.shop_id,s.id as sale_id,s.reference,s.total,coalesce(sum(i.line_total),0) as item_total
from public.sales s left join public.sale_items i on i.shop_id=s.shop_id and i.sale_id=s.id
group by s.shop_id,s.id,s.reference,s.total
having s.total<>coalesce(sum(i.line_total),0);

-- A line must never be returned beyond its original quantity or value.
select i.shop_id,i.id as sale_item_id,i.quantity,coalesce(sum(a.quantity),0) as returned_quantity,
       i.line_total,coalesce(sum(a.line_total),0) as returned_total
from public.sale_items i left join public.sale_adjustment_items a on a.shop_id=i.shop_id and a.sale_item_id=i.id
group by i.shop_id,i.id,i.quantity,i.line_total
having coalesce(sum(a.quantity),0)>i.quantity or coalesce(sum(a.line_total),0)>i.line_total;

-- Every sale payment/refund must have one exactly matching cashbook event.
select p.shop_id,p.id as payment_id,p.amount,p.method,count(c.id) as cash_entries
from public.payments p left join public.cashbook_entries c on c.shop_id=p.shop_id and c.payment_id=p.id
  and c.amount=abs(p.amount) and c.method=p.method
  and c.direction=case when p.amount>0 then 'in' else 'out' end
group by p.shop_id,p.id,p.amount,p.method
having count(c.id)<>1;

-- Net receipts cannot exceed the remaining sale value or be negative.
select s.shop_id,s.id,s.reference,s.net_total,s.collected_total,s.balance_due
from public.sales_ledger s
where s.collected_total<0 or s.collected_total>s.net_total
   or s.net_total-s.collected_total<>s.balance_due;

-- Incomplete idempotency responses cannot legitimately survive a committed RPC.
select shop_id,user_id,request_id,operation,created_at from public.idempotency_keys where response is null;

-- All listed application base tables must retain enabled RLS after restore.
select n.nspname,c.relname,c.relrowsecurity
from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in
 ('shops','shop_memberships','categories','products','sales','sale_items','sale_adjustments','sale_adjustment_items',
  'inventory_movements','payments','expenses','purchases','purchase_items','cashbook_entries','audit_records','idempotency_keys')
 and not c.relrowsecurity;
