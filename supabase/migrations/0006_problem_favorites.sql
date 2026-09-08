-- A problem favorite belongs to one signed-in user and is private to that user.
create table public.problem_favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  problem_id text not null references public.problems(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, problem_id)
);

create index problem_favorites_problem_idx
  on public.problem_favorites(problem_id);

alter table public.problem_favorites enable row level security;

create policy problem_favorites_select_own
  on public.problem_favorites for select
  to authenticated
  using (user_id = auth.uid());

create policy problem_favorites_insert_own
  on public.problem_favorites for insert
  to authenticated
  with check (user_id = auth.uid());

create policy problem_favorites_delete_own
  on public.problem_favorites for delete
  to authenticated
  using (user_id = auth.uid());

grant select, insert, delete on public.problem_favorites to authenticated;
grant all on public.problem_favorites to service_role;
