-- Transactional deployment: verifies live function versions and preserves all existing exercise rows.
-- Stop if any assertion fails. Do not remove guards to force deployment.
begin;
lock table public.toowee_exercise_sets in share row exclusive mode;
do $guard$ begin
if (select md5(prosrc) from pg_proc where oid='public.toowee_exercise_sets(text,jsonb)'::regprocedure)<>'6aceac70766651f12f81684d87a72328'
or (select md5(prosrc) from pg_proc where oid='public.toowee_sophie(text,jsonb)'::regprocedure)<>'230571a30cade48d2b274c857d96c78c'
or (select md5(prosrc) from pg_proc where oid='public.toowee_collections(text,jsonb)'::regprocedure)<>'ba250e019520f29c09a13d102bfbcd35'
or (select md5(prosrc) from pg_proc where oid='public.toowee_magic_dice(text,jsonb)'::regprocedure)<>'ddb7782911ee6c46feb3c7c4fa93715d'
then raise exception 'Live functions changed; repeat audit.';end if;
end $guard$;
create temp table toowee_format_preservation_check on commit drop as select id,md5((to_jsonb(s)-'question_format'-'format_review')::text) original_hash from public.toowee_exercise_sets s;
alter table public.toowee_exercise_sets add column if not exists question_format text check(question_format in ('open','quiz','write'));
alter table public.toowee_exercise_sets add column if not exists format_review boolean not null default false;
create or replace function public.toowee_infer_question_format(cards jsonb) returns text
language sql immutable set search_path=public,pg_temp as $infer$
 select case when jsonb_array_length(cards)=0 then null
 when not exists(select 1 from jsonb_array_elements(cards)c where c->>'type' is distinct from 'open') then 'open'
 when not exists(select 1 from jsonb_array_elements(cards)c where c->>'type'='open' or coalesce(btrim(c->>'answer'),'')='' or jsonb_array_length(coalesce(c->'wrong','[]'))=0) then 'quiz'
 when not exists(select 1 from jsonb_array_elements(cards)c where c->>'type'='open' or coalesce(btrim(c->>'answer'),'')='' or jsonb_array_length(coalesce(c->'wrong','[]'))>0) then 'write'
 else null end
$infer$;
-- Only classification metadata changes; original cards, answers, IDs and relationships stay intact.
update public.toowee_exercise_sets set question_format=public.toowee_infer_question_format(cards),
 format_review=public.toowee_infer_question_format(cards) is null where question_format is null;


alter table public.toowee_exercise_sets add column if not exists target_lang text
 check (target_lang in ('Polish','English','Japanese','Spanish'));

create or replace function public.toowee_exercise_sets(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare who uuid:=auth.uid();s public.toowee_exercise_sets; item jsonb; cards jsonb; wrong jsonb; names text[]; result jsonb; fid uuid; req uuid; expected integer; page integer; v_lang text; v_title text; v_description text; v_public boolean; recipient uuid; recipient_ids uuid[]; v_format text;
begin
 if who is null or (p_action not in ('assigned','get') and not exists(select 1 from public.toowee_accounts where id=who and role in ('teacher','admin'))) then raise exception 'Zestawy są dostępne dla nauczycieli.';end if;
 if p_action='get' and not exists(select 1 from public.toowee_accounts where id=who and role in ('teacher','admin')) and not exists(select 1 from public.toowee_material_deliveries d join public.toowee_student_profiles p on p.id=d.profile_id join public.toowee_exercise_sets e on e.id=d.source_id and e.owner_id=d.owner_id where d.kind='exercise' and d.source_id=(p_data->>'id')::uuid and p.owner_id=d.owner_id and p.student_id=who and not p.blocked) then raise exception 'Brak dostępu do zestawu.';end if;
 if p_action='assign_folder' then
 if not exists(select 1 from public.toowee_exercise_folders where id=(p_data->>'folder_id')::uuid and owner_id=who) then raise exception 'Brak dostępu do folderu.';end if;
 for s in select * from public.toowee_exercise_sets where owner_id=who and folder_id=(p_data->>'folder_id')::uuid loop
  perform public.toowee_exercise_sets('assign',p_data||jsonb_build_object('id',s.id));
 end loop;return jsonb_build_object('saved',true);
 end if;
 if p_action='assigned' then
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,'description',e.description,'lang',e.lang,'count',jsonb_array_length(e.cards),'author',a.display_name) order by e.updated_at desc),'[]') into result from public.toowee_exercise_sets e join public.toowee_accounts a on a.id=e.owner_id where exists(select 1 from public.toowee_material_deliveries d join public.toowee_student_profiles p on p.id=d.profile_id where d.owner_id=e.owner_id and d.kind='exercise' and d.source_id=e.id and p.owner_id=e.owner_id and p.student_id=who and not p.blocked);
 return jsonb_build_object('sets',result);
 end if;
 if p_action='recipients' then
 return jsonb_build_object('profiles',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',trim(first_name||' '||last_name))),'[]') from public.toowee_student_profiles where owner_id=who and not blocked),'groups',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'lang',lang)),'[]') from public.toowee_groups where owner_id=who));
 end if;
 if p_action='folder_create' then
 v_title:=btrim(p_data->>'name');v_lang:=p_data->>'lang';
 if coalesce(length(v_title),0) not between 1 and 200 or v_lang is null or v_lang not in ('English','Japanese','Spanish') then raise exception 'Podaj nazwę folderu i język.';end if;
 insert into public.toowee_exercise_folders(owner_id,name,lang) values(who,v_title,v_lang) returning id into fid;
 return jsonb_build_object('id',fid,'saved',true);
 end if;
 if p_action='folder_delete' then
 if p_data->>'confirm_id' is distinct from p_data->>'id' then raise exception 'Potwierdź usunięcie folderu.';end if;
 delete from public.toowee_exercise_folders where id=(p_data->>'id')::uuid and owner_id=who;
 if not found then raise exception 'Brak dostępu do folderu zestawów.';end if;
 return jsonb_build_object('deleted',true);
 end if;
 if p_action='folder_rename' then
 v_title:=btrim(p_data->>'name');if coalesce(length(v_title),0) not between 1 and 200 then raise exception 'Podaj nazwę folderu.';end if;
 update public.toowee_exercise_folders set name=v_title where id=(p_data->>'id')::uuid and owner_id=who;
 if not found then raise exception 'Brak dostępu do folderu zestawów.';end if;
 return jsonb_build_object('saved',true);
 end if;
 if p_action='folders' then
 select coalesce(jsonb_agg(to_jsonb(f)),'[]') into result from public.toowee_exercise_folders f where f.owner_id=who;
 return jsonb_build_object('folders',result,'library','exercise');
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
   select e.id,e.title,e.description,e.lang,e.question_format as format,e.format_review,case when e.owner_id=who then e.folder_id else null end as folder_id,e.is_public,e.owner_id=who as mine,e.revision,e.updated_at,jsonb_array_length(e.cards) as count,coalesce(nullif(a.display_name,''),'Nauczyciel') as author
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
  v_format:=coalesce(nullif(p_data->>'format',''),public.toowee_infer_question_format(p_data->'cards'));if v_format is null or v_format not in ('open','quiz','write') then raise exception 'Zestaw wymaga sprawdzenia: wybierz jeden format pytań.';end if;
  v_title:=trim(p_data->>'title');v_description:=coalesce(p_data->>'description','');v_lang:=p_data->>'lang';cards:=p_data->'cards';v_public:=coalesce((p_data->>'is_public')::boolean,false);
  if coalesce(length(v_title),0) not between 1 and 200 or length(v_description)>2000 or coalesce(v_lang,'') not in ('English','Japanese','Spanish') then raise exception 'Uzupełnij nazwę i język zestawu.';end if;
  if jsonb_typeof(cards) is distinct from 'array' then raise exception 'Nieprawidłowe karty.';end if;
  if jsonb_array_length(cards) not between 1 and 500 or length(cards::text)>4000000 then raise exception 'Zestaw musi zawierać od 1 do 500 kart.';end if;
  fid:=case when p_data?'folder_id' then nullif(p_data->>'folder_id','')::uuid else s.folder_id end;
  if fid is not null and not exists(select 1 from public.toowee_exercise_folders where id=fid and owner_id=who and lang=v_lang) then raise exception 'Wybierz własny folder w języku zestawu.';end if;
  names:='{}';
  for item in select value from jsonb_array_elements(cards) loop
   if (v_format='open' and item->>'type'<>'open') or (v_format in ('quiz','write') and (item->>'type'='open' or coalesce(btrim(item->>'answer'),'')='')) or (v_format='quiz' and jsonb_array_length(coalesce(item->'wrong','[]'))<1) then raise exception 'Wszystkie pytania muszą pasować do formatu zestawu.';end if;
   if coalesce(item->>'type','') not in ('vocabulary','question','open','quiz') or coalesce(length(trim(item->>'prompt')),0) not between 1 and 2000 or length(coalesce(item->>'answer',''))>2000 or (item->>'type'<>'open' and coalesce(length(trim(item->>'answer')),0)=0) or length(coalesce(item->>'reading',''))>500 then raise exception 'Uzupełnij zadanie i odpowiedź każdej karty.';end if;
   if coalesce(item->>'id','')!~'^[a-f0-9-]{36}$' or (item->>'id')=any(names) then raise exception 'Nieprawidłowe lub powtórzone identyfikatory kart.';end if;names:=array_append(names,item->>'id');
   if coalesce(item->>'image','')<>'' and (length(item->>'image')>2000 or (item->>'image')!~'^https://[^[:space:]]+$') then raise exception 'Obrazek wymaga adresu HTTPS.';end if;
   wrong:=coalesce(item->'wrong','[]');if jsonb_typeof(wrong) is distinct from 'array' then raise exception 'Nieprawidłowe odpowiedzi.';end if;
   if item->>'type'='quiz' and jsonb_array_length(wrong)<1 then raise exception 'Quiz wymaga co najmniej jednej błędnej odpowiedzi.';end if;
   if exists(select 1 from jsonb_array_elements(wrong) w where jsonb_typeof(w)<>'string' or length(trim(w#>>'{}')) not between 1 and 2000) or (select count(distinct lower(trim(v))) from (select value v from jsonb_array_elements_text(wrong) union all select item->>'answer') a)<>jsonb_array_length(wrong)+1 then raise exception 'Odpowiedzi muszą być różne i niepuste.';end if;
  end loop;
  insert into public.toowee_exercise_sets(id,owner_id,title,description,lang,cards,is_public,folder_id,target_lang,question_format,format_review) values(req,who,v_title,v_description,v_lang,cards,v_public,fid,case when p_data?'target_lang' then p_data->>'target_lang' else s.target_lang end,v_format,false)
  on conflict(id) do update set question_format=excluded.question_format,format_review=false,folder_id=excluded.folder_id,target_lang=excluded.target_lang,title=excluded.title,description=excluded.description,lang=excluded.lang,cards=excluded.cards,is_public=excluded.is_public,revision=toowee_exercise_sets.revision+1,updated_at=now() returning * into s;
 else
  select * into s from public.toowee_exercise_sets where id=(p_data->>'id')::uuid for update;
  if not found or(s.owner_id<>who and not s.is_public and not(p_action='get' and exists(select 1 from public.toowee_material_deliveries d join public.toowee_student_profiles p on p.id=d.profile_id where d.kind='exercise' and d.source_id=s.id and d.owner_id=s.owner_id and p.owner_id=s.owner_id and p.student_id=who and not p.blocked))) then raise exception 'Ten zestaw jest prywatny lub nie jest już dostępny.';end if;
 end if;
 if p_action in ('delete','assign') then
 if s.owner_id<>who then raise exception 'Możesz zmieniać tylko własny zestaw.';end if;
 if p_action='delete' then
  if p_data->>'confirmation' is distinct from 'DELETE' or p_data->>'confirm_id' is distinct from s.id::text then raise exception 'Potwierdź usunięcie zestawu.';end if;
  delete from public.toowee_material_deliveries where owner_id=who and kind='exercise' and source_id=s.id;
  delete from public.toowee_exercise_sets where id=s.id and owner_id=who;
  return jsonb_build_object('deleted',true);
 end if;
 if nullif(p_data->>'group_id','') is not null then
  if not exists(select 1 from public.toowee_groups where id=(p_data->>'group_id')::uuid and owner_id=who and (lang is null or lang=s.lang)) then raise exception 'Wybierz własną grupę w języku zestawu.';end if;
  select array_agg(gs.profile_id) into recipient_ids from public.toowee_group_students gs join public.toowee_student_profiles p on p.id=gs.profile_id where gs.group_id=(p_data->>'group_id')::uuid and p.owner_id=who and not p.blocked;
 else
  if jsonb_typeof(p_data->'profile_ids') is distinct from 'array' or jsonb_array_length(p_data->'profile_ids') not between 1 and 100 then raise exception 'Wybierz uczniów.';end if;
  select array_agg(distinct value::uuid) into recipient_ids from jsonb_array_elements_text(p_data->'profile_ids');
 end if;
 if coalesce(array_length(recipient_ids,1),0)=0 then raise exception 'Brak aktywnych uczniów.';end if;
 foreach recipient in array recipient_ids loop
  if not exists(select 1 from public.toowee_student_profiles where id=recipient and owner_id=who and not blocked) then raise exception 'Brak dostępu do ucznia.';end if;
  insert into public.toowee_material_deliveries(owner_id,profile_id,kind,source_id) values(who,recipient,'exercise',s.id) on conflict do nothing;
 end loop;
 return jsonb_build_object('assigned',array_length(recipient_ids,1));
 end if;
 if p_action='copy' then
  req:=(p_data->>'new_id')::uuid;if req is null then raise exception 'Brak identyfikatora kopii.';end if;
  if exists(select 1 from public.toowee_exercise_sets where id=req and owner_id<>who) then raise exception 'Nieprawidłowy identyfikator kopii.';end if;
  insert into public.toowee_exercise_sets(id,owner_id,title,description,lang,cards,is_public,source_id,target_lang,question_format,format_review) values(req,who,left(s.title||' — kopia',200),s.description,s.lang,s.cards,false,s.id,s.target_lang,s.question_format,s.format_review) on conflict(id) do nothing;
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
 return jsonb_build_object('id',s.id,'title',s.title,'description',s.description,'lang',s.lang,'target_lang',s.target_lang,'cards',s.cards,'format',s.question_format,'format_review',s.format_review,'is_public',s.is_public,'mine',s.owner_id=who,'revision',s.revision,'source_id',s.source_id,'folder_id',case when s.owner_id=who then s.folder_id else null end,'author',(select coalesce(nullif(display_name,''),'Nauczyciel') from public.toowee_accounts where id=s.owner_id));
end;$$;
revoke all on function public.toowee_exercise_sets(text,jsonb) from public,anon;
grant execute on function public.toowee_exercise_sets(text,jsonb) to authenticated;
notify pgrst,'reload schema';
-- Shared server-side question snapshots. Correct answers never come from a player's payload.
create or replace function public.toowee_question_snapshot(card jsonb,fmt text) returns jsonb
language plpgsql set search_path=public,pg_temp as $q$
declare opts jsonb; solution text:=coalesce(card->>'answer','');wrong jsonb:=coalesce(card->'wrong','[]');idx integer;
begin
 if fmt not in ('open','quiz','write') or coalesce(btrim(card->>'prompt'),'')='' then raise exception 'Nieprawidłowy format pytania.';end if;
 if fmt<>'open' and btrim(solution)='' then raise exception 'Brak poprawnej odpowiedzi.';end if;
 if fmt='quiz' then
 if jsonb_typeof(wrong)<>'array' or jsonb_array_length(wrong)<1 then raise exception 'Quiz wymaga błędnej odpowiedzi.';end if;
 select jsonb_agg(value order by random()) into opts from (select to_jsonb(solution) value union all select value from jsonb_array_elements(wrong)) a;
 select ordinality::int-1 into idx from jsonb_array_elements_text(opts) with ordinality where value=solution;
 else opts:=jsonb_build_array(solution);idx:=0;end if;
 return jsonb_build_object('prompt',card->>'prompt','reading',card->>'reading','format',fmt,'options',opts,'correct',idx,'solution',solution);
end;$q$;
create or replace function public.toowee_answer_equal(actual text,expected text) returns boolean language sql immutable set search_path=public,pg_temp as $q$
 select coalesce(btrim(expected)<>''
 and lower(regexp_replace(btrim(normalize(actual,NFKC)),'\s+',' ','g'))=lower(regexp_replace(btrim(normalize(expected,NFKC)),'\s+',' ','g')),false)
$q$;
revoke all on function public.toowee_question_snapshot(jsonb,text),public.toowee_answer_equal(text,text) from public,anon,authenticated;
alter table public.sophie_round_answers add column if not exists awaiting_review boolean not null default false;
alter table public.sophie_round_answers add column if not exists response_text text;
alter table public.toowee_collection_quiz add column if not exists awaiting_review boolean not null default false;
alter table public.toowee_dice_players add column if not exists assessment jsonb;
CREATE OR REPLACE FUNCTION public.toowee_sophie(p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 who uuid:=auth.uid();room public.sophie_rooms%rowtype;answer public.sophie_round_answers%rowtype;
 set_row public.toowee_exercise_sets;grade_correct boolean;grade_pending boolean;grade_pid uuid;grade_round integer;
 pool jsonb;questions jsonb:='[]';q jsonb;item jsonb;choices jsonb;correct_index integer;
 victim uuid;victim_name text;victim_shields integer;own_shields integer;amount integer;kind text;credit_row record;
 review_hold timestamptz; freeplay boolean; shared_round integer; personal_done boolean:=false; pace text;
 advance boolean:=false;limit_seconds integer;mode text;
 n integer;requested integer;duration integer;direction text;rid uuid;roomcode text;nick text;
 pid uuid;secret text;secret_hash text;linked_account uuid;credited integer;game_score integer;delta integer;
 host boolean;member boolean;players integer;answered integer;settled integer;can_next boolean;expired boolean;selected integer;
begin
 -- A closed/lost host connection cannot leave abandoned rooms blocking future games.
 update public.sophie_rooms set status='finished',finished_at=coalesce(finished_at,clock_timestamp()) where status<>'finished' and (expires_at<=clock_timestamp() or host_seen_at is null or host_seen_at<clock_timestamp()-interval '2 minutes') and (host_id=who or code=upper(trim(p_data->>'code')));
 if p_action='rooms' then
  if not exists(select 1 from public.toowee_accounts where id=who and role in ('teacher','admin')) then raise exception 'Tylko nauczyciel zarządza pokojami.';end if;
  return jsonb_build_object('custom_count',true,'custom_seconds',true,'play_modes',jsonb_build_array('teacher','free'),'rooms',(select coalesce(jsonb_agg(jsonb_build_object('code',r.code,'lang',r.lang,'status',r.status,'created_at',r.created_at,'players',(select count(*) from public.sophie_participants p where p.room_id=r.id)) order by r.created_at desc),'[]') from public.sophie_rooms r where r.host_id=who and r.status<>'finished' and r.expires_at>clock_timestamp()));
 end if;
 if p_action='create' then
  if not exists(select 1 from public.toowee_accounts where id=who and role in ('teacher','admin')) then raise exception 'Tylko nauczyciel może tworzyć rozgrywki.';end if;
  -- Serialize creates per teacher and allow safe retry of the same request.
  perform 1 from public.toowee_accounts where id=who for update;
  rid:=(p_data->>'request_id')::uuid;
  select * into room from public.sophie_rooms where host_id=who and request_id=rid for update;
  if not found then

   pace:=coalesce(p_data->>'play_mode','teacher');if pace not in ('teacher','free') then raise exception 'Wybierz tryb gry.';end if;
   mode:=coalesce(p_data->>'end_mode',case when coalesce((p_data->>'time_limit')::integer,0)>0 then 'timer' else 'words' end);
   if mode not in ('words','timer') then raise exception 'Wybierz liczbę słówek albo timer.';end if;
   limit_seconds:=case when mode='timer' then (p_data->>'time_limit')::integer else 0 end;
   if mode='timer' and (limit_seconds is null or limit_seconds<60 or limit_seconds>1800) then raise exception 'Timer musi wynosić od 1 do 30 minut.';end if;
   requested:=case when mode='timer' then 1000 else (p_data->>'count')::integer end;duration:=(p_data->>'seconds')::integer;direction:=p_data->>'direction';
   if (mode='words' and (requested is null or requested not between 1 and 1000)) or duration is null or duration not between 1 and 300 or direction is null or direction not in ('to_pl','from_pl') then raise exception 'Nieprawidłowe ustawienia gry.';end if;
   if p_data->>'lang' is null or p_data->>'lang' not in ('English','Japanese','Spanish') then raise exception 'Wybierz język materiałów.';end if;
   if nullif(p_data->>'exercise_set_id','') is not null then
    select * into set_row from public.toowee_exercise_sets where id=(p_data->>'exercise_set_id')::uuid and owner_id=who and lang=p_data->>'lang';
    if not found or set_row.format_review or set_row.question_format is null then raise exception 'Sprawdź własny zestaw przed grą.';end if;
    select jsonb_agg(prepared.generated_question) into questions from (select public.toowee_question_snapshot(c,set_row.question_format) generated_question from jsonb_array_elements(set_row.cards)c order by random() limit requested) prepared;
   else
   if jsonb_typeof(p_data->'ids') is distinct from 'array' or jsonb_array_length(p_data->'ids')>1000 then raise exception 'Wybierz od 4 do 1000 słówek.';end if;
   select coalesce(jsonb_agg(jsonb_build_object('prompt',prompt,'answer',solution)),'[]') into pool from (
    select distinct on (lower(trim(prompt))) prompt,solution from (
     select w.id,case when direction='to_pl' then w.word||case when w.lang='Japanese' and w.reading<>'' then ' ('||w.reading||')' else '' end else w.translation end as prompt,
     case when direction='to_pl' then w.translation else w.word||case when w.lang='Japanese' and w.reading<>'' then ' ('||w.reading||')' else '' end end as solution
     from public.vocabulary_words w where w.owner_id=who and w.lang=p_data->>'lang' and w.id in (select value::uuid from jsonb_array_elements_text(p_data->'ids'))
    ) raw order by lower(trim(prompt)),id
   ) unique_prompts;
   if jsonb_array_length(pool)<4 or (select count(distinct lower(trim(value->>'answer'))) from jsonb_array_elements(pool))<4 then raise exception 'Potrzebujesz co najmniej 4 różnych pytań i odpowiedzi w wybranym zestawie.';end if;
   for item in select value from jsonb_array_elements(pool) order by random() limit requested loop
    -- Build distractors separately so the correct answer is always included.
    select jsonb_agg(label order by random()) into choices from (
     select item->>'answer' as label union all
     (select label from (select distinct on (lower(trim(value->>'answer'))) value->>'answer' as label from jsonb_array_elements(pool) where lower(trim(value->>'answer'))<>lower(trim(item->>'answer')) order by lower(trim(value->>'answer'))) labels order by random() limit 3)
    ) options;
    select ordinality::integer-1 into correct_index from jsonb_array_elements_text(choices) with ordinality where value=item->>'answer';
    questions:=questions||jsonb_build_array(jsonb_build_object('prompt',item->>'prompt','options',choices,'correct',correct_index));
   end loop;
   end if;
   roomcode:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
   insert into public.sophie_rooms(host_id,request_id,code,lang,questions,seconds,time_limit,end_mode,play_mode,host_seen_at) values(who,rid,roomcode,p_data->>'lang',questions,duration,limit_seconds,mode,pace,clock_timestamp()) returning * into room;
  end if;
  -- A retry after upgrading an older server must retain the chosen game clock.
  if room.status='lobby' and (p_data ? 'time_limit' or p_data ? 'end_mode') then
   mode:=coalesce(p_data->>'end_mode',case when coalesce((p_data->>'time_limit')::integer,0)>0 then 'timer' else 'words' end);
   if mode not in ('words','timer') then raise exception 'Nieprawidłowy tryb gry.';end if;
   limit_seconds:=case when mode='timer' then (p_data->>'time_limit')::integer else 0 end;
   if mode='timer' and (limit_seconds is null or limit_seconds<60 or limit_seconds>1800) then raise exception 'Nieprawidłowy czas gry.';end if;
   room.time_limit:=limit_seconds;room.end_mode:=mode;update public.sophie_rooms set time_limit=limit_seconds,end_mode=mode where id=room.id;
  end if;
 else
  roomcode:=upper(trim(p_data->>'code'));
  select * into room from public.sophie_rooms where code=roomcode for update;
  if not found then raise exception 'Nie znaleziono pokoju. Sprawdź kod.';end if;
 end if;
 if room.expires_at<=clock_timestamp() then raise exception 'Pokój wygasł. Nauczyciel może utworzyć nowy.';end if;
 host:=coalesce(room.host_id=who,false);if host then update public.sophie_rooms set host_seen_at=clock_timestamp() where id=room.id;end if;freeplay:=room.play_mode='free';shared_round:=room.round;
 if who is null or p_action='link' then
  secret:=p_data->>'guest_token';
  if secret is null or secret !~ '^[0-9a-f]{64}$' then raise exception 'Dołącz pseudonimem, aby otrzymać dostęp do gry.';end if;
  secret_hash:=encode(sha256(convert_to(secret,'UTF8')),'hex');
 end if;
 if p_action='link' then
  if who is null then raise exception 'Zaloguj się, aby przypisać punkty do konta.';end if;
  select player_id,account_id into pid,linked_account from public.sophie_participants where room_id=room.id and guest_hash=secret_hash for update;
  if pid is null or (linked_account is not null and linked_account<>who) then raise exception 'Nieprawidłowy dostęp do sesji gościa.';end if;
  if exists(select 1 from public.sophie_participants where room_id=room.id and account_id=who and player_id<>pid) then raise exception 'To konto ma już uczestnika w tym pokoju. Wróć do gry na swoim koncie.';end if;
  update public.sophie_participants set account_id=who where room_id=room.id and player_id=pid;
 elsif who is not null and not host then
  select player_id into pid from public.sophie_participants where room_id=room.id and account_id=who;
 elsif not host then
  select player_id into pid from public.sophie_participants where room_id=room.id and guest_hash=secret_hash and account_id is null;
 end if;
 member:=pid is not null;
 if p_action='assess' then
  if not host or room.status<>'question' or jsonb_typeof(p_data->'correct') is distinct from 'boolean' then raise exception 'Tylko prowadzący ocenia odpowiedzi otwarte.';end if;
  select player_id into grade_pid from public.sophie_participants where room_id=room.id and public_id::text=p_data->>'player_id';
  grade_round:=(p_data->>'round')::integer;
  q:=room.questions->((grade_round-1)%jsonb_array_length(room.questions));
  if q->>'format' is distinct from 'open' then raise exception 'To pytanie nie wymaga oceny nauczyciela.';end if;
  select * into answer from public.sophie_round_answers where room_id=room.id and player_id=grade_pid and round=grade_round for update;
  if not found then raise exception 'Uczeń nie zgłosił odpowiedzi.';end if;
  if answer.awaiting_review then
   grade_correct:=(p_data->>'correct')::boolean;
   update public.sophie_round_answers set awaiting_review=false,correct=grade_correct,base=case when grade_correct then 100 else 0 end,review_until=case when not grade_correct then clock_timestamp()+interval '5 seconds' end where room_id=room.id and player_id=grade_pid and round=grade_round;
   update public.sophie_participants set question_deadline=greatest(question_deadline,clock_timestamp()+interval '10 seconds') where room_id=room.id and player_id=grade_pid;
   if room.play_mode<>'free' then update public.sophie_rooms set deadline=greatest(deadline,clock_timestamp()+interval '10 seconds'),auto_at=greatest(auto_at,clock_timestamp()+interval '10 seconds') where id=room.id returning * into room;end if;
  end if;
  p_action:='load';
 end if;
 if p_action='join' and not host then
  if not member then
   if room.status<>'lobby' then raise exception 'Gra już się rozpoczęła. Do nowej gry dołączysz w poczekalni.';end if;
   if (select count(*) from public.sophie_participants where room_id=room.id)>=30 then raise exception 'Pokój ma już 30 uczestników.';end if;
   if who is null and exists(select 1 from public.sophie_participants where room_id=room.id and guest_hash=secret_hash) then raise exception 'Ta sesja gościa jest już przypisana do konta. Zaloguj się, aby wrócić.';end if;
   nick:=trim(p_data->>'nickname');if nick is null or length(nick) not between 1 and 32 then raise exception 'Wpisz pseudonim (1–32 znaki).';end if;
   insert into public.sophie_participants(room_id,account_id,guest_hash,nickname) values(room.id,who,secret_hash,nick) returning player_id into pid;member:=true;
  end if;
 end if;
 if not host and not member then raise exception 'Najpierw dołącz do pokoju kodem.';end if;
 if member then update public.sophie_participants set last_seen=clock_timestamp() where room_id=room.id and player_id=pid;end if;
 select count(*) into players from public.sophie_participants where room_id=room.id;
 if freeplay and member and shared_round>0 then
  select current_round,question_deadline,completed into room.round,room.deadline,personal_done from public.sophie_participants where room_id=room.id and player_id=pid;
  room.auto_at:=room.deadline+interval '10 seconds';
 end if;
 select max(review_until) into review_hold from public.sophie_round_answers where room_id=room.id and round=room.round and not correct and (not freeplay or host or player_id=pid);
 select count(*),count(*) filter(where not awaiting_review and (not correct or (pick is not null and resolved))) into answered,settled from public.sophie_round_answers where room_id=room.id and round=room.round;
 can_next:=not exists(select 1 from public.sophie_round_answers where room_id=room.id and round=room.round and awaiting_review) and (room.status='lobby' and players>0 or room.status='question' and (settled>=players and players>0 or clock_timestamp()>=room.deadline+interval '10 seconds') and (review_hold is null or clock_timestamp()>=review_hold));
 -- Any participant's refresh advances a due round. A teacher click is not required.
 if p_action='close' then
  if not host then raise exception 'Tylko prowadzący zamyka pokój.';end if;
  room.status:='finished';update public.sophie_rooms set status='finished',finished_at=coalesce(finished_at,clock_timestamp()) where id=room.id;p_action:='load';
 end if;
 if p_action in ('next','finish') and not host then raise exception 'Tylko prowadzący steruje rundami.';end if;
 if freeplay and (host and p_action='finish' or room.game_deadline<=clock_timestamp()) then select max(review_until) into review_hold from public.sophie_round_answers where room_id=room.id and not correct;end if;
 if room.status='question' and room.game_deadline is not null and clock_timestamp()>=room.game_deadline then
  if review_hold is null or clock_timestamp()>=review_hold then room.status:='finished';end if;
  update public.sophie_rooms set status=room.status where id=room.id;
  if p_action in ('answer','pick','steal','ready','next') then p_action:='load';end if;
 end if;
 if not freeplay and room.status='question' and not exists(select 1 from public.sophie_round_answers where room_id=room.id and round=room.round and awaiting_review) and p_action in ('load','answer','pick','steal','ready','link') and clock_timestamp()>=coalesce(room.auto_at,room.deadline+interval '10 seconds') and (review_hold is null or clock_timestamp()>=review_hold) then
  advance:=true;
  if p_action in ('answer','pick','steal','ready') then p_action:='load';end if;
 end if;
 if freeplay and personal_done and p_action in ('answer','pick','steal','ready') then p_action:='load';end if;
 -- Only the caller's expired question is turned into a five-second review.
 if freeplay and member and not personal_done and room.status='question' and p_action in ('load','ready') and clock_timestamp()>=room.deadline and not exists(select 1 from public.sophie_round_answers where room_id=room.id and player_id=pid and round=room.round) then
  insert into public.sophie_round_answers(room_id,player_id,round,choice,correct,review_until) values(room.id,pid,room.round,-1,false,clock_timestamp()+interval '5 seconds') on conflict do nothing;
 end if;
 if p_action in ('next','finish') then
  if p_action='finish' then
   if review_hold>clock_timestamp() then raise exception 'Trwa 5-sekundowa pauza na zapamiętanie poprawnej odpowiedzi.';end if;
   room.status:='finished';
  elsif freeplay and room.status<>'lobby' then raise exception 'W swobodnej grze każdy uczeń przechodzi dalej samodzielnie.';
  elsif (p_data->>'round')::integer is distinct from room.round then null;
  elsif room.status='finished' then null;
  elsif not can_next then raise exception 'Poczekaj na odpowiedzi i wybór saszetek albo na koniec czasu + 10 sekund.';
  else advance:=true;end if;
  update public.sophie_rooms set status=room.status where id=room.id;
 elsif p_action='answer' then
  if host then raise exception 'Prowadzący nie odpowiada jako gracz.';end if;
  if room.status<>'question' or (p_data->>'round')::integer is distinct from room.round then raise exception 'Ta runda nie jest już aktywna.';end if;
  select * into answer from public.sophie_round_answers where room_id=room.id and player_id=pid and round=room.round;
  if not found then
   if clock_timestamp()>room.deadline then raise exception 'Czas na odpowiedź minął.';end if;
   q:=room.questions->((room.round-1)%jsonb_array_length(room.questions));
   grade_pending:=q->>'format'='open';grade_pending:=coalesce(grade_pending,false);
   if grade_pending then selected:=-1;grade_correct:=false;
   elsif q->>'format'='write' then
    if length(coalesce(p_data->>'text','')) not between 1 and 2000 then raise exception 'Wpisz odpowiedź (do 2000 znaków).';end if;
    grade_correct:=public.toowee_answer_equal(p_data->>'text',q->>'solution');selected:=case when grade_correct then 0 else -1 end;
   else selected:=(p_data->>'choice')::integer;
    if selected is null or selected<0 or selected>=jsonb_array_length(q->'options') then raise exception 'Wybierz odpowiedź.';end if;
    grade_correct:=selected=(q->>'correct')::integer;
   end if;
   insert into public.sophie_round_answers(room_id,player_id,round,choice,correct,base,bonuses,pack_events,review_until,awaiting_review,response_text) values(room.id,pid,room.round,selected,grade_correct,case when grade_correct then 100 else 0 end,array[20*(1+floor(random()*5)::integer),20*(1+floor(random()*5)::integer),20*(1+floor(random()*5)::integer)],array(select case floor(random()*20)::integer when 0 then 'lose' when 1 then 'lose' when 2 then 'super' when 3 then 'super' when 4 then 'steal' when 5 then 'steal' when 6 then 'steal' when 7 then 'shield' else 'bonus' end from generate_series(1,3)),case when not grade_correct and not grade_pending then clock_timestamp()+interval '5 seconds' else null end,grade_pending,left(p_data->>'text',2000));
  end if;
 elsif p_action='pick' then
  if room.status<>'question' or (p_data->>'round')::integer is distinct from room.round then raise exception 'Ta runda jest już zakończona.';end if;
  select * into answer from public.sophie_round_answers where room_id=room.id and player_id=pid and round=room.round for update;
  if not found or not answer.correct then raise exception 'Saszetkę wybierasz po poprawnej odpowiedzi.';end if;
  selected:=(p_data->>'pick')::integer;
  if selected is null or selected not between 0 and 2 then raise exception 'Wybierz jedną z trzech saszetek.';end if;
  if answer.pick is null then
   kind:=coalesce(answer.pack_events[selected+1],'bonus');amount:=0;
   update public.sophie_round_answers set pick=selected,event=kind,bonus=0,resolved=true where room_id=room.id and player_id=pid and round=room.round;
   if kind='super' then
    update public.sophie_round_answers set bonus=200,effect_amount=200,effect_message='Super karma! Zyskujesz dodatkowe 200 karmy!' where room_id=room.id and player_id=pid and round=room.round;
   elsif kind='lose' then
    amount:=floor(public.sophie_game_score(room.id,pid)*0.10)::integer;
    update public.sophie_participants set adjustment=adjustment-amount,notice='Psotna saszetka: tracisz 10% karmy (−'||amount||').' where room_id=room.id and player_id=pid;
    update public.sophie_round_answers set effect_amount=-amount,effect_message='Psotna saszetka! Tracisz 10% swojej karmy: −'||amount||'.' where room_id=room.id and player_id=pid and round=room.round;
   elsif kind='shield' then
    select shields into own_shields from public.sophie_participants where room_id=room.id and player_id=pid;
    update public.sophie_participants set shields=least(3,shields+1),notice=case when own_shields>=3 then 'Masz już 3 tarcze — zapas jest pełny.' else 'Zdobywasz tarczę Sophie. Tarcze są ukryte przed innymi graczami.' end where room_id=room.id and player_id=pid;
    update public.sophie_round_answers set effect_message=case when own_shields>=3 then 'Masz już komplet 3 tarcz. Kolejna tarcza nie jest dodawana.' else 'Tarcza Sophie! Masz '||(own_shields+1)||'/3 tarcz. Każda blokuje jedną kradzież.' end where room_id=room.id and player_id=pid and round=room.round;
   elsif kind='steal' and players>1 then
    update public.sophie_round_answers set resolved=false,effect_message='Kocia psota! Wybierz gracza i ukradnij 20% jego karmy.' where room_id=room.id and player_id=pid and round=room.round;
   else
    amount:=case when kind='steal' then 100 else answer.bonuses[selected+1] end;
    update public.sophie_round_answers set event='bonus',bonus=amount,effect_amount=amount,effect_message=case when kind='steal' then 'Sophie dokłada 100 karmy — nie ma tu drugiego gracza do okradzenia.' else 'Smaczna saszetka! +'||amount||' karmy.' end where room_id=room.id and player_id=pid and round=room.round;
   end if;
  end if;
 elsif p_action='steal' then
  if room.status<>'question' or (p_data->>'round')::integer is distinct from room.round then raise exception 'Ta runda jest już zakończona.';end if;
  select * into answer from public.sophie_round_answers where room_id=room.id and player_id=pid and round=room.round for update;
  if not found or answer.event<>'steal' or answer.pick is null then raise exception 'Nie masz kradzieży w tej rundzie.';end if;
  if not answer.resolved then
   select p.player_id,p.nickname,p.shields into victim,victim_name,victim_shields from public.sophie_participants p where p.room_id=room.id and p.public_id=(p_data->>'target')::uuid and p.player_id<>pid for update;
   if victim is null then raise exception 'Wybierz innego gracza z tego pokoju.';end if;
   if victim_shields>0 then
    amount:=0;update public.sophie_participants set shields=shields-1,notice='Twoja tarcza Sophie zablokowała kradzież! Zostało tarcz: '||(shields-1)||'.' where room_id=room.id and player_id=victim;
   else
    amount:=floor(public.sophie_game_score(room.id,victim)*0.20)::integer;
    update public.sophie_participants set adjustment=adjustment-amount,notice='Kocia psota! Ktoś ukradł 20% Twojej karmy: −'||amount||'.' where room_id=room.id and player_id=victim;
    update public.sophie_participants set adjustment=adjustment+amount where room_id=room.id and player_id=pid;
   end if;
   update public.sophie_round_answers set resolved=true,effect_amount=amount,effect_message=case when victim_shields>0 then 'Nic nie ukradłeś — gracz '||victim_name||' miał tarczę. Kradzież zablokowana.' else 'Kradniesz 20% karmy gracza '||victim_name||': +'||amount||'!' end where room_id=room.id and player_id=pid and round=room.round;
  end if;
 elsif p_action='ready' then
  if host or room.status<>'question' or (p_data->>'round')::integer is distinct from room.round then raise exception 'Poczekaj na zakończenie swojej odpowiedzi.';end if;
  select * into answer from public.sophie_round_answers where room_id=room.id and player_id=pid and round=room.round;
  if found and answer.awaiting_review then raise exception 'Poczekaj na ocenę nauczyciela.';end if;
  if found and not answer.correct and answer.review_until>clock_timestamp() then raise exception 'Zapamiętaj poprawną odpowiedź — pauza trwa 5 sekund.';end if;
  if not found and clock_timestamp()>=room.deadline then
   insert into public.sophie_round_answers(room_id,player_id,round,choice,correct,review_until) values(room.id,pid,room.round,-1,false,clock_timestamp()+interval '5 seconds') on conflict do nothing;
  elsif not found or answer.correct and (answer.pick is null or not answer.resolved) then raise exception 'Najpierw odpowiedz i rozlicz saszetkę.';end if;
  select count(*) filter(where not awaiting_review and (not correct or (pick is not null and resolved))) into settled from public.sophie_round_answers where room_id=room.id and round=room.round;
  select max(review_until) into review_hold from public.sophie_round_answers where room_id=room.id and round=room.round and not correct;
  if freeplay then
   if answer.player_id is not null and (not answer.correct or answer.pick is not null and answer.resolved) and (answer.review_until is null or answer.review_until<=clock_timestamp()) then advance:=true;end if;
  elsif settled>=players and (review_hold is null or clock_timestamp()>=review_hold) then advance:=true;end if;

 elsif p_action not in ('create','join','load','link') then raise exception 'Nieznana operacja gry.';end if;
 if advance and freeplay and member and room.status='question' then
  if room.end_mode='words' and room.round>=jsonb_array_length(room.questions) then
   personal_done:=true;update public.sophie_participants set completed=true where room_id=room.id and player_id=pid;
  else
   room.round:=room.round+1;room.deadline:=least(clock_timestamp()+make_interval(secs=>room.seconds),room.game_deadline);room.auto_at:=room.deadline+interval '10 seconds';
   update public.sophie_participants set current_round=room.round,question_deadline=room.deadline where room_id=room.id and player_id=pid;
  end if;
  advance:=false;
 end if;
 if advance then
  if room.end_mode='words' and room.round>=jsonb_array_length(room.questions) then room.status:='finished';
  else
   if room.round=0 and room.time_limit>0 then room.game_deadline:=clock_timestamp()+make_interval(secs=>room.time_limit);end if;
   room.round:=room.round+1;room.status:='question';room.deadline:=least(clock_timestamp()+make_interval(secs=>room.seconds),room.game_deadline);
   room.auto_at:=least(room.deadline+interval '10 seconds',room.game_deadline);
  end if;
  update public.sophie_rooms set status=room.status,round=room.round,deadline=room.deadline,auto_at=room.auto_at,game_deadline=room.game_deadline where id=room.id;
  if freeplay and shared_round=0 then update public.sophie_participants set current_round=1,question_deadline=room.deadline where room_id=room.id;end if;
 end if;
 if freeplay and room.status='question' and players>0 and not exists(select 1 from public.sophie_participants where room_id=room.id and not completed) then
  room.status:='finished';update public.sophie_rooms set status='finished' where id=room.id;
 end if;
 select * into answer from public.sophie_round_answers where room_id=room.id and player_id=pid and round=room.round;
 select max(review_until) into review_hold from public.sophie_round_answers where room_id=room.id and round=room.round and not correct and (not freeplay or host or player_id=pid);
 select count(*),count(*) filter(where not awaiting_review and (not correct or (pick is not null and resolved))) into answered,settled from public.sophie_round_answers where room_id=room.id and round=room.round;
 can_next:=not exists(select 1 from public.sophie_round_answers where room_id=room.id and round=room.round and awaiting_review) and (room.status='lobby' and players>0 or room.status='question' and (settled>=players and players>0 or clock_timestamp()>=room.deadline+interval '10 seconds') and (review_hold is null or clock_timestamp()>=review_hold));
 if not freeplay and room.status='question' and players>0 and settled>=players then
  room.auto_at:=least(coalesce(room.auto_at,room.deadline+interval '10 seconds'),clock_timestamp()+interval '1 second',room.game_deadline);
  update public.sophie_rooms set auto_at=room.auto_at where id=room.id;
 end if;
 if not freeplay and room.status='question' and review_hold>clock_timestamp() then
  room.auto_at:=greatest(coalesce(room.auto_at,room.deadline+interval '10 seconds'),review_hold);
  update public.sophie_rooms set auto_at=room.auto_at where id=room.id;
 end if;
 if freeplay and host and room.status<>'lobby' then can_next:=false;end if;
 q:=case when room.round>0 then room.questions->((room.round-1)%jsonb_array_length(room.questions)) else null end;
 -- Synchronize both gains and losses, including a theft victim, exactly once.
 for credit_row in select p.player_id,p.account_id,p.credited from public.sophie_participants p where p.room_id=room.id and p.account_id is not null order by p.account_id for update loop
  game_score:=public.sophie_game_score(room.id,credit_row.player_id);delta:=game_score-credit_row.credited;
  if delta<>0 then
   insert into public.sophie_account_points(owner_id,points) values(credit_row.account_id,greatest(delta,0)) on conflict(owner_id) do update set points=greatest(0,public.sophie_account_points.points+delta);
   update public.sophie_participants set credited=game_score where room_id=room.id and player_id=credit_row.player_id;
  end if;
 end loop;

 if room.status='finished' then update public.sophie_rooms set finished_at=coalesce(finished_at,clock_timestamp()) where id=room.id;end if;
 return jsonb_build_object('play_mode',room.play_mode,'personal_done',personal_done,'room_status',room.status,'finished_players',(select count(*) from public.sophie_participants where room_id=room.id and completed),'shield_limit',3,'shields',(select shields from public.sophie_participants where room_id=room.id and player_id=pid),'wrong_delay',5,'review_hold_until',review_hold,'surprises',true,'notice',(select notice from public.sophie_participants where room_id=room.id and player_id=pid),'automatic',true,'auto_at',room.auto_at,'time_limit',room.time_limit,'game_deadline',room.game_deadline,'code',room.code,'host',host,'guest',who is null,'personal_points',case when who is not null and member then coalesce((select points from public.sophie_account_points where owner_id=who),0) else null end,'status',case when personal_done then 'finished' else room.status end,'round',room.round,'end_mode',room.end_mode,'bank_size',jsonb_array_length(room.questions),'total',case when room.end_mode='words' then jsonb_array_length(room.questions) else null end,'lang',room.lang,'deadline',room.deadline,'server_now',clock_timestamp(),'players',players,'answered',answered,'settled',settled,'can_next',can_next,
  'pending_reviews',case when host then (select coalesce(jsonb_agg(jsonb_build_object('player_id',p.public_id,'name',p.nickname,'round',a.round,'prompt',room.questions->((a.round-1)%jsonb_array_length(room.questions))->>'prompt','solution',room.questions->((a.round-1)%jsonb_array_length(room.questions))->>'solution')),'[]') from public.sophie_round_answers a join public.sophie_participants p on p.room_id=a.room_id and p.player_id=a.player_id where a.room_id=room.id and a.awaiting_review) else '[]'::jsonb end,
  'question',case when host or personal_done or q is null then null else (q-'correct'-'solution')||case when q->>'format' in ('open','write') then jsonb_build_object('options','[]'::jsonb) else '{}'::jsonb end end,
  'solution',case when host then null when answer.player_id is not null or room.status='finished' or room.deadline<=clock_timestamp() then coalesce(q->'solution',q->'options'->((q->>'correct')::integer)) else null end,
  'answer',case when answer.player_id is null then null else jsonb_build_object('pending',answer.awaiting_review,'choice',answer.choice,'correct',answer.correct,'review_until',answer.review_until,'base',answer.base,'pick',answer.pick,'bonus',answer.bonus,'effect',jsonb_build_object('kind',answer.event,'resolved',answer.resolved,'amount',answer.effect_amount,'message',answer.effect_message)) end,
  'ranking',(select coalesce(jsonb_agg(jsonb_build_object('id',public_id,'name',nickname,'score',score,'correct',correct,'answered',answered_count,'me',player_id=pid) order by score desc,joined_at),'[]') from (
   select p.player_id,p.public_id,p.nickname,p.joined_at,public.sophie_game_score(room.id,p.player_id) as score,(select count(*) from public.sophie_round_answers a where a.room_id=p.room_id and a.player_id=p.player_id and a.correct) as correct,(select count(*) from public.sophie_round_answers a where a.room_id=p.room_id and a.player_id=p.player_id) as answered_count from public.sophie_participants p where p.room_id=room.id

  ) standings));
end $function$
;
CREATE OR REPLACE FUNCTION public.toowee_collections(p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- COLLECTIONS_LIVE_V4
 declare set_row public.toowee_exercise_sets;question_public jsonb;grade_pid uuid;grade_value boolean;
 who uuid:=auth.uid();r public.toowee_collection_rooms%rowtype;pid uuid;target uuid;q public.toowee_collection_quiz%rowtype;x record;
 token text:=p_data->>'guest_token';s jsonb;p jsonb;players jsonb;wordpool jsonb;req uuid;roomcode text;idx int;cycle_number int;n int;
 toy int;cell int;source_cell int;cost int;basket int;amount int;free_slots int;available int;stash int[];board jsonb;result jsonb;
 mine jsonb;answer_rows jsonb;stats jsonb;resume text;paused_at timestamptz;pause_duration interval;extra int;created bool:=false;
begin
 if p_action='history' then return public.toowee_collections_legacy(p_action,p_data);end if;
 if p_action='create' then
 if coalesce((p_data->>'protocol')::int,0)<>4 then return public.toowee_collections_legacy(p_action,p_data);end if;
 if who is null or not exists(select 1 from public.toowee_accounts where id=who and role in ('teacher','admin')) then raise exception 'Wybierz konto nauczyciela.';end if;
 req:=(p_data->>'request_id')::uuid;if req is null then raise exception 'Brak identyfikatora gry.';end if;
 select * into r from public.toowee_collection_rooms where host_id=who and request_id=req;
 if not found then
 if nullif(p_data->>'exercise_set_id','') is not null then
 select * into set_row from public.toowee_exercise_sets where id=(p_data->>'exercise_set_id')::uuid and owner_id=who and lang=p_data->>'lang';
 if not found or set_row.format_review or set_row.question_format is null then raise exception 'Sprawdź własny zestaw przed grą.';end if;
 select jsonb_agg(jsonb_build_object('word',c->>'prompt','translation',coalesce(c->>'answer',''),'reading',coalesce(c->>'reading',''),'quiz_options',coalesce(c->'wrong','[]'),'question_format',set_row.question_format)) into wordpool from jsonb_array_elements(set_row.cards)c;
 else
 if coalesce(jsonb_array_length(p_data->'ids'),0)>1000 then raise exception 'Maksymalnie 1000 słówek.';end if;
 select jsonb_agg(jsonb_build_object('word',w.word,'reading',w.reading,'translation',w.translation)) into wordpool
 from public.vocabulary_words w where w.owner_id=who and w.lang=p_data->>'lang' and public.toowee_word_access(w.id)
 and length(trim(w.word))>0 and length(trim(w.translation))>0 and w.id::text in(select jsonb_array_elements_text(p_data->'ids'));
 
  -- toowee-language-direction-v1
  if p_data->>'direction'='toTarget' then
   select jsonb_agg(jsonb_build_object('word',tw_direction_item.value->>'translation','reading','','translation',tw_direction_item.value->>'word')) into wordpool from jsonb_array_elements(wordpool) as tw_direction_item(value);
  end if;
  if coalesce(jsonb_array_length(wordpool),0)<2 or (select count(distinct value->>'translation') from jsonb_array_elements(wordpool))<2 then raise exception 'Wybierz co najmniej dwa różne słówka i tłumaczenia.';end if;
 end if;
 if coalesce(p_data->>'end_mode','rounds') not in ('rounds','timer') or coalesce((p_data->>'time_limit')::int,300) not between 60 and 3600 then raise exception 'Wybierz rundy albo czas od 1 do 60 minut.';end if;
 roomcode:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
 insert into public.toowee_collection_rooms(host_id,request_id,code,lang,words,rounds,questions_per_turn,seconds,placement_seconds,end_mode,time_limit,state)
 values(who,req,roomcode,p_data->>'lang',wordpool,coalesce((p_data->>'rounds')::int,6),coalesce((p_data->>'questions_per_turn')::int,3),coalesce((p_data->>'seconds')::int,30),coalesce((p_data->>'placement_seconds')::int,60),coalesce(p_data->>'end_mode','rounds'),coalesce((p_data->>'time_limit')::int,300),'{"layout":"live-v4"}') on conflict(host_id,request_id) do nothing;
 select * into r from public.toowee_collection_rooms where host_id=who and request_id=req;
 end if;
 else
 select * into r from public.toowee_collection_rooms where code=upper(trim(p_data->>'code')) for update;
 if not found then raise exception 'Nie znaleziono pokoju.';end if;
 end if;
 if r.state->>'layout' is distinct from 'live-v4' then return public.toowee_collections_legacy(p_action,p_data);end if;
 -- Serialize gameplay actions, including create retry responses.
 select * into r from public.toowee_collection_rooms where id=r.id for update;
 if who is not null then select id into pid from public.toowee_collection_players where room_id=r.id and account_id=who;
 elsif token ~ '^[a-f0-9]{64}$' then select id into pid from public.toowee_collection_players where room_id=r.id and guest_hash=md5(token);end if;
 if p_action='join' and pid is null then
 if r.host_id=who then raise exception 'Prowadzący obserwuje grę. Do testów dołącz w oknie prywatnym.';end if;
 if r.status<>'lobby' then raise exception 'Gra już się rozpoczęła.';end if;
 if (select count(*) from public.toowee_collection_players where room_id=r.id)>=12 then raise exception 'Pokój jest pełny.';end if;
 if who is null and (token is null or token !~ '^[a-f0-9]{64}$') then raise exception 'Nieprawidłowy klucz gościa.';end if;
 insert into public.toowee_collection_players(room_id,account_id,guest_hash,nickname) values(r.id,who,case when who is null then md5(token) end,trim(p_data->>'nickname')) returning id into pid;
 end if;
 if r.host_id is distinct from who and pid is null then raise exception 'Dołącz do pokoju.';end if;
 if p_action='details' then
 if r.host_id is distinct from who and r.status<>'finished' then raise exception 'Statystyki są dostępne po zakończeniu gry.';end if;
 select coalesce(jsonb_agg(to_jsonb(a) order by a.turn_no,a.q_no),'[]') into answer_rows from public.toowee_collection_answers a where a.room_id=r.id and (r.host_id=who or a.player_id=pid);
 return jsonb_build_object('code',r.code,'state',r.state,'answers',answer_rows);
 end if;
 if p_action='start' then
 if r.host_id is distinct from who then raise exception 'Tylko prowadzący rozpoczyna grę.';end if;
 if r.status='lobby' then
 select jsonb_agg(jsonb_build_object('id',id,'name',nickname,'score',0,'completed',0,'stash',array[0,0,0,0,0],'board',to_jsonb(array_fill(-1,array[25])),'cards',jsonb_build_array(public.toowee_collection_card(),public.toowee_collection_card(),public.toowee_collection_card())) order by joined_at,id) into players from public.toowee_collection_players where room_id=r.id;
 if players is null then raise exception 'Poczekaj na gracza.';end if;
 update public.toowee_collection_rooms set state=jsonb_build_object('layout','live-v4','players',players,'cycle',1,'draw_index',0,'finish_after_cycle',false,'cycle_complete',false),game_deadline=case when end_mode='timer' then clock_timestamp()+make_interval(secs=>time_limit) end where id=r.id;
 perform public.toowee_collection_live_cycle(r.id,1);
 end if;
 end if;
 select * into r from public.toowee_collection_rooms where id=r.id;
 -- Stop the clock and every action while the teacher makes the fair-finish decision.
 if r.status='playing' and r.phase<>'time_decision' and r.game_deadline is not null and clock_timestamp()>=r.game_deadline then
 r.state:=r.state||jsonb_build_object('resume_phase',r.phase,'paused_at',clock_timestamp());
 update public.toowee_collection_rooms set state=r.state,phase='time_decision',revision=revision+1 where id=r.id;
 select * into r from public.toowee_collection_rooms where id=r.id;
 end if;
 if p_action in ('finish','finish_cycle','add_time','add_round') then
 if r.host_id is distinct from who then raise exception 'Tylko prowadzący zmienia koniec gry.';end if;
 if r.status='lobby' and p_action<>'finish' then raise exception 'Najpierw rozpocznij grę.';end if;
 if p_action='finish' then
 if r.status<>'finished' then
 r.state:=r.state||jsonb_build_object('resume_phase',case when r.phase='time_decision' then r.state->>'resume_phase' else r.phase end,'paused_at',coalesce(r.state->>'paused_at',clock_timestamp()::text));
 update public.toowee_collection_rooms set state=r.state,status='finished',phase='finished',finished_at=clock_timestamp(),revision=revision+1 where id=r.id;
 end if;
 else
 if p_action='finish_cycle' and r.phase<>'time_decision' then raise exception 'Ta decyzja jest dostępna po upływie czasu.';end if;
 resume:=coalesce(r.state->>'resume_phase','questions');paused_at:=coalesce((r.state->>'paused_at')::timestamptz,clock_timestamp());pause_duration:=clock_timestamp()-paused_at;
 if r.phase in ('time_decision','finished') then
 update public.toowee_collection_quiz set question_started_at=question_started_at+pause_duration,deadline=deadline+pause_duration,review_until=review_until+pause_duration where room_id=r.id and cycle=(r.state->>'cycle')::int;
 end if;
 s:=r.state||jsonb_build_object('finish_after_cycle',p_action='finish_cycle');s:=s-'paused_at'-'resume_phase';
 if p_action='add_time' then
 extra:=coalesce((p_data->>'seconds')::int,(p_data->>'minutes')::int*60,120);if extra not between 1 and 1800 then raise exception 'Dodaj od 1 sekundy do 30 minut.';end if;
 update public.toowee_collection_rooms set state=s,status='playing',phase=resume,end_mode='timer',game_deadline=greatest(clock_timestamp(),coalesce(game_deadline,clock_timestamp()))+make_interval(secs=>extra),finished_at=null,deadline=case when r.deadline is not null then r.deadline+pause_duration end,revision=revision+1 where id=r.id;
 elsif p_action='add_round' then
 extra:=coalesce((p_data->>'rounds')::int,1);if extra not between 1 and 10 then raise exception 'Dodaj od 1 do 10 rund.';end if;
 update public.toowee_collection_rooms set state=s,status='playing',phase=resume,end_mode='rounds',rounds=least(300,(r.state->>'cycle')::int+extra),game_deadline=null,finished_at=null,deadline=case when r.deadline is not null then r.deadline+pause_duration end,revision=revision+1 where id=r.id;
 else
 update public.toowee_collection_rooms set state=s,phase=resume,game_deadline=null,deadline=case when r.deadline is not null then r.deadline+pause_duration end,revision=revision+1 where id=r.id;
 end if;
 if coalesce((r.state->>'cycle_complete')::bool,false) then
 update public.toowee_collection_rooms set state=jsonb_set(state,'{cycle_complete}','false') where id=r.id;
 perform public.toowee_collection_live_cycle(r.id,(r.state->>'cycle')::int+1);
 end if;
 end if;
 select * into r from public.toowee_collection_rooms where id=r.id;
 end if;
 if r.status='playing' and r.phase='questions' then
 -- Timeouts are per participant, not shared across the class.
 for x in select player_id from public.toowee_collection_quiz where room_id=r.id and cycle=(r.state->>'cycle')::int and not done and not review and deadline is not null and deadline<=clock_timestamp() loop
 perform public.toowee_collection_quiz_answer(r.id,x.player_id,null);
 end loop;
 if p_action='assess' then
 if r.host_id is distinct from who or jsonb_typeof(p_data->'correct') is distinct from 'boolean' then raise exception 'Tylko prowadzący ocenia odpowiedzi.';end if;
 grade_pid:=(p_data->>'player_id')::uuid;
 select * into q from public.toowee_collection_quiz where room_id=r.id and player_id=grade_pid and cycle=(r.state->>'cycle')::int for update;
 if not found or q.question->>'id' is distinct from p_data->>'question_id' or q.cycle is distinct from (p_data->>'cycle')::int or q.question->>'format' is distinct from 'open' then raise exception 'To pytanie nie jest już aktualne.';end if;
 if q.awaiting_review then
 update public.toowee_collection_quiz set awaiting_review=false where room_id=r.id and player_id=grade_pid and cycle=q.cycle;
 perform public.toowee_collection_quiz_answer(r.id,grade_pid,case when (p_data->>'correct')::boolean then 0 else null end);
 end if;p_action:='load';
 end if;
 select * into q from public.toowee_collection_quiz where room_id=r.id and player_id=pid and cycle=(r.state->>'cycle')::int;
 if p_action='answer' then
 if not found or q.done or q.review or (p_data->>'cycle')::int is distinct from q.cycle or p_data->>'question_id' is distinct from q.question->>'id' then raise exception 'To pytanie jest już rozliczone. Poczekaj na aktualny widok.';end if;
 if q.awaiting_review then null;
 elsif q.question->>'format'='open' then
 update public.toowee_collection_quiz set awaiting_review=true,deadline=null where room_id=r.id and player_id=pid and cycle=q.cycle;
 elsif q.question->>'format'='write' then
 if length(coalesce(p_data->>'text','')) not between 1 and 2000 then raise exception 'Wpisz odpowiedź (do 2000 znaków).';end if;
 grade_value:=public.toowee_answer_equal(p_data->>'text',q.question->>'solution');
 perform public.toowee_collection_quiz_answer(r.id,pid,case when grade_value then 0 else null end);
 update public.toowee_collection_answers set answer=p_data->>'text' where room_id=r.id and player_id=pid and turn_no=q.cycle and q_no=q.q_no;
 else
 if (p_data->>'choice')::int is null or (p_data->>'choice')::int<0 or (p_data->>'choice')::int>=jsonb_array_length(q.question->'options') then raise exception 'Wybierz odpowiedź.';end if;
 perform public.toowee_collection_quiz_answer(r.id,pid,(p_data->>'choice')::int);
 end if;
 elsif p_action='continue' then
 if not found or not q.review or p_data->>'question_id' is distinct from q.question->>'id' then raise exception 'Pytanie się zmieniło.';end if;
 if clock_timestamp()<q.review_until then raise exception 'Spójrz na poprawną odpowiedź — odczekaj 3 sekundy.';end if;
 perform public.toowee_collection_quiz_step(r.id,pid);
 elsif p_action='skip' then
 if r.host_id is distinct from who then raise exception 'Tylko prowadzący pomija nieobecnych.';end if;
 for x in select player_id from public.toowee_collection_quiz where room_id=r.id and cycle=(r.state->>'cycle')::int and not done loop
 loop
 select * into q from public.toowee_collection_quiz where room_id=r.id and player_id=x.player_id and cycle=(r.state->>'cycle')::int;
 exit when q.done;
 if q.review then perform public.toowee_collection_quiz_step(r.id,x.player_id);else perform public.toowee_collection_quiz_answer(r.id,x.player_id,null);end if;
 end loop;
 end loop;
 end if;
 if not exists(select 1 from public.toowee_collection_quiz where room_id=r.id and cycle=(r.state->>'cycle')::int and (not done or review)) then
 select jsonb_agg(to_jsonb(qz.player_id::text) order by qz.correct_count desc,qz.elapsed_ms asc,pz.ord) into result
 from jsonb_array_elements(r.state->'players') with ordinality pz(value,ord)
 join public.toowee_collection_quiz qz on qz.player_id=(pz.value->>'id')::uuid and qz.room_id=r.id and qz.cycle=(r.state->>'cycle')::int;
 update public.toowee_collection_rooms set state=jsonb_set(state,'{turn_order}',result),phase='draw',deadline=null,revision=revision+1 where id=r.id;
 end if;
 elsif r.status='playing' and r.phase in ('draw','place') then
 target:=coalesce(r.state->'turn_order'->>((r.state->>'draw_index')::int),r.state->'players'->((r.state->>'draw_index')::int)->>'id')::uuid;
 select ord-1,value into idx,p from jsonb_array_elements(r.state->'players') with ordinality z(value,ord) where value->>'id'=target::text;
 select * into q from public.toowee_collection_quiz where room_id=r.id and player_id=target and cycle=(r.state->>'cycle')::int;
 if r.phase='place' and r.deadline is not null and clock_timestamp()>=r.deadline and p->'pending_match' is null then
 perform public.toowee_collection_live_next(r.id);
 elsif p_action='skip' then
 if r.host_id is distinct from who then raise exception 'Tylko prowadzący pomija turę.';end if;
 if (p_data->>'revision')::int is distinct from r.revision then raise exception 'Tura się zmieniła.';end if;
 perform public.toowee_collection_live_next(r.id);
 elsif p_action in ('draw','put','move','remove','choose_match','end_turn') then
 if pid is distinct from target or (p_data->>'revision')::int is distinct from r.revision then raise exception 'To nie Twoja kolej lub plansza się zmieniła.';end if;
 select array_agg(value::int order by ord) into stash from jsonb_array_elements_text(p->'stash') with ordinality x(value,ord);free_slots:=greatest(0,5-(select sum(t) from unnest(stash) t));
 if p->'pending_match' is not null and p_action<>'choose_match' then raise exception 'Najpierw wybierz, które zabawki zdjąć z planszy.';end if;
 if p_action='choose_match' then
 if p->'pending_match' is null then raise exception 'Nie ma układu do wybrania.';end if;
 if p_data->>'option' is null then raise exception 'Wybierz podświetlony układ.';end if;
 p:=public.toowee_collection_live_resolve(p,(p_data->>'option')::int);
 update public.toowee_collection_rooms set state=public.toowee_collection_balance(jsonb_set(state,array['players',idx::text],p)),deadline=case when placement_seconds>0 then clock_timestamp()+make_interval(secs=>placement_seconds) end,revision=revision+1 where id=r.id;
 elsif p_action='draw' then
 if r.phase<>'draw' or q.correct_count=0 then raise exception 'Nie możesz już dobierać zabawek w tej turze.';end if;
 if free_slots=0 then raise exception 'Nie masz miejsca w schowku. Zakończ turę albo połóż zabawkę ze schowka — po położeniu nie można już dobierać.';end if;
 toy:=(p_data->>'toy')::int;basket:=(p_data->>'basket')::int;
 if toy is null or basket is null or toy not between 0 and 4 or basket not between 0 and 4 then raise exception 'Wybierz koszyk i zabawkę.';end if;
 available:=(r.state->'baskets'->basket->>toy)::int;if available<=0 then raise exception 'Nie ma tych zabawek.';end if;
 amount:=least(available,free_slots);stash[toy+1]:=stash[toy+1]+amount;
 s:=jsonb_set(r.state,array['baskets',basket::text,toy::text],to_jsonb(available-amount));
 if not exists(select 1 from jsonb_array_elements_text(s->'baskets'->basket) piece(value) where piece.value::int>0) then s:=jsonb_set(s,array['baskets',basket::text],public.toowee_collection_supply(s,basket));end if;
 p:=jsonb_set(p,'{stash}',to_jsonb(stash))||jsonb_build_object('fresh_toy',toy,'fresh_remaining',amount,'stash_order',jsonb_build_array(toy)||coalesce((select jsonb_agg(value) from jsonb_array_elements(coalesce(p->'stash_order','[0,1,2,3,4]')) where value::int<>toy),'[]'));s:=jsonb_set(s,array['players',idx::text],p);s:=public.toowee_collection_balance(s);
 update public.toowee_collection_rooms set state=s,phase='place',deadline=case when placement_seconds>0 then clock_timestamp()+make_interval(secs=>placement_seconds) end,revision=revision+1 where id=r.id;
 elsif p_action='end_turn' then
 if r.phase='draw' and free_slots>0 and q.correct_count>0 then raise exception 'Najpierw dobierz zabawki albo połóż zabawkę ze schowka.';end if;
 perform public.toowee_collection_live_next(r.id);
 else
 board:=p->'board';cell:=(p_data->>'cell')::int;
 if cell is null or cell not between 0 and 24 then raise exception 'Wybierz pole planszy.';end if;
 if p_action='put' then
 toy:=(p_data->>'toy')::int;
 if coalesce((p->>'fresh_remaining')::int,0)>0 and toy is distinct from (p->>'fresh_toy')::int then raise exception 'Najpierw połóż nowe zabawki z koszyka.';end if;
 if toy is null or toy not between 0 and 4 or stash[toy+1]<=0 or (board->>cell)::int<>-1 then raise exception 'Wybierz swoją zabawkę i puste pole.';end if;
 stash[toy+1]:=stash[toy+1]-1;p:=p||jsonb_build_object('fresh_remaining',greatest(0,coalesce((p->>'fresh_remaining')::int,0)-1));p:=jsonb_set(p,'{stash}',to_jsonb(stash));board:=jsonb_set(board,array[cell::text],to_jsonb(toy));
 else
 cost:=case when p_action='move' then 2 else 1 end;
 if (p->>'score')::int<cost then raise exception 'Za mało punktów: potrzeba % pkt.',cost;end if;
 if p_action='move' then
 source_cell:=(p_data->>'from')::int;
 if source_cell is null or source_cell not between 0 and 24 or source_cell=cell or (board->>source_cell)::int not between 0 and 4 or (board->>cell)::int<>-1 then raise exception 'Wybierz zabawkę i inne puste pole.';end if;
 toy:=(board->>source_cell)::int;board:=jsonb_set(jsonb_set(board,array[source_cell::text],'-1'),array[cell::text],to_jsonb(toy));
 else if (board->>cell)::int not between 0 and 4 then raise exception 'To pole jest puste.';end if;board:=jsonb_set(board,array[cell::text],'-1');end if;
 p:=jsonb_set(p,'{score}',to_jsonb((p->>'score')::int-cost));
 end if;
 p:=public.toowee_collection_live_resolve(jsonb_set(p,'{board}',board));s:=public.toowee_collection_balance(jsonb_set(r.state,array['players',idx::text],p));
 update public.toowee_collection_rooms set state=s,phase='place',deadline=case when r.phase='draw' and placement_seconds>0 then clock_timestamp()+make_interval(secs=>placement_seconds) else deadline end,revision=revision+1 where id=r.id;
 end if;
 end if;
 end if;
 select * into r from public.toowee_collection_rooms where id=r.id;
 select * into q from public.toowee_collection_quiz where room_id=r.id and player_id=pid and cycle=coalesce((r.state->>'cycle')::int,1);
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',nickname) order by joined_at,id),'[]') into players from public.toowee_collection_players where room_id=r.id;
 select coalesce(jsonb_agg(to_jsonb(a) order by a.turn_no,a.q_no),'[]') into answer_rows from public.toowee_collection_answers a where a.room_id=r.id and (r.host_id=who or a.player_id=pid);
 select coalesce(jsonb_agg(jsonb_build_object('id',p.value->>'id','name',p.value->>'name','score',(p.value->>'score')::int,'completed',(p.value->>'completed')::int,
 'correct',(select count(*) from public.toowee_collection_answers a where a.room_id=r.id and a.player_id=(p.value->>'id')::uuid and a.correct),
 'incorrect',(select count(*) from public.toowee_collection_answers a where a.room_id=r.id and a.player_id=(p.value->>'id')::uuid and not a.correct)) order by (p.value->>'score')::int desc,p.ord),'[]') into stats from jsonb_array_elements(coalesce(r.state->'players','[]')) with ordinality p(value,ord);
 return jsonb_build_object('protocol',4,'code',r.code,'lang',r.lang,'host',coalesce(r.host_id=who,false),'me',pid,'status',r.status,'phase',r.phase,'state',r.state,'players',players,'revision',r.revision,'turn_no',r.turn_no,'rounds',r.rounds,'end_mode',r.end_mode,'game_deadline',r.game_deadline,'deadline',case when r.phase='questions' then q.deadline else r.deadline end,'server_now',clock_timestamp(),'questions_per_turn',r.questions_per_turn,'q_no',q.q_no,'correct_count',q.correct_count,
 'pending_reviews',case when r.host_id=who then (select coalesce(jsonb_agg(jsonb_build_object('player_id',z.player_id,'name',p.nickname,'cycle',z.cycle,'question_id',z.question->>'id','prompt',z.question->>'prompt','solution',z.question->>'solution')),'[]') from public.toowee_collection_quiz z join public.toowee_collection_players p on p.id=z.player_id and p.room_id=z.room_id where z.room_id=r.id and z.cycle=(r.state->>'cycle')::int and z.awaiting_review) else '[]'::jsonb end,
 'question',case when r.phase='questions' and not q.done and not q.review then (q.question-'solution'-'correct')||case when q.question->>'format' in ('open','write') then jsonb_build_object('options','[]'::jsonb) else '{}'::jsonb end else null end,
 'my_quiz',case when q.player_id is not null then jsonb_build_object('pending',q.awaiting_review,'cycle',q.cycle,'done',q.done,'review',q.review,'review_until',q.review_until,'question_id',q.question->>'id') end,
 'quiz_progress',(select coalesce(jsonb_agg(jsonb_build_object('id',player_id,'done',done,'q_no',q_no,'review',review)),'[]') from public.toowee_collection_quiz where room_id=r.id and cycle=coalesce((r.state->>'cycle')::int,1)),
 'feedback',(select jsonb_build_object('correct',a.correct,'prompt',a.prompt,'solution',a.solution,'answer',a.answer,'turn_no',a.turn_no,'q_no',a.q_no) from public.toowee_collection_answers a where a.room_id=r.id and a.player_id=pid order by a.turn_no desc,a.q_no desc limit 1),
 'results',case when r.status='finished' then jsonb_build_object('ranking',stats,'answers',answer_rows) end,
 'draw_correct',case when r.phase in ('draw','place') then (select correct_count from public.toowee_collection_quiz where room_id=r.id and cycle=(r.state->>'cycle')::int and player_id=coalesce(r.state->'turn_order'->>((r.state->>'draw_index')::int),r.state->'players'->((r.state->>'draw_index')::int)->>'id')::uuid) end);
end $function$
;
CREATE OR REPLACE FUNCTION public.toowee_collection_draw(pool jsonb, rid uuid, pid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare bag public.toowee_collection_word_bags%rowtype; item jsonb; k text; choices jsonb; result jsonb;
begin
 insert into public.toowee_collection_word_bags(room_id,player_id) values(rid,pid) on conflict do nothing;
 select * into bag from public.toowee_collection_word_bags where room_id=rid and player_id=pid for update;
 select value into item from jsonb_array_elements(pool)
 where not (lower(trim(value->>'word'))||chr(31)||lower(trim(value->>'translation'))=any(bag.seen)) order by random() limit 1;
 if item is null then
 bag.seen:='{}';
 select value into item from jsonb_array_elements(pool)
 where (jsonb_array_length(pool)=1 or lower(trim(value->>'word'))||chr(31)||lower(trim(value->>'translation')) is distinct from bag.last_key) order by random() limit 1;
 end if;
 if item is null then raise exception 'Brak słówek w puli gry.';end if;
 k:=lower(trim(item->>'word'))||chr(31)||lower(trim(item->>'translation'));
 update public.toowee_collection_word_bags set seen=array_append(bag.seen,k),last_key=k where room_id=rid and player_id=pid;
 if item ? 'question_format' then return public.toowee_question_snapshot(jsonb_build_object('prompt',item->>'word','answer',item->>'translation','reading',item->>'reading','wrong',item->'quiz_options'),item->>'question_format');end if;
 -- Build distractors from the complete pool, including already tested words.
 select jsonb_agg(label order by random()) into choices from (
 select item->>'translation' as label union all
 (select distinct value->>'translation' as label from jsonb_array_elements(pool) where value->>'translation'<>item->>'translation' order by label limit 3)
 ) answers;
 return jsonb_build_object('prompt',item->>'word','reading',item->>'reading','options',choices,'solution',item->>'translation');
end $function$
;
CREATE OR REPLACE FUNCTION public.toowee_collection_quiz_step(rid uuid, pid uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare r public.toowee_collection_rooms%rowtype;q public.toowee_collection_quiz%rowtype;
begin
 select * into r from public.toowee_collection_rooms where id=rid;
 select * into q from public.toowee_collection_quiz where room_id=rid and player_id=pid and cycle=(r.state->>'cycle')::int for update;
 if q.q_no>=r.questions_per_turn then
 update public.toowee_collection_quiz set awaiting_review=false,done=true,review=false,deadline=null where room_id=rid and player_id=pid and cycle=q.cycle;
 else
 update public.toowee_collection_quiz set awaiting_review=false,question_started_at=clock_timestamp(),q_no=q_no+1,question=public.toowee_collection_draw(r.words,rid,pid)||jsonb_build_object('id',gen_random_uuid()),review=false,review_until=null,deadline=case when r.seconds>0 then clock_timestamp()+make_interval(secs=>r.seconds) end where room_id=rid and player_id=pid and cycle=q.cycle;
 end if;
end $function$
;
CREATE OR REPLACE FUNCTION public.toowee_magic_dice(p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare set_row public.toowee_exercise_sets;pending jsonb;grade_player public.toowee_dice_players;
 who uuid:=auth.uid(); room public.toowee_dice_sessions; player public.toowee_dice_players; host boolean; secret text; config jsonb; rows jsonb; snapshot jsonb; n integer;
begin
 if p_action='create' then
  if who is null or not exists(select 1 from public.toowee_accounts where id=who and role in ('teacher','admin')) then raise exception 'Wybierz konto nauczyciela.';end if;
  config:=p_data->'config';
  if config is null or coalesce(config->>'language','') not in ('Japanese','English','Spanish') or coalesce((config->>'size')::integer,0) not in (3,4,5) or coalesce((config->>'quota')::integer,0) not between 1 and 10 or coalesce(config->>'direction','') not in ('toPolish','toTarget') or jsonb_typeof(config->'words') is distinct from 'array' then raise exception 'Nieprawidłowe ustawienia gry.';end if;
  if nullif(config->>'exercise_set_id','') is not null then
   select * into set_row from public.toowee_exercise_sets where id=(config->>'exercise_set_id')::uuid and owner_id=who and lang=config->>'language';
   if not found or set_row.format_review or set_row.question_format is null then raise exception 'Sprawdź własny zestaw przed grą.';end if;
   select jsonb_agg(jsonb_build_object('id',c->>'id','word',c->>'prompt','translation',coalesce(c->>'answer',''),'reading',coalesce(c->>'reading',''),'quiz_options',coalesce(c->'wrong','[]'),'question_format',set_row.question_format)) into rows from jsonb_array_elements(set_row.cards)c;
   config:=config||jsonb_build_object('words',rows,'direction','toPolish');
  end if;
  n:=jsonb_array_length(config->'words');if n<(case when config?'exercise_set_id' then 1 else 2 end) or n>2000 or length(config::text)>4000000 then raise exception 'Wybierz od 2 do 2000 słówek.';end if;
  if exists(select 1 from jsonb_array_elements(config->'words') w where coalesce(length(trim(w->>'word')),0) not between 1 and 2000 or (w->>'question_format' is distinct from 'open' and coalesce(length(trim(w->>'translation')),0) not between 1 and 2000)) then raise exception 'Nieprawidłowe słówka.';end if;
  insert into public.toowee_dice_sessions(host_id,request_id,config) values(who,(p_data->>'request_id')::uuid,config) on conflict(host_id,request_id) do nothing;
  select * into room from public.toowee_dice_sessions where host_id=who and request_id=(p_data->>'request_id')::uuid;
 elsif p_action='history' then
  if who is null then raise exception 'Zaloguj się.';end if;
  select coalesce(jsonb_agg(jsonb_build_object('code',r.code,'status',r.status,'created_at',r.created_at,'finished_at',r.finished_at,'language',r.config->>'language') order by r.created_at desc),'[]') into rows from (select * from public.toowee_dice_sessions where host_id=who order by created_at desc limit 100) r;
  return jsonb_build_object('rooms',rows);
 else
  select * into room from public.toowee_dice_sessions where code=p_data->>'code' for update;
  if not found then raise exception 'Nie znaleziono gry.';end if;
 end if;
 host:=who is not null and who=room.host_id;
 if room.status='playing' and room.expires_at<now() then update public.toowee_dice_sessions set status='finished',finished_at=now() where id=room.id returning * into room;end if;
 if host then
  if p_action='assess' then
   if jsonb_typeof(p_data->'correct') is distinct from 'boolean' or room.status<>'playing' then raise exception 'Nieprawidłowa ocena.';end if;
   select * into grade_player from public.toowee_dice_players where room_id=room.id and id=(p_data->>'player_id')::uuid for update;
   pending:=grade_player.stats->'pending_question';
   if not found or pending->>'id' is distinct from p_data->>'question_id' or room.config->'words'->((grade_player.stats->'resume'->>'wordIndex')::int)->>'question_format' is distinct from 'open' then raise exception 'To pytanie nie jest już aktualne.';end if;
   if grade_player.assessment->>'question_id' is distinct from pending->>'id' then
    update public.toowee_dice_players set assessment=jsonb_build_object('question_id',pending->>'id','correct',(p_data->>'correct')::boolean) where room_id=room.id and id=grade_player.id;
   end if;
  end if;
  if p_action='finish' and room.status<>'finished' then update public.toowee_dice_sessions set status='finished',finished_at=now() where id=room.id returning * into room;end if;
  if p_action not in ('create','load','finish','assess') then raise exception 'Niedozwolona operacja prowadzącego.';end if;
 else
  if p_action not in ('join','load','sync') then raise exception 'Tylko nauczyciel może zakończyć grę.';end if;
  if coalesce(p_data->>'guest_token','')!~'^[a-f0-9]{64}$' then raise exception 'Brak klucza uczestnika.';end if;
  secret:=encode(sha256(convert_to(p_data->>'guest_token','UTF8')),'hex');
  select * into player from public.toowee_dice_players where room_id=room.id and guest_hash=secret;
  if p_action='join' and player.id is null then
   if room.status='finished' then raise exception 'Nauczyciel zakończył tę grę.';end if;
   if coalesce(length(trim(p_data->>'name')),0) not between 1 and 32 then raise exception 'Wpisz imię lub pseudonim (1–32 znaki).';end if;
   if (select count(*) from public.toowee_dice_players where room_id=room.id)>=60 then raise exception 'Pokój jest pełny.';end if;
   insert into public.toowee_dice_players(room_id,guest_hash,name) values(room.id,secret,trim(p_data->>'name')) returning * into player;
  end if;
  if player.id is null then raise exception 'Najpierw dołącz do gry.';end if;
  if p_action='sync' and not player.finalized then
   snapshot:=p_data->'stats';n:=(p_data->>'revision')::integer;
   if jsonb_typeof(snapshot) is distinct from 'object' or length(snapshot::text)>1000000 or n<1 or n>1000000 then raise exception 'Nieprawidłowy wynik.';end if;
   if n>player.revision then update public.toowee_dice_players set stats=snapshot,revision=n,finalized=coalesce((p_data->>'final')::boolean,false),updated_at=now() where room_id=room.id and id=player.id returning * into player;end if;
  end if;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'stats',p.stats,'assessment',p.assessment,'finalized',p.finalized,'revision',p.revision,'updated_at',p.updated_at) order by p.name),'[]') into rows from public.toowee_dice_players p where p.room_id=room.id and (host or p.id=player.id);
 return jsonb_build_object('code',room.code,'host',host,'status',room.status,'config',case when room.status='playing' then room.config else null end,'finished_at',room.finished_at,'players',rows);
end;$function$
;
notify pgrst,'reload schema';
do $verify$ begin
if exists(select 1 from toowee_format_preservation_check b full join public.toowee_exercise_sets s on s.id=b.id where b.id is null or s.id is null or b.original_hash<>md5((to_jsonb(s)-'question_format'-'format_review')::text)) then raise exception 'Existing data changed; abort.';end if;
end $verify$;
commit;
