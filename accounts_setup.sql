-- TooWee: role, zaproszenia i prywatne materiały nauczyciela.
-- Uruchom całość w Supabase SQL Editor. Nie usuwa istniejących kont ani postępu.
begin;
create table if not exists public.toowee_accounts (
 id uuid primary key references auth.users(id) on delete cascade,
 role text not null check(role in ('student','teacher','admin')),
 display_name text not null default '',created_at timestamptz not null default now()
);
alter table public.toowee_accounts add column if not exists preferences jsonb not null default '{}';
alter table public.toowee_accounts drop constraint if exists toowee_accounts_role_check;
alter table public.toowee_accounts add constraint toowee_accounts_role_check check(role in ('student','teacher','admin'));
create table if not exists public.toowee_connections (
 teacher_id uuid not null references auth.users(id) on delete cascade,
 student_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),primary key(teacher_id,student_id),check(teacher_id<>student_id)
);
create table if not exists public.toowee_invites (
 token text primary key,teacher_id uuid not null references auth.users(id) on delete cascade,
 expires_at timestamptz not null default now()+interval '7 days',accepted_by uuid references auth.users(id) on delete cascade
);
create table if not exists public.toowee_assignments (
 teacher_id uuid not null references auth.users(id) on delete cascade,
 student_id uuid not null references auth.users(id) on delete cascade,
 source_word_id uuid not null,word_id uuid not null unique references public.vocabulary_words(id) on delete cascade,
 created_at timestamptz not null default now(),primary key(teacher_id,student_id,source_word_id)
);
create table if not exists public.toowee_student_profiles (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 first_name text not null, last_name text not null, student_id uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(), unique(owner_id,student_id)
);
alter table public.toowee_student_profiles add column if not exists blocked boolean not null default false;
alter table public.toowee_student_profiles add column if not exists languages text[];
alter table public.toowee_assignments add column if not exists access_disabled boolean not null default false;
create table if not exists public.toowee_profile_folders (
 profile_id uuid not null references public.toowee_student_profiles(id) on delete cascade,
 lang text not null check(lang in ('English','Japanese','Spanish')),
 folder_id uuid references public.vocabulary_folders(id) on delete set null, primary key(profile_id,lang), unique(folder_id)
);
create table if not exists public.toowee_material_folders (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id) on delete cascade,
 profile_id uuid references public.toowee_student_profiles(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 200),lang text not null check(lang in ('English','Japanese','Spanish')),created_at timestamptz not null default now()
);
create table if not exists public.toowee_material_sets (
 folder_id uuid not null references public.toowee_material_folders(id) on delete cascade,
 set_id uuid primary key references public.vocabulary_folders(id) on delete cascade
);
alter table public.toowee_material_folders enable row level security;
alter table public.toowee_material_sets enable row level security;
revoke all on public.toowee_material_folders,public.toowee_material_sets from public,anon,authenticated;
-- Rename only the old system default container; the all-words list is a virtual view.
update public.toowee_material_folders mf set name='Słówka bez zestawu'
 where mf.name='Ogólne' and mf.profile_id is not null and exists(
  select 1 from public.toowee_material_sets ms join public.toowee_profile_folders pf on pf.folder_id=ms.set_id and pf.profile_id=mf.profile_id where ms.folder_id=mf.id);
alter table public.toowee_invites add column if not exists profile_id uuid references public.toowee_student_profiles(id) on delete cascade;
alter table public.toowee_student_profiles enable row level security;
alter table public.toowee_profile_folders enable row level security;
revoke all on public.toowee_student_profiles,public.toowee_profile_folders from public,anon,authenticated;
insert into public.toowee_student_profiles(owner_id,first_name,last_name,student_id)
 select c.teacher_id,coalesce(a.display_name,'Uczeń'),'',c.student_id from public.toowee_connections c
 left join public.toowee_accounts a on a.id=c.student_id on conflict(owner_id,student_id) do nothing;
alter table public.toowee_accounts enable row level security;
alter table public.toowee_connections enable row level security;
alter table public.toowee_invites enable row level security;
alter table public.toowee_assignments enable row level security;
revoke all on public.toowee_accounts,public.toowee_connections,public.toowee_invites,public.toowee_assignments from public,anon,authenticated;
alter table public.vocabulary_words add column if not exists example text not null default '';
-- A restrictive policy also covers direct API reads of teacher copies.
create or replace function public.toowee_word_access(word uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select not exists(select 1 from public.toowee_assignments where word_id=word and student_id=auth.uid() and access_disabled)
$$;
revoke all on function public.toowee_word_access(uuid) from public,anon;
grant execute on function public.toowee_word_access(uuid) to authenticated;
drop policy if exists "Teacher material access" on public.vocabulary_words;
create policy "Teacher material access" on public.vocabulary_words as restrictive for all to authenticated
using(public.toowee_word_access(id)) with check(public.toowee_word_access(id));
create or replace function public.toowee_portal(p_action text default 'load',p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare who uuid:=auth.uid(); me public.toowee_accounts%rowtype; other uuid; code text; folder uuid; copied uuid; src record; n integer:=0; result jsonb; oldrole text; profile public.toowee_student_profiles%rowtype; pid uuid; item jsonb; language text; rows_json jsonb; all_words jsonb;
begin
 if who is null then raise exception 'Zaloguj się.';end if;
 -- A role is a workspace type, never an entitlement to a paid subscription or administrator access.
 insert into public.toowee_accounts(id,role,display_name)
 select id,case when raw_user_meta_data->>'role'='teacher' then 'teacher' else 'student' end,left(coalesce(raw_user_meta_data->>'display_name','Użytkownik'),100) from auth.users where id=who on conflict do nothing;
 select * into me from public.toowee_accounts where id=who for update;
 if p_action='settings_save' then
  if me.role not in ('teacher','admin') then raise exception 'Tylko konto nauczyciela.';end if;
  if coalesce(length(trim(p_data->>'display_name')),0) not between 1 and 100 then raise exception 'Podaj nazwę profilu (1–100 znaków).';end if;
  result:=p_data->'preferences';
  if jsonb_typeof(result) is distinct from 'object' or length(result::text)>2000 or jsonb_typeof(result->'languages') is distinct from 'array' then raise exception 'Nieprawidłowe ustawienia.';end if;
  if jsonb_array_length(result->'languages') not between 1 and 3 or exists(select 1 from jsonb_array_elements_text(result->'languages') l where l is null or l not in ('Japanese','English','Spanish')) or (select count(distinct l) from jsonb_array_elements_text(result->'languages') l)<>jsonb_array_length(result->'languages') then raise exception 'Wybierz języki bez powtórzeń.';end if;
  if coalesce(result->>'play_mode','') not in ('free','teacher') or coalesce(result->>'end_mode','') not in ('words','timer') or coalesce(result->>'japanese','') not in ('both','kana','kanji') or length(coalesce(result->>'brand',''))>200 then raise exception 'Nieprawidłowe preferencje.';end if;
  if coalesce(result->>'seconds','') !~ '^[0-9]+$' or coalesce(result->>'count','') !~ '^[0-9]+$' or coalesce(result->>'minutes','') !~ '^[0-9]+$' then raise exception 'Wpisz pełne liczby.';end if;
  if (result->>'seconds')::int not between 1 and 300 or (result->>'count')::int not between 1 and 1000 or (result->>'minutes')::int not between 1 and 30 then raise exception 'Ustawienia gry poza zakresem.';end if;
  update public.toowee_accounts set display_name=trim(p_data->>'display_name'),preferences=result where id=who;
  return jsonb_build_object('saved',true);
 end if;
 if p_action like 'profile_%' then
  if me.role not in ('teacher','admin') then raise exception 'Tylko nauczyciel zarządza profilami.';end if;
  if p_action='profile_self' then
   insert into public.toowee_student_profiles(owner_id,first_name,last_name,student_id)
   values(who,coalesce(nullif(split_part(trim(me.display_name),' ',1),''),'Mój profil'),trim(regexp_replace(trim(me.display_name),'^[^ ]+ *','')),who)
   on conflict(owner_id,student_id) do update set student_id=excluded.student_id returning * into profile;
   return to_jsonb(profile);
  end if;
  if p_action='profile_create' then
   if coalesce(length(trim(p_data->>'first_name')),0) not between 1 and 100 or coalesce(length(trim(p_data->>'last_name')),0) not between 1 and 100 then raise exception 'Podaj imię i nazwisko (do 100 znaków).';end if;
   insert into public.toowee_student_profiles(owner_id,first_name,last_name,languages) values(who,trim(p_data->>'first_name'),trim(p_data->>'last_name'),case when p_data->>'lang' in ('Japanese','English','Spanish') then array[p_data->>'lang'] else null end) returning * into profile;
   return to_jsonb(profile);
  end if;
  select * into profile from public.toowee_student_profiles where id=(p_data->>'profile_id')::uuid and owner_id=who for update;
  if not found then raise exception 'Brak dostępu do profilu.';end if;
  if p_action='profile_edit' then
   if coalesce(length(trim(p_data->>'first_name')),0) not between 1 and 100 or coalesce(length(trim(p_data->>'last_name')),0) not between 1 and 100 then raise exception 'Podaj imię i nazwisko.';end if;
   if jsonb_typeof(p_data->'languages') is distinct from 'array' or jsonb_array_length(p_data->'languages') not between 1 and 3 or exists(select 1 from jsonb_array_elements_text(p_data->'languages') l where l is null or l not in ('Japanese','English','Spanish')) then raise exception 'Wybierz co najmniej jeden język.';end if;
   update public.toowee_student_profiles set first_name=trim(p_data->>'first_name'),last_name=trim(p_data->>'last_name'),languages=array(select distinct jsonb_array_elements_text(p_data->'languages')) where id=profile.id returning * into profile;
   return to_jsonb(profile);
  elsif p_action='profile_block' then
   if profile.student_id=who then raise exception 'Nie możesz zablokować własnego konta.';end if;
   if jsonb_typeof(p_data->'blocked') is distinct from 'boolean' then raise exception 'Podaj stan blokady.';end if;
   update public.toowee_student_profiles set blocked=(p_data->>'blocked')::boolean where id=profile.id returning * into profile;
   update public.toowee_assignments set access_disabled=profile.blocked where teacher_id=who and student_id=profile.student_id;
   return to_jsonb(profile);
  elsif p_action='profile_delete' then
   if p_data->>'confirm_id' is distinct from profile.id::text or p_data->>'confirmation' is distinct from 'USUN' then raise exception 'Potwierdź usunięcie profilu dwa razy.';end if;
   update public.toowee_assignments set access_disabled=true where teacher_id=who and student_id=profile.student_id;
   delete from public.toowee_connections where teacher_id=who and student_id=profile.student_id;
   -- Keep teacher vocabulary and historical game results; detach profile folders.
   update public.toowee_material_folders set profile_id=null where owner_id=who and profile_id=profile.id;
   delete from public.toowee_student_profiles where id=profile.id;
   return jsonb_build_object('deleted',true);
  end if;
  if p_action='profile_invite' then
   if profile.blocked then raise exception 'Odblokuj ucznia przed wysłaniem zaproszenia.';end if;
   if profile.student_id is not null then raise exception 'Profil jest już połączony z kontem.';end if;
   code:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
   insert into public.toowee_invites(token,teacher_id,profile_id) values(code,who,profile.id);
   return jsonb_build_object('token',code);
  end if;
  language:=p_data->>'lang';
  if language is null or language not in ('English','Japanese','Spanish') then raise exception 'Wybierz język.';end if;
  if nullif(p_data->>'set_id','') is not null then
   select ms.set_id into folder from public.toowee_material_sets ms join public.toowee_material_folders mf on mf.id=ms.folder_id join public.vocabulary_folders vf on vf.id=ms.set_id
    where ms.set_id=(p_data->>'set_id')::uuid and mf.owner_id=who and mf.profile_id=profile.id and mf.lang=language and vf.owner_id=who and vf.lang=language;
   if folder is null then raise exception 'Brak dostępu do zestawu ucznia.';end if;
  else
   select folder_id into folder from public.toowee_profile_folders where profile_id=profile.id and lang=language;
  end if;
  if folder is null then
   insert into public.vocabulary_folders(owner_id,name,lang) values(who,left(profile.first_name||' '||profile.last_name||' · Materiały',200),language) returning id into folder;
   insert into public.toowee_profile_folders(profile_id,lang,folder_id) values(profile.id,language,folder) on conflict(profile_id,lang) do update set folder_id=excluded.folder_id;
  end if;
  if not exists(select 1 from public.toowee_material_sets where set_id=folder) then
   insert into public.toowee_material_folders(owner_id,profile_id,name,lang) values(who,profile.id,'Słówka bez zestawu',language) returning id into pid;
   insert into public.toowee_material_sets(folder_id,set_id) values(pid,folder);
  end if;
  if p_action='profile_save' then
   rows_json:=p_data->'words';
   if jsonb_typeof(rows_json) is distinct from 'array' or jsonb_array_length(rows_json) not between 1 and 500 then raise exception 'Dodaj od 1 do 500 słówek.';end if;
   for item in select value from jsonb_array_elements(rows_json) loop
    if coalesce(length(trim(item->>'word')),0) not between 1 and 500 or coalesce(length(trim(item->>'translation')),0) not between 1 and 1000 or length(coalesce(item->>'reading',''))>500 or length(coalesce(item->>'example',''))>5000 then raise exception 'Nieprawidłowe słówko lub tłumaczenie.';end if;
    if not exists(select 1 from public.vocabulary_words where owner_id=who and folder_id=folder and word=trim(item->>'word') and reading=coalesce(item->>'reading','') and translation=trim(item->>'translation') and example=coalesce(item->>'example','')) then
     insert into public.vocabulary_words(owner_id,lang,folder_id,word,reading,translation,example) values(who,language,folder,trim(item->>'word'),coalesce(item->>'reading',''),trim(item->>'translation'),coalesce(item->>'example',''));n:=n+1;
    end if;
   end loop;
  elsif p_action not in ('profile_load','profile_sync') then raise exception 'Nieznana operacja profilu.';end if;
  if profile.student_id is not null and profile.student_id<>who then
   perform public.toowee_portal('assign',jsonb_build_object('student_id',profile.student_id,'lang',language,'folder_id',folder,'name',profile.first_name||' '||profile.last_name));
  end if;
  select coalesce(jsonb_agg(to_jsonb(w) order by w.created_at,w.id),'[]') into all_words from public.vocabulary_words w
   where w.owner_id=who and public.toowee_word_access(w.id) and w.lang=language and (
    exists(select 1 from public.toowee_material_sets ms join public.toowee_material_folders mf on mf.id=ms.folder_id where ms.set_id=w.folder_id and mf.owner_id=who and mf.profile_id=profile.id)
    or exists(select 1 from public.toowee_assignments a join public.toowee_connections c on c.teacher_id=a.teacher_id and c.student_id=a.student_id where a.teacher_id=who and a.student_id=profile.student_id and not a.access_disabled and a.source_word_id=w.id)
    or (profile.student_id=who and not exists(select 1 from public.toowee_material_sets ms join public.toowee_material_folders mf on mf.id=ms.folder_id where ms.set_id=w.folder_id and ((mf.profile_id is not null and mf.profile_id<>profile.id) or to_jsonb(mf)->>'group_id' is not null))));
  if coalesce((p_data->>'all')::boolean,false) then return jsonb_build_object('folder_id',folder,'default_set_id',(select folder_id from public.toowee_profile_folders where profile_id=profile.id and lang=language),'all',true,'all_count',jsonb_array_length(all_words),'added',n,'words',all_words);end if;
  return jsonb_build_object('default_set_id',(select folder_id from public.toowee_profile_folders where profile_id=profile.id and lang=language),'all_count',jsonb_array_length(all_words),'folder_id',folder,'added',n,'words',(select coalesce(jsonb_agg(to_jsonb(w) order by w.created_at),'[]') from public.vocabulary_words w where w.owner_id=who and public.toowee_word_access(w.id) and w.folder_id=folder));
 elsif p_action='become_teacher' then
  update public.toowee_accounts set role=case when role='admin' then 'admin' else 'teacher' end where id=who returning * into me;
 elsif p_action='invite' then
  if me.role not in ('teacher','admin') then raise exception 'Tylko nauczyciel może zapraszać uczniów.';end if;
  code:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  insert into public.toowee_invites(token,teacher_id) values(code,who);
  return jsonb_build_object('token',code,'expires_days',7);
 elsif p_action='accept' then
  code:=trim(p_data->>'token');
  select teacher_id into other from public.toowee_invites where token=code and expires_at>now() and accepted_by is null for update;
  if other is null or other=who then raise exception 'Zaproszenie jest nieprawidłowe, wykorzystane lub wygasło.';end if;
  select profile_id into pid from public.toowee_invites where token=code;
  if pid is not null then
   select * into profile from public.toowee_student_profiles where id=pid and owner_id=other for update;
   if not found or profile.blocked or profile.student_id is not null or exists(select 1 from public.toowee_student_profiles where owner_id=other and student_id=who) then raise exception 'Profil jest już połączony. Skontaktuj się z nauczycielem.';end if;
   update public.toowee_student_profiles set student_id=who where id=pid;
  end if;
  insert into public.toowee_connections(teacher_id,student_id) values(other,who) on conflict do nothing;
  if pid is not null then
   for src in select w.* from public.vocabulary_words w where w.owner_id=other and (exists(select 1 from public.toowee_profile_folders pf where pf.folder_id=w.folder_id and pf.profile_id=pid) or exists(select 1 from public.toowee_material_sets ms join public.toowee_material_folders mf on mf.id=ms.folder_id where ms.set_id=w.folder_id and mf.profile_id=pid and mf.owner_id=other))
    and not exists(select 1 from public.toowee_assignments a where a.teacher_id=other and a.student_id=who and a.source_word_id=w.id)
   loop
    select id into folder from public.vocabulary_folders where owner_id=who and lang=src.lang and name=left('Od nauczyciela · '||profile.first_name||' '||profile.last_name,200) limit 1;
    if folder is null then insert into public.vocabulary_folders(owner_id,name,lang) values(who,left('Od nauczyciela · '||profile.first_name||' '||profile.last_name,200),src.lang) returning id into folder;end if;
    insert into public.vocabulary_words(owner_id,lang,word,reading,translation,example,folder_id) values(who,src.lang,src.word,src.reading,src.translation,src.example,folder) returning id into copied;
    insert into public.toowee_assignments(teacher_id,student_id,source_word_id,word_id) values(other,who,src.id,copied);
   end loop;
  end if;
  update public.toowee_invites set accepted_by=who where token=code;
 elsif p_action='disconnect' then
  other:=(p_data->>'id')::uuid;
  update public.toowee_student_profiles set student_id=null where (owner_id=who and student_id=other) or (student_id=who and owner_id=other);
  delete from public.toowee_connections where (teacher_id=who and student_id=other) or (student_id=who and teacher_id=other);
 elsif p_action='assign' then
  other:=(p_data->>'student_id')::uuid;
  if me.role not in ('teacher','admin') or not exists(select 1 from public.toowee_connections where teacher_id=who and student_id=other) then raise exception 'Uczeń nie jest połączony z Twoim kontem.';end if;
  if p_data->>'lang' not in ('English','Japanese','Spanish') or p_data->>'lang' is null then raise exception 'Wybierz język.';end if;
  -- Lock the connection: a concurrent disconnect cannot race with an assignment.
  perform 1 from public.toowee_connections where teacher_id=who and student_id=other for update;
  if not found then raise exception 'Połączenie z uczniem zostało usunięte.';end if;
  for src in select w.* from public.vocabulary_words w where w.owner_id=who and public.toowee_word_access(w.id) and w.lang=p_data->>'lang' and (nullif(p_data->>'folder_id','') is null or w.folder_id=(p_data->>'folder_id')::uuid)
    and not exists(select 1 from public.toowee_assignments a where a.teacher_id=who and a.student_id=other and a.source_word_id=w.id) limit 500
  loop
   if folder is null then insert into public.vocabulary_folders(owner_id,name,lang) values(other,left('Od: '||me.display_name||' · '||coalesce(nullif(p_data->>'name',''),'Materiały z lekcji'),200),p_data->>'lang') returning id into folder;end if;
   insert into public.vocabulary_words(owner_id,lang,word,reading,translation,example,folder_id) values(other,src.lang,src.word,src.reading,src.translation,src.example,folder) returning id into copied;
   insert into public.toowee_assignments(teacher_id,student_id,source_word_id,word_id) values(who,other,src.id,copied);
   update public.toowee_assignments set access_disabled=true where word_id=copied and exists(select 1 from public.toowee_student_profiles where owner_id=who and student_id=other and blocked);
   n:=n+1;
  end loop;
  return jsonb_build_object('assigned',n);
 elsif p_action='progress' then
  other:=(p_data->>'student_id')::uuid;
  if me.role not in ('teacher','admin') or not exists(select 1 from public.toowee_connections where teacher_id=who and student_id=other) then raise exception 'Brak dostępu do postępu tego ucznia.';end if;
  select coalesce(jsonb_agg(jsonb_build_object('word',w.word,'reading',w.reading,'translation',w.translation,'lang',w.lang,'stage',coalesce(vp.stage,0),'reviews',coalesce(vp.reviews,0),'due_at',vp.due_at,'last_reviewed_at',vp.last_reviewed_at) order by w.word),'[]') into result
  from public.toowee_assignments a join public.vocabulary_words w on w.id=a.word_id and w.owner_id=other left join public.vocabulary_progress vp on vp.owner_id=other and vp.word_id=a.word_id where a.teacher_id=who and a.student_id=other;
  return jsonb_build_object('words',result);
 elsif p_action<>'load' then raise exception 'Nieznana operacja.';end if;
 return jsonb_build_object('account',to_jsonb(me)-'id',
  'profiles',(select coalesce(jsonb_agg(to_jsonb(p) order by p.last_name,p.first_name),'[]') from public.toowee_student_profiles p where p.owner_id=who),
  'students',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',a.display_name)),'[]') from public.toowee_connections c join public.toowee_accounts a on a.id=c.student_id where c.teacher_id=who),
  'teachers',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',a.display_name)),'[]') from public.toowee_connections c join public.toowee_accounts a on a.id=c.teacher_id where c.student_id=who),
  'sources',(select coalesce(jsonb_agg(jsonb_build_object('word_id',s.word_id,'teacher_id',s.teacher_id,'teacher_name',a.display_name)),'[]') from public.toowee_assignments s join public.toowee_accounts a on a.id=s.teacher_id where s.student_id=who and not s.access_disabled));
end $$;
revoke all on function public.toowee_portal(text,jsonb) from public;
grant execute on function public.toowee_portal(text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
