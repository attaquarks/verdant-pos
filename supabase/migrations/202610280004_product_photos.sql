-- Private, immutable objects and separate metadata. This migration deliberately
-- changes neither other buckets nor unrelated storage policies/grants.
begin;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('product-photos','product-photos',false,2097152,array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
do $$
begin
  if not exists (select 1 from storage.buckets where id='product-photos' and name='product-photos'
    and public=false and file_size_limit=2097152
    and allowed_mime_types @> array['image/jpeg','image/png','image/webp']::text[]
    and allowed_mime_types <@ array['image/jpeg','image/png','image/webp']::text[]) then
    raise exception 'Existing product-photos bucket has unsafe settings';
  end if;
end $$;

-- Only shop/product/version are readable; paths, uploader and timestamps need
-- not be exposed by the application. Product catalog updated_at is untouched.
create table public.product_photos (
  shop_id uuid not null,
  product_id uuid not null,
  version uuid not null,
  primary key (shop_id,product_id),
  foreign key (shop_id,product_id) references public.products(shop_id,id)
);
alter table public.product_photos enable row level security;
revoke all on public.product_photos from public,anon,authenticated;
grant select (shop_id,product_id,version) on public.product_photos to authenticated;
create policy product_photos_member_read on public.product_photos for select to authenticated
  using (public.is_shop_member(shop_id));

-- A boolean predicate is necessary in storage RLS; reject malformed/noncanonical
-- paths *before* casting. The SECURITY DEFINER is narrowly scoped and returns
-- only a yes/no for a product already visible to the caller.
create function public.product_photo_path_allowed(p_name text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare v_shop uuid; v_product uuid;
begin
  if auth.uid() is null or p_name is null or p_name !~
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then return false; end if;
  v_shop := split_part(p_name,'/',1)::uuid;
  v_product := split_part(p_name,'/',2)::uuid;
  return public.is_shop_member(v_shop) and exists
    (select 1 from public.products p where p.shop_id=v_shop and p.id=v_product);
end $$;
revoke all on function public.product_photo_path_allowed(text) from public,anon,authenticated;
-- anon needs this predicate only so a restrictive guard can defeat any pre-existing
-- overly broad permissive Storage policy. For anon it always returns false.
grant execute on function public.product_photo_path_allowed(text) to anon,authenticated;

-- Only authenticated object reads and normal uploads are permitted; signed URL
-- issuance and signed uploads are not part of this app's authorization model.
create policy product_photos_object_read on storage.objects for select to authenticated
  using (bucket_id='product-photos' and public.product_photo_path_allowed(name)
    and storage.allow_any_operation(array['object.get_authenticated','object.get_authenticated_info','object.head_authenticated_info','object.upload']));
create policy product_photos_object_insert on storage.objects for insert to authenticated
  with check (bucket_id='product-photos' and owner_id=auth.uid()::text and public.product_photo_path_allowed(name)
    and storage.allow_any_operation(array['object.upload']));
-- Restrictive guards are scoped by bucket and AND with any permissive policies,
-- including pre-existing broad ones. They do not change other buckets. No user
-- may overwrite, rename into/out of this bucket, or delete its objects.
create policy product_photos_guard_read on storage.objects as restrictive for select to anon,authenticated
  using (bucket_id <> 'product-photos' or (public.product_photo_path_allowed(name)
    and storage.allow_any_operation(array['object.get_authenticated','object.get_authenticated_info','object.head_authenticated_info','object.upload'])));
create policy product_photos_guard_insert on storage.objects as restrictive for insert to anon,authenticated
  with check (bucket_id <> 'product-photos' or (owner_id=auth.uid()::text and public.product_photo_path_allowed(name)
    and storage.allow_any_operation(array['object.upload'])));
create policy product_photos_guard_update on storage.objects as restrictive for update to anon,authenticated
  using (bucket_id <> 'product-photos') with check (bucket_id <> 'product-photos');
create policy product_photos_guard_delete on storage.objects as restrictive for delete to anon,authenticated
  using (bucket_id <> 'product-photos');

-- Reuse the existing request reservation, audit and membership-locking protocol.
-- Storage can be written directly by an active user; existence/owner/path are
-- verified here, but bytes are NEVER trusted without decoding at the read edge.
create function public.link_product_photo(p_shop_id uuid,p_product_id uuid,p_expected_version uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb; v_current uuid; v_path text;
begin
  perform pos_private.require_member(p_shop_id);
  if p_product_id is null or p_request_id is null then
    raise exception 'Product and request ID are required' using errcode='22023';
  end if;
  v_result := pos_private.start_request(p_shop_id,'link_product_photo',
    jsonb_build_object('product_id',p_product_id,'expected_version',p_expected_version),p_request_id);
  if v_result is not null then return v_result; end if;
  -- Serialize first-photo and replacement races, including when no metadata row exists.
  perform id from public.products where shop_id=p_shop_id and id=p_product_id for update;
  if not found then raise exception 'Product not found in this shop' using errcode='22023'; end if;
  select version into v_current from public.product_photos where shop_id=p_shop_id and product_id=p_product_id;
  if v_current is distinct from p_expected_version then
    raise exception 'Photo changed; refresh before replacing it' using errcode='23514';
  end if;
  v_path := p_shop_id::text||'/'||p_product_id::text||'/'||p_request_id::text;
  perform 1 from storage.objects where bucket_id='product-photos' and name=v_path
    and owner_id=auth.uid()::text for share;
  if not found then raise exception 'Photo upload not found' using errcode='22023'; end if;
  insert into public.product_photos(shop_id,product_id,version) values(p_shop_id,p_product_id,p_request_id)
    on conflict (shop_id,product_id) do update set version=excluded.version;
  return pos_private.finish_request(p_shop_id,p_request_id,
    jsonb_build_object('product_id',p_product_id,'version',p_request_id),
    'link_product_photo',p_product_id);
end $$;
revoke all on function public.link_product_photo(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.link_product_photo(uuid,uuid,uuid,uuid) to authenticated;
commit;
