-- Apply after 0001 if that version created empty nicknames.

alter table public.profiles
  add column if not exists nickname_changed_at timestamptz;

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

do $$
declare
  rec record;
begin
  for rec in select id from public.profiles where coalesce(nickname, '') = '' loop
    update public.profiles
    set nickname = public.random_nickname()
    where id = rec.id;
  end loop;
end;
$$;

alter table public.profiles alter column nickname set not null;

alter table public.profiles drop constraint if exists profiles_nickname_format;
alter table public.profiles
  add constraint profiles_nickname_format check (
    nickname ~ '^[가-힣a-zA-Z0-9_]{2,16}$'
  );

drop index if exists profiles_nickname_ci;
create unique index if not exists profiles_nickname_ci
  on public.profiles (lower(nickname));

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
