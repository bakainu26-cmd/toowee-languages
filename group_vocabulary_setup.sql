-- Uruchom po teacher_setup.sql. Wspólne materiały grup, z automatyczną synchronizacją.
begin;
alter table public.toowee_material_folders add column if not exists group_id uuid references public.toowee_groups(id) on delete cascade;
create table if not exists public.toowee_group_folder_copies(
 source_folder uuid references public.toowee_material_folders(id) on delete cascade,profile_id uuid references public.toowee_student_profiles(id) on delete cascade,target_folder uuid not null references public.toowee_material_folders(id) on delete cascade,primary key(source_folder,profile_id));
create table if not exists public.toowee_group_set_copies(
 source_set uuid references public.vocabulary_folders(id) on delete cascade,source_folder uuid not null references public.toowee_material_folders(id) on delete cascade,profile_id uuid references public.toowee_student_profiles(id) on delete cascade,target_set uuid not null references public.vocabulary_folders(id) on delete cascade,student_set uuid references public.vocabulary_folders(id) on delete set null,primary key(source_set,profile_id));
create table if not exists public.toowee_group_word_copies(
 source_word uuid references public.vocabulary_words(id) on delete cascade,profile_id uuid references public.toowee_student_profiles(id) on delete cascade,source_set uuid not null,target_word uuid not null references public.vocabulary_words(id) on delete cascade,student_word uuid references public.vocabulary_words(id) on delete set null,primary key(source_word,profile_id),foreign key(source_set,profile_id) references public.toowee_group_set_copies(source_set,profile_id) on delete cascade);
alter table public.toowee_group_folder_copies enable row level security;
alter table public.toowee_group_set_copies enable row level security;
alter table public.toowee_group_word_copies enable row level security;
revoke all on public.toowee_group_folder_copies,public.toowee_group_set_copies,public.toowee_group_word_copies from public,anon,authenticated;
create or replace function public.toowee_group_cleanup() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if tg_table_name='toowee_group_word_copies' then
 delete from public.vocabulary_words where id=old.student_word;
 delete from public.toowee_assignments where source_word_id=old.target_word;
 delete from public.vocabulary_words where id=old.target_word;
 elsif tg_table_name='toowee_group_set_copies' then
 delete from public.toowee_group_word_copies where source_set=old.source_set and profile_id=old.profile_id;
 delete from public.vocabulary_words where folder_id in (old.student_set,old.target_set);
 delete from public.vocabulary_folders where id=old.student_set;
 delete from public.vocabulary_folders where id=old.target_set;
 else
 delete from public.toowee_group_set_copies where source_folder=old.source_folder and profile_id=old.profile_id;
 delete from public.toowee_material_folders where id=old.target_folder;
 end if;return old;
end $$;
drop trigger if exists group_word_cleanup on public.toowee_group_word_copies;
create trigger group_word_cleanup after delete on public.toowee_group_word_copies for each row execute function public.toowee_group_cleanup();
drop trigger if exists group_set_cleanup on public.toowee_group_set_copies;
create trigger group_set_cleanup after delete on public.toowee_group_set_copies for each row execute function public.toowee_group_cleanup();
drop trigger if exists group_folder_cleanup on public.toowee_group_folder_copies;
create trigger group_folder_cleanup after delete on public.toowee_group_folder_copies for each row execute function public.toowee_group_cleanup();
drop function if exists public.toowee_group_sync(uuid);
create or replace function public.toowee_group_sync(gid uuid,changed_word uuid default null) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare g public.toowee_groups%rowtype;p public.toowee_student_profiles%rowtype;f record;s record;w record;fc uuid;sc public.toowee_group_set_copies%rowtype;wc public.toowee_group_word_copies%rowtype;tw uuid;sw uuid;sf uuid;connected bool;
begin
 select * into g from public.toowee_groups where id=gid for update;if not found then return;end if;
 delete from public.toowee_group_folder_copies c using public.toowee_material_folders m where c.source_folder=m.id and m.group_id=gid and not exists(select 1 from public.toowee_group_students gs where gs.group_id=gid and gs.profile_id=c.profile_id);
 for p in select sp.* from public.toowee_student_profiles sp join public.toowee_group_students gs on gs.profile_id=sp.id where gs.group_id=gid and sp.owner_id=g.owner_id loop
 if p.languages is not null and not g.lang=any(p.languages) then update public.toowee_student_profiles set languages=array_append(languages,g.lang) where id=p.id;end if;
 connected:=p.student_id is not null and p.student_id<>g.owner_id and exists(select 1 from public.toowee_connections where teacher_id=g.owner_id and student_id=p.student_id);
 for f in select * from public.toowee_material_folders where group_id=gid and owner_id=g.owner_id loop
 select target_folder into fc from public.toowee_group_folder_copies where source_folder=f.id and profile_id=p.id;
 if fc is null then
 insert into public.toowee_material_folders(owner_id,profile_id,name,lang) values(g.owner_id,p.id,left(g.name||' · '||f.name,200),f.lang) returning id into fc;
 insert into public.toowee_group_folder_copies values(f.id,p.id,fc);
 else update public.toowee_material_folders set name=left(g.name||' · '||f.name,200) where id=fc;end if;
 for s in select v.* from public.vocabulary_folders v join public.toowee_material_sets ms on ms.set_id=v.id where ms.folder_id=f.id and v.owner_id=g.owner_id loop
 select * into sc from public.toowee_group_set_copies where source_set=s.id and profile_id=p.id;
 if not found then
 insert into public.vocabulary_folders(owner_id,name,lang) values(g.owner_id,s.name,s.lang) returning id into tw;
 insert into public.toowee_material_sets values(fc,tw);
 insert into public.toowee_group_set_copies(source_set,source_folder,profile_id,target_set) values(s.id,f.id,p.id,tw) returning * into sc;
 else update public.vocabulary_folders set name=s.name where id=sc.target_set and name is distinct from s.name;end if;
 -- Remove former account copies when a profile is disconnected or linked to another account.
 if sc.student_set is not null and (not connected or not exists(select 1 from public.vocabulary_folders where id=sc.student_set and owner_id=p.student_id)) then
 delete from public.vocabulary_words where folder_id=sc.student_set;
 delete from public.vocabulary_folders where id=sc.student_set;
 update public.toowee_group_set_copies set student_set=null where source_set=s.id and profile_id=p.id;sc.student_set:=null;
 end if;
 if connected and sc.student_set is null then
 insert into public.vocabulary_folders(owner_id,name,lang) values(p.student_id,left(g.name||' · '||s.name,200),s.lang) returning id into sf;
 update public.toowee_group_set_copies set student_set=sf where source_set=s.id and profile_id=p.id;sc.student_set:=sf;
 elsif connected then update public.vocabulary_folders set name=left(g.name||' · '||s.name,200) where id=sc.student_set and name is distinct from left(g.name||' · '||s.name,200);end if;
 for w in select * from public.vocabulary_words where folder_id=s.id and owner_id=g.owner_id and (changed_word is null or id=changed_word) loop
 select * into wc from public.toowee_group_word_copies where source_word=w.id and profile_id=p.id;
 if not found then
 insert into public.vocabulary_words(owner_id,folder_id,lang,word,reading,translation,example) values(g.owner_id,sc.target_set,w.lang,w.word,w.reading,w.translation,w.example) returning id into tw;
 insert into public.toowee_group_word_copies(source_word,profile_id,source_set,target_word) values(w.id,p.id,s.id,tw) returning * into wc;
 else update public.vocabulary_words set word=w.word,reading=w.reading,translation=w.translation,example=w.example where id=wc.target_word and (word,reading,translation,example) is distinct from (w.word,w.reading,w.translation,w.example);end if;
 if connected then
 select word_id into sw from public.toowee_assignments where teacher_id=g.owner_id and student_id=p.student_id and source_word_id=wc.target_word;
 if sw is null then
 insert into public.vocabulary_words(owner_id,folder_id,lang,word,reading,translation,example) values(p.student_id,sc.student_set,w.lang,w.word,w.reading,w.translation,w.example) returning id into sw;
 insert into public.toowee_assignments(teacher_id,student_id,source_word_id,word_id,access_disabled) values(g.owner_id,p.student_id,wc.target_word,sw,p.blocked);
 else update public.vocabulary_words set folder_id=sc.student_set,word=w.word,reading=w.reading,translation=w.translation,example=w.example where id=sw and (folder_id,word,reading,translation,example) is distinct from (sc.student_set,w.word,w.reading,w.translation,w.example);
 update public.toowee_assignments set access_disabled=p.blocked where word_id=sw;end if;
 update public.toowee_group_word_copies set student_word=sw where source_word=w.id and profile_id=p.id;
 end if;
 end loop;
 end loop;
 end loop;
 end loop;
end $$;
create or replace function public.toowee_group_changed() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare gid uuid;sid uuid;pid uuid;
begin
 if tg_table_name='toowee_group_students' then gid:=case when tg_op='DELETE' then old.group_id else new.group_id end;perform public.toowee_group_sync(gid);
 elsif tg_table_name='toowee_student_profiles' then
 for gid in select group_id from public.toowee_group_students where profile_id=new.id loop perform public.toowee_group_sync(gid);end loop;
 elsif tg_table_name='toowee_connections' then
 for gid in select gs.group_id from public.toowee_group_students gs join public.toowee_student_profiles sp on sp.id=gs.profile_id where sp.student_id=case when tg_op='DELETE' then old.student_id else new.student_id end and sp.owner_id=case when tg_op='DELETE' then old.teacher_id else new.teacher_id end loop perform public.toowee_group_sync(gid);end loop;
 elsif tg_table_name='toowee_groups' then perform public.toowee_group_sync(new.id);
 elsif tg_table_name='toowee_material_folders' then
 if tg_op<>'DELETE' and new.group_id is not null then perform public.toowee_group_sync(new.group_id);end if;
 else
 if tg_table_name='vocabulary_words' and tg_op='UPDATE' then
 if old.folder_id is distinct from new.folder_id then delete from public.toowee_group_word_copies where source_word=old.id;end if;end if;
 if tg_table_name='toowee_material_sets' and tg_op in ('DELETE','UPDATE') then
 if tg_op='DELETE' or old.folder_id is distinct from new.folder_id then delete from public.toowee_group_set_copies where source_set=old.set_id;end if;end if;
 if tg_table_name='vocabulary_words' then sid:=case when tg_op='DELETE' then old.folder_id else new.folder_id end;
 elsif tg_table_name='vocabulary_folders' then sid:=new.id;
 else sid:=case when tg_op='DELETE' then old.set_id else new.set_id end;end if;
 select mf.group_id into gid from public.toowee_material_sets ms join public.toowee_material_folders mf on mf.id=ms.folder_id where ms.set_id=sid and mf.group_id is not null;
 if gid is not null then
 if tg_table_name='vocabulary_words' then if tg_op<>'DELETE' then perform public.toowee_group_sync(gid,new.id);end if;
 else perform public.toowee_group_sync(gid);end if;end if;
 end if;return null;
end $$;
drop trigger if exists group_members_sync on public.toowee_group_students;
create trigger group_members_sync after insert or delete on public.toowee_group_students for each row execute function public.toowee_group_changed();
drop trigger if exists group_profile_sync on public.toowee_student_profiles;
create trigger group_profile_sync after update of student_id,blocked on public.toowee_student_profiles for each row execute function public.toowee_group_changed();
drop trigger if exists group_name_sync on public.toowee_groups;
create trigger group_name_sync after update of name on public.toowee_groups for each row execute function public.toowee_group_changed();
drop trigger if exists group_folder_sync on public.toowee_material_folders;
create trigger group_folder_sync after insert or update of name on public.toowee_material_folders for each row execute function public.toowee_group_changed();
drop trigger if exists group_set_sync on public.toowee_material_sets;
create trigger group_set_sync after insert or update or delete on public.toowee_material_sets for each row execute function public.toowee_group_changed();
drop trigger if exists group_word_sync on public.vocabulary_words;
create trigger group_word_sync after insert or update or delete on public.vocabulary_words for each row execute function public.toowee_group_changed();
drop trigger if exists group_set_name_sync on public.vocabulary_folders;
create trigger group_set_name_sync after update of name on public.vocabulary_folders for each row execute function public.toowee_group_changed();
drop trigger if exists group_connection_sync on public.toowee_connections;
create trigger group_connection_sync after insert or delete on public.toowee_connections for each row execute function public.toowee_group_changed();
create or replace function public.toowee_group_language_guard() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.lang is distinct from old.lang and exists(select 1 from public.toowee_material_folders where group_id=old.id) then raise exception 'Ta grupa ma już słownictwo. Zachowaj jej język albo utwórz nową grupę dla innego języka.';end if;return new;
end $$;
drop trigger if exists group_language_guard on public.toowee_groups;
create trigger group_language_guard before update of lang on public.toowee_groups for each row execute function public.toowee_group_language_guard();
revoke all on function public.toowee_group_language_guard() from public,anon,authenticated;
create or replace function public.toowee_group_vocabulary(p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare who uuid:=auth.uid();g public.toowee_groups%rowtype;fid uuid;sid uuid;wid uuid;item jsonb;created uuid;source record;source_ids uuid[];
begin
 if who is null or not exists(select 1 from public.toowee_accounts where id=who and role in ('teacher','admin')) then raise exception 'Wybierz konto nauczyciela.';end if;
 select * into g from public.toowee_groups where id=(p_data->>'group_id')::uuid and owner_id=who for update;if not found then raise exception 'Brak dostępu do grupy.';end if;
 if g.lang is null then raise exception 'Najpierw ustaw język grupy.';end if;
 if p_action='folder_create' then
 insert into public.toowee_material_folders(owner_id,group_id,name,lang) values(who,g.id,trim(p_data->>'name'),g.lang);
 elsif p_action in ('set_create','copy') then
 fid:=(p_data->>'folder_id')::uuid;
 if p_action='copy' and p_data->>'kind'='folder' then
 select * into source from public.toowee_material_folders where id=(p_data->>'source_id')::uuid and owner_id=who and lang=g.lang;
 if not found then raise exception 'Wybierz własny folder w języku grupy.';end if;
 select array_agg(set_id) into source_ids from public.toowee_material_sets where folder_id=source.id;
 insert into public.toowee_material_folders(owner_id,group_id,name,lang) values(who,g.id,source.name,g.lang) returning id into fid;
 else
 if not exists(select 1 from public.toowee_material_folders where id=fid and owner_id=who and group_id=g.id) then raise exception 'Wybierz folder tej grupy.';end if;
 if p_action='copy' then source_ids:=array[(p_data->>'source_id')::uuid];end if;
 end if;
 if p_action='set_create' then
 insert into public.vocabulary_folders(owner_id,name,lang) values(who,trim(p_data->>'name'),g.lang) returning id into created;
 insert into public.toowee_material_sets values(fid,created);
 else
 foreach sid in array coalesce(source_ids,'{}') loop
 select * into source from public.vocabulary_folders where id=sid and owner_id=who and lang=g.lang;
 if not found then raise exception 'Wybierz własny zestaw w języku grupy.';end if;
 insert into public.vocabulary_folders(owner_id,name,lang) values(who,source.name,g.lang) returning id into created;
 insert into public.toowee_material_sets values(fid,created);
 insert into public.vocabulary_words(owner_id,folder_id,lang,word,reading,translation,example) select who,created,lang,word,reading,translation,example from public.vocabulary_words where folder_id=sid and owner_id=who;
 end loop;
 end if;
 elsif p_action in ('words_save','word_delete') then
 sid:=(p_data->>'set_id')::uuid;
 if not exists(select 1 from public.toowee_material_sets ms join public.toowee_material_folders mf on mf.id=ms.folder_id where ms.set_id=sid and mf.group_id=g.id and mf.owner_id=who) then raise exception 'Brak dostępu do zestawu grupy.';end if;
 if p_action='word_delete' then delete from public.vocabulary_words where id=(p_data->>'word_id')::uuid and folder_id=sid and owner_id=who;
 else
 if jsonb_typeof(p_data->'words') is distinct from 'array' or jsonb_array_length(p_data->'words')>500 then raise exception 'Dodaj od 1 do 500 słówek naraz.';end if;
 for item in select value from jsonb_array_elements(p_data->'words') loop
 wid:=nullif(item->>'id','')::uuid;
 if wid is null then insert into public.vocabulary_words(owner_id,folder_id,lang,word,reading,translation,example) values(who,sid,g.lang,trim(item->>'word'),coalesce(item->>'reading',''),trim(item->>'translation'),coalesce(item->>'example',''));
 else update public.vocabulary_words set word=trim(item->>'word'),reading=coalesce(item->>'reading',''),translation=trim(item->>'translation'),example=coalesce(item->>'example','') where id=wid and folder_id=sid and owner_id=who;if not found then raise exception 'Brak słówka w tym zestawie.';end if;end if;
 end loop;end if;
 elsif p_action<>'load' then raise exception 'Nieznana operacja słownictwa grupy.';end if;
 perform public.toowee_group_sync(g.id);
 return jsonb_build_object('group',to_jsonb(g),'created_set_id',created,
 'folders',(select coalesce(jsonb_agg(to_jsonb(m) order by m.name),'[]') from public.toowee_material_folders m where m.group_id=g.id and m.owner_id=who),
 'sets',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'name',v.name,'folder_id',ms.folder_id) order by v.name),'[]') from public.vocabulary_folders v join public.toowee_material_sets ms on ms.set_id=v.id join public.toowee_material_folders mf on mf.id=ms.folder_id where mf.group_id=g.id and mf.owner_id=who),
 'words',(select coalesce(jsonb_agg(to_jsonb(w) order by w.created_at),'[]') from public.vocabulary_words w join public.toowee_material_sets ms on ms.set_id=w.folder_id join public.toowee_material_folders mf on mf.id=ms.folder_id where mf.group_id=g.id and w.owner_id=who));
end $$;
revoke all on function public.toowee_group_sync(uuid,uuid),public.toowee_group_cleanup(),public.toowee_group_changed() from public,anon,authenticated;
revoke all on function public.toowee_group_vocabulary(text,jsonb) from public,anon;
grant execute on function public.toowee_group_vocabulary(text,jsonb) to authenticated;
commit;
