-- TooWee Languages: teacher-controlled Magic Dice links and saved results.
-- Run once in Supabase SQL Editor. Existing games and vocabulary are preserved.
begin;
create table if not exists public.toowee_dice_sessions (
 id uuid primary key default gen_random_uuid(),
 host_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null, code text not null unique default replace(gen_random_uuid()::text,'-',''),
 config jsonb not null, status text not null default 'playing' check(status in ('playing','finished')),
 created_at timestamptz not null default now(), finished_at timestamptz,
 expires_at timestamptz not null default now()+interval '7 days', unique(host_id,request_id)
);
create table if not exists public.toowee_dice_players (
 room_id uuid not null references public.toowee_dice_sessions(id) on delete cascade,
 id uuid not null default gen_random_uuid(), guest_hash text not null,
 name text not null, stats jsonb not null default '{}', revision integer not null default 0,
 finalized boolean not null default false, updated_at timestamptz not null default now(),
 primary key(room_id,id),unique(room_id,guest_hash)
);
alter table public.toowee_dice_sessions enable row level security;
alter table public.toowee_dice_players enable row level security;
revoke all on public.toowee_dice_sessions,public.toowee_dice_players from public,anon,authenticated;
create index if not exists toowee_dice_host_idx on public.toowee_dice_sessions(host_id,created_at desc);
create or replace function public.toowee_magic_dice(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare who uuid:=auth.uid(); room public.toowee_dice_sessions; player public.toowee_dice_players; host boolean; secret text; config jsonb; rows jsonb; snapshot jsonb; n integer;
begin
 if p_action='create' then
  if who is null or not exists(select 1 from public.toowee_accounts where id=who and role in ('teacher','admin')) then raise exception 'Wybierz konto nauczyciela.';end if;
  config:=p_data->'config';
  if config is null or coalesce(config->>'language','') not in ('Japanese','English','Spanish') or coalesce((config->>'size')::integer,0) not in (3,4,5) or coalesce((config->>'quota')::integer,0) not between 1 and 10 or coalesce(config->>'direction','') not in ('toPolish','toTarget') or jsonb_typeof(config->'words') is distinct from 'array' then raise exception 'Nieprawidłowe ustawienia gry.';end if;
  n:=jsonb_array_length(config->'words');if n<2 or n>2000 or length(config::text)>4000000 then raise exception 'Wybierz od 2 do 2000 słówek.';end if;
  if exists(select 1 from jsonb_array_elements(config->'words') w where coalesce(length(trim(w->>'word')),0) not between 1 and 2000 or coalesce(length(trim(w->>'translation')),0) not between 1 and 2000) then raise exception 'Nieprawidłowe słówka.';end if;
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
  if p_action='finish' and room.status<>'finished' then update public.toowee_dice_sessions set status='finished',finished_at=now() where id=room.id returning * into room;end if;
  if p_action not in ('create','load','finish') then raise exception 'Niedozwolona operacja prowadzącego.';end if;
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
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'stats',p.stats,'finalized',p.finalized,'revision',p.revision,'updated_at',p.updated_at) order by p.name),'[]') into rows from public.toowee_dice_players p where p.room_id=room.id and (host or p.id=player.id);
 return jsonb_build_object('code',room.code,'host',host,'status',room.status,'config',case when room.status='playing' then room.config else null end,'finished_at',room.finished_at,'players',rows);
end;$$;
revoke all on function public.toowee_magic_dice(text,jsonb) from public;
grant execute on function public.toowee_magic_dice(text,jsonb) to anon,authenticated;
notify pgrst,'reload schema';
commit;
