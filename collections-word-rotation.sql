-- Kolekcje: najpierw wszystkie słowa, potem kolejna losowa kolejka.
-- Uruchom po collections_live_setup.sql. Nie usuwa wyników ani słownictwa.
begin;
create table if not exists public.toowee_collection_word_bags(
 room_id uuid not null references public.toowee_collection_rooms(id) on delete cascade,
 player_id uuid not null, seen text[] not null default '{}', last_key text,
 primary key(room_id,player_id)
);
alter table public.toowee_collection_word_bags enable row level security;
revoke all on public.toowee_collection_word_bags from public,anon,authenticated;
create or replace function public.toowee_collection_draw(pool jsonb,rid uuid,pid uuid) returns jsonb
language plpgsql set search_path=public as $$
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
 -- Build distractors from the complete pool, including already tested words.
 select jsonb_agg(label order by random()) into choices from (
 select item->>'translation' as label union all
 (select distinct value->>'translation' as label from jsonb_array_elements(pool) where value->>'translation'<>item->>'translation' order by label limit 3)
 ) answers;
 return jsonb_build_object('prompt',item->>'word','reading',item->>'reading','options',choices,'solution',item->>'translation');
end $$;
revoke all on function public.toowee_collection_draw(jsonb,uuid,uuid) from public,anon,authenticated;

create or replace function public.toowee_collection_live_cycle(rid uuid,cycle_number int) returns void language plpgsql set search_path=public as $$
declare r public.toowee_collection_rooms%rowtype;player jsonb;
begin
 select * into r from public.toowee_collection_rooms where id=rid for update;
 r.state:=jsonb_set(jsonb_set(r.state,'{cycle}',to_jsonb(cycle_number)),'{draw_index}','0')-'turn_order';
 r.state:=public.toowee_collection_balance(r.state);
 for player in select value from jsonb_array_elements(r.state->'players') loop
 insert into public.toowee_collection_quiz(room_id,player_id,cycle,question,deadline)
 values(rid,(player->>'id')::uuid,cycle_number,public.toowee_collection_draw(r.words,rid,(player->>'id')::uuid)||jsonb_build_object('id',gen_random_uuid()),case when r.seconds>0 then clock_timestamp()+make_interval(secs=>r.seconds) end)
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
 update public.toowee_collection_quiz set question_started_at=clock_timestamp(),q_no=q_no+1,question=public.toowee_collection_draw(r.words,rid,pid)||jsonb_build_object('id',gen_random_uuid()),review=false,review_until=null,deadline=case when r.seconds>0 then clock_timestamp()+make_interval(secs=>r.seconds) end where room_id=rid and player_id=pid and cycle=q.cycle;
 end if;
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
 update public.toowee_collection_rooms set state=r.state,turn_no=turn_no+1,q_no=1,correct_count=0,phase='question',question=public.toowee_collection_draw(words,rid,'00000000-0000-0000-0000-000000000000'::uuid),deadline=case when seconds>0 then clock_timestamp()+make_interval(secs=>seconds) end,revision=revision+1 where id=rid;
end $$;
commit;
