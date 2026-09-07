-- Public app schema for Vercel + Supabase. Hidden tests never live here.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null,
  picture text not null default '',
  nickname_changed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint profiles_nickname_format check (
    nickname ~ '^[가-힣a-zA-Z0-9_]{2,16}$'
  )
);

create unique index if not exists profiles_nickname_ci
  on public.profiles (lower(nickname));

create table if not exists public.problems (
  id text primary key,
  source text not null,
  source_id text not null,
  source_url text not null default '',
  title text not null,
  difficulty text not null default '',
  source_difficulty text not null default '',
  tier integer not null default 1,
  tags jsonb not null default '[]'::jsonb,
  source_tags jsonb not null default '[]'::jsonb,
  our_types jsonb not null default '[]'::jsonb,
  time_limit_ms integer not null default 2000,
  memory_limit_mb integer not null default 256,
  statement_html text not null default '',
  input_spec text not null default '',
  output_spec text not null default '',
  notes text not null default '',
  samples_json jsonb not null default '[]'::jsonb,
  judge_mode text not null default 'stdin',
  sort_order integer not null default 100,
  imported_at timestamptz not null default now()
);

create index if not exists problems_sort_idx
  on public.problems (sort_order, id);

create table if not exists public.submissions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  problem_id text not null references public.problems (id) on delete cascade,
  language text not null default 'python',
  source text not null,
  verdict text not null,
  passed integer not null,
  total integer not null,
  time_ms integer,
  peak_rss_kb integer,
  compile_log text,
  detail_json jsonb not null default '[]'::jsonb,
  origin text not null default 'browser_sample',
  created_at timestamptz not null default now(),
  constraint submissions_source_len check (char_length(source) between 1 and 200000)
);

create index if not exists submissions_created_at_idx
  on public.submissions (created_at desc);

create index if not exists submissions_user_idx
  on public.submissions (user_id, created_at desc);

create index if not exists submissions_problem_idx
  on public.submissions (problem_id, created_at desc);

create table if not exists public.comments (
  id bigint generated always as identity primary key,
  submission_id bigint not null references public.submissions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comments_body_len check (char_length(body) between 1 and 4000)
);

create index if not exists comments_submission_idx
  on public.comments (submission_id, created_at);

create or replace function public.random_nickname()
returns text
language plpgsql
as $$
declare
  letters constant text := 'abcdefghijklmnopqrstuvwxyz';
  digits constant text := '0123456789';
  candidate text;
  n int;
begin
  for n in 1..40 loop
    candidate :=
      substr(letters, 1 + (floor(random() * 26))::int, 1) ||
      substr(letters, 1 + (floor(random() * 26))::int, 1) ||
      substr(letters, 1 + (floor(random() * 26))::int, 1) ||
      substr(letters, 1 + (floor(random() * 26))::int, 1) ||
      substr(digits, 1 + (floor(random() * 10))::int, 1) ||
      substr(digits, 1 + (floor(random() * 10))::int, 1) ||
      substr(digits, 1 + (floor(random() * 10))::int, 1) ||
      substr(digits, 1 + (floor(random() * 10))::int, 1);
    if not exists (select 1 from public.profiles where lower(nickname) = candidate) then
      return candidate;
    end if;
  end loop;
  return 'u' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nickname, picture)
  values (
    new.id,
    public.random_nickname(),
    coalesce(
      new.raw_user_meta_data ->> 'picture',
      new.raw_user_meta_data ->> 'avatar_url',
      ''
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_comment_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists comments_set_updated_at on public.comments;
create trigger comments_set_updated_at
  before update on public.comments
  for each row execute function public.touch_comment_updated_at();

create or replace function public.guard_nickname_change()
returns trigger
language plpgsql
as $$
begin
  if new.nickname is distinct from old.nickname then
    if coalesce(old.nickname, '') = '' then
      return new;
    end if;
    if old.nickname_changed_at is not null
       and now() < old.nickname_changed_at + interval '3 days' then
      raise exception 'NICKNAME_LOCKED'
        using errcode = 'P0001';
    end if;
    new.nickname_changed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_nickname on public.profiles;
create trigger profiles_guard_nickname
  before update on public.profiles
  for each row execute function public.guard_nickname_change();

alter table public.profiles enable row level security;
alter table public.problems enable row level security;
alter table public.submissions enable row level security;
alter table public.comments enable row level security;

drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_authenticated
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists problems_select_authenticated on public.problems;
create policy problems_select_authenticated
  on public.problems for select
  to authenticated
  using (true);

drop policy if exists submissions_select_authenticated on public.submissions;
create policy submissions_select_authenticated
  on public.submissions for select
  to authenticated
  using (true);

drop policy if exists submissions_insert_own on public.submissions;
create policy submissions_insert_own
  on public.submissions for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists comments_select_authenticated on public.comments;
create policy comments_select_authenticated
  on public.comments for select
  to authenticated
  using (true);

drop policy if exists comments_insert_own on public.comments;
create policy comments_insert_own
  on public.comments for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists comments_update_own on public.comments;
create policy comments_update_own
  on public.comments for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists comments_delete_own on public.comments;
create policy comments_delete_own
  on public.comments for delete
  to authenticated
  using (user_id = auth.uid());

grant usage on schema public to authenticated, service_role;
grant select, insert, update on public.profiles to authenticated;
grant select on public.problems to authenticated;
grant select, insert on public.submissions to authenticated;
grant select, insert, update, delete on public.comments to authenticated;
grant usage, select on all sequences in schema public to authenticated, service_role;
grant all on table public.profiles to service_role;
grant select, insert, update on table public.problems to service_role;
grant select, insert, update on table public.submissions to service_role;
grant all on table public.comments to service_role;
