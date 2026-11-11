-- TooWee: przypisanie zestawów do istniejących folderów.
-- Uruchom w Supabase SQL Editor. Aktualizacja zachowuje istniejące dane.
-- TooWee: grupy i organizacja materiałów nauczyciela. Po accounts_setup.sql.
begin;
create table if not exists public.toowee_groups (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 200),created_at timestamptz not null default now()
);
create table if not exists public.toowee_group_students (
 group_id uuid not null references public.toowee_groups(id) on delete cascade,
 profile_id uuid not null references public.toowee_student_profiles(id) on delete cascade,primary key(group_id,profile_id)
);
alter table public.toowee_groups add column if not exists lang text check(lang in ('Japanese','English','Spanish'));
alter table public.toowee_material_folders add column if not exists group_id uuid references public.toowee_groups(id) on delete cascade;
alter table public.toowee_groups enable row level security;
alter table public.toowee_group_students enable row level security;
revoke all on public.toowee_groups,public.toowee_group_students from public,anon,authenticated;
create table if not exists public.toowee_material_deliveries (
 owner_id uuid not null references auth.users(id) on delete cascade,
 profile_id uuid not null references public.toowee_student_profiles(id) on delete cascade,
 kind text not null,source_id uuid not null,
 primary key(owner_id,profile_id,kind,source_id)
);
alter table public.toowee_material_deliveries add column if not exists target_folder_id uuid;
alter table public.toowee_material_deliveries add column if not exists target_set_ids uuid[] not null default '{}';
alter table public.toowee_material_deliveries enable row level security;
revoke all on public.toowee_material_deliveries from public,anon,authenticated;
alter table public.toowee_material_folders add column if not exists parent_id uuid references public.toowee_material_folders(id) on delete set null;
create or replace function public.toowee_teacher(p_action text default 'load',p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare who uuid:=auth.uid();gid uuid;pid uuid;fid uuid;sid uuid;item jsonb;bucket public.toowee_material_folders%rowtype; source_ids uuid[];target_folder uuid;new_set uuid;target_profile public.toowee_student_profiles%rowtype;material_lang text;material_name text;source record; copied_sets uuid[]:='{}';recipient jsonb;
begin
 if who is null or not exists(select 1 from public.toowee_accounts where id=who and role in ('teacher','admin')) then raise exception 'Wybierz konto nauczyciela.';end if;
 perform 1 from public.toowee_accounts where id=who for update;
 -- Bring pre-existing pupil sets into a folder without moving or copying vocabulary.
 for item in select to_jsonb(pf) from public.toowee_profile_folders pf join public.toowee_student_profiles p on p.id=pf.profile_id where p.owner_id=who and pf.folder_id is not null and not exists(select 1 from public.toowee_material_sets ms where ms.set_id=pf.folder_id) loop
  insert into public.toowee_material_folders(owner_id,profile_id,name,lang) values(who,(item->>'profile_id')::uuid,'Słówka bez zestawu',item->>'lang') returning id into fid;
  insert into public.toowee_material_sets values(fid,(item->>'folder_id')::uuid) on conflict do nothing;
 end loop;
 if p_action='material_assign_many' then
  if jsonb_typeof(p_data->'profile_ids') is distinct from 'array' then raise exception 'Zaznacz uczniów.';end if;
  if jsonb_array_length(p_data->'profile_ids') not between 1 and 100 then raise exception 'Wybierz od 1 do 100 uczniów.';end if;
  for recipient in select distinct value from jsonb_array_elements(p_data->'profile_ids') loop
   if not exists(select 1 from public.toowee_student_profiles where id=(recipient#>>'{}')::uuid and owner_id=who and not blocked) then raise exception 'Brak dostępu do ucznia lub uczeń zablokowany.';end if;
  end loop;
  for recipient in select distinct value from jsonb_array_elements(p_data->'profile_ids') loop
   perform public.toowee_teacher('material_assign',(p_data-'profile_ids')||jsonb_build_object('profile_id',recipient));
  end loop;
  return public.toowee_teacher('load');
 end if;
 if p_action in ('material_edit','material_delete','material_assign') then
  if p_data->>'kind'='folder' then
   select * into bucket from public.toowee_material_folders where id=(p_data->>'id')::uuid and owner_id=who for update;
   if not found then raise exception 'Brak dostępu do folderu.';end if;
   material_lang:=bucket.lang;material_name:=bucket.name;
   select coalesce(array_agg(set_id),'{}') into source_ids from public.toowee_material_sets where folder_id=bucket.id;
  elsif p_data->>'kind'='set' then
   select lang,name into material_lang,material_name from public.vocabulary_folders where id=(p_data->>'id')::uuid and owner_id=who for update;
   if not found then raise exception 'Brak dostępu do zestawu.';end if;
   source_ids:=array[(p_data->>'id')::uuid];
  else raise exception 'Wybierz folder albo zestaw.';end if;
  if p_action='material_edit' then
   if length(trim(coalesce(p_data->>'name',''))) not between 1 and 200 then raise exception 'Podaj nazwę (1–200 znaków).';end if;
   if p_data->>'kind'='folder' then update public.toowee_material_folders set name=trim(p_data->>'name') where id=bucket.id;
   else update public.vocabulary_folders set name=trim(p_data->>'name') where id=any(source_ids) and owner_id=who;end if;
  elsif p_action='material_delete' then
   if p_data->>'confirm_id' is distinct from p_data->>'id' or p_data->>'confirmation' is distinct from 'DELETE' or coalesce(p_data->>'delete_scope','') not in ('student','permanent') then raise exception 'Wybierz zakres i potwierdź usunięcie ponownie.';end if;
   if p_data->>'delete_scope'='student' then
    pid:=nullif(p_data->>'profile_id','')::uuid;
    if pid is null or not exists(select 1 from public.toowee_student_profiles where id=pid and owner_id=who) then raise exception 'Wybierz własny profil ucznia.';end if;
    if p_data->>'kind'='folder' then
     if bucket.profile_id is distinct from pid then raise exception 'Folder nie należy do tego ucznia.';end if;
    elsif not exists(select 1 from public.toowee_material_sets ms join public.toowee_material_folders mf on mf.id=ms.folder_id where ms.set_id=any(source_ids) and mf.owner_id=who and mf.profile_id=pid) then raise exception 'Zestaw nie należy do tego ucznia.';end if;
    update public.toowee_assignments a set access_disabled=true where a.teacher_id=who and a.student_id=(select student_id from public.toowee_student_profiles where id=pid) and a.source_word_id in(select w.id from public.vocabulary_words w where w.owner_id=who and w.folder_id=any(source_ids));
    delete from public.toowee_profile_folders where profile_id=pid and folder_id=any(source_ids);
    delete from public.toowee_material_deliveries where owner_id=who and profile_id=pid and (target_set_ids && source_ids or target_folder_id=bucket.id);
    if p_data->>'kind'='folder' then
     update public.toowee_material_folders set profile_id=null where id=bucket.id and owner_id=who;
    else
     insert into public.toowee_material_folders(owner_id,profile_id,name,lang) values(who,null,material_name,material_lang) returning id into target_folder;
     update public.toowee_material_sets set folder_id=target_folder where set_id=any(source_ids);
    end if;
   else
    update public.toowee_assignments a set access_disabled=true where a.teacher_id=who and a.source_word_id in(select w.id from public.vocabulary_words w where w.owner_id=who and w.folder_id=any(source_ids));
    delete from public.toowee_material_deliveries where owner_id=who and (target_set_ids && source_ids or target_folder_id=bucket.id);
    delete from public.vocabulary_words where owner_id=who and folder_id=any(source_ids);
    delete from public.vocabulary_folders where owner_id=who and id=any(source_ids);
    if p_data->>'kind'='folder' then delete from public.toowee_material_folders where id=bucket.id and owner_id=who;end if;
   end if;
  else
   select * into target_profile from public.toowee_student_profiles where id=(p_data->>'profile_id')::uuid and owner_id=who for update;
   if not found then raise exception 'Brak dostępu do ucznia.';end if;
   if target_profile.blocked then raise exception 'Odblokuj ucznia przed przypisaniem materiałów.';end if;
   if exists(select 1 from public.toowee_material_sets ms join public.toowee_material_folders mf on mf.id=ms.folder_id where ms.set_id=any(source_ids) and mf.profile_id=target_profile.id) or bucket.profile_id=target_profile.id then raise exception 'Ten materiał jest już w profilu ucznia.';end if;
   if exists(select 1 from public.toowee_material_deliveries where owner_id=who and profile_id=target_profile.id and kind=p_data->>'kind' and source_id=(p_data->>'id')::uuid) then return public.toowee_teacher('load');end if;
   if (select count(*) from public.vocabulary_words where owner_id=who and folder_id=any(source_ids))>2000 then raise exception 'Przypisuj maksymalnie 2000 słówek naraz.';end if;
   insert into public.toowee_material_folders(owner_id,profile_id,name,lang) values(who,target_profile.id,material_name,material_lang) returning id into target_folder;
   for source in select * from public.vocabulary_folders where owner_id=who and id=any(source_ids) loop
    insert into public.vocabulary_folders(owner_id,name,lang) values(who,source.name,material_lang) returning id into new_set;
    insert into public.toowee_material_sets(folder_id,set_id) values(target_folder,new_set);copied_sets:=array_append(copied_sets,new_set);
    insert into public.vocabulary_words(owner_id,lang,word,reading,translation,example,folder_id) select who,lang,word,reading,translation,example,new_set from public.vocabulary_words where owner_id=who and folder_id=source.id;
    if target_profile.student_id is not null and target_profile.student_id<>who then loop item:=public.toowee_portal('assign',jsonb_build_object('student_id',target_profile.student_id,'lang',material_lang,'folder_id',new_set,'name',source.name));exit when (item->>'assigned')::int<500;end loop;end if;
   end loop;
   if target_profile.languages is not null and not material_lang=any(target_profile.languages) then update public.toowee_student_profiles set languages=array_append(languages,material_lang) where id=target_profile.id;end if;
   insert into public.toowee_material_deliveries(owner_id,profile_id,kind,source_id,target_folder_id,target_set_ids) values(who,target_profile.id,p_data->>'kind',(p_data->>'id')::uuid,target_folder,copied_sets);
  end if;
 elsif p_action in ('group_create','group_save') then
  if length(trim(coalesce(p_data->>'name',''))) not between 1 and 200 then raise exception 'Podaj nazwę grupy.';end if;
  if jsonb_typeof(p_data->'students') is distinct from 'array' or jsonb_array_length(p_data->'students')>1000 then raise exception 'Wybierz uczniów.';end if;
  for item in select value from jsonb_array_elements(p_data->'students') loop
   if not exists(select 1 from public.toowee_student_profiles where id=(item#>>'{}')::uuid and owner_id=who) then raise exception 'Uczeń nie należy do Twojej listy.';end if;
  end loop;
  if p_data->>'lang' is not null and p_data->>'lang' not in ('Japanese','English','Spanish') then raise exception 'Wybierz język grupy.';end if;
  if p_action='group_create' then insert into public.toowee_groups(owner_id,name,lang) values(who,trim(p_data->>'name'),p_data->>'lang') returning id into gid;
  else select id into gid from public.toowee_groups where id=(p_data->>'id')::uuid and owner_id=who for update;
   if gid is null then raise exception 'Brak dostępu do grupy.';end if;
   update public.toowee_groups set name=trim(p_data->>'name'),lang=coalesce(p_data->>'lang',lang) where id=gid;delete from public.toowee_group_students where group_id=gid and profile_id::text not in(select jsonb_array_elements_text(p_data->'students'));
  end if;
  insert into public.toowee_group_students(group_id,profile_id) select gid,value::uuid from jsonb_array_elements_text(p_data->'students') on conflict do nothing;
 elsif p_action='folder_create' then
  if length(trim(coalesce(p_data->>'name',''))) not between 1 and 200 then raise exception 'Podaj nazwę folderu lub klasy.';end if;
  pid:=nullif(p_data->>'profile_id','')::uuid;
  if pid is not null and not exists(select 1 from public.toowee_student_profiles where id=pid and owner_id=who) then raise exception 'Brak dostępu do ucznia.';end if;
  fid:=nullif(p_data->>'parent_id','')::uuid;
  if fid is not null and not exists(select 1 from public.toowee_material_folders where id=fid and owner_id=who and lang=p_data->>'lang' and profile_id is not distinct from pid and group_id is null) then raise exception 'Wybierz folder nadrzędny w tym samym profilu i języku.';end if;
  insert into public.toowee_material_folders(owner_id,profile_id,name,lang,parent_id) values(who,pid,trim(p_data->>'name'),p_data->>'lang',fid);
 elsif p_action in ('set_move','set_copy') then
  select id,lang into sid,material_lang from public.vocabulary_folders where id=(p_data->>'set_id')::uuid and owner_id=who;
  if sid is null then raise exception 'Wybierz własny zestaw.';end if;
  if nullif(p_data->>'folder_id','') is not null then
   select * into bucket from public.toowee_material_folders where id=(p_data->>'folder_id')::uuid and owner_id=who and lang=material_lang for update;
   if not found then raise exception 'Wybierz własny folder w tym samym języku.';end if;
  end if;
  if p_action='set_move' then
   if bucket.profile_id is not null or exists(select 1 from public.toowee_material_sets ms join public.toowee_material_folders m on m.id=ms.folder_id where ms.set_id=sid and m.profile_id is not null) then raise exception 'Zestaw ucznia pozostaje w jego profilu. Użyj kopiowania.';end if;
   if bucket.id is null then delete from public.toowee_material_sets where set_id=sid;
   else insert into public.toowee_material_sets values(bucket.id,sid) on conflict(set_id) do update set folder_id=excluded.folder_id;end if;
  else
   if bucket.id is null then raise exception 'Wybierz folder dla kopii.';end if;
   if (select count(*) from public.vocabulary_words where owner_id=who and folder_id=sid)>500 then raise exception 'Kopiuj maksymalnie 500 słówek naraz.';end if;
   pid:=sid;
   insert into public.vocabulary_folders(owner_id,name,lang) select who,name,lang from public.vocabulary_folders where id=pid returning id into sid;
   insert into public.toowee_material_sets values(bucket.id,sid);
   insert into public.vocabulary_words(owner_id,lang,word,reading,translation,example,folder_id) select who,lang,word,reading,translation,example,sid from public.vocabulary_words where owner_id=who and folder_id=pid;
  end if;
 elsif p_action='set_create' then
  if nullif(p_data->>'folder_id','') is not null then
   select * into bucket from public.toowee_material_folders where id=(p_data->>'folder_id')::uuid and owner_id=who for update;
   if not found then raise exception 'Brak dostępu do folderu.';end if;
  end if;
  material_lang:=coalesce(bucket.lang,p_data->>'lang');
  if material_lang not in ('English','Japanese','Spanish') or material_lang is null then raise exception 'Wybierz język zestawu.';end if;
  if length(trim(coalesce(p_data->>'name',''))) not between 1 and 200 then raise exception 'Podaj nazwę zestawu.';end if;
  insert into public.vocabulary_folders(owner_id,name,lang) values(who,trim(p_data->>'name'),material_lang) returning id into sid;
  if bucket.id is not null then insert into public.toowee_material_sets values(bucket.id,sid);end if;
 elsif p_action not in ('load','profile') then raise exception 'Nieznana operacja panelu nauczyciela.';end if;
 if p_action='profile' then
  pid:=(p_data->>'profile_id')::uuid;
  if not exists(select 1 from public.toowee_student_profiles where id=pid and owner_id=who) then raise exception 'Brak dostępu do ucznia.';end if;
 end if;
 return jsonb_build_object('created_set_id',sid,'overview',jsonb_build_object('words',(select count(*) from public.vocabulary_words where owner_id=who),'games',(select count(*) from public.sophie_rooms where host_id=who and status='finished')),
  'profile_languages',(select coalesce(jsonb_agg(x),'[]') from (select p.id as profile_id,unnest(p.languages) as lang from public.toowee_student_profiles p where p.owner_id=who and p.languages is not null union select m.profile_id,m.lang from public.toowee_material_folders m join public.toowee_student_profiles p on p.id=m.profile_id where m.owner_id=who and p.languages is null union select pf.profile_id,pf.lang from public.toowee_profile_folders pf join public.toowee_student_profiles p on p.id=pf.profile_id where p.owner_id=who and p.languages is null) x),
  'groups',(select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'lang',g.lang,'students',(select coalesce(jsonb_agg(s.profile_id),'[]') from public.toowee_group_students s where s.group_id=g.id)) order by g.name),'[]') from public.toowee_groups g where g.owner_id=who),
  'folders',(select coalesce(jsonb_agg(to_jsonb(m) order by m.name),'[]') from public.toowee_material_folders m where m.owner_id=who),
  'sets',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'name',v.name,'lang',v.lang,'folder_id',ms.folder_id,'profile_id',m.profile_id,'group_id',m.group_id,'words',(select count(*) from public.vocabulary_words w where w.owner_id=who and w.folder_id=v.id)) order by v.name),'[]') from public.vocabulary_folders v left join public.toowee_material_sets ms on ms.set_id=v.id left join public.toowee_material_folders m on m.id=ms.folder_id where v.owner_id=who));
end $$;
revoke all on function public.toowee_teacher(text,jsonb) from public,anon;
grant execute on function public.toowee_teacher(text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;

-- TooWee Languages: reusable private/public exercise sets for teachers.
-- Requires teacher_setup.sql, accounts_setup.sql and vocabulary_setup.sql, with language support.
begin;
create table if not exists public.toowee_exercise_sets(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id) on delete cascade,
 title text not null,description text not null default '',lang text not null,
 cards jsonb not null default '[]',is_public boolean not null default false,
 source_id uuid references public.toowee_exercise_sets(id) on delete set null,
 revision integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table public.toowee_exercise_sets add column if not exists folder_id uuid references public.toowee_material_folders(id) on delete set null;
create table if not exists public.toowee_exercise_materials(
 set_id uuid primary key references public.toowee_exercise_sets(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 folder_id uuid not null references public.vocabulary_folders(id) on delete cascade,revision integer not null
);
alter table public.toowee_exercise_sets enable row level security;
alter table public.toowee_exercise_materials enable row level security;
revoke all on public.toowee_exercise_sets,public.toowee_exercise_materials from public,anon,authenticated;
create index if not exists toowee_exercises_owner_idx on public.toowee_exercise_sets(owner_id,updated_at desc);
create index if not exists toowee_exercises_public_idx on public.toowee_exercise_sets(lang,updated_at desc) where is_public;
create or replace function public.toowee_exercise_sets(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare who uuid:=auth.uid();s public.toowee_exercise_sets; item jsonb; cards jsonb; wrong jsonb; names text[]; result jsonb; fid uuid; req uuid; expected integer; page integer; v_lang text; v_title text; v_description text; v_public boolean;
begin
 if who is null or not exists(select 1 from public.toowee_accounts where id=who and role in ('teacher','admin')) then raise exception 'Zestawy są dostępne dla nauczycieli.';end if;
 if p_action='folders' then
 select coalesce(jsonb_agg(to_jsonb(f)),'[]') into result from public.toowee_material_folders f where f.owner_id=who;
 return jsonb_build_object('folders',result);
 end if;
 if p_action='import_vocabulary' then
  select name,lang into v_title,v_lang from public.vocabulary_folders where id=(p_data->>'folder_id')::uuid and owner_id=who;
  if not found then raise exception 'Brak dostępu do zestawu słówek.';end if;
  select jsonb_agg(jsonb_build_object('id',gen_random_uuid(),'type','vocabulary','prompt',w.word,'answer',w.translation,'reading',w.reading,'wrong','[]'::jsonb,'image','') order by w.created_at,w.id) into cards from public.vocabulary_words w where w.folder_id=(p_data->>'folder_id')::uuid and w.owner_id=who;
  if cards is null then raise exception 'Ten zestaw nie zawiera jeszcze słówek.';end if;
  return public.toowee_exercise_sets('save',jsonb_build_object('id',p_data->>'new_id','revision',0,'title',v_title,'lang',v_lang,'cards',cards,'is_public',false));
 end if;
 if p_action='list' then
  page:=greatest(0,least(1000,coalesce((p_data->>'page')::integer,0)));
  select coalesce(jsonb_agg(to_jsonb(r)),'[]') into result from(
   select e.id,e.title,e.description,e.lang,case when e.owner_id=who then e.folder_id else null end as folder_id,e.is_public,e.owner_id=who as mine,e.revision,e.updated_at,jsonb_array_length(e.cards) as count,coalesce(nullif(a.display_name,''),'Nauczyciel') as author
   from public.toowee_exercise_sets e join public.toowee_accounts a on a.id=e.owner_id
   where(case when p_data->>'scope'='public' then e.is_public else e.owner_id=who end)
   and(not(p_data?'folder_id') or (e.owner_id=who and e.folder_id is not distinct from nullif(p_data->>'folder_id','')::uuid))
   and(coalesce(p_data->>'lang','')='' or e.lang=p_data->>'lang')
   and(coalesce(p_data->>'query','')='' or e.title ilike '%'||(p_data->>'query')||'%' or e.description ilike '%'||(p_data->>'query')||'%')
   order by e.updated_at desc,e.id limit 24 offset page*24
  )r;return jsonb_build_object('sets',result,'page',page);
 end if;
 if p_action='save' then
  req:=(p_data->>'id')::uuid;if req is null then raise exception 'Brak identyfikatora zestawu.';end if;
  select * into s from public.toowee_exercise_sets where id=req for update;
  if found and s.owner_id<>who then raise exception 'Możesz edytować tylko własny zestaw. Zapisz kopię.';end if;
  if s.id is not null and (p_data->>'revision')::integer is distinct from s.revision then raise exception 'Zestaw zmieniono w innym oknie. Wczytaj jego aktualną wersję przed zapisem.';end if;
  v_title:=trim(p_data->>'title');v_description:=coalesce(p_data->>'description','');v_lang:=p_data->>'lang';cards:=p_data->'cards';v_public:=coalesce((p_data->>'is_public')::boolean,false);
  if coalesce(length(v_title),0) not between 1 and 200 or length(v_description)>2000 or coalesce(v_lang,'') not in ('English','Japanese','Spanish') then raise exception 'Uzupełnij nazwę i język zestawu.';end if;
  if jsonb_typeof(cards) is distinct from 'array' then raise exception 'Nieprawidłowe karty.';end if;
  if jsonb_array_length(cards) not between 1 and 500 or length(cards::text)>4000000 then raise exception 'Zestaw musi zawierać od 1 do 500 kart.';end if;
  fid:=case when p_data?'folder_id' then nullif(p_data->>'folder_id','')::uuid else s.folder_id end;
  if fid is not null and not exists(select 1 from public.toowee_material_folders where id=fid and owner_id=who and lang=v_lang) then raise exception 'Wybierz własny folder w języku zestawu.';end if;
  names:='{}';
  for item in select value from jsonb_array_elements(cards) loop
   if coalesce(item->>'type','') not in ('vocabulary','question','open','quiz') or coalesce(length(trim(item->>'prompt')),0) not between 1 and 2000 or length(coalesce(item->>'answer',''))>2000 or (item->>'type'<>'open' and coalesce(length(trim(item->>'answer')),0)=0) or length(coalesce(item->>'reading',''))>500 then raise exception 'Uzupełnij zadanie i odpowiedź każdej karty.';end if;
   if coalesce(item->>'id','')!~'^[a-f0-9-]{36}$' or (item->>'id')=any(names) then raise exception 'Nieprawidłowe lub powtórzone identyfikatory kart.';end if;names:=array_append(names,item->>'id');
   if coalesce(item->>'image','')<>'' and (length(item->>'image')>2000 or (item->>'image')!~'^https://[^[:space:]]+$') then raise exception 'Obrazek wymaga adresu HTTPS.';end if;
   wrong:=coalesce(item->'wrong','[]');if jsonb_typeof(wrong) is distinct from 'array' then raise exception 'Nieprawidłowe odpowiedzi.';end if;
   if jsonb_array_length(wrong)>3 or (item->>'type'='quiz' and jsonb_array_length(wrong)<>3) then raise exception 'Quiz ABCD wymaga 3 błędnych odpowiedzi.';end if;
   if exists(select 1 from jsonb_array_elements(wrong) w where jsonb_typeof(w)<>'string' or length(trim(w#>>'{}')) not between 1 and 2000) or (select count(distinct lower(trim(v))) from (select value v from jsonb_array_elements_text(wrong) union all select item->>'answer') a)<>jsonb_array_length(wrong)+1 then raise exception 'Odpowiedzi muszą być różne i niepuste.';end if;
  end loop;
  insert into public.toowee_exercise_sets(id,owner_id,title,description,lang,cards,is_public,folder_id) values(req,who,v_title,v_description,v_lang,cards,v_public,fid)
  on conflict(id) do update set folder_id=excluded.folder_id,title=excluded.title,description=excluded.description,lang=excluded.lang,cards=excluded.cards,is_public=excluded.is_public,revision=toowee_exercise_sets.revision+1,updated_at=now() returning * into s;
 else
  select * into s from public.toowee_exercise_sets where id=(p_data->>'id')::uuid for update;
  if not found or(s.owner_id<>who and not s.is_public) then raise exception 'Ten zestaw jest prywatny lub nie jest już dostępny.';end if;
 end if;
 if p_action='copy' then
  req:=(p_data->>'new_id')::uuid;if req is null then raise exception 'Brak identyfikatora kopii.';end if;
  if exists(select 1 from public.toowee_exercise_sets where id=req and owner_id<>who) then raise exception 'Nieprawidłowy identyfikator kopii.';end if;
  insert into public.toowee_exercise_sets(id,owner_id,title,description,lang,cards,is_public,source_id) values(req,who,left(s.title||' — kopia',200),s.description,s.lang,s.cards,false,s.id) on conflict(id) do nothing;
  select * into s from public.toowee_exercise_sets where id=req;
 elsif p_action='prepare_game' then
  if s.owner_id<>who then raise exception 'Najpierw zapisz własną kopię.';end if;
  if exists(select 1 from jsonb_array_elements(s.cards) c where c->>'type'<>'vocabulary' or length(c->>'prompt')>500 or length(c->>'answer')>1000) then raise exception 'Ta gra obsługuje zestawy słówek. Wybierz grę do zadań.';end if;
  select folder_id into fid from public.toowee_exercise_materials where set_id=s.id and owner_id=who;
  if fid is null then
   insert into public.vocabulary_folders(owner_id,name,lang) values(who,s.title,s.lang) returning id into fid;
   insert into public.toowee_exercise_materials values(s.id,who,fid,0);
  end if;
  if (select revision from public.toowee_exercise_materials where set_id=s.id)<>s.revision then
   update public.vocabulary_folders set name=s.title,lang=s.lang where id=fid and owner_id=who;
   delete from public.vocabulary_words where folder_id=fid and owner_id=who;
   insert into public.vocabulary_words(owner_id,lang,folder_id,word,reading,translation) select who,s.lang,fid,c->>'prompt',coalesce(c->>'reading',''),c->>'answer' from jsonb_array_elements(s.cards)c;
   update public.toowee_exercise_materials set revision=s.revision where set_id=s.id;
  end if;
  select coalesce(jsonb_agg(to_jsonb(w)),'[]') into result from public.vocabulary_words w where owner_id=who and folder_id=fid;
  return jsonb_build_object('name',s.title,'lang',s.lang,'folders','[]'::jsonb,'sets',jsonb_build_array(jsonb_build_object('id',fid,'name',s.title,'lang',s.lang)),'words',result);
 elsif p_action not in ('get','save','copy') then raise exception 'Nieznana operacja.';
 end if;
 return jsonb_build_object('id',s.id,'title',s.title,'description',s.description,'lang',s.lang,'cards',s.cards,'is_public',s.is_public,'mine',s.owner_id=who,'revision',s.revision,'source_id',s.source_id,'folder_id',case when s.owner_id=who then s.folder_id else null end,'author',(select coalesce(nullif(display_name,''),'Nauczyciel') from public.toowee_accounts where id=s.owner_id));
end;$$;
revoke all on function public.toowee_exercise_sets(text,jsonb) from public,anon;
grant execute on function public.toowee_exercise_sets(text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;

-- Preserve the currently installed classroom tools implementation; forward source language only.
begin;
do $upgrade$
declare definition text;
begin
 select pg_get_functiondef('public.toowee_classroom_tools(text,jsonb)'::regprocedure) into definition;
 definition:=replace(definition,$old$jsonb_build_object('folder_id',p_data->>'folder_id','name',p_data->>'name')$old$,$new$jsonb_build_object('folder_id',p_data->>'folder_id','name',p_data->>'name','lang',p_data->>'source')$new$);
 execute definition;
end $upgrade$;
notify pgrst,'reload schema';
commit;
