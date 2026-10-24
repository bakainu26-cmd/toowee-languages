begin;
alter table public.vocabulary_words
  drop constraint if exists vocabulary_words_lang_check;
alter table public.vocabulary_words
  add constraint vocabulary_words_lang_check
  check (lang in ('English', 'Japanese', 'Spanish'));
commit;
select 'Hiszpański gotowy' as wynik;
