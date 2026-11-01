-- TooWee: Saszetki Sophie. Uruchom całość w Supabase SQL Editor.
-- Wymaga accounts_setup.sql i konfiguracji słownictwa. Nie zmienia monet świata.
begin;
create table if not exists public.sophie_rooms (
 id uuid primary key default gen_random_uuid(),host_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null,code text not null unique,status text not null default 'lobby' check(status in ('lobby','question','finished')),
 lang text not null,questions jsonb not null,round integer not null default 0,
 seconds integer not null default 30,deadline timestamptz,created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '24 hours',
 unique(host_id,request_id)
);
alter table public.sophie_rooms add column if not exists time_limit integer not null default 0 check(time_limit between 0 and 1800);
alter table public.sophie_rooms add column if not exists end_mode text not null default 'words' check(end_mode in ('words','timer'));
update public.sophie_rooms set end_mode='timer' where time_limit>0 and end_mode='words';
alter table public.sophie_rooms add column if not exists game_deadline timestamptz;
alter table public.sophie_rooms add column if not exists auto_at timestamptz;
create table if not exists public.sophie_players (
 room_id uuid not null references public.sophie_rooms(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,
 nickname text not null check(length(trim(nickname)) between 1 and 32),joined_at timestamptz not null default now(),last_seen timestamptz not null default now(),primary key(room_id,user_id)
);
create table if not exists public.sophie_answers (
 room_id uuid not null,user_id uuid not null,round integer not null,choice integer not null,correct boolean not null,
 base integer not null default 0,bonuses integer[] not null default '{}',pick integer,bonus integer not null default 0,
 primary key(room_id,user_id,round),foreign key(room_id,user_id) references public.sophie_players(room_id,user_id) on delete cascade
);
alter table public.sophie_rooms enable row level security;
alter table public.sophie_players enable row level security;
alter table public.sophie_answers enable row level security;
revoke all on public.sophie_rooms,public.sophie_players,public.sophie_answers from public,anon,authenticated;
create index if not exists sophie_rooms_host_idx on public.sophie_rooms(host_id,created_at desc);
-- Uczestnik może mieć konto albo prywatny klucz gościa. Stare wyniki zachowujemy.
create table if not exists public.sophie_participants (
 room_id uuid not null references public.sophie_rooms(id) on delete cascade,
 player_id uuid not null default gen_random_uuid(),account_id uuid references auth.users(id) on delete cascade,
 guest_hash text,nickname text not null check(length(trim(nickname)) between 1 and 32),
 joined_at timestamptz not null default now(),last_seen timestamptz not null default now(),credited integer not null default 0,
 primary key(room_id,player_id),unique(room_id,account_id),unique(room_id,guest_hash),
 check(account_id is not null or guest_hash is not null)
);
create table if not exists public.sophie_round_answers (
 room_id uuid not null,player_id uuid not null,round integer not null,choice integer not null,correct boolean not null,
 base integer not null default 0,bonuses integer[] not null default '{}',pick integer,bonus integer not null default 0,
 primary key(room_id,player_id,round),foreign key(room_id,player_id) references public.sophie_participants(room_id,player_id) on delete cascade
);
create table if not exists public.sophie_account_points (
 owner_id uuid primary key references auth.users(id) on delete cascade,points bigint not null default 0 check(points>=0)
);
insert into public.sophie_participants(room_id,player_id,account_id,nickname,joined_at,last_seen)
 select room_id,user_id,user_id,nickname,joined_at,last_seen from public.sophie_players on conflict do nothing;
insert into public.sophie_round_answers(room_id,player_id,round,choice,correct,base,bonuses,pick,bonus)
 select a.room_id,p.player_id,a.round,a.choice,a.correct,a.base,a.bonuses,a.pick,a.bonus from public.sophie_answers a
 join public.sophie_participants p on p.room_id=a.room_id and p.account_id=a.user_id on conflict do nothing;
alter table public.sophie_participants enable row level security;
alter table public.sophie_round_answers enable row level security;
alter table public.sophie_account_points enable row level security;
revoke all on public.sophie_participants,public.sophie_round_answers,public.sophie_account_points from public,anon,authenticated;
alter table public.sophie_participants add column if not exists public_id uuid not null default gen_random_uuid();
create unique index if not exists sophie_public_player_idx on public.sophie_participants(room_id,public_id);
alter table public.sophie_participants add column if not exists adjustment integer not null default 0;
alter table public.sophie_participants add column if not exists shield boolean not null default false;
alter table public.sophie_participants add column if not exists notice text not null default '';
alter table public.sophie_round_answers add column if not exists pack_events text[];
alter table public.sophie_round_answers add column if not exists event text not null default 'bonus';
alter table public.sophie_round_answers add column if not exists resolved boolean not null default true;
alter table public.sophie_round_answers add column if not exists effect_amount integer not null default 0;
alter table public.sophie_round_answers add column if not exists effect_message text not null default '';
create or replace function public.sophie_game_score(p_room uuid,p_player uuid) returns integer
language sql stable security definer set search_path=public,pg_temp as $$
 select greatest(0,coalesce(sum(a.base+a.bonus),0)+p.adjustment)::integer
 from public.sophie_participants p left join public.sophie_round_answers a on a.room_id=p.room_id and a.player_id=p.player_id
 where p.room_id=p_room and p.player_id=p_player group by p.adjustment;
$$;
revoke all on function public.sophie_game_score(uuid,uuid) from public,anon,authenticated;
create or replace function public.toowee_sophie(p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 who uuid:=auth.uid();room public.sophie_rooms%rowtype;answer public.sophie_round_answers%rowtype;
 pool jsonb;questions jsonb:='[]';q jsonb;item jsonb;choices jsonb;correct_index integer;
 victim uuid;victim_name text;victim_shield boolean;amount integer;kind text;credit_row record;
 advance boolean:=false;limit_seconds integer;mode text;
 n integer;requested integer;duration integer;direction text;rid uuid;roomcode text;nick text;
 pid uuid;secret text;secret_hash text;linked_account uuid;credited integer;game_score integer;delta integer;
 host boolean;member boolean;players integer;answered integer;settled integer;can_next boolean;expired boolean;selected integer;
begin
 if p_action='create' then
  if not exists(select 1 from public.toowee_accounts where id=who and role in ('teacher','admin')) then raise exception 'Tylko nauczyciel może tworzyć rozgrywki.';end if;
  -- Serialize creates per teacher and allow safe retry of the same request.
  perform 1 from public.toowee_accounts where id=who for update;
  rid:=(p_data->>'request_id')::uuid;
  select * into room from public.sophie_rooms where host_id=who and request_id=rid for update;
  if not found then
   if (select count(*) from public.sophie_rooms where host_id=who and status<>'finished' and expires_at>clock_timestamp())>=3 then raise exception 'Masz już 3 otwarte pokoje. Zakończ poprzednią grę.';end if;
   mode:=coalesce(p_data->>'end_mode',case when coalesce((p_data->>'time_limit')::integer,0)>0 then 'timer' else 'words' end);
   if mode not in ('words','timer') then raise exception 'Wybierz liczbę słówek albo timer.';end if;
   limit_seconds:=case when mode='timer' then (p_data->>'time_limit')::integer else 0 end;
   if mode='timer' and (limit_seconds is null or limit_seconds<60 or limit_seconds>1800) then raise exception 'Timer musi wynosić od 1 do 30 minut.';end if;
   requested:=case when mode='timer' then 1000 else (p_data->>'count')::integer end;duration:=(p_data->>'seconds')::integer;direction:=p_data->>'direction';
   if (mode='words' and (requested is null or requested not in (6,10,15,20,25))) or duration is null or duration not in (20,30,45,60) or direction is null or direction not in ('to_pl','from_pl') then raise exception 'Nieprawidłowe ustawienia gry.';end if;
   if p_data->>'lang' is null or p_data->>'lang' not in ('English','Japanese','Spanish') then raise exception 'Wybierz język materiałów.';end if;
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
   roomcode:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
   insert into public.sophie_rooms(host_id,request_id,code,lang,questions,seconds,time_limit,end_mode) values(who,rid,roomcode,p_data->>'lang',questions,duration,limit_seconds,mode) returning * into room;
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
 host:=coalesce(room.host_id=who,false);
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
 select count(*),count(*) filter(where not correct or (pick is not null and resolved)) into answered,settled from public.sophie_round_answers where room_id=room.id and round=room.round;
 can_next:=room.status='lobby' and players>0 or room.status='question' and (settled>=players and players>0 or clock_timestamp()>=room.deadline+interval '10 seconds');
 -- Any participant's refresh advances a due round. A teacher click is not required.
 if p_action in ('next','finish') and not host then raise exception 'Tylko prowadzący steruje rundami.';end if;
 if room.status='question' and room.game_deadline is not null and clock_timestamp()>=room.game_deadline then
  room.status:='finished';
  update public.sophie_rooms set status=room.status where id=room.id;
  if p_action in ('answer','pick','steal','ready','next') then p_action:='load';end if;
 end if;
 if room.status='question' and p_action in ('load','answer','pick','steal','ready','link') and clock_timestamp()>=coalesce(room.auto_at,room.deadline+interval '10 seconds') then
  advance:=true;
  if p_action in ('answer','pick','steal','ready') then p_action:='load';end if;
 end if;
 if p_action in ('next','finish') then
  if p_action='finish' then room.status:='finished';
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
   selected:=(p_data->>'choice')::integer;
   if selected is null or selected not between 0 and 3 then raise exception 'Wybierz jedną z czterech odpowiedzi.';end if;
   q:=room.questions->((room.round-1)%jsonb_array_length(room.questions));
   insert into public.sophie_round_answers(room_id,player_id,round,choice,correct,base,bonuses,pack_events) values(room.id,pid,room.round,selected,selected=(q->>'correct')::integer,case when selected=(q->>'correct')::integer then 100 else 0 end,array[20*(1+floor(random()*5)::integer),20*(1+floor(random()*5)::integer),20*(1+floor(random()*5)::integer)],array(select case floor(random()*20)::integer when 0 then 'lose' when 1 then 'lose' when 2 then 'super' when 3 then 'super' when 4 then 'steal' when 5 then 'steal' when 6 then 'steal' when 7 then 'shield' else 'bonus' end from generate_series(1,3)));
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
    update public.sophie_participants set shield=true,notice='Masz tarczę Sophie — zablokuje jedną kradzież.' where room_id=room.id and player_id=pid;
    update public.sophie_round_answers set effect_message='Tarcza Sophie! Chroni przed jedną kradzieżą. Tarcze nie sumują się.' where room_id=room.id and player_id=pid and round=room.round;
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
   select p.player_id,p.nickname,p.shield into victim,victim_name,victim_shield from public.sophie_participants p where p.room_id=room.id and p.public_id=(p_data->>'target')::uuid and p.player_id<>pid for update;
   if victim is null then raise exception 'Wybierz innego gracza z tego pokoju.';end if;
   if victim_shield then
    amount:=0;update public.sophie_participants set shield=false,notice='Twoja tarcza Sophie zablokowała kradzież!' where room_id=room.id and player_id=victim;
   else
    amount:=floor(public.sophie_game_score(room.id,victim)*0.20)::integer;
    update public.sophie_participants set adjustment=adjustment-amount,notice='Kocia psota! Ktoś ukradł 20% Twojej karmy: −'||amount||'.' where room_id=room.id and player_id=victim;
    update public.sophie_participants set adjustment=adjustment+amount where room_id=room.id and player_id=pid;
   end if;
   update public.sophie_round_answers set resolved=true,effect_amount=amount,effect_message=case when victim_shield then victim_name||' ma tarczę! Kradzież zablokowana, tarcza zużyta.' else 'Kradniesz 20% karmy gracza '||victim_name||': +'||amount||'!' end where room_id=room.id and player_id=pid and round=room.round;
  end if;
 elsif p_action='ready' then
  if host or room.status<>'question' or (p_data->>'round')::integer is distinct from room.round then raise exception 'Poczekaj na zakończenie swojej odpowiedzi.';end if;
  select * into answer from public.sophie_round_answers where room_id=room.id and player_id=pid and round=room.round;
  if not found and clock_timestamp()>=room.deadline then
   insert into public.sophie_round_answers(room_id,player_id,round,choice,correct) values(room.id,pid,room.round,-1,false) on conflict do nothing;
  elsif not found or answer.correct and (answer.pick is null or not answer.resolved) then raise exception 'Najpierw odpowiedz i rozlicz saszetkę.';end if;
  select count(*) filter(where not correct or (pick is not null and resolved)) into settled from public.sophie_round_answers where room_id=room.id and round=room.round;
  if settled>=players then advance:=true;end if;

 elsif p_action not in ('create','join','load','link') then raise exception 'Nieznana operacja gry.';end if;
 if advance then
  if room.end_mode='words' and room.round>=jsonb_array_length(room.questions) then room.status:='finished';
  else
   if room.round=0 and room.time_limit>0 then room.game_deadline:=clock_timestamp()+make_interval(secs=>room.time_limit);end if;
   room.round:=room.round+1;room.status:='question';room.deadline:=least(clock_timestamp()+make_interval(secs=>room.seconds),room.game_deadline);
   room.auto_at:=least(room.deadline+interval '10 seconds',room.game_deadline);
  end if;
  update public.sophie_rooms set status=room.status,round=room.round,deadline=room.deadline,auto_at=room.auto_at,game_deadline=room.game_deadline where id=room.id;
 end if;
 select * into answer from public.sophie_round_answers where room_id=room.id and player_id=pid and round=room.round;
 select count(*),count(*) filter(where not correct or (pick is not null and resolved)) into answered,settled from public.sophie_round_answers where room_id=room.id and round=room.round;
 can_next:=room.status='lobby' and players>0 or room.status='question' and (settled>=players and players>0 or clock_timestamp()>=room.deadline+interval '10 seconds');
 if room.status='question' and players>0 and settled>=players then
  room.auto_at:=least(coalesce(room.auto_at,room.deadline+interval '10 seconds'),clock_timestamp()+interval '1 second',room.game_deadline);
  update public.sophie_rooms set auto_at=room.auto_at where id=room.id;
 end if;
 q:=case when room.round>0 then room.questions->((room.round-1)%jsonb_array_length(room.questions)) else null end;
 -- Synchronize both gains and losses, including a theft victim, exactly once.
 for credit_row in select p.player_id,p.account_id,p.credited from public.sophie_participants p where p.room_id=room.id and p.account_id is not null order by p.account_id for update loop
  game_score:=public.sophie_game_score(room.id,credit_row.player_id);delta:=game_score-credit_row.credited;
  if delta<>0 then
   insert into public.sophie_account_points(owner_id,points) values(credit_row.account_id,greatest(delta,0)) on conflict(owner_id) do update set points=greatest(0,public.sophie_account_points.points+delta);
   update public.sophie_participants set credited=game_score where room_id=room.id and player_id=credit_row.player_id;
  end if;
 end loop;

 return jsonb_build_object('surprises',true,'notice',(select notice from public.sophie_participants where room_id=room.id and player_id=pid),'automatic',true,'auto_at',room.auto_at,'time_limit',room.time_limit,'game_deadline',room.game_deadline,'code',room.code,'host',host,'guest',who is null,'personal_points',case when who is not null and member then coalesce((select points from public.sophie_account_points where owner_id=who),0) else null end,'status',room.status,'round',room.round,'end_mode',room.end_mode,'bank_size',jsonb_array_length(room.questions),'total',case when room.end_mode='words' then jsonb_array_length(room.questions) else null end,'lang',room.lang,'deadline',room.deadline,'server_now',clock_timestamp(),'players',players,'answered',answered,'settled',settled,'can_next',can_next,
  'question',case when q is null then null else q-'correct' end,
  'solution',case when host or answer.player_id is not null or room.status='finished' or room.deadline<=clock_timestamp() then q->'options'->((q->>'correct')::integer) else null end,
  'answer',case when answer.player_id is null then null else jsonb_build_object('choice',answer.choice,'correct',answer.correct,'base',answer.base,'pick',answer.pick,'bonus',answer.bonus,'effect',jsonb_build_object('kind',answer.event,'resolved',answer.resolved,'amount',answer.effect_amount,'message',answer.effect_message)) end,
  'ranking',(select coalesce(jsonb_agg(jsonb_build_object('id',public_id,'shield',shield,'name',nickname,'score',score,'correct',correct,'me',player_id=pid) order by score desc,joined_at),'[]') from (
   select p.player_id,p.public_id,p.shield,p.nickname,p.joined_at,public.sophie_game_score(room.id,p.player_id) as score,(select count(*) from public.sophie_round_answers a where a.room_id=p.room_id and a.player_id=p.player_id and a.correct) as correct from public.sophie_participants p where p.room_id=room.id

  ) standings));
end $$;
revoke all on function public.toowee_sophie(text,jsonb) from public;
grant execute on function public.toowee_sophie(text,jsonb) to anon,authenticated;
notify pgrst,'reload schema';
commit;
