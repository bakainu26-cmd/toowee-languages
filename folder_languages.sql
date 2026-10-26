-- Uruchom jednorazowo w Supabase > SQL Editor. Można uruchomić ponownie.
-- Nie usuwa folderów, słówek ani wyników powtórek.
begin;

alter table public.vocabulary_folders add column if not exists lang text;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.vocabulary_folders'::regclass and conname='vocabulary_folders_lang_check') then
    alter table public.vocabulary_folders add constraint vocabulary_folders_lang_check
      check (lang in ('English','Japanese','Spanish'));
  end if;
end $$;

-- Dawne wspólne foldery dzielimy według języka ich słówek.
-- Zachowujemy nazwę, właściciela, wszystkie słówka i ich identyfikatory.
do $$
declare
  folder_row record;
  language_row record;
  primary_language text;
  new_folder_id uuid;
begin
  for folder_row in
    select f.id, f.owner_id, f.name, f.created_at
    from public.vocabulary_folders f
    where f.lang is null
      and (select count(distinct w.lang) from public.vocabulary_words w where w.folder_id=f.id and w.owner_id=f.owner_id)>1
  loop
    select w.lang into primary_language from public.vocabulary_words w
      where w.folder_id=folder_row.id and w.owner_id=folder_row.owner_id
      group by w.lang order by count(*) desc, w.lang limit 1;
    update public.vocabulary_folders set lang=primary_language where id=folder_row.id;
    for language_row in
      select distinct w.lang from public.vocabulary_words w
      where w.folder_id=folder_row.id and w.owner_id=folder_row.owner_id and w.lang<>primary_language
    loop
      insert into public.vocabulary_folders (owner_id,name,created_at,lang)
        values (folder_row.owner_id,folder_row.name,folder_row.created_at,language_row.lang)
        returning id into new_folder_id;
      update public.vocabulary_words set folder_id=new_folder_id
        where folder_id=folder_row.id and owner_id=folder_row.owner_id and lang=language_row.lang;
    end loop;
  end loop;
end $$;

-- Foldery z jednym językiem słówek otrzymują ten język.
update public.vocabulary_folders f set lang=source.lang
from (
  select w.folder_id,w.owner_id,min(w.lang) as lang
  from public.vocabulary_words w where w.folder_id is not null
  group by w.folder_id,w.owner_id having count(distinct w.lang)=1
) source
where f.id=source.folder_id and f.owner_id=source.owner_id and f.lang is null;

-- Uzgodnione przypisanie pustego folderu „Manga” na koncie Magdy.
update public.vocabulary_folders f set lang='Japanese'
from auth.users u
where f.owner_id=u.id and lower(u.email)='bakainu26@gmail.com'
  and lower(trim(f.name))='manga' and f.lang is null
  and not exists (select 1 from public.vocabulary_words w where w.folder_id=f.id and w.owner_id=f.owner_id);

-- Pozostałe stare puste foldery pozostają do ręcznego przypisania w zakładce Foldery.
-- Nowy folder musi mieć jawnie wybrany język.
create or replace function public.require_vocabulary_folder_language()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.lang is null then
    raise exception 'Wybierz język folderu.' using errcode='23514';
  end if;
  return new;
end $$;
drop trigger if exists require_vocabulary_folder_language on public.vocabulary_folders;
create trigger require_vocabulary_folder_language before insert on public.vocabulary_folders
for each row execute function public.require_vocabulary_folder_language();

-- Baza również pilnuje, aby słówko nie trafiało do folderu innego języka.
create unique index if not exists vocabulary_folders_id_owner_lang_idx
  on public.vocabulary_folders(id,owner_id,lang);
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.vocabulary_words'::regclass and conname='vocabulary_words_folder_language_fkey') then
    alter table public.vocabulary_words add constraint vocabulary_words_folder_language_fkey
      foreign key (folder_id,owner_id,lang) references public.vocabulary_folders(id,owner_id,lang);
  end if;
end $$;

commit;
