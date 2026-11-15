-- Supabase SQL Editor: uruchom cały plik.
-- Usuwa wskazane materiały i ich słówka wyłącznie u jedynego administratora.
begin;
create table if not exists public.toowee_cleanup_archive (
 id uuid primary key default gen_random_uuid(),created_at timestamptz not null default now(),
 owner_id uuid not null,reason text not null,payload jsonb not null
);
alter table public.toowee_cleanup_archive enable row level security;
revoke all on public.toowee_cleanup_archive from public,anon,authenticated;
do $cleanup$
declare who uuid; n integer; folders uuid[]; lists uuid[]; sets uuid[]; words uuid[]; f record; source text; changed text;
begin
 select count(*),(array_agg(id))[1] into n,who from public.toowee_accounts where role='admin';
 if n<>1 then raise exception 'Oczekiwano jednego administratora, znaleziono %. Nic nie usunięto.',n;end if;
 perform 1 from public.toowee_accounts where id=who for update;
 select coalesce(array_agg(id),'{}') into folders from public.toowee_material_folders where owner_id=who and lower(btrim(name))='słówka bez zestawu';
 select coalesce(array_agg(id),'{}') into lists from public.vocabulary_folders where owner_id=who and (lower(btrim(name))='słówka bez zestawu' or id in(select set_id from public.toowee_material_sets where folder_id=any(folders)));
 select coalesce(array_agg(id),'{}') into sets from public.toowee_exercise_sets where owner_id=who and lower(btrim(title))='słówka bez zestawu';
 select coalesce(array_agg(id),'{}') into words from public.vocabulary_words where owner_id=who and folder_id=any(lists);
 -- Kopia danych właściciela oraz zależności przed operacją.
 insert into public.toowee_cleanup_archive(owner_id,reason,payload) values(who,'Słówka bez zestawu — 2026-11-15',jsonb_build_object(
 'material_folders',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.toowee_material_folders x where owner_id=who),
 'material_sets',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.toowee_material_sets x where folder_id in(select id from public.toowee_material_folders where owner_id=who)),
 'vocabulary_folders',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.vocabulary_folders x where owner_id=who),
 'vocabulary_words',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.vocabulary_words x where id=any(words)),
 'profile_folders',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.toowee_profile_folders x where folder_id=any(lists)),
 'assignments',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.toowee_assignments x where source_word_id=any(words) or word_id=any(words)),
 'progress',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.vocabulary_progress x where word_id=any(words)),
 'exercise_sets',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.toowee_exercise_sets x where owner_id=who),
 'exercise_materials',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.toowee_exercise_materials x where owner_id=who)
 ));
 -- Wyłącz stare automatyczne tworzenie domyślnych kontenerów.
 for f in select p.oid,p.proname from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public' and p.prokind='f' and (p.proname like 'toowee_portal%' or p.proname like 'toowee_teacher%') and position('Słówka bez zestawu' in p.prosrc)>0 loop
  source:=pg_get_functiondef(f.oid);changed:=source;
  changed:=replace(changed,$old_profile$  if folder is null then
   insert into public.vocabulary_folders(owner_id,name,lang) values(who,left(profile.first_name||' '||profile.last_name||' · Materiały',200),language) returning id into folder;
   insert into public.toowee_profile_folders(profile_id,lang,folder_id) values(profile.id,language,folder) on conflict(profile_id,lang) do update set folder_id=excluded.folder_id;
  end if;
  if not exists(select 1 from public.toowee_material_sets where set_id=folder) then
   insert into public.toowee_material_folders(owner_id,profile_id,name,lang) values(who,profile.id,'Słówka bez zestawu',language) returning id into pid;
   insert into public.toowee_material_sets(folder_id,set_id) values(pid,folder);
  end if;
$old_profile$,$new_profile$  if p_action='profile_save' and nullif(p_data->>'set_id','') is null then
   raise exception 'Najpierw utwórz lub wybierz listę słówek.';
  end if;
$new_profile$);
  changed:=replace(changed,$old_bootstrap$ for item in select to_jsonb(pf) from public.toowee_profile_folders pf join public.toowee_student_profiles p on p.id=pf.profile_id where p.owner_id=who and pf.folder_id is not null and not exists(select 1 from public.toowee_material_sets ms where ms.set_id=pf.folder_id) loop
  insert into public.toowee_material_folders(owner_id,profile_id,name,lang) values(who,(item->>'profile_id')::uuid,'Słówka bez zestawu',item->>'lang') returning id into fid;
  insert into public.toowee_material_sets values(fid,(item->>'folder_id')::uuid) on conflict do nothing;
 end loop;$old_bootstrap$,'');
  changed:=replace(changed,'if profile.student_id is not null and profile.student_id<>who then','if folder is not null and profile.student_id is not null and profile.student_id<>who then');
  if changed=source or position(quote_literal('Słówka bez zestawu') in changed)>0 then raise exception 'Nierozpoznana wersja funkcji %. Cała operacja wycofana.',f.proname;end if;
  insert into public.toowee_cleanup_archive(owner_id,reason,payload) values(who,'Funkcja przed zmianą',jsonb_build_object('function',f.proname,'definition',source));
  execute changed;
 end loop;
 update public.toowee_assignments set access_disabled=true where teacher_id=who and source_word_id=any(words);
 delete from public.vocabulary_words where owner_id=who and id=any(words);
 delete from public.vocabulary_folders where owner_id=who and id=any(lists);
 delete from public.toowee_exercise_sets where owner_id=who and id=any(sets);
 -- Zachowaj inaczej nazwane zestawy ćwiczeń i podfoldery.
 update public.toowee_exercise_sets set folder_id=null where owner_id=who and folder_id=any(folders);
 update public.toowee_material_folders set parent_id=null where owner_id=who and parent_id=any(folders) and not(id=any(folders));
 delete from public.toowee_material_folders where owner_id=who and id=any(folders);
 raise notice 'Usunięto: % folderów, % list, % słówek, % zestawów ćwiczeń. Kopia: toowee_cleanup_archive.',cardinality(folders),cardinality(lists),cardinality(words),cardinality(sets);
end $cleanup$;
commit;
