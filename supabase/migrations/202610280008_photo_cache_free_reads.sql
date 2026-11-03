-- Require user-scoped S3 reads for product photos. Unlike authenticated
-- Storage HTTP delivery, Supabase documents that S3 does not use the CDN cache.
-- Standard HTTP upload remains allowed; its internal SELECT needs object.upload.
begin;
alter policy product_photos_object_read on storage.objects using (
  bucket_id='product-photos' and public.product_photo_path_allowed(name)
  and storage.allow_any_operation(array['object.upload','s3.object.get'])
);
alter policy product_photos_guard_read on storage.objects using (
  bucket_id <> 'product-photos' or (public.product_photo_path_allowed(name)
  and storage.allow_any_operation(array['object.upload','s3.object.get']))
);
commit;
