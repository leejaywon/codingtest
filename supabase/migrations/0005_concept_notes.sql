-- A saved note is readable by signed-in users; only its owner may change it.
create table public.concept_notes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  concept_id text not null check (char_length(concept_id) between 1 and 100),
  body jsonb not null check (jsonb_typeof(body) = 'object' and coalesce(body->>'type', '') = 'doc' and octet_length(body::text) <= 200000),
  updated_at timestamptz not null default now(),
  primary key (user_id, concept_id)
);
create index concept_notes_concept_idx on public.concept_notes(concept_id);
create trigger concept_notes_updated_at before update on public.concept_notes
  for each row execute function public.touch_comment_updated_at();
alter table public.concept_notes enable row level security;
create policy concept_notes_read on public.concept_notes for select to authenticated using (true);
create policy concept_notes_insert on public.concept_notes for insert to authenticated with check (user_id = auth.uid());
create policy concept_notes_update on public.concept_notes for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update on public.concept_notes to authenticated;
grant all on public.concept_notes to service_role;
