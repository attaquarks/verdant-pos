-- Add authenticated, user-scoped S3 reads for a no-CDN verification trial.
-- Existing HTTPS reads remain available until the follow-up cutover is tested.
begin;
alter policy product_photos_object_read on storage.objects using (
  bucket_id='product-photos' and public.product_photo_path_allowed(name)
  and storage.allow_any_operation(array['object.get_authenticated','object.get_authenticated_info','object.head_authenticated_info','object.upload','s3.object.get'])
);
alter policy product_photos_guard_read on storage.objects using (
  bucket_id <> 'product-photos' or (public.product_photo_path_allowed(name)
  and storage.allow_any_operation(array['object.get_authenticated','object.get_authenticated_info','object.head_authenticated_info','object.upload','s3.object.get']))
);
commit;
