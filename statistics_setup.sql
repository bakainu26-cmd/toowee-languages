-- TooWee: trwałe sesje fiszek i statystyki uczniów/gier.
-- Uruchamiaj po accounts_setup.sql oraz multiplayer_setup.sql.
begin;
create table if not exists public.toowee_study_history (
 id uuid primary key, owner_id uuid not null references auth.users(id) on delete cascade,
 lang text not null check(lang in ('English','Japanese','Spanish')),mode text not null check(mode in ('learn','review')),
 started_at timestamptz not null,finished_at timestamptz not null default now(),seconds integer not null check(seconds between 0 and 86400),
 attempts integer not null check(attempts between 0 and 100000)
);
create table if not exists public.toowee_study_history_words (
 session_id uuid not null references public.toowee_study_history(id) on delete cascade,
 word_id uuid not null references public.vocabulary_words(id) on delete cascade,known boolean not null,
 primary key(session_id,word_id)
);
create table if not exists public.toowee_game_students (
 room_id uuid not null,player_id uuid not null,profile_id uuid not null references public.toowee_student_profiles(id) on delete cascade,
 primary key(room_id,player_id),foreign key(room_id,player_id) references public.sophie_participants(room_id,player_id) on delete cascade
);
-- Account matches are stored once so disconnecting later does not erase past game attribution.
insert into public.toowee_game_students(room_id,player_id,profile_id)
 select r.id,p.player_id,sp.id from public.sophie_rooms r join public.sophie_participants p on p.room_id=r.id
 join public.toowee_student_profiles sp on sp.owner_id=r.host_id and sp.student_id=p.account_id
 join public.toowee_connections c on c.teacher_id=sp.owner_id and c.student_id=sp.student_id on conflict do nothing;
create or replace function public.toowee_match_game_student() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into public.toowee_game_students(room_id,player_id,profile_id)
 select new.room_id,new.player_id,sp.id from public.toowee_student_profiles sp join public.sophie_rooms r on r.host_id=sp.owner_id and r.id=new.room_id
 join public.toowee_connections c on c.teacher_id=sp.owner_id and c.student_id=sp.student_id where sp.student_id=new.account_id on conflict do nothing;
 return new;
end $$;
revoke all on function public.toowee_match_game_student() from public,anon,authenticated;
drop trigger if exists toowee_match_game_student on public.sophie_participants;
create trigger toowee_match_game_student after insert or update of account_id on public.sophie_participants for each row execute function public.toowee_match_game_student();
alter table public.toowee_study_history enable row level security;
alter table public.toowee_study_history_words enable row level security;
alter table public.toowee_game_students enable row level security;
revoke all on public.toowee_study_history,public.toowee_study_history_words,public.toowee_game_students from public,anon,authenticated;
create index if not exists toowee_study_history_owner_date on public.toowee_study_history(owner_id,finished_at desc);
create or replace function public.toowee_statistics(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
#variable_conflict use_variable
declare who uuid:=auth.uid();profile public.toowee_student_profiles%rowtype;room public.sophie_rooms%rowtype;
 pid uuid;words uuid[];item jsonb;sid uuid; result jsonb; lang text; personal boolean;
begin
 if who is null then raise exception 'Zaloguj się.';end if;
 -- History must reconcile abandoned rooms even when nobody reopens the game.
 if p_action in ('games','profile','game_detail','assign_game') then
  update public.sophie_rooms set status='finished',finished_at=coalesce(finished_at,clock_timestamp())
   where host_id=who and status<>'finished'
   and (expires_at<=clock_timestamp() or host_seen_at is null or host_seen_at<clock_timestamp()-interval '2 minutes');
 end if;
 if p_action='record_study' then
  sid:=(p_data->>'id')::uuid;
  if exists(select 1 from public.toowee_study_history where id=sid) then
   if not exists(select 1 from public.toowee_study_history where id=sid and owner_id=who) then raise exception 'Brak dostępu do sesji.';end if;
   return jsonb_build_object('saved',true);
  end if;
  if jsonb_typeof(p_data->'words') is distinct from 'array' or jsonb_array_length(p_data->'words') not between 1 and 1000 then raise exception 'Nieprawidłowa sesja fiszek.';end if;
  lang:=p_data->>'lang';
  for item in select value from jsonb_array_elements(p_data->'words') loop
   if not exists(select 1 from public.vocabulary_words where id=(item->>'word_id')::uuid and owner_id=who and vocabulary_words.lang=lang) or jsonb_typeof(item->'known') is distinct from 'boolean' then raise exception 'Sesja zawiera cudze lub nieprawidłowe słówka.';end if;
  end loop;
  insert into public.toowee_study_history(id,owner_id,lang,mode,started_at,seconds,attempts)
   values(sid,who,lang,p_data->>'mode',least(now(),greatest(now()-interval '7 days',(p_data->>'started_at')::timestamptz)),(p_data->>'seconds')::integer,(p_data->>'attempts')::integer);
  for item in select value from jsonb_array_elements(p_data->'words') loop
   insert into public.toowee_study_history_words values(sid,(item->>'word_id')::uuid,(item->>'known')::boolean) on conflict do nothing;
  end loop;
  return jsonb_build_object('saved',true);
 elsif p_action in ('game_detail','assign_game') then
  select * into room from public.sophie_rooms where code=upper(trim(p_data->>'code'));
  if not found or room.host_id<>who then raise exception 'Brak dostępu do wyników tej gry.';end if;
  if room.status<>'finished' then raise exception 'Statystyki szczegółowe są dostępne po zakończeniu gry.';end if;
  if p_action='assign_game' then
   select * into profile from public.toowee_student_profiles where id=(p_data->>'profile_id')::uuid and owner_id=who;
   if not found then raise exception 'Brak dostępu do profilu.';end if;
   select player_id into pid from public.sophie_participants where room_id=room.id and public_id=(p_data->>'player_id')::uuid;
   if pid is null then raise exception 'Nie znaleziono gracza.';end if;
   insert into public.toowee_game_students values(room.id,pid,profile.id) on conflict(room_id,player_id) do update set profile_id=excluded.profile_id;
  end if;
  return jsonb_build_object('code',room.code,'finished_at',room.finished_at,'players',(select coalesce(jsonb_agg(jsonb_build_object(
   'id',p.public_id,'name',p.nickname,'score',public.sophie_game_score(room.id,p.player_id),
   'correct',(select count(*) from public.sophie_round_answers a where a.room_id=room.id and a.player_id=p.player_id and a.correct),
   'answered',(select count(*) from public.sophie_round_answers a where a.room_id=room.id and a.player_id=p.player_id),
   'profile_id',(select g.profile_id from public.toowee_game_students g where g.room_id=room.id and g.player_id=p.player_id),
   'mistakes',(select coalesce(jsonb_agg(jsonb_build_object('question',room.questions->((a.round-1)%jsonb_array_length(room.questions))->>'prompt','answer',room.questions->((a.round-1)%jsonb_array_length(room.questions))->'options'->((room.questions->((a.round-1)%jsonb_array_length(room.questions))->>'correct')::integer)) order by a.round),'[]') from public.sophie_round_answers a where a.room_id=room.id and a.player_id=p.player_id and not a.correct)
   ) order by public.sophie_game_score(room.id,p.player_id) desc),'[]') from public.sophie_participants p where p.room_id=room.id));
 elsif p_action='profile' then
  select * into profile from public.toowee_student_profiles where id=(p_data->>'profile_id')::uuid and owner_id=who;
  if not found or not exists(select 1 from public.toowee_accounts where id=who and role in ('teacher','admin')) then raise exception 'Brak dostępu do profilu ucznia.';end if;
  lang:=nullif(p_data->>'lang','');
  if profile.student_id=who then
   -- The teacher sees their own learning without creating duplicate word copies.
   select coalesce(array_agg(w.id),'{}') into words from public.vocabulary_words w where w.owner_id=who and (lang is null or w.lang=lang)
    and not exists(select 1 from public.toowee_material_sets ms join public.toowee_material_folders mf on mf.id=ms.folder_id where ms.set_id=w.folder_id and mf.profile_id is not null and mf.profile_id<>profile.id);
  else
  select coalesce(array_agg(w.id),'{}') into words from public.toowee_assignments a join public.vocabulary_words w on w.id=a.word_id and w.owner_id=profile.student_id
   where a.teacher_id=who and a.student_id=profile.student_id and exists(select 1 from public.toowee_connections c where c.teacher_id=who and c.student_id=profile.student_id) and (lang is null or w.lang=lang);
  end if;
  return jsonb_build_object('self',profile.student_id=who,'linked',profile.student_id is not null,'memory',(select jsonb_build_object('new',count(*) filter(where coalesce(v.stage,0)=0),'short',count(*) filter(where v.stage between 1 and 3),'long',count(*) filter(where v.stage>=4)) from public.vocabulary_words w left join public.vocabulary_progress v on v.word_id=w.id and v.owner_id=profile.student_id where w.id=any(words)),
   'difficult',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from (select w.word,w.reading,w.translation,v.lapses,v.reviews,v.last_reviewed_at from public.vocabulary_words w join public.vocabulary_progress v on v.word_id=w.id and v.owner_id=profile.student_id where w.id=any(words) and v.lapses>0 order by v.lapses desc,v.last_reviewed_at desc limit 100)t),
   'study',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from (select h.id,h.started_at,h.finished_at,h.mode,count(*) as words,count(*) filter(where hw.known) as known,count(*) filter(where not hw.known) as difficult from public.toowee_study_history h join public.toowee_study_history_words hw on hw.session_id=h.id where h.owner_id=profile.student_id and hw.word_id=any(words) group by h.id order by h.finished_at desc limit 100)t),
   'games',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from (select r.code,r.created_at,r.finished_at,r.lang,r.play_mode,p.public_id as player_id,p.nickname,public.sophie_game_score(r.id,p.player_id) as score,
    (select count(*) from public.sophie_round_answers a where a.room_id=r.id and a.player_id=p.player_id) as answered,
    (select count(*) from public.sophie_round_answers a where a.room_id=r.id and a.player_id=p.player_id and a.correct) as correct
    from public.sophie_rooms r join public.sophie_participants p on p.room_id=r.id left join public.toowee_game_students g on g.room_id=r.id and g.player_id=p.player_id
    where r.host_id=who and r.status='finished' and (lang is null or r.lang=lang) and (g.profile_id=profile.id or (g.profile_id is null and profile.student_id is not null and p.account_id=profile.student_id and (profile.student_id=who or exists(select 1 from public.toowee_connections c where c.teacher_id=who and c.student_id=profile.student_id)))) order by coalesce(r.finished_at,r.created_at) desc limit 100)t));
 elsif p_action='games' then
  if not exists(select 1 from public.toowee_accounts where id=who and role in ('teacher','admin')) then raise exception 'Tylko nauczyciel widzi historię gier.';end if;
  return jsonb_build_object('games',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from(select code,lang,play_mode,created_at,finished_at,(select count(*) from public.sophie_participants p where p.room_id=r.id) as players from public.sophie_rooms r where host_id=who and status='finished' order by coalesce(finished_at,created_at) desc limit 100)t));
 else raise exception 'Nieznana operacja statystyk.';end if;
end $$;
revoke all on function public.toowee_statistics(text,jsonb) from public,anon;
grant execute on function public.toowee_statistics(text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
