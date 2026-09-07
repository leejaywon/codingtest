-- Keep solve history when problems are added or updated.
-- Deleting a problem in the SQL editor still removes that problem's submissions (ON DELETE CASCADE).
-- Upload keys cannot DELETE problems or submissions.

revoke delete on table public.problems from service_role;
revoke delete on table public.submissions from service_role;
grant select, insert, update on table public.problems to service_role;
grant select, insert, update on table public.submissions to service_role;

alter table public.submissions
  add column if not exists problem_title text not null default '';
