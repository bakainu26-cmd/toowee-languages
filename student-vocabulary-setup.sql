-- Foldery zestawów ucznia: wykorzystuje istniejące tabele materiałów i słownictwa.
-- Uruchom po teacher_setup.sql. Nie przenosi ani nie usuwa istniejących danych.
begin;
create or replace function public.toowee_student_materials(p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public as $$
declare who uuid:=auth.uid();fid uuid;sid uuid;language text:=p_data->>'lang';title text:=trim(p_data->>'name');
begin
 if who is null then raise exception 'Zaloguj się.';end if;
 if p_action='list' then
 return jsonb_build_object('folders',(select coalesce(jsonb_agg(to_jsonb(f) order by f.name),'[]') from public.toowee_material_folders f where f.owner_id=who and f.profile_id is null and f.group_id is null),'sets',(select coalesce(jsonb_agg(jsonb_build_object('id',s.set_id,'folder_id',s.folder_id)),'[]') from public.toowee_material_sets s join public.toowee_material_folders f on f.id=s.folder_id where f.owner_id=who and f.profile_id is null and f.group_id is null));
 end if;
 if language not in ('English','Japanese','Spanish') or language is null then raise exception 'Wybierz język.';end if;
 fid:=nullif(p_data->>'folder_id','')::uuid;
 if fid is not null and not exists(select 1 from public.toowee_material_folders where id=fid and owner_id=who and lang=language and profile_id is null and group_id is null) then raise exception 'Brak dostępu do folderu w tym języku.';end if;
 if p_action in ('create_folder','create_set') and (title is null or length(title) not between 1 and 200) then raise exception 'Podaj nazwę (1–200 znaków).';end if;
 if p_action='create_folder' then
 insert into public.toowee_material_folders(owner_id,name,lang,parent_id) values(who,title,language,fid) returning id into fid;return jsonb_build_object('id',fid);
 elsif p_action='create_set' then
 insert into public.vocabulary_folders(owner_id,name,lang) values(who,title,language) returning id into sid;
 if fid is not null then insert into public.toowee_material_sets(folder_id,set_id) values(fid,sid);end if;
 return jsonb_build_object('id',sid);
 elsif p_action='move_set' then
 sid:=(p_data->>'set_id')::uuid;
 if not exists(select 1 from public.vocabulary_folders where id=sid and owner_id=who and lang=language) or exists(select 1 from public.toowee_material_sets s join public.toowee_material_folders f on f.id=s.folder_id where s.set_id=sid and (f.owner_id<>who or f.profile_id is not null or f.group_id is not null)) then raise exception 'Ten zestaw nie jest Twoim prywatnym zestawem.';end if;
 delete from public.toowee_material_sets where set_id=sid;
 if fid is not null then insert into public.toowee_material_sets(folder_id,set_id) values(fid,sid);end if;
 return '{"saved":true}';
 end if;
 raise exception 'Nieznana operacja.';
end $$;
revoke all on function public.toowee_student_materials(text,jsonb) from public,anon;
grant execute on function public.toowee_student_materials(text,jsonb) to authenticated;
commit;
