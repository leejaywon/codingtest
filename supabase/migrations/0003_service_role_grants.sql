-- Needed when tables were created without default grants to service_role.
-- SQL Editor에서 실행한 뒤 로컬에서 ./scripts/push-supabase.sh

grant usage on schema public to service_role;
grant all on table public.profiles to service_role;
grant select, insert, update on table public.problems to service_role;
grant select, insert, update on table public.submissions to service_role;
grant all on table public.comments to service_role;
grant usage, select on all sequences in schema public to service_role;
