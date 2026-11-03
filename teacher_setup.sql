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
alter table public.toowee_groups enable row level security;
alter table public.toowee_group_students enable row level security;
revoke all on public.toowee_groups,public.toowee_group_students from public,anon,authenticated;
create table if not exists public.toowee_material_deliveries (
 owner_id uuid not null references auth.users(id) on delete cascade,
 profile_id uuid not null references public.toowee_student_profiles(id) on delete cascade,
 kind text not null,source_id uuid not null,
 primary key(owner_id,profile_id,kind,source_id)
);
alter table public.toowee_material_deliveries enable row level security;
revoke all on public.toowee_material_deliveries from public,anon,authenticated;
create or replace function public.toowee_teacher(p_action text default 'load',p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare who uuid:=auth.uid();gid uuid;pid uuid;fid uuid;sid uuid;item jsonb;bucket public.toowee_material_folders%rowtype; source_ids uuid[];target_folder uuid;new_set uuid;target_profile public.toowee_student_profiles%rowtype;material_lang text;material_name text;source record;
begin
 if who is null or not exists(select 1 from public.toowee_accounts where id=who and role in ('teacher','admin')) then raise exception 'Wybierz konto nauczyciela.';end if;
 perform 1 from public.toowee_accounts where id=who for update;
 -- Bring pre-existing pupil sets into a folder without moving or copying vocabulary.
 for item in select to_jsonb(pf) from public.toowee_profile_folders pf join public.toowee_student_profiles p on p.id=pf.profile_id where p.owner_id=who and pf.folder_id is not null and not exists(select 1 from public.toowee_material_sets ms where ms.set_id=pf.folder_id) loop
  insert into public.toowee_material_folders(owner_id,profile_id,name,lang) values(who,(item->>'profile_id')::uuid,'Słówka bez zestawu',item->>'lang') returning id into fid;
  insert into public.toowee_material_sets values(fid,(item->>'folder_id')::uuid) on conflict do nothing;
 end loop;
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
   if p_data->>'confirm_id' is distinct from p_data->>'id' then raise exception 'Potwierdź usunięcie materiałów.';end if;
   update public.toowee_assignments a set access_disabled=true where a.teacher_id=who and a.source_word_id in(select w.id from public.vocabulary_words w where w.owner_id=who and w.folder_id=any(source_ids));
   delete from public.vocabulary_words where owner_id=who and folder_id=any(source_ids);
   delete from public.vocabulary_folders where owner_id=who and id=any(source_ids);
   if p_data->>'kind'='folder' then delete from public.toowee_material_folders where id=bucket.id and owner_id=who;end if;
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
    insert into public.toowee_material_sets(folder_id,set_id) values(target_folder,new_set);
    insert into public.vocabulary_words(owner_id,lang,word,reading,translation,example,folder_id) select who,lang,word,reading,translation,example,new_set from public.vocabulary_words where owner_id=who and folder_id=source.id;
    if target_profile.student_id is not null and target_profile.student_id<>who then loop item:=public.toowee_portal('assign',jsonb_build_object('student_id',target_profile.student_id,'lang',material_lang,'folder_id',new_set,'name',source.name));exit when (item->>'assigned')::int<500;end loop;end if;
   end loop;
   if target_profile.languages is not null and not material_lang=any(target_profile.languages) then update public.toowee_student_profiles set languages=array_append(languages,material_lang) where id=target_profile.id;end if;
   insert into public.toowee_material_deliveries values(who,target_profile.id,p_data->>'kind',(p_data->>'id')::uuid);
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
   update public.toowee_groups set name=trim(p_data->>'name'),lang=coalesce(p_data->>'lang',lang) where id=gid;delete from public.toowee_group_students where group_id=gid;
  end if;
  insert into public.toowee_group_students(group_id,profile_id) select gid,value::uuid from jsonb_array_elements_text(p_data->'students') on conflict do nothing;
 elsif p_action='folder_create' then
  if length(trim(coalesce(p_data->>'name',''))) not between 1 and 200 then raise exception 'Podaj nazwę folderu lub klasy.';end if;
  pid:=nullif(p_data->>'profile_id','')::uuid;
  if pid is not null and not exists(select 1 from public.toowee_student_profiles where id=pid and owner_id=who) then raise exception 'Brak dostępu do ucznia.';end if;
  insert into public.toowee_material_folders(owner_id,profile_id,name,lang) values(who,pid,trim(p_data->>'name'),p_data->>'lang');
 elsif p_action in ('set_move','set_copy') then
  select * into bucket from public.toowee_material_folders where id=(p_data->>'folder_id')::uuid and owner_id=who for update;
  if not found then raise exception 'Brak dostępu do folderu.';end if;
  select id into sid from public.vocabulary_folders where id=(p_data->>'set_id')::uuid and owner_id=who and lang=bucket.lang;
  if sid is null then raise exception 'Wybierz własny zestaw w tym samym języku.';end if;
  if p_action='set_move' then
   if bucket.profile_id is not null or exists(select 1 from public.toowee_material_sets ms join public.toowee_material_folders m on m.id=ms.folder_id where ms.set_id=sid and m.profile_id is not null) then raise exception 'Zestaw ucznia pozostaje w jego profilu. Użyj kopiowania.';end if;
   insert into public.toowee_material_sets values(bucket.id,sid) on conflict(set_id) do update set folder_id=excluded.folder_id;
  else
   if (select count(*) from public.vocabulary_words where owner_id=who and folder_id=sid)>500 then raise exception 'Kopiuj maksymalnie 500 słówek naraz.';end if;
   pid:=sid;
   insert into public.vocabulary_folders(owner_id,name,lang) select who,name,lang from public.vocabulary_folders where id=pid returning id into sid;
   insert into public.toowee_material_sets values(bucket.id,sid);
   insert into public.vocabulary_words(owner_id,lang,word,reading,translation,example,folder_id) select who,lang,word,reading,translation,example,sid from public.vocabulary_words where owner_id=who and folder_id=pid;
  end if;
 elsif p_action='set_create' then
  select * into bucket from public.toowee_material_folders where id=(p_data->>'folder_id')::uuid and owner_id=who for update;
  if not found then raise exception 'Brak dostępu do folderu.';end if;
  if length(trim(coalesce(p_data->>'name',''))) not between 1 and 200 then raise exception 'Podaj nazwę zestawu.';end if;
  insert into public.vocabulary_folders(owner_id,name,lang) values(who,trim(p_data->>'name'),bucket.lang) returning id into sid;
  insert into public.toowee_material_sets values(bucket.id,sid);
 elsif p_action not in ('load','profile') then raise exception 'Nieznana operacja panelu nauczyciela.';end if;
 if p_action='profile' then
  pid:=(p_data->>'profile_id')::uuid;
  if not exists(select 1 from public.toowee_student_profiles where id=pid and owner_id=who) then raise exception 'Brak dostępu do ucznia.';end if;
 end if;
 return jsonb_build_object('created_set_id',sid,'overview',jsonb_build_object('words',(select count(*) from public.vocabulary_words where owner_id=who),'games',(select count(*) from public.sophie_rooms where host_id=who and status='finished')),
  'profile_languages',(select coalesce(jsonb_agg(x),'[]') from (select p.id as profile_id,unnest(p.languages) as lang from public.toowee_student_profiles p where p.owner_id=who and p.languages is not null union select m.profile_id,m.lang from public.toowee_material_folders m join public.toowee_student_profiles p on p.id=m.profile_id where m.owner_id=who and p.languages is null union select pf.profile_id,pf.lang from public.toowee_profile_folders pf join public.toowee_student_profiles p on p.id=pf.profile_id where p.owner_id=who and p.languages is null) x),
  'groups',(select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'lang',g.lang,'students',(select coalesce(jsonb_agg(s.profile_id),'[]') from public.toowee_group_students s where s.group_id=g.id)) order by g.name),'[]') from public.toowee_groups g where g.owner_id=who),
  'folders',(select coalesce(jsonb_agg(to_jsonb(m) order by m.name),'[]') from public.toowee_material_folders m where m.owner_id=who),
  'sets',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'name',v.name,'lang',v.lang,'folder_id',ms.folder_id,'profile_id',m.profile_id,'words',(select count(*) from public.vocabulary_words w where w.owner_id=who and w.folder_id=v.id)) order by v.name),'[]') from public.vocabulary_folders v left join public.toowee_material_sets ms on ms.set_id=v.id left join public.toowee_material_folders m on m.id=ms.folder_id where v.owner_id=who));
end $$;
revoke all on function public.toowee_teacher(text,jsonb) from public,anon;
grant execute on function public.toowee_teacher(text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
