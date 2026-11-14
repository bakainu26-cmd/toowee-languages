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


-- Usuwanie tablic: uczeń ukrywa u siebie, właściciel w panelu nauczyciela usuwa dla obu stron.
-- Po classroom-tools-setup.sql. Zachowuje dotychczasowe tablice.
begin;
create table if not exists public.toowee_board_hidden(board_id uuid not null references public.toowee_boards(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,hidden_at timestamptz not null default now(),primary key(board_id,user_id));
alter table public.toowee_board_hidden enable row level security;
revoke all on public.toowee_board_hidden from public,anon,authenticated;
create or replace function public.toowee_classroom_tools(p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public as $$
declare who uuid:=auth.uid(); v_board public.toowee_boards%rowtype;wid uuid;sid uuid;pid uuid;v_image text;v_url text;v_token text;result jsonb;v int;v_email text;v_teacher boolean;
begin
 if who is null then raise exception 'Zaloguj się.';end if;
 v_teacher:=coalesce(p_data->>'view','teacher')<>'student' and exists(select 1 from public.toowee_accounts where id=who and role in ('teacher','admin'));
 if not v_teacher and p_action in ('link_save','link_delete','board_create') then raise exception 'Ta operacja jest dostępna w panelu nauczyciela.';end if;
 if p_action='metadata' then
 return jsonb_build_object('images',(select coalesce(jsonb_object_agg(x.word_id::text,x.image),'{}') from (
 select i.word_id,i.image from public.toowee_word_images i where i.owner_id=who
 union all select a.word_id,i.image from public.toowee_assignments a join public.toowee_word_images i on i.word_id=a.source_word_id where a.student_id=who and not a.access_disabled
 ) x),'pairs',(select coalesce(jsonb_object_agg(set_id::text,jsonb_build_object('source',source_lang,'target',target_lang)),'{}') from public.toowee_language_pairs where owner_id=who),'word_targets',(select coalesce(jsonb_object_agg(w.id::text,w.target_lang),'{}') from (select w.id,lp.target_lang from public.vocabulary_words w join public.toowee_language_pairs lp on lp.set_id=w.folder_id where w.owner_id=who union all select a.word_id as id,lp.target_lang from public.toowee_assignments a join public.vocabulary_words src on src.id=a.source_word_id join public.toowee_language_pairs lp on lp.set_id=src.folder_id where a.student_id=who and not a.access_disabled) w));
 elsif p_action='image_save' then
 wid:=(p_data->>'word_id')::uuid;
 if not exists(select 1 from public.vocabulary_words where id=wid and owner_id=who) then raise exception 'Brak dostępu do słówka.';end if;
 v_image:=coalesce(p_data->>'image','');
 if length(v_image)>1500000 or (v_image<>'' and v_image !~ '^https://' and v_image !~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$') then raise exception 'Wybierz obraz PNG, JPEG lub WebP albo link HTTPS (maks. 1 MB).';end if;
 insert into public.toowee_word_images values(wid,who,v_image) on conflict(word_id) do update set image=excluded.image;
 return jsonb_build_object('saved',true);
 elsif p_action='set_create' then
 if p_data->>'source' not in ('English','Japanese','Spanish') or p_data->>'target' not in ('Polish','English','Japanese','Spanish') or p_data->>'source'=p_data->>'target' then raise exception 'Wybierz dwa różne języki.';end if;
 if not exists(select 1 from public.toowee_accounts where id=who and role in ('teacher','admin')) then raise exception 'Wybierz konto nauczyciela.';end if;
 result:=public.toowee_teacher('set_create',jsonb_build_object('folder_id',p_data->>'folder_id','name',p_data->>'name','lang',p_data->>'source'));
 sid:=(result->>'created_set_id')::uuid;
 if not exists(select 1 from public.vocabulary_folders where id=sid and owner_id=who and lang=p_data->>'source') then raise exception 'Folder ma inny język niż lista. Wybierz folder w języku słówek.';end if;
 insert into public.toowee_language_pairs values(sid,who,p_data->>'source',p_data->>'target');return result;
 elsif p_action='pair_save' then
 sid:=(p_data->>'set_id')::uuid;
 if not (exists(select 1 from public.vocabulary_folders where id=sid and owner_id=who and lang=p_data->>'source') or exists(select 1 from public.toowee_exercise_sets where id=sid and owner_id=who and lang=p_data->>'source')) or p_data->>'target' not in ('Polish','English','Japanese','Spanish') or p_data->>'target'=p_data->>'source' then raise exception 'Nieprawidłowa para języków.';end if;
 insert into public.toowee_language_pairs values(sid,who,p_data->>'source',p_data->>'target') on conflict(set_id) do update set target_lang=excluded.target_lang;return '{"saved":true}';
 elsif p_action='invite_email' then
 pid:=nullif(p_data->>'profile_id','')::uuid;
 v_email:=lower(trim(p_data->>'email'));
 if v_email is null or v_email !~ '^[^ @]+@[^ @]+\.[^ @]+$' or length(v_email)>254 then raise exception 'Wpisz poprawny e-mail ucznia.';end if;
 if pid is not null then result:=public.toowee_portal('profile_invite',jsonb_build_object('profile_id',pid));
 else result:=public.toowee_portal('invite','{}');end if;
 v_token:=result->>'token';if v_token is null then raise exception 'Nie udało się utworzyć połączenia.';end if;
 insert into public.toowee_email_links values(v_token,v_email);return '{"saved":true}';
 elsif p_action='email_pending' then
 select lower(u.email) into v_email from auth.users u where u.id=who and u.email_confirmed_at is not null;
 return jsonb_build_object('requests',(select coalesce(jsonb_agg(jsonb_build_object('token',i.token,'teacher',a.display_name)),'[]') from public.toowee_email_links e join public.toowee_invites i on i.token=e.token join public.toowee_accounts a on a.id=i.teacher_id where e.email=v_email and i.accepted_by is null and i.expires_at>now()));
 elsif p_action='email_accept' then
 v_token:=p_data->>'token';
 if not exists(select 1 from public.toowee_email_links e join auth.users u on lower(u.email)=e.email where u.id=who and u.email_confirmed_at is not null and e.token=v_token) then raise exception 'Zaproszenie jest przypisane do innego adresu e-mail.';end if;
 return public.toowee_portal('accept',jsonb_build_object('token',v_token));
 elsif p_action in ('links','boards') then
 return jsonb_build_object('items',case when p_action='links' then (
 select coalesce(jsonb_agg(to_jsonb(l) order by l.created_at),'[]') from public.toowee_notebook_links l join public.toowee_student_profiles p on p.id=l.profile_id where (v_teacher and l.owner_id=who or p.student_id=who and not p.blocked) and (nullif(p_data->>'profile_id','') is null or l.profile_id=(p_data->>'profile_id')::uuid)
 ) else (
 select coalesce(jsonb_agg(to_jsonb(x) order by x.updated_at desc),'[]') from (select b.id,b.owner_id,b.profile_id,b.title,b.revision,b.updated_at from public.toowee_boards b left join public.toowee_student_profiles p on p.id=b.profile_id where (b.owner_id=who and (v_teacher or b.profile_id is null) or p.student_id=who and not p.blocked) and (v_teacher or not exists(select 1 from public.toowee_board_hidden h where h.board_id=b.id and h.user_id=who)) and (nullif(p_data->>'profile_id','') is null or b.profile_id=(p_data->>'profile_id')::uuid)) x
 ) end);
 elsif p_action='link_save' then
 pid:=(p_data->>'profile_id')::uuid;
 if not exists(select 1 from public.toowee_student_profiles where id=pid and owner_id=who) then raise exception 'Wybierz własnego ucznia.';end if;
 v_url:=trim(p_data->>'url');if v_url !~ '^https://' or length(v_url)>2000 or length(trim(p_data->>'title')) not between 1 and 200 then raise exception 'Podaj tytuł i poprawny link HTTPS.';end if;
 insert into public.toowee_notebook_links(owner_id,profile_id,title,url) values(who,pid,trim(p_data->>'title'),v_url);return '{"saved":true}';
 elsif p_action='link_delete' then
 delete from public.toowee_notebook_links where id=(p_data->>'id')::uuid and owner_id=who;return '{"saved":true}';
 elsif p_action='board_create' then
 if not exists(select 1 from public.toowee_accounts where id=who and role in ('teacher','admin')) then raise exception 'Tablice tworzy nauczyciel.';end if;
 pid:=nullif(p_data->>'profile_id','')::uuid;
 if pid is not null and not exists(select 1 from public.toowee_student_profiles where id=pid and owner_id=who and not blocked) then raise exception 'Wybierz własnego ucznia.';end if;
 insert into public.toowee_boards(owner_id,profile_id,title,slides) values(who,pid,left(coalesce(nullif(trim(p_data->>'title'),''),'Nowa tablica'),200),'[{"id":"first","objects":[]}]') returning * into v_board;return to_jsonb(v_board);
 elsif p_action='board_delete' then
 select * into v_board from public.toowee_boards where id=(p_data->>'id')::uuid for update;
 if not found then raise exception 'Brak dostępu do tablicy.';end if;
 if v_teacher and v_board.owner_id=who then
 delete from public.toowee_boards where id=v_board.id;return '{"deleted":true}';
 end if;
 if not(v_board.owner_id=who and v_board.profile_id is null or exists(select 1 from public.toowee_student_profiles where id=v_board.profile_id and student_id=who and not blocked)) then raise exception 'Brak dostępu do tablicy.';end if;
 insert into public.toowee_board_hidden(board_id,user_id) values(v_board.id,who) on conflict do nothing;return '{"hidden":true}';
 elsif p_action in ('board_load','board_save') then
 select * into v_board from public.toowee_boards where id=(p_data->>'id')::uuid for update;
 if not found or not(v_board.owner_id=who and (v_teacher or v_board.profile_id is null) or exists(select 1 from public.toowee_student_profiles where id=v_board.profile_id and student_id=who and not blocked)) then raise exception 'Brak dostępu do tablicy.';end if;
 if not v_teacher and exists(select 1 from public.toowee_board_hidden where board_id=v_board.id and user_id=who) then raise exception 'Tablica została usunięta z Twojej listy.';end if;
 if p_action='board_save' then
 if v_board.revision is distinct from (p_data->>'revision')::int then raise exception 'Tablica zmieniła się na drugim urządzeniu. Odśwież widok przed zapisem.';end if;
 if jsonb_typeof(p_data->'slides') is distinct from 'array' or jsonb_array_length(p_data->'slides') not between 1 and 200 or length((p_data->'slides')::text)>25000000 then raise exception 'Tablica może mieć 1–200 slajdów i maksymalnie 25 MB.';end if;
 update public.toowee_boards set slides=p_data->'slides',revision=revision+1,updated_at=now() where id=v_board.id returning * into v_board;
 end if;return to_jsonb(v_board);
 else raise exception 'Nieznana operacja.';end if;
end $$;
revoke all on function public.toowee_classroom_tools(text,jsonb) from public,anon;
grant execute on function public.toowee_classroom_tools(text,jsonb) to authenticated;
create or replace function public.toowee_board_realtime_access(room_topic text) returns boolean
language plpgsql stable security definer set search_path=public as $$
declare board_id uuid;who uuid:=auth.uid();
begin
 if who is null or room_topic is null or room_topic !~ '^toowee-board:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then return false;end if;
 board_id:=substring(room_topic from 14)::uuid;
 return exists(select 1 from public.toowee_boards b left join public.toowee_student_profiles p on p.id=b.profile_id where b.id=board_id and (b.owner_id=who or p.student_id=who and not p.blocked and not exists(select 1 from public.toowee_board_hidden h where h.board_id=b.id and h.user_id=who)));
end $$;
revoke all on function public.toowee_board_realtime_access(text) from public,anon;
grant execute on function public.toowee_board_realtime_access(text) to authenticated;

commit;
