-- Kolekcje Sophisi: uruchom po konfiguracji kont i słownictwa.
begin;
create table if not exists public.toowee_collection_rooms(
 id uuid primary key default gen_random_uuid(), host_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null, code text not null unique, lang text not null,
 status text not null default 'lobby' check(status in ('lobby','playing','finished')),
 words jsonb not null, question jsonb, state jsonb not null default '{}',
 rounds int not null check(rounds between 1 and 30), questions_per_turn int not null check(questions_per_turn between 1 and 20),
 seconds int not null check(seconds between 0 and 300), placement_seconds int not null check(placement_seconds between 0 and 300),
 turn_no int not null default 0, q_no int not null default 0, correct_count int not null default 0,
 phase text not null default 'lobby', deadline timestamptz, revision int not null default 0,
 created_at timestamptz not null default now(), finished_at timestamptz, unique(host_id,request_id)
);
create table if not exists public.toowee_collection_players(
 room_id uuid not null references public.toowee_collection_rooms(id) on delete cascade,
 id uuid not null default gen_random_uuid(), account_id uuid references auth.users(id) on delete set null,
 guest_hash text, nickname text not null check(length(trim(nickname)) between 1 and 32),
 joined_at timestamptz not null default now(),primary key(room_id,id),unique(room_id,account_id),unique(room_id,guest_hash)
);
create table if not exists public.toowee_collection_answers(
 room_id uuid not null,player_id uuid not null,turn_no int not null,q_no int not null,
 prompt text not null,solution text not null,answer text,correct boolean not null,
 created_at timestamptz not null default now(),primary key(room_id,turn_no,q_no),
 foreign key(room_id,player_id) references public.toowee_collection_players(room_id,id) on delete cascade
);
alter table public.toowee_collection_rooms enable row level security;
alter table public.toowee_collection_players enable row level security;
alter table public.toowee_collection_answers enable row level security;
revoke all on public.toowee_collection_rooms,public.toowee_collection_players,public.toowee_collection_answers from public,anon,authenticated;
create index if not exists toowee_collection_host_idx on public.toowee_collection_rooms(host_id,created_at desc);

create or replace function public.toowee_collection_card() returns jsonb language plpgsql set search_path=public as $$
declare need int[]:=array[0,0,0,0,0]; kind int:=floor(random()*6); a int:=1+floor(random()*5); b int; points int; title text;
begin
 b:=1+(a+floor(random()*4)::int)%5;
 if kind=0 then need[a]:=2;points:=3;title:='Mała kolekcja';
 elsif kind=1 then need[a]:=3;points:=5;title:='Ulubione zabawki';
 elsif kind=2 then need[a]:=2;need[b]:=2;points:=7;title:='Dwie dobrane pary';
 elsif kind=3 then need:=array[1,1,1,1,1];points:=9;title:='Po trochu wszystkiego';
 elsif kind=4 then need[a]:=5;points:=11;title:='Wielka kolekcja';
 else need[a]:=3;need[b]:=1;points:=6;title:='Trzy plus jedna';end if;
 return jsonb_build_object('id',gen_random_uuid(),'title',title,'need',need,'have',array[0,0,0,0,0],'points',points,'shape',case when kind in (2,5) then 'square' else 'line' end);
end $$;
-- Match an exact multiset in a contiguous horizontal/vertical line or a 2x2 square.
-- Returned positions are zero-based; crossing a row boundary is never a line.
create or replace function public.toowee_collection_match(board jsonb, goal jsonb) returns int[] language plpgsql set search_path=public as $$
declare need int[]; counts int[]; cells int[]; amount int; row int; col int; direction int; step int; position int; toy int; good bool;
begin
 if jsonb_array_length(board)<>25 then return null;end if;
 select array_agg(value::int order by ord) into need from jsonb_array_elements_text(goal->'need') with ordinality x(value,ord);
 select sum(x) into amount from unnest(need) x;
 for row in 0..4 loop for col in 0..4 loop for direction in 0..1 loop
 cells:='{}';
 if goal->>'shape'='square' then
 if row=4 or col=4 or direction=1 then continue;end if;
 cells:=array[row*5+col,row*5+col+1,(row+1)*5+col,(row+1)*5+col+1];
 else
 if (direction=0 and col+amount>5) or (direction=1 and row+amount>5) then continue;end if;
 for step in 0..amount-1 loop cells:=array_append(cells,row*5+col+step*case when direction=0 then 1 else 5 end);end loop;
 end if;
 counts:=array[0,0,0,0,0];good:=true;
 foreach position in array cells loop toy:=(board->>position)::int;if toy is null or toy not between 0 and 4 then good:=false;exit;end if;counts[toy+1]:=counts[toy+1]+1;end loop;
 if good and counts=need then return cells;end if;
 end loop;end loop;end loop;
 return null;
end $$;

create or replace function public.toowee_collection_baskets() returns jsonb language plpgsql set search_path=public as $$
declare result jsonb:='[]'; counts int[]; i int;j int;t int;
begin for i in 1..5 loop counts:=array[0,0,0,0,0];for j in 1..4 loop t:=1+floor(random()*5);counts[t]:=counts[t]+1;end loop;result:=result||jsonb_build_array(to_jsonb(counts));end loop;return result;end $$;
create or replace function public.toowee_collection_question(pool jsonb) returns jsonb language plpgsql set search_path=public as $$
declare item jsonb; options jsonb;
begin
 select value into item from jsonb_array_elements(pool) order by random() limit 1;
 select jsonb_agg(label order by random()) into options from (
 select item->>'translation' as label union all
 select label from (select label from (select distinct value->>'translation' as label from jsonb_array_elements(pool) where value->>'translation'<>item->>'translation') choices order by random() limit 3) d
 ) final_options;
 return jsonb_build_object('prompt',item->>'word','reading',item->>'reading','options',options,'solution',item->>'translation');
end $$;
create or replace function public.toowee_collection_next(rid uuid) returns void language plpgsql set search_path=public as $$
declare r public.toowee_collection_rooms%rowtype; idx int; p jsonb; extra int; i int;stash int[]; kept int:=0;
begin
 select * into r from public.toowee_collection_rooms where id=rid for update;
 if r.turn_no>0 then
 idx:=(r.turn_no-1)%jsonb_array_length(r.state->'players');p:=r.state->'players'->idx;
 select array_agg(value::int order by ord) into stash from jsonb_array_elements_text(p->'stash') with ordinality x(value,ord);
 extra:=greatest(0,(select sum(x) from unnest(stash) x)-2);
 -- Unplaced overflow costs one point per toy; retain the first two toys deterministically.
 for i in 1..5 loop if kept+stash[i]>2 then stash[i]:=greatest(0,2-kept);end if;kept:=kept+stash[i];end loop;
 p:=jsonb_set(p,'{stash}',to_jsonb(stash));p:=jsonb_set(p,'{score}',to_jsonb(greatest(0,(p->>'score')::int-extra)));
 r.state:=jsonb_set(r.state,array['players',idx::text],p);
 end if;
 if r.turn_no>=r.rounds*jsonb_array_length(r.state->'players') then
 update public.toowee_collection_rooms set status='finished',phase='finished',deadline=null,question=null,state=r.state,finished_at=now(),revision=revision+1 where id=rid;return;
 end if;
 if not exists(select 1 from jsonb_array_elements(r.state->'baskets') b cross join lateral jsonb_array_elements_text(b) n where n::int>0) then r.state:=jsonb_set(r.state,'{baskets}',public.toowee_collection_baskets());end if;
 update public.toowee_collection_rooms set state=r.state,turn_no=turn_no+1,q_no=1,correct_count=0,phase='question',question=public.toowee_collection_question(words),deadline=case when seconds>0 then clock_timestamp()+make_interval(secs=>seconds) end,revision=revision+1 where id=rid;
end $$;

create or replace function public.toowee_collections(p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public as $$
declare who uuid:=auth.uid(); r public.toowee_collection_rooms%rowtype; pid uuid; target uuid; token text:=p_data->>'guest_token';
 actor bool; timedout bool:=false; idx int; players jsonb; p jsonb; c jsonb; baskets jsonb; stash int[]; have int[]; need int[];
 cell int; positions int[]; position int; matched bool; cycles int; gameboard jsonb;
 wordpool jsonb; selected text; correct bool; toy int; basket int; card int; count_toys int; i int; result jsonb; rows_json jsonb; req uuid; roomcode text;
begin
 if p_action='history' then
 if who is null then raise exception 'Zaloguj się.';end if;
 return jsonb_build_object('games',(select coalesce(jsonb_agg(x order by x.created_at desc),'[]') from (
 select id,code,lang,created_at,finished_at,status,state->'players' as players from public.toowee_collection_rooms where host_id=who order by created_at desc limit 100) x));
 end if;
 if p_action='create' then
 if who is null or not exists(select 1 from public.toowee_accounts where id=who and role in ('admin','teacher')) then raise exception 'Wybierz konto nauczyciela.';end if;
 req:=(p_data->>'request_id')::uuid;
 if req is null then raise exception 'Brak identyfikatora gry.';end if;
 select * into r from public.toowee_collection_rooms where host_id=who and request_id=req;
 if not found then
 if jsonb_array_length(coalesce(p_data->'ids','[]'))>1000 then raise exception 'Maksymalnie 1000 słówek.';end if;
 select jsonb_agg(jsonb_build_object('word',w.word,'reading',w.reading,'translation',w.translation)) into wordpool from public.vocabulary_words w
 where w.owner_id=who and w.lang=p_data->>'lang' and public.toowee_word_access(w.id) and length(trim(w.word))>0 and length(trim(w.translation))>0 and w.id::text in (select jsonb_array_elements_text(p_data->'ids'));
 if coalesce(jsonb_array_length(wordpool),0)<2 or (select count(distinct value->>'translation') from jsonb_array_elements(wordpool))<2 then raise exception 'Wybierz co najmniej dwa różne słówka i tłumaczenia.';end if;
 roomcode:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
 insert into public.toowee_collection_rooms(host_id,request_id,code,lang,words,rounds,questions_per_turn,seconds,placement_seconds)
 values(who,req,roomcode,p_data->>'lang',wordpool,coalesce((p_data->>'rounds')::int,6),coalesce((p_data->>'questions_per_turn')::int,3),coalesce((p_data->>'seconds')::int,30),coalesce((p_data->>'placement_seconds')::int,60)) on conflict(host_id,request_id) do nothing;
 select * into r from public.toowee_collection_rooms where host_id=who and request_id=req;
 end if;
 else select * into r from public.toowee_collection_rooms where code=upper(trim(p_data->>'code')) for update;
 if not found then raise exception 'Nie znaleziono pokoju.';end if;
 end if;
 if who is not null then select id into pid from public.toowee_collection_players where room_id=r.id and account_id=who;
 elsif token ~ '^[a-f0-9]{64}$' then select id into pid from public.toowee_collection_players where room_id=r.id and guest_hash=md5(token);end if;
 if p_action='join' then
 if r.host_id=who then raise exception 'Prowadzący obserwuje grę. Do testów dołącz w innym oknie.';end if;
 if pid is null then
 if r.status<>'lobby' then raise exception 'Gra już się rozpoczęła.';end if;
 if (select count(*) from public.toowee_collection_players where room_id=r.id)>=12 then raise exception 'Pokój jest pełny (12 osób).';end if;
 if who is null and (token is null or token !~ '^[a-f0-9]{64}$') then raise exception 'Nieprawidłowy klucz gościa.';end if;
 insert into public.toowee_collection_players(room_id,account_id,guest_hash,nickname) values(r.id,who,case when who is null then md5(token) end,trim(p_data->>'nickname')) returning id into pid;
 end if;
 end if;
 if r.host_id is distinct from who and pid is null then raise exception 'Dołącz do pokoju.';end if;
 if p_action='details' then
 if r.host_id is distinct from who then raise exception 'Tylko prowadzący może otworzyć raport.';end if;
 return jsonb_build_object('code',r.code,'state',r.state,'answers',(select coalesce(jsonb_agg(to_jsonb(a) order by a.turn_no,a.q_no),'[]') from public.toowee_collection_answers a where a.room_id=r.id));
 end if;
 if p_action='start' then
 if r.host_id is distinct from who then raise exception 'Tylko prowadzący rozpoczyna grę.';end if;
 if r.status='lobby' then
 select jsonb_agg(jsonb_build_object('id',id,'name',nickname,'score',0,'completed',0,'stash',array[0,0,0,0,0],'board',to_jsonb(array_fill(-1,array[25])),'cards',jsonb_build_array(public.toowee_collection_card(),public.toowee_collection_card(),public.toowee_collection_card())) order by joined_at,id) into players from public.toowee_collection_players where room_id=r.id;
 if players is null then raise exception 'Poczekaj na co najmniej jednego gracza.';end if;
 update public.toowee_collection_rooms set state=jsonb_build_object('layout','board-v2','players',players,'baskets',public.toowee_collection_baskets()),status='playing' where id=r.id;
 perform public.toowee_collection_next(r.id);
 end if;
 elsif p_action='skip' then
 if r.host_id is distinct from who or r.status<>'playing' then raise exception 'Tylko prowadzący może pominąć turę.';end if;
 if (p_data->>'revision')::int is distinct from r.revision then raise exception 'Tura się zmieniła.';end if;
 perform public.toowee_collection_next(r.id);
 elsif p_action='finish' then
 if r.host_id is distinct from who then raise exception 'Tylko prowadzący kończy grę.';end if;
 update public.toowee_collection_rooms set status='finished',phase='finished',question=null,deadline=null,finished_at=coalesce(finished_at,now()),revision=revision+1 where id=r.id;
 end if;
 select * into r from public.toowee_collection_rooms where id=r.id;
 if r.status='playing' then
 idx:=(r.turn_no-1)%jsonb_array_length(r.state->'players');p:=r.state->'players'->idx;target:=(p->>'id')::uuid;actor:=pid=target;
 if r.deadline is not null and clock_timestamp()>=r.deadline then
 timedout:=true;
 if r.phase='question' then p_action:='answer';else perform public.toowee_collection_next(r.id);p_action:='load';end if;
 end if;
 if p_action in ('answer','draw','put','end_turn') then
 if not timedout and (not coalesce(actor,false) or (p_data->>'revision')::int is distinct from r.revision) then raise exception 'Widok gry się zmienił. Odśwież grę.';end if;
 if p_action='answer' then
 if r.phase<>'question' then raise exception 'Teraz wybierasz zabawki.';end if;
 if not timedout and ((p_data->>'choice')::int is null or (p_data->>'choice')::int<0 or (p_data->>'choice')::int>=jsonb_array_length(r.question->'options')) then raise exception 'Wybierz odpowiedź.';end if;
 selected:=case when timedout then null else r.question->'options'->>((p_data->>'choice')::int) end;
 if not timedout and selected is null then raise exception 'Wybierz odpowiedź.';end if;
 correct:=coalesce(selected=r.question->>'solution',false);
 insert into public.toowee_collection_answers(room_id,player_id,turn_no,q_no,prompt,solution,answer,correct) values(r.id,target,r.turn_no,r.q_no,r.question->>'prompt',r.question->>'solution',selected,correct);
 if r.q_no<r.questions_per_turn then
 update public.toowee_collection_rooms set q_no=q_no+1,correct_count=correct_count+correct::int,question=public.toowee_collection_question(words),deadline=case when seconds>0 then clock_timestamp()+make_interval(secs=>seconds) end,revision=revision+1 where id=r.id;
 elsif r.correct_count+correct::int>0 then
 update public.toowee_collection_rooms set correct_count=correct_count+correct::int,phase='draw',question=null,deadline=case when placement_seconds>0 then clock_timestamp()+make_interval(secs=>placement_seconds) end,revision=revision+1 where id=r.id;
 else perform public.toowee_collection_next(r.id);end if;
 elsif p_action='draw' then
 if r.phase<>'draw' then raise exception 'Zabawki już dobrano.';end if;
 basket:=(p_data->>'basket')::int;toy:=(p_data->>'toy')::int;
 if basket is null or toy is null or basket not between 0 and 4 or toy not between 0 and 4 then raise exception 'Wybierz koszyk i zabawkę.';end if;
 baskets:=r.state->'baskets';count_toys:=(baskets->basket->>toy)::int;
 if count_toys<=0 then raise exception 'Nie ma już tych zabawek.';end if;
 select array_agg(value::int order by ord) into stash from jsonb_array_elements_text(p->'stash') with ordinality x(value,ord);stash[toy+1]:=stash[toy+1]+count_toys;
 r.state:=jsonb_set(r.state,array['players',idx::text,'stash'],to_jsonb(stash));r.state:=jsonb_set(r.state,array['baskets',basket::text,toy::text],'0');
 update public.toowee_collection_rooms set state=r.state,phase='place',revision=revision+1 where id=r.id;
 elsif p_action='put' then
 if r.phase<>'place' then raise exception 'Najpierw dobierz zabawki.';end if;
 toy:=(p_data->>'toy')::int;
 if r.state->>'layout'='board-v2' then
 cell:=(p_data->>'cell')::int;
 if toy is null or cell is null or toy not between 0 and 4 or cell not between 0 and 24 then raise exception 'Wybierz zabawkę i puste pole planszy.';end if;
 gameboard:=p->'board';
 if (gameboard->>cell)::int<>-1 then raise exception 'To pole jest już zajęte.';end if;
 select array_agg(value::int order by ord) into stash from jsonb_array_elements_text(p->'stash') with ordinality x(value,ord);
 if stash[toy+1]<=0 then raise exception 'Nie masz tej zabawki w schowku.';end if;
 stash[toy+1]:=stash[toy+1]-1;gameboard:=jsonb_set(gameboard,array[cell::text],to_jsonb(toy));
 p:=jsonb_set(p,'{stash}',to_jsonb(stash));
 -- Resolve overlapping goals in card order; consumed toys cannot score twice.
 for cycles in 1..12 loop
 matched:=false;
 for card in 0..2 loop
 c:=p->'cards'->card;positions:=public.toowee_collection_match(gameboard,c);
 if positions is not null then
 foreach position in array positions loop gameboard:=jsonb_set(gameboard,array[position::text],'-1');end loop;
 p:=jsonb_set(p,'{score}',to_jsonb((p->>'score')::int+(c->>'points')::int));p:=jsonb_set(p,'{completed}',to_jsonb((p->>'completed')::int+1));
 p:=jsonb_set(p,array['cards',card::text],public.toowee_collection_card());matched:=true;exit;
 end if;
 end loop;
 exit when not matched;
 end loop;
 p:=jsonb_set(p,'{board}',gameboard);r.state:=jsonb_set(r.state,array['players',idx::text],p);
 update public.toowee_collection_rooms set state=r.state,revision=revision+1 where id=r.id;
 else
 toy:=(p_data->>'toy')::int;card:=(p_data->>'card')::int;
 if toy is null or card is null or toy not between 0 and 4 or card not between 0 and 2 then raise exception 'Wybierz kartę i zabawkę.';end if;
 c:=p->'cards'->card;
 if c->>'id' is distinct from p_data->>'card_id' then raise exception 'Ta kolekcja została już ukończona.';end if;
 select array_agg(value::int order by ord) into stash from jsonb_array_elements_text(p->'stash') with ordinality x(value,ord);
 select array_agg(value::int order by ord) into have from jsonb_array_elements_text(c->'have') with ordinality x(value,ord);
 select array_agg(value::int order by ord) into need from jsonb_array_elements_text(c->'need') with ordinality x(value,ord);
 if stash[toy+1]<=0 or have[toy+1]>=need[toy+1] then raise exception 'Ta zabawka nie pasuje lub nie masz jej w schowku.';end if;
 stash[toy+1]:=stash[toy+1]-1;have[toy+1]:=have[toy+1]+1;
 p:=jsonb_set(p,'{stash}',to_jsonb(stash));c:=jsonb_set(c,'{have}',to_jsonb(have));
 if have=need then
 p:=jsonb_set(p,'{score}',to_jsonb((p->>'score')::int+(c->>'points')::int));p:=jsonb_set(p,'{completed}',to_jsonb((p->>'completed')::int+1));c:=public.toowee_collection_card();
 end if;
 p:=jsonb_set(p,array['cards',card::text],c);r.state:=jsonb_set(r.state,array['players',idx::text],p);
 update public.toowee_collection_rooms set state=r.state,revision=revision+1 where id=r.id;
 end if;
 elsif p_action='end_turn' then
 if r.phase not in ('draw','place') then raise exception 'Najpierw odpowiedz na pytania.';end if;
 perform public.toowee_collection_next(r.id);
 end if;
 end if;
 end if;
 select * into r from public.toowee_collection_rooms where id=r.id;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',nickname) order by joined_at,id),'[]') into players from public.toowee_collection_players where room_id=r.id;
 return jsonb_build_object('code',r.code,'lang',r.lang,'host',r.host_id=who,'me',pid,'status',r.status,'state',r.state,'players',players,'turn_no',r.turn_no,'rounds',r.rounds,'questions_per_turn',r.questions_per_turn,'q_no',r.q_no,'correct_count',r.correct_count,'phase',r.phase,'revision',r.revision,'deadline',r.deadline,'server_now',clock_timestamp(),
 'question',case when r.status='playing' and r.phase='question' and pid=(r.state->'players'->((r.turn_no-1)%jsonb_array_length(r.state->'players'))->>'id')::uuid then r.question-'solution' else null end,
 'feedback',(select jsonb_build_object('correct',a.correct,'prompt',a.prompt,'solution',a.solution,'answer',a.answer,'turn_no',a.turn_no,'q_no',a.q_no) from public.toowee_collection_answers a where a.room_id=r.id and a.player_id=pid order by a.turn_no desc,a.q_no desc limit 1));
end $$;
revoke all on function public.toowee_collection_match(jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.toowee_collection_card(),public.toowee_collection_baskets(),public.toowee_collection_question(jsonb),public.toowee_collection_next(uuid) from public,anon,authenticated;
revoke all on function public.toowee_collections(text,jsonb) from public;
grant execute on function public.toowee_collections(text,jsonb) to anon,authenticated;
commit;
