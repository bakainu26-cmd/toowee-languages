-- TooWee: Mój świat. Uruchom całość w Supabase → SQL Editor → Run.
begin;
create table if not exists public.world_profiles (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 coins integer not null default 0 check(coins>=0),
 owned text[] not null default array['shirt_lilac'],
 outfit text not null default 'shirt_lilac', accessory text not null default 'none',
 x integer not null default 6 check(x between 0 and 11),
 y integer not null default 6 check(y between 0 and 7)
);
alter table public.world_profiles add column if not exists shelf text[] not null default '{}';
create table if not exists public.world_days (
 owner_id uuid not null references auth.users(id) on delete cascade,
 day date not null, lang text not null check(lang in ('English','Japanese','Spanish')),
 learned_ids uuid[] not null default '{}', reviewed_ids uuid[] not null default '{}',
 pairs_done boolean not null default false, seconds integer not null default 0,
 learned_paid boolean not null default false, review_paid boolean not null default false,
 pairs_paid boolean not null default false, time_paid integer not null default 0,
 primary key(owner_id,day,lang)
);
create table if not exists public.world_events (
 owner_id uuid not null references auth.users(id) on delete cascade,
 event_id uuid not null, created_at timestamptz not null default now(),
 primary key(owner_id,event_id)
);
alter table public.world_profiles enable row level security;
alter table public.world_days enable row level security;
alter table public.world_events enable row level security;
revoke all on public.world_profiles,public.world_days,public.world_events from anon,authenticated;
grant select on public.world_profiles,public.world_days to authenticated;
drop policy if exists world_profile_read on public.world_profiles;
create policy world_profile_read on public.world_profiles for select to authenticated using(owner_id=auth.uid());
drop policy if exists world_day_read on public.world_days;
create policy world_day_read on public.world_days for select to authenticated using(owner_id=auth.uid());
create or replace function public.toowee_world(p_action text,p_lang text,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 who uuid:=auth.uid(); today date:=(now() at time zone 'Europe/Warsaw')::date;
 profile public.world_profiles%rowtype; daily public.world_days%rowtype;
 item text; price integer; category text; valid_ids uuid[]; gain integer:=0;
 seconds_delta integer; blocks integer; inserted integer;
begin
 if who is null then raise exception 'Zaloguj się.'; end if;
 if p_lang is null or p_lang not in ('English','Japanese','Spanish') then raise exception 'Wybierz język.'; end if;
 insert into public.world_profiles(owner_id) values(who) on conflict do nothing;
 select * into profile from public.world_profiles where owner_id=who for update;
 insert into public.world_days(owner_id,day,lang) values(who,today,p_lang) on conflict do nothing;
 select * into daily from public.world_days where owner_id=who and day=today and lang=p_lang;
 if p_action='position' then
  profile.x:=greatest(0,least(11,(p_data->>'x')::integer));
  profile.y:=greatest(0,least(7,(p_data->>'y')::integer));
 elsif p_action in ('buy','equip') then
  item:=p_data->>'item';
  case item
   when 'shirt_lilac' then price:=0;category:='outfit';
   when 'shirt_mint' then price:=25;category:='outfit';
   when 'shirt_coral' then price:=25;category:='outfit';
   when 'hoodie_night' then price:=60;category:='outfit';
   when 'hat_sun' then price:=40;category:='accessory';
   when 'headphones' then price:=50;category:='accessory';
   when 'sofi_sleep' then price:=40;category:='figurine';
   when 'sofi_box' then price:=60;category:='figurine';
   when 'sofi_book' then price:=90;category:='figurine';
   when 'sofi_wizard' then price:=120;category:='figurine';
   when 'sofi_magda' then price:=180;category:='figurine';
   when 'none' then price:=0;category:='accessory';
   else raise exception 'Nieznany przedmiot.';
  end case;
  if not(item=any(profile.owned)) and item<>'none' then
   if p_action<>'buy' then raise exception 'Najpierw kup ten przedmiot.'; end if;
   if profile.coins<price then raise exception 'Masz za mało monet.'; end if;
   profile.coins:=profile.coins-price;profile.owned:=array_append(profile.owned,item);
  end if;
  if category='outfit' then profile.outfit:=item;elsif category='accessory' then profile.accessory:=item;end if;
 elsif p_action='display' then
  item:=p_data->>'item';
  if item is null or item not in ('sofi_sleep','sofi_box','sofi_book','sofi_wizard','sofi_magda') then raise exception 'Nieznana figurka.';end if;
  if not(item=any(profile.owned)) then raise exception 'Najpierw kup tę figurkę.';end if;
  if item=any(profile.shelf) then profile.shelf:=array_remove(profile.shelf,item);
  else
   if cardinality(profile.shelf)>=3 then raise exception 'Na półce są 3 figurki. Schowaj jedną, aby ustawić inną.';end if;
   profile.shelf:=array_append(profile.shelf,item);
  end if;
 elsif p_action='activity' then
  if jsonb_array_length(coalesce(p_data->'ids','[]'))>100 then raise exception 'Za dużo słówek w jednym zapisie.';end if;
  insert into public.world_events(owner_id,event_id) values(who,(p_data->>'event_id')::uuid) on conflict do nothing;
  get diagnostics inserted=row_count;
  if inserted>0 then
   select coalesce(array_agg(distinct w.id),'{}') into valid_ids
   from public.vocabulary_words w
   where w.owner_id=who and w.lang=p_lang and w.id in
    (select value::uuid from jsonb_array_elements_text(coalesce(p_data->'ids','[]')));
   if p_data->>'kind' in ('learn','review') then
    -- Only words successfully saved in vocabulary_progress can advance a mission.
    select coalesce(array_agg(v.id),'{}') into valid_ids from unnest(valid_ids) v(id)
    join public.vocabulary_progress vp on vp.owner_id=who and vp.word_id=v.id
    where vp.stage>0 and vp.last_reviewed_at>=now()-interval '1 day';
    if p_data->>'kind'='learn' then
     select array_agg(distinct id) into daily.learned_ids from unnest(daily.learned_ids||valid_ids) v(id);
     daily.learned_ids:=coalesce(daily.learned_ids,'{}');
    else
     select array_agg(distinct id) into daily.reviewed_ids from unnest(daily.reviewed_ids||valid_ids) v(id);
     daily.reviewed_ids:=coalesce(daily.reviewed_ids,'{}');
    end if;
   elsif p_data->>'kind'='pairs' and cardinality(valid_ids)>=6 then daily.pairs_done:=true;
   end if;
   if p_data->>'kind' in ('learn','review','practice') then
    seconds_delta:=greatest(0,least(3600,coalesce((p_data->>'seconds')::integer,0),greatest(0,coalesce((p_data->>'answers')::integer,0))*30));
    daily.seconds:=least(3600,daily.seconds+seconds_delta);
   end if;
   if cardinality(daily.learned_ids)>=10 and not daily.learned_paid then gain:=gain+40;daily.learned_paid:=true;end if;
   if cardinality(daily.reviewed_ids)>=5 and not daily.review_paid then gain:=gain+25;daily.review_paid:=true;end if;
   if daily.pairs_done and not daily.pairs_paid then gain:=gain+20;daily.pairs_paid:=true;end if;
   blocks:=least(12,daily.seconds/300);
   gain:=gain+greatest(0,blocks-daily.time_paid)*10;daily.time_paid:=blocks;
   profile.coins:=profile.coins+gain;
  end if;
 elsif p_action<>'load' then raise exception 'Nieznana operacja.';
 end if;
 update public.world_profiles set coins=profile.coins,owned=profile.owned,shelf=profile.shelf,outfit=profile.outfit,accessory=profile.accessory,x=profile.x,y=profile.y where owner_id=who;
 update public.world_days set learned_ids=daily.learned_ids,reviewed_ids=daily.reviewed_ids,pairs_done=daily.pairs_done,seconds=daily.seconds,learned_paid=daily.learned_paid,review_paid=daily.review_paid,pairs_paid=daily.pairs_paid,time_paid=daily.time_paid where owner_id=who and day=today and lang=p_lang;
 return jsonb_build_object('profile',to_jsonb(profile)-'owner_id','daily',to_jsonb(daily)-'owner_id','earned',gain);
end $$;
revoke all on function public.toowee_world(text,text,jsonb) from public;
grant execute on function public.toowee_world(text,text,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;

-- Zapis fiszek misji. Można uruchomić ponownie, bez usuwania postępu.
begin;
create table if not exists public.world_study_sessions (
 owner_id uuid not null references auth.users(id) on delete cascade,
 lang text not null check(lang in ('English','Japanese','Spanish')),
 mode text not null check(mode in ('learn','review')),
 payload jsonb,
 revision integer not null default 0,
 updated_at timestamptz not null default now(),
 primary key(owner_id,lang,mode)
);
alter table public.world_study_sessions enable row level security;
revoke all on public.world_study_sessions from anon,authenticated;
grant select on public.world_study_sessions to authenticated;
drop policy if exists world_study_read on public.world_study_sessions;
create policy world_study_read on public.world_study_sessions for select to authenticated using(owner_id=auth.uid());
create or replace function public.toowee_world_study(p_lang text,p_mode text,p_payload jsonb default null,p_revision integer default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare who uuid:=auth.uid();saved public.world_study_sessions%rowtype;
begin
 if who is null then raise exception 'Zaloguj się.';end if;
 if p_lang is null or p_lang not in ('English','Japanese','Spanish') or p_mode is null or p_mode not in ('learn','review') then raise exception 'Nieprawidłowy tryb misji.';end if;
 insert into public.world_study_sessions(owner_id,lang,mode) values(who,p_lang,p_mode) on conflict do nothing;
 select * into saved from public.world_study_sessions where owner_id=who and lang=p_lang and mode=p_mode for update;
 if p_payload is not null then
  if p_revision is null or p_revision<>saved.revision then raise exception 'Sesja zmieniła się na innym urządzeniu. Wróć na mapę i otwórz misję ponownie.';end if;
  if jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>200000 then raise exception 'Nieprawidłowy zapis sesji.';end if;
  update public.world_study_sessions set payload=p_payload,revision=revision+1,updated_at=now() where owner_id=who and lang=p_lang and mode=p_mode returning * into saved;
 end if;
 return jsonb_build_object('state',saved.payload,'revision',saved.revision);
end $$;
revoke all on function public.toowee_world_study(text,text,jsonb,integer) from public;
grant execute on function public.toowee_world_study(text,text,jsonb,integer) to authenticated;
notify pgrst,'reload schema';
commit;
