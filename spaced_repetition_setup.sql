begin;

-- Each vocabulary word can be linked only to progress owned by the same user.
create unique index if not exists vocabulary_words_id_owner_unique
  on public.vocabulary_words (id, owner_id);

create table if not exists public.vocabulary_progress (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  word_id uuid not null,
  stage integer not null default 0 check (stage between 0 and 6),
  reviews integer not null default 0 check (reviews >= 0),
  lapses integer not null default 0 check (lapses >= 0),
  due_at timestamptz not null default now(),
  last_reviewed_at timestamptz not null default now(),
  primary key (owner_id, word_id),
  foreign key (word_id, owner_id)
    references public.vocabulary_words (id, owner_id) on delete cascade
);

create index if not exists vocabulary_progress_due_idx
  on public.vocabulary_progress(owner_id, due_at);
alter table public.vocabulary_progress enable row level security;

drop policy if exists "Own vocabulary progress" on public.vocabulary_progress;
create policy "Own vocabulary progress" on public.vocabulary_progress
for all to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

revoke all on public.vocabulary_progress from anon;
grant select, insert, update, delete on public.vocabulary_progress to authenticated;

commit;

select 'System powtórek gotowy' as wynik;
