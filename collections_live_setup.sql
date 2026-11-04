-- Kolekcje Sophisi V4: równoczesne pytania, kolejka układania, czas i wyniki.
-- Uruchom po collections_setup.sql. Powtarzalne, zachowuje istniejące pokoje i odpowiedzi.
begin;
alter table public.toowee_collection_rooms add column if not exists end_mode text not null default 'rounds';
alter table public.toowee_collection_rooms add column if not exists time_limit int not null default 300;
alter table public.toowee_collection_rooms add column if not exists game_deadline timestamptz;
alter table public.toowee_collection_rooms drop constraint if exists toowee_collection_rooms_rounds_check;
alter table public.toowee_collection_rooms add constraint toowee_collection_rooms_rounds_check check(rounds between 1 and 300);
alter table public.toowee_collection_answers drop constraint if exists toowee_collection_answers_pkey;
alter table public.toowee_collection_answers add primary key(room_id,player_id,turn_no,q_no);
create table if not exists public.toowee_collection_quiz(
 room_id uuid not null, player_id uuid not null, cycle int not null, q_no int not null default 1,
 question jsonb not null, correct_count int not null default 0, done bool not null default false,
 review bool not null default false, review_until timestamptz, deadline timestamptz,
 primary key(room_id,player_id,cycle),foreign key(room_id,player_id) references public.toowee_collection_players(room_id,id) on delete cascade
);
alter table public.toowee_collection_quiz add column if not exists elapsed_ms bigint not null default 0;
alter table public.toowee_collection_quiz add column if not exists question_started_at timestamptz not null default clock_timestamp();
alter table public.toowee_collection_quiz enable row level security;
revoke all on public.toowee_collection_quiz from public,anon,authenticated;
-- Keep the previous engine available only to this owner-defined dispatcher.
do $$ declare definition text;body text;begin
 select prosrc into body from pg_proc where oid='public.toowee_collections(text,jsonb)'::regprocedure;
 if position('COLLECTIONS_LIVE_V4' in body)=0 then
 definition:=pg_get_functiondef('public.toowee_collections(text,jsonb)'::regprocedure);
 execute replace(definition,'FUNCTION public.toowee_collections(','FUNCTION public.toowee_collections_legacy(');
 end if;
end $$;
revoke all on function public.toowee_collections_legacy(text,jsonb) from public,anon,authenticated;

create or replace function public.toowee_collection_supply(s jsonb,basket_index int default 0) returns jsonb language plpgsql set search_path=public as $$
declare demand int[]:=array[2,2,2,2,2];counts int[]:=array[0,0,0,0,0];player jsonb;card jsonb;t int;j int;total int;ticket int;pick int;
begin
 for player in select value from jsonb_array_elements(coalesce(s->'players','[]')) loop
 for card in select value from jsonb_array_elements(player->'cards') loop
 for t in 0..4 loop demand[t+1]:=demand[t+1]+greatest(0,coalesce((card->'need'->>t)::int,0));end loop;
 end loop;
 for t in 0..4 loop demand[t+1]:=greatest(2,demand[t+1]-coalesce((player->'stash'->>t)::int,0));end loop;
 end loop;
 -- Three weighted toy kinds in stacks of 2..4, rather than four single draws.
 for j in 1..3 loop
 total:=0;for t in 1..5 loop if counts[t]=0 then total:=total+demand[t];end if;end loop;
 ticket:=floor(random()*total);pick:=1;
 for t in 1..5 loop if counts[t]=0 then ticket:=ticket-demand[t];if ticket<0 then pick:=t;exit;end if;end if;end loop;
 counts[pick]:=2+floor(random()*3);
 end loop;
 return to_jsonb(counts);
end $$;
create or replace function public.toowee_collection_balance(s jsonb) returns jsonb language plpgsql set search_path=public as $$
declare baskets jsonb:=s->'baskets';needed bool[]:=array[false,false,false,false,false];player jsonb;card jsonb;t int;total int;idx int;
begin
 if baskets is null then baskets:='[]';for idx in 0..4 loop baskets:=baskets||jsonb_build_array(public.toowee_collection_supply(s,idx));end loop;end if;
 for player in select value from jsonb_array_elements(s->'players') loop
 for card in select value from jsonb_array_elements(player->'cards') loop
 for t in 0..4 loop if coalesce((card->'need'->>t)::int,0)>0 then needed[t+1]:=true;end if;end loop;
 end loop;end loop;
 -- A needed kind cannot disappear from the entire common pool.
 for t in 0..4 loop
 select coalesce(sum((value->>t)::int),0) into total from jsonb_array_elements(baskets);
 if needed[t+1] and total<2 then
 select ord-1 into idx from jsonb_array_elements(baskets) with ordinality b(value,ord)
 order by (select sum(x::int) from jsonb_array_elements_text(value) x),ord limit 1;
 baskets:=jsonb_set(baskets,array[idx::text,t::text],to_jsonb(2+floor(random()*3)::int));
 end if;
 end loop;
 return jsonb_set(s,'{baskets}',baskets);
end $$;

create or replace function public.toowee_collection_matches(board jsonb,card jsonb) returns jsonb language plpgsql set search_path=public as $$
declare options jsonb:='[]';cells jsonb;seq jsonb:=card->'sequence';start_cell int;step int;j int;len int;fits bool;
begin
 len:=jsonb_array_length(seq);if len is null or len<2 or len>5 then return options;end if;
 for start_cell in 0..24 loop foreach step in array array[1,5] loop
 if (step=1 and start_cell%5+len>5) or (step=5 and start_cell/5+len>5) then continue;end if;
 fits:=true;cells:='[]';for j in 0..len-1 loop
 if board->>(start_cell+j*step) is distinct from seq->>j then fits:=false;exit;end if;
 cells:=cells||to_jsonb(start_cell+j*step);end loop;
 if fits then options:=options||jsonb_build_array(cells);end if;
 end loop;end loop;return options;
end $$;
create or replace function public.toowee_collection_live_resolve(p jsonb,chosen int default null) returns jsonb language plpgsql set search_path=public as $$
declare cards jsonb:=p->'cards';board jsonb:=p->'board';options jsonb;cells jsonb;card jsonb;cell text;i int;passes int;matched bool;
begin
 p:=p-'pending_match';
 for passes in 1..32 loop
 matched:=false;
 for i in 0..2 loop
 card:=cards->i;options:=public.toowee_collection_matches(board,card);
 if jsonb_array_length(options)=0 then continue;end if;
 if jsonb_array_length(options)>1 then
 if chosen is null then return p||jsonb_build_object('board',board,'cards',cards,'pending_match',jsonb_build_object('card_id',card->>'id','options',options));end if;
 if chosen<0 or chosen>=jsonb_array_length(options) then raise exception 'Wybierz podświetlony układ.';end if;
 cells:=options->chosen;chosen:=null;
 else cells:=options->0;end if;
 for cell in select jsonb_array_elements_text(cells) loop board:=jsonb_set(board,array[cell],'-1');end loop;
 p:=p||jsonb_build_object('score',(p->>'score')::int+(card->>'points')::int,'completed',(p->>'completed')::int+1);
 cards:=jsonb_set(cards,array[i::text],public.toowee_collection_card());matched:=true;exit;
 end loop;exit when not matched;
 end loop;return p||jsonb_build_object('board',board,'cards',cards);
end $$;
revoke all on function public.toowee_collection_matches(jsonb,jsonb),public.toowee_collection_live_resolve(jsonb,int) from public,anon,authenticated;

create or replace function public.toowee_collection_live_cycle(rid uuid,cycle_number int) returns void language plpgsql set search_path=public as $$
declare r public.toowee_collection_rooms%rowtype;player jsonb;
begin
 select * into r from public.toowee_collection_rooms where id=rid for update;
 r.state:=jsonb_set(jsonb_set(r.state,'{cycle}',to_jsonb(cycle_number)),'{draw_index}','0')-'turn_order';
 r.state:=public.toowee_collection_balance(r.state);
 for player in select value from jsonb_array_elements(r.state->'players') loop
 insert into public.toowee_collection_quiz(room_id,player_id,cycle,question,deadline)
 values(rid,(player->>'id')::uuid,cycle_number,public.toowee_collection_question(r.words)||jsonb_build_object('id',gen_random_uuid()),case when r.seconds>0 then clock_timestamp()+make_interval(secs=>r.seconds) end)
 on conflict do nothing;
 end loop;
 update public.toowee_collection_rooms set status='playing',phase='questions',state=r.state,turn_no=(cycle_number-1)*jsonb_array_length(r.state->'players')+1,q_no=1,deadline=null,finished_at=null,revision=revision+1 where id=rid;
end $$;
create or replace function public.toowee_collection_quiz_step(rid uuid,pid uuid) returns void language plpgsql set search_path=public as $$
declare r public.toowee_collection_rooms%rowtype;q public.toowee_collection_quiz%rowtype;
begin
 select * into r from public.toowee_collection_rooms where id=rid;
 select * into q from public.toowee_collection_quiz where room_id=rid and player_id=pid and cycle=(r.state->>'cycle')::int for update;
 if q.q_no>=r.questions_per_turn then
 update public.toowee_collection_quiz set done=true,review=false,deadline=null where room_id=rid and player_id=pid and cycle=q.cycle;
 else
 update public.toowee_collection_quiz set question_started_at=clock_timestamp(),q_no=q_no+1,question=public.toowee_collection_question(r.words)||jsonb_build_object('id',gen_random_uuid()),review=false,review_until=null,deadline=case when r.seconds>0 then clock_timestamp()+make_interval(secs=>r.seconds) end where room_id=rid and player_id=pid and cycle=q.cycle;
 end if;
end $$;
create or replace function public.toowee_collection_quiz_answer(rid uuid,pid uuid,choice int) returns void language plpgsql set search_path=public as $$
declare r public.toowee_collection_rooms%rowtype;q public.toowee_collection_quiz%rowtype;selected text;correct bool;
begin
 select * into r from public.toowee_collection_rooms where id=rid;
 select * into q from public.toowee_collection_quiz where room_id=rid and player_id=pid and cycle=(r.state->>'cycle')::int for update;
 if q.done or q.review then return;end if;
 update public.toowee_collection_quiz set elapsed_ms=elapsed_ms+greatest(0,floor(extract(epoch from (clock_timestamp()-q.question_started_at))*1000))::bigint where room_id=rid and player_id=pid and cycle=q.cycle;
 selected:=case when choice is null then null else q.question->'options'->>choice end;correct:=coalesce(selected=q.question->>'solution',false);
 insert into public.toowee_collection_answers(room_id,player_id,turn_no,q_no,prompt,solution,answer,correct)
 values(rid,pid,q.cycle,q.q_no,q.question->>'prompt',q.question->>'solution',selected,correct) on conflict do nothing;
 if correct then
 update public.toowee_collection_quiz set correct_count=correct_count+1 where room_id=rid and player_id=pid and cycle=q.cycle;
 perform public.toowee_collection_quiz_step(rid,pid);
 else
 update public.toowee_collection_quiz set review=true,review_until=clock_timestamp()+interval '3 seconds',deadline=null where room_id=rid and player_id=pid and cycle=q.cycle;
 end if;
end $$;
create or replace function public.toowee_collection_live_next(rid uuid) returns void language plpgsql set search_path=public as $$
declare r public.toowee_collection_rooms%rowtype;idx int;n int;cycle_number int;
begin
 select * into r from public.toowee_collection_rooms where id=rid for update;
 r.state:=jsonb_set(r.state,'{players}',(select jsonb_agg(value||jsonb_build_object('fresh_remaining',0) order by ord) from jsonb_array_elements(r.state->'players') with ordinality z(value,ord)));
 update public.toowee_collection_rooms set state=r.state where id=rid;
 idx:=(r.state->>'draw_index')::int;n:=jsonb_array_length(r.state->'players');cycle_number:=(r.state->>'cycle')::int;
 if idx+1<n then
 r.state:=jsonb_set(r.state,'{draw_index}',to_jsonb(idx+1));
 update public.toowee_collection_rooms set state=r.state,phase='draw',turn_no=turn_no+1,deadline=null,revision=revision+1 where id=rid;
 elsif coalesce((r.state->>'finish_after_cycle')::bool,false) or (r.end_mode='rounds' and cycle_number>=r.rounds) then
 r.state:=jsonb_set(r.state,'{cycle_complete}','true');
 update public.toowee_collection_rooms set state=r.state,status='finished',phase='finished',deadline=null,finished_at=clock_timestamp(),revision=revision+1 where id=rid;
 else perform public.toowee_collection_live_cycle(rid,cycle_number+1);
 end if;
end $$;
create or replace function public.toowee_collections(p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public as $$
-- COLLECTIONS_LIVE_V4
 declare who uuid:=auth.uid();r public.toowee_collection_rooms%rowtype;pid uuid;target uuid;q public.toowee_collection_quiz%rowtype;x record;
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
 if coalesce(jsonb_array_length(p_data->'ids'),0)>1000 then raise exception 'Maksymalnie 1000 słówek.';end if;
 select jsonb_agg(jsonb_build_object('word',w.word,'reading',w.reading,'translation',w.translation)) into wordpool
 from public.vocabulary_words w where w.owner_id=who and w.lang=p_data->>'lang' and public.toowee_word_access(w.id)
 and length(trim(w.word))>0 and length(trim(w.translation))>0 and w.id::text in(select jsonb_array_elements_text(p_data->'ids'));
 if coalesce(jsonb_array_length(wordpool),0)<2 or (select count(distinct value->>'translation') from jsonb_array_elements(wordpool))<2 then raise exception 'Wybierz co najmniej dwa różne słówka i tłumaczenia.';end if;
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
 select * into q from public.toowee_collection_quiz where room_id=r.id and player_id=pid and cycle=(r.state->>'cycle')::int;
 if p_action='answer' then
 if not found or q.done or q.review or (p_data->>'cycle')::int is distinct from q.cycle or p_data->>'question_id' is distinct from q.question->>'id' then raise exception 'To pytanie jest już rozliczone. Poczekaj na aktualny widok.';end if;
 if (p_data->>'choice')::int is null or (p_data->>'choice')::int<0 or (p_data->>'choice')::int>=jsonb_array_length(q.question->'options') then raise exception 'Wybierz odpowiedź.';end if;
 perform public.toowee_collection_quiz_answer(r.id,pid,(p_data->>'choice')::int);
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
 'question',case when r.phase='questions' and not q.done and not q.review then q.question-'solution' else null end,
 'my_quiz',case when q.player_id is not null then jsonb_build_object('cycle',q.cycle,'done',q.done,'review',q.review,'review_until',q.review_until,'question_id',q.question->>'id') end,
 'quiz_progress',(select coalesce(jsonb_agg(jsonb_build_object('id',player_id,'done',done,'q_no',q_no,'review',review)),'[]') from public.toowee_collection_quiz where room_id=r.id and cycle=coalesce((r.state->>'cycle')::int,1)),
 'feedback',(select jsonb_build_object('correct',a.correct,'prompt',a.prompt,'solution',a.solution,'answer',a.answer,'turn_no',a.turn_no,'q_no',a.q_no) from public.toowee_collection_answers a where a.room_id=r.id and a.player_id=pid order by a.turn_no desc,a.q_no desc limit 1),
 'results',case when r.status='finished' then jsonb_build_object('ranking',stats,'answers',answer_rows) end,
 'draw_correct',case when r.phase in ('draw','place') then (select correct_count from public.toowee_collection_quiz where room_id=r.id and cycle=(r.state->>'cycle')::int and player_id=coalesce(r.state->'turn_order'->>((r.state->>'draw_index')::int),r.state->'players'->((r.state->>'draw_index')::int)->>'id')::uuid) end);
end $$;
revoke all on function public.toowee_collection_supply(jsonb,int),public.toowee_collection_balance(jsonb),public.toowee_collection_live_cycle(uuid,int),public.toowee_collection_quiz_step(uuid,uuid),public.toowee_collection_quiz_answer(uuid,uuid,int),public.toowee_collection_live_next(uuid) from public,anon,authenticated;
revoke all on function public.toowee_collections(text,jsonb) from public;
grant execute on function public.toowee_collections(text,jsonb) to anon,authenticated;
commit;
