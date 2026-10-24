begin;

create table if not exists public.study_challenge_days (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  challenge_date date not null default ((now() at time zone 'Europe/Warsaw')::date),
  language text not null check (language in ('English','Japanese','Spanish')),
  review_count integer not null check (review_count between 1 and 100000),
  study_seconds integer not null check (study_seconds between 0 and 86400),
  goal_seconds integer not null default 0 check (goal_seconds between 0 and 10800),
  completed_all boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (owner_id, challenge_date),
  check (completed_all or (goal_seconds >= 60 and study_seconds >= goal_seconds))
);

alter table public.study_challenge_days enable row level security;

drop policy if exists "Read own challenge days" on public.study_challenge_days;
create policy "Read own challenge days" on public.study_challenge_days
for select to authenticated
using (owner_id = (select auth.uid()));

drop policy if exists "Earn today's challenge" on public.study_challenge_days;
create policy "Earn today's challenge" on public.study_challenge_days
for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and challenge_date = ((now() at time zone 'Europe/Warsaw')::date)
);

revoke all on public.study_challenge_days from anon, authenticated;
grant select, insert on public.study_challenge_days to authenticated;

commit;
select 'Dzienny challenge gotowy' as wynik;
