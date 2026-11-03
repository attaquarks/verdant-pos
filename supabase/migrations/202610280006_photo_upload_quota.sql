-- Bounded photo reservations prevent bypassing per-shop limits via the Storage API.
-- This limits private media objects, not users' sales or inventory records.
begin;
create table public.product_photo_reservations (
  upload_id uuid primary key,
  shop_id uuid not null,
  product_id uuid not null,
  user_id uuid not null references auth.users(id),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (shop_id,product_id) references public.products(shop_id,id)
);
alter table public.product_photo_reservations enable row level security;
revoke all on public.product_photo_reservations from public,anon,authenticated;
grant select on public.product_photo_reservations to authenticated;
create policy photo_reservations_member_read on public.product_photo_reservations for select to authenticated
  using (user_id=auth.uid() and public.is_shop_member(shop_id));

-- This invoker predicate has only the caller's RLS-scoped reservation access.
create function public.product_photo_upload_allowed(p_name text) returns boolean
language plpgsql stable security invoker set search_path='' as $$
begin
  if auth.uid() is null or not public.product_photo_path_allowed(p_name) then return false; end if;
  return exists(select 1 from public.product_photo_reservations r
    where r.shop_id=split_part(p_name,'/',1)::uuid
      and r.product_id=split_part(p_name,'/',2)::uuid
      and r.upload_id=split_part(p_name,'/',3)::uuid
      and r.user_id=auth.uid() and r.expires_at>now());
end $$;
revoke all on function public.product_photo_upload_allowed(text) from public,anon,authenticated;
grant execute on function public.product_photo_upload_allowed(text) to anon,authenticated;

-- Restrictive policy ANDs with existing photo INSERT policy, even if future
-- unrelated permissive Storage policies are broad. Other buckets are untouched.
create policy product_photos_reservation_guard on storage.objects as restrictive for insert to anon,authenticated
  with check (bucket_id <> 'product-photos' or public.product_photo_upload_allowed(name));

-- Serialize the quota decision globally. Count existing photo objects plus
-- unexpired reservations that have not yet resulted in an object. Reservations
-- never imply a privileged write to storage.objects or the underlying bytes.
create function public.reserve_product_photo(p_shop_id uuid,p_product_id uuid,p_upload_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid; v_existing public.product_photo_reservations%rowtype;
  v_global bigint; v_shop bigint; v_renew boolean := false;
begin
  v_uid := pos_private.lock_member(p_shop_id);
  if p_product_id is null or p_upload_id is null then
    raise exception 'Product and upload ID are required' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(20372163, 104);
  if not exists(select 1 from public.products where shop_id=p_shop_id and id=p_product_id) then
    raise exception 'Product not found in this shop' using errcode='22023';
  end if;
  select * into v_existing from public.product_photo_reservations where upload_id=p_upload_id for update;
  if found then
    if v_existing.shop_id<>p_shop_id or v_existing.product_id<>p_product_id or v_existing.user_id<>v_uid then
      raise exception 'Photo upload ID is already in use' using errcode='23505';
    end if;
    -- An active reservation or an already-uploaded object already consumes a
    -- slot. An expired reservation without an object must pass the quota again.
    if v_existing.expires_at>now() or exists(select 1 from storage.objects o
      where o.bucket_id='product-photos'
        and o.name=p_shop_id::text||'/'||p_product_id::text||'/'||p_upload_id::text) then
      update public.product_photo_reservations set expires_at=now()+interval '30 minutes' where upload_id=p_upload_id;
      return jsonb_build_object('upload_id',p_upload_id);
    end if;
    v_renew := true;
  end if;
  select count(*) into v_global from storage.objects o where o.bucket_id='product-photos';
  select count(*) into v_shop from storage.objects o where o.bucket_id='product-photos'
    and split_part(o.name,'/',1)=p_shop_id::text;
  select v_global+count(*), v_shop+count(*) filter (where r.shop_id=p_shop_id)
    into v_global,v_shop from public.product_photo_reservations r
    where r.expires_at>now() and not exists(select 1 from storage.objects o
      where o.bucket_id='product-photos' and o.name=r.shop_id::text||'/'||r.product_id::text||'/'||r.upload_id::text);
  if v_shop>=150 or v_global>=400 then
    raise exception 'Photo storage limit reached' using errcode='23514';
  end if;
  if v_renew then
    update public.product_photo_reservations set expires_at=now()+interval '30 minutes' where upload_id=p_upload_id;
  else
    insert into public.product_photo_reservations(upload_id,shop_id,product_id,user_id,expires_at)
      values(p_upload_id,p_shop_id,p_product_id,v_uid,now()+interval '30 minutes');
  end if;
  return jsonb_build_object('upload_id',p_upload_id);
end $$;
revoke all on function public.reserve_product_photo(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.reserve_product_photo(uuid,uuid,uuid) to authenticated;
commit;
