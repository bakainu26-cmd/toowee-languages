-- TooWee: uruchom CAŁOŚĆ w nowym zapytaniu. Błąd wycofuje zmiany.

begin;

lock table public.toowee_exercise_sets in share row exclusive mode;

create temp table tw_before on commit drop as select id,md5((to_jsonb(s)-'question_format'-'format_review')::text) hash from public.toowee_exercise_sets s;



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

update public.toowee_exercise_sets set question_format=public.toowee_infer_question_format(cards),format_review=public.toowee_infer_question_format(cards) is null where question_format is null;

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

alter table public.sophie_round_answers add column if not exists awaiting_review boolean not null default false;alter table public.sophie_round_answers add column if not exists response_text text;alter table public.toowee_collection_quiz add column if not exists awaiting_review boolean not null default false;alter table public.toowee_dice_players add column if not exists assessment jsonb;



do $patch$ declare v_oid oid:='public.toowee_collection_draw(jsonb,uuid,uuid)'::regprocedure;src text;orig text;begin
select prosrc into orig from pg_proc where oid=v_oid;
if md5(orig)<>'230a304e7665d869039bc5285dd8fe94' then raise exception 'Zmieniona funkcja: toowee_collection_draw. Przerwano bezpiecznie.';end if;
src:=orig;
src:=overlay(src placing $new$if item ? 'question_format' then return public.toowee_question_snapshot(jsonb_build_object('prompt',item->>'word','answer',item->>'translation','reading',item->>'reading','wrong',item->'quiz_options'),item->>'question_format');end if;
 $new$ from 1057 for 0);
if md5(src)<>'5b549e4846a910ac0ede78850fddcfce' then raise exception 'Nieprawidłowa poprawka: toowee_collection_draw';end if;
execute replace(pg_get_functiondef(v_oid),orig,src);
end $patch$;

do $patch$ declare v_oid oid:='public.toowee_collection_quiz_step(uuid,uuid)'::regprocedure;src text;orig text;begin
select prosrc into orig from pg_proc where oid=v_oid;
if md5(orig)<>'883fae79a980228d79ca13295aea7a96' then raise exception 'Zmieniona funkcja: toowee_collection_quiz_step. Przerwano bezpiecznie.';end if;
src:=orig;
src:=overlay(src placing $new$awaiting_review=false,$new$ from 520 for 0);
src:=overlay(src placing $new$awaiting_review=false,$new$ from 380 for 0);
if md5(src)<>'3f5738dae10e107ba1b0d49b14c02048' then raise exception 'Nieprawidłowa poprawka: toowee_collection_quiz_step';end if;
execute replace(pg_get_functiondef(v_oid),orig,src);
end $patch$;

do $patch$ declare v_oid oid:='public.toowee_collections(text,jsonb)'::regprocedure;src text;orig text;begin
select prosrc into orig from pg_proc where oid=v_oid;
if md5(orig)<>'ba250e019520f29c09a13d102bfbcd35' then raise exception 'Zmieniona funkcja: toowee_collections. Przerwano bezpiecznie.';end if;
src:=orig;
src:=overlay(src placing $new$'pending',q.awaiting_review,$new$ from 19908 for 0);
src:=overlay(src placing $new$(q.question-'solution'-'correct')||case when q.question->>'format' in ('open','write') then jsonb_build_object('options','[]'::jsonb) else '{}'::jsonb end$new$ from 19802 for 21);
src:=overlay(src placing $new$pending_reviews',case when r.host_id=who then (select coalesce(jsonb_agg(jsonb_build_object('player_id',z.player_id,'name',p.nickname,'cycle',z.cycle,'question_id',z.question->>'id','prompt',z.question->>'prompt','solution',z.question->>'solution')),'[]') from public.toowee_collection_quiz z join public.toowee_collection_players p on p.id=z.player_id and p.room_id=z.room_id where z.room_id=r.id and z.cycle=(r.state->>'cycle')::int and z.awaiting_review) else '[]'::jsonb end,
 '$new$ from 19725 for 0);
src:=overlay(src placing $new$;
 end if$new$ from 10615 for 0);
src:=overlay(src placing $new$q.awaiting_review then null;
 elsif q.question->>'format'='open' then
 update public.toowee_collection_quiz set awaiting_review=true,deadline=null where room_id=r.id and player_id=pid and cycle=q.cycle;
 elsif q.question->>'format'='write' then
 if length(coalesce(p_data->>'text','')) not between 1 and 2000 then raise exception 'Wpisz odpowiedź (do 2000 znaków).';end if;
 grade_value:=public.toowee_answer_equal(p_data->>'text',q.question->>'solution');
 perform public.toowee_collection_quiz_answer(r.id,pid,case when grade_value then 0 else null end);
 update public.toowee_collection_answers set answer=p_data->>'text' where room_id=r.id and player_id=pid and turn_no=q.cycle and q_no=q.q_no;
 else
 if $new$ from 10351 for 0);
src:=overlay(src placing $new$if p_action='assess' then
 if r.host_id is distinct from who or jsonb_typeof(p_data->'correct') is distinct from 'boolean' then raise exception 'Tylko prowadzący ocenia odpowiedzi.';end if;
 grade_pid:=(p_data->>'player_id')::uuid;
 select * into q from public.toowee_collection_quiz where room_id=r.id and player_id=grade_pid and cycle=(r.state->>'cycle')::int for update;
 if not found or q.question->>'id' is distinct from p_data->>'question_id' or q.cycle is distinct from (p_data->>'cycle')::int or q.question->>'format' is distinct from 'open' then raise exception 'To pytanie nie jest już aktualne.';end if;
 if q.awaiting_review then
 update public.toowee_collection_quiz set awaiting_review=false where room_id=r.id and player_id=grade_pid and cycle=q.cycle;
 perform public.toowee_collection_quiz_answer(r.id,grade_pid,case when (p_data->>'correct')::boolean then 0 else null end);
 end if;p_action:='load';
 end if;
 $new$ from 9956 for 0);
src:=overlay(src placing $new$end if;
 $new$ from 2194 for 0);
src:=overlay(src placing $new$nullif(p_data->>'exercise_set_id','') is not null then
 select * into set_row from public.toowee_exercise_sets where id=(p_data->>'exercise_set_id')::uuid and owner_id=who and lang=p_data->>'lang';
 if not found or set_row.format_review or set_row.question_format is null then raise exception 'Sprawdź własny zestaw przed grą.';end if;
 select jsonb_agg(jsonb_build_object('word',c->>'prompt','translation',coalesce(c->>'answer',''),'reading',coalesce(c->>'reading',''),'quiz_options',coalesce(c->'wrong','[]'),'question_format',set_row.question_format)) into wordpool from jsonb_array_elements(set_row.cards)c;
 else
 if $new$ from 1200 for 0);
src:=overlay(src placing $new$ set_row public.toowee_exercise_sets;question_public jsonb;grade_pid uuid;grade_value boolean;
$new$ from 33 for 0);
if md5(src)<>'a0a0c9c36a47c8063e4b060934152288' then raise exception 'Nieprawidłowa poprawka: toowee_collections';end if;
execute replace(pg_get_functiondef(v_oid),orig,src);
end $patch$;

do $patch$ declare v_oid oid:='public.toowee_exercise_sets(text,jsonb)'::regprocedure;src text;orig text;begin
select prosrc into orig from pg_proc where oid=v_oid;
if md5(orig)<>'6aceac70766651f12f81684d87a72328' then raise exception 'Zmieniona funkcja: toowee_exercise_sets. Przerwano bezpiecznie.';end if;
src:=orig;
src:=overlay(src placing $new$format',s.question_format,'format_review',s.format_review,'$new$ from 14248 for 0);
src:=overlay(src placing $new$,s.question_format,s.format_review$new$ from 12374 for 0);
src:=overlay(src placing $new$,question_format,format_review$new$ from 12274 for 0);
src:=overlay(src placing $new$,v_format,false)
  on conflict(id) do update set question_format=excluded.question_format,format_review=false,$new$ from 9131 for 34);
src:=overlay(src placing $new$,question_format,format_review$new$ from 8985 for 0);
src:=overlay(src placing $new$item->>'type'='quiz' and jsonb_array_length(wrong)<1 then raise exception 'Quiz wymaga co najmniej jednej błędnej$new$ from 8323 for 138);
src:=overlay(src placing $new$(v_format='open' and item->>'type'<>'open') or (v_format in ('quiz','write') and (item->>'type'='open' or coalesce(btrim(item->>'answer'),'')='')) or (v_format='quiz' and jsonb_array_length(coalesce(item->'wrong','[]'))<1) then raise exception 'Wszystkie pytania muszą pasować do formatu zestawu.';end if;
   if $new$ from 7414 for 0);
src:=overlay(src placing $new$format:=coalesce(nullif(p_data->>'format',''),public.toowee_infer_question_format(p_data->'cards'));if v_format is null or v_format not in ('open','quiz','write') then raise exception 'Zestaw wymaga sprawdzenia: wybierz jeden format pytań.';end if;
  v_$new$ from 6373 for 0);
src:=overlay(src placing $new$e.question_format as format,e.format_review,$new$ from 5002 for 0);
src:=overlay(src placing $new$; v_format text$new$ from 281 for 0);
if md5(src)<>'e57bbd72c1c93aafb1db7a02369ba470' then raise exception 'Nieprawidłowa poprawka: toowee_exercise_sets';end if;
execute replace(pg_get_functiondef(v_oid),orig,src);
end $patch$;

do $patch$ declare v_oid oid:='public.toowee_magic_dice(text,jsonb)'::regprocedure;src text;orig text;begin
select prosrc into orig from pg_proc where oid=v_oid;
if md5(orig)<>'ddb7782911ee6c46feb3c7c4fa93715d' then raise exception 'Zmieniona funkcja: toowee_magic_dice. Przerwano bezpiecznie.';end if;
src:=orig;
src:=overlay(src placing $new$assessment',p.assessment,'$new$ from 4316 for 0);
src:=overlay(src placing $new$','assess$new$ from 2590 for 0);
src:=overlay(src placing $new$assess' then
   if jsonb_typeof(p_data->'correct') is distinct from 'boolean' or room.status<>'playing' then raise exception 'Nieprawidłowa ocena.';end if;
   select * into grade_player from public.toowee_dice_players where room_id=room.id and id=(p_data->>'player_id')::uuid for update;
   pending:=grade_player.stats->'pending_question';
   if not found or pending->>'id' is distinct from p_data->>'question_id' or room.config->'words'->((grade_player.stats->'resume'->>'wordIndex')::int)->>'question_format' is distinct from 'open' then raise exception 'To pytanie nie jest już aktualne.';end if;
   if grade_player.assessment->>'question_id' is distinct from pending->>'id' then
    update public.toowee_dice_players set assessment=jsonb_build_object('question_id',pending->>'id','correct',(p_data->>'correct')::boolean) where room_id=room.id and id=grade_player.id;
   end if;
  end if;
  if p_action='$new$ from 2382 for 0);
src:=overlay(src placing $new$(w->>'question_format' is distinct from 'open' and coalesce(length(trim(w->>'translation')),0) not between 1 and 2000)$new$ from 1103 for 66);
src:=overlay(src placing $new$if nullif(config->>'exercise_set_id','') is not null then
   select * into set_row from public.toowee_exercise_sets where id=(config->>'exercise_set_id')::uuid and owner_id=who and lang=config->>'language';
   if not found or set_row.format_review or set_row.question_format is null then raise exception 'Sprawdź własny zestaw przed grą.';end if;
   select jsonb_agg(jsonb_build_object('id',c->>'id','word',c->>'prompt','translation',coalesce(c->>'answer',''),'reading',coalesce(c->>'reading',''),'quiz_options',coalesce(c->'wrong','[]'),'question_format',set_row.question_format)) into rows from jsonb_array_elements(set_row.cards)c;
   config:=config||jsonb_build_object('words',rows,'direction','toPolish');
  end if;
  n:=jsonb_array_length(config->'words');if n<(case when config?'exercise_set_id' then 1 else 2 end)$new$ from 820 for 45);
src:=overlay(src placing $new$ set_row public.toowee_exercise_sets;pending jsonb;grade_player public.toowee_dice_players;
$new$ from 9 for 0);
if md5(src)<>'4647d659e08083014379af21bb0eff74' then raise exception 'Nieprawidłowa poprawka: toowee_magic_dice';end if;
execute replace(pg_get_functiondef(v_oid),orig,src);
end $patch$;

do $patch$ declare v_oid oid:='public.toowee_sophie(text,jsonb)'::regprocedure;src text;orig text;begin
select prosrc into orig from pg_proc where oid=v_oid;
if md5(orig)<>'230571a30cade48d2b274c857d96c78c' then raise exception 'Zmieniona funkcja: toowee_sophie. Przerwano bezpiecznie.';end if;
src:=orig;
src:=overlay(src placing $new$'pending',answer.awaiting_review,$new$ from 26647 for 0);
src:=overlay(src placing $new$coalesce(q->'solution',q->'options'->((q->>'correct')::integer)$new$ from 26511 for 39);
src:=overlay(src placing $new$pending_reviews',case when host then (select coalesce(jsonb_agg(jsonb_build_object('player_id',p.public_id,'name',p.nickname,'round',a.round,'prompt',room.questions->((a.round-1)%jsonb_array_length(room.questions))->>'prompt','solution',room.questions->((a.round-1)%jsonb_array_length(room.questions))->>'solution')),'[]') from public.sophie_round_answers a join public.sophie_participants p on p.room_id=a.room_id and p.player_id=a.player_id where a.room_id=room.id and a.awaiting_review) else '[]'::jsonb end,
  'question',case when host or personal_done or q is null then null else (q-'correct'-'solution')||case when q->>'format' in ('open','write') then jsonb_build_object('options','[]'::jsonb) else '{}'::jsonb end$new$ from 26285 for 81);
src:=overlay(src placing $new$)$new$ from 23434 for 0);
src:=overlay(src placing $new$not exists(select 1 from public.sophie_round_answers where room_id=room.id and round=room.round and awaiting_review) and ($new$ from 23221 for 0);
src:=overlay(src placing $new$awaiting_review and (not correct or (pick is not null and resolved)$new$ from 23067 for 41);
src:=overlay(src placing $new$awaiting_review and (not correct or (pick is not null and resolved)$new$ from 20300 for 41);
src:=overlay(src placing $new$answer.awaiting_review then raise exception 'Poczekaj na ocenę nauczyciela.';end if;
  if found and $new$ from 19709 for 0);
src:=overlay(src placing $new$not grade_correct and not grade_pending then clock_timestamp()+interval '5 seconds' else null end,grade_pending,left(p_data->>'text',2000)$new$ from 14660 for 92);
src:=overlay(src placing $new$,awaiting_review,response_text) values(room.id,pid,room.round,selected,grade_correct,case when grade_correct$new$ from 14153 for 118);
src:=overlay(src placing $new$q:=room.questions->((room.round-1)%jsonb_array_length(room.questions));
   grade_pending:=q->>'format'='open';grade_pending:=coalesce(grade_pending,false);
   if grade_pending then selected:=-1;grade_correct:=false;
   elsif q->>'format'='write' then
    if length(coalesce(p_data->>'text','')) not between 1 and 2000 then raise exception 'Wpisz odpowiedź (do 2000 znaków).';end if;
    grade_correct:=public.toowee_answer_equal(p_data->>'text',q->>'solution');selected:=case when grade_correct then 0 else -1 end;
   else selected:=(p_data->>'choice')::integer;
    if selected is null or selected<0 or selected>=jsonb_array_length(q->'options') then raise exception 'Wybierz odpowiedź.';end if;
    grade_correct:=selected=(q->>'correct')::integer;
   end if$new$ from 13796 for 236);
src:=overlay(src placing $new$ and not exists(select 1 from public.sophie_round_answers where room_id=room.id and round=room.round and awaiting_review)$new$ from 11639 for 0);
src:=overlay(src placing $new$)$new$ from 10538 for 0);
src:=overlay(src placing $new$not exists(select 1 from public.sophie_round_answers where room_id=room.id and round=room.round and awaiting_review) and ($new$ from 10325 for 0);
src:=overlay(src placing $new$awaiting_review and (not correct or (pick is not null and resolved)$new$ from 10171 for 41);
src:=overlay(src placing $new$assess' then
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
 if p_action='$new$ from 8505 for 0);
src:=overlay(src placing $new$;
   end if$new$ from 5535 for 0);
src:=overlay(src placing $new$nullif(p_data->>'exercise_set_id','') is not null then
    select * into set_row from public.toowee_exercise_sets where id=(p_data->>'exercise_set_id')::uuid and owner_id=who and lang=p_data->>'lang';
    if not found or set_row.format_review or set_row.question_format is null then raise exception 'Sprawdź własny zestaw przed grą.';end if;
    select jsonb_agg(prepared.generated_question) into questions from (select public.toowee_question_snapshot(c,set_row.question_format) generated_question from jsonb_array_elements(set_row.cards)c order by random() limit requested) prepared;
   else
   if $new$ from 3547 for 0);
src:=overlay(src placing $new$;
 set_row public.toowee_exercise_sets;grade_correct boolean;grade_pending boolean;grade_pid uuid;grade_round integer$new$ from 107 for 0);
if md5(src)<>'c740c877d9d22f34acab2c542650d1e5' then raise exception 'Nieprawidłowa poprawka: toowee_sophie';end if;
execute replace(pg_get_functiondef(v_oid),orig,src);
end $patch$;

alter function public.toowee_collections(text,jsonb) set search_path=public,pg_temp;alter function public.toowee_collection_draw(jsonb,uuid,uuid) set search_path=public,pg_temp;alter function public.toowee_collection_quiz_step(uuid,uuid) set search_path=public,pg_temp;

do $check$ begin if exists(select 1 from tw_before b full join public.toowee_exercise_sets s using(id) where b.id is null or s.id is null or b.hash<>md5((to_jsonb(s)-'question_format'-'format_review')::text)) then raise exception 'Zmieniono istniejące dane. Wycofano migrację.';end if;end $check$;

notify pgrst,'reload schema';

commit;

select 'Gotowe' status,count(*) zestawy,sum(jsonb_array_length(cards)) pytania from public.toowee_exercise_sets;