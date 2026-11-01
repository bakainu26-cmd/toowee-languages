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
