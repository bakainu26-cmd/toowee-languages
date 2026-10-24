begin;

create table if not exists public.vocabulary_folders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 200),
  created_at timestamptz not null default now(),
  unique (id, owner_id)
);

create table if not exists public.vocabulary_words (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lang text not null check (lang in ('English', 'Japanese')),
  word text not null check (length(trim(word)) between 1 and 500),
  reading text not null default '' check (length(reading) <= 500),
  translation text not null check (length(trim(translation)) between 1 and 1000),
  folder_id uuid,
  created_at timestamptz not null default now(),
  foreign key (folder_id, owner_id) references public.vocabulary_folders(id, owner_id)
);

create index if not exists vocabulary_words_owner_idx on public.vocabulary_words(owner_id);
create index if not exists vocabulary_folders_owner_idx on public.vocabulary_folders(owner_id);
create index if not exists vocabulary_words_folder_idx on public.vocabulary_words(folder_id, owner_id);

alter table public.vocabulary_folders enable row level security;
alter table public.vocabulary_words enable row level security;

-- The owner can read and manage their own rows only.
drop policy if exists "Own vocabulary folders" on public.vocabulary_folders;
create policy "Own vocabulary folders" on public.vocabulary_folders
for all to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

drop policy if exists "Own vocabulary words" on public.vocabulary_words;
create policy "Own vocabulary words" on public.vocabulary_words
for all to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

revoke all on public.vocabulary_folders, public.vocabulary_words from anon;
grant select, insert, update, delete on public.vocabulary_folders, public.vocabulary_words to authenticated;

commit;
