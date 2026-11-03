-- The path predicate needs no elevated privileges: callers can read only their
-- RLS-scoped products and is_shop_member already enforces active membership.
-- An anonymous caller returns false before any protected-table access.
begin;
alter function public.product_photo_path_allowed(text) security invoker;
commit;
