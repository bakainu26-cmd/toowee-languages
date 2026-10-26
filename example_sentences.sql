-- Uruchom w Supabase → SQL Editor → New query → Run.
begin;
alter table public.vocabulary_words add column if not exists example text not null default '';
do $$ begin
if not exists (select 1 from pg_constraint where conrelid='public.vocabulary_words'::regclass and conname='vocabulary_words_example_check') then
alter table public.vocabulary_words add constraint vocabulary_words_example_check check (length(example)<=2000);
end if; end $$;
commit;
