-- TooWee: role, zaproszenia i prywatne materiały nauczyciela.
-- Uruchom całość w Supabase SQL Editor. Nie usuwa istniejących kont ani postępu.
begin;
create table if not exists public.toowee_accounts (
 id uuid primary key references auth.users(id) on delete cascade,
 role text not null check(role in ('student','teacher','admin')),
 display_name text not null default '',created_at timestamptz not null default now()
);
alter table public.toowee_accounts drop constraint if exists toowee_accounts_role_check;
alter table public.toowee_accounts add constraint toowee_accounts_role_check check(role in ('student','teacher','admin'));
create table if not exists public.toowee_connections (
 teacher_id uuid not null references auth.users(id) on delete cascade,
 student_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),primary key(teacher_id,student_id),check(teacher_id<>student_id)
);
create table if not exists public.toowee_invites (
 token text primary key,teacher_id uuid not null references auth.users(id) on delete cascade,
 expires_at timestamptz not null default now()+interval '7 days',accepted_by uuid references auth.users(id) on delete cascade
);
create table if not exists public.toowee_assignments (
 teacher_id uuid not null references auth.users(id) on delete cascade,
 student_id uuid not null references auth.users(id) on delete cascade,
 source_word_id uuid not null,word_id uuid not null unique references public.vocabulary_words(id) on delete cascade,
 created_at timestamptz not null default now(),primary key(teacher_id,student_id,source_word_id)
);
alter table public.toowee_accounts enable row level security;
alter table public.toowee_connections enable row level security;
alter table public.toowee_invites enable row level security;
alter table public.toowee_assignments enable row level security;
revoke all on public.toowee_accounts,public.toowee_connections,public.toowee_invites,public.toowee_assignments from public,anon,authenticated;
alter table public.vocabulary_words add column if not exists example text not null default '';
create or replace function public.toowee_portal(p_action text default 'load',p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare who uuid:=auth.uid(); me public.toowee_accounts%rowtype; other uuid; code text; folder uuid; copied uuid; src record; n integer:=0; result jsonb; oldrole text;
begin
 if who is null then raise exception 'Zaloguj się.';end if;
 -- A role is a workspace type, never an entitlement to a paid subscription or administrator access.
 insert into public.toowee_accounts(id,role,display_name)
 select id,case when raw_user_meta_data->>'role'='teacher' then 'teacher' else 'student' end,left(coalesce(raw_user_meta_data->>'display_name','Użytkownik'),100) from auth.users where id=who on conflict do nothing;
 select * into me from public.toowee_accounts where id=who for update;
 if p_action='become_teacher' then
  update public.toowee_accounts set role=case when role='admin' then 'admin' else 'teacher' end where id=who returning * into me;
 elsif p_action='invite' then
  if me.role not in ('teacher','admin') then raise exception 'Tylko nauczyciel może zapraszać uczniów.';end if;
  code:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  insert into public.toowee_invites(token,teacher_id) values(code,who);
  return jsonb_build_object('token',code,'expires_days',7);
 elsif p_action='accept' then
  code:=trim(p_data->>'token');
  select teacher_id into other from public.toowee_invites where token=code and expires_at>now() and accepted_by is null for update;
  if other is null or other=who then raise exception 'Zaproszenie jest nieprawidłowe, wykorzystane lub wygasło.';end if;
  insert into public.toowee_connections(teacher_id,student_id) values(other,who) on conflict do nothing;
  update public.toowee_invites set accepted_by=who where token=code;
 elsif p_action='disconnect' then
  other:=(p_data->>'id')::uuid;
  delete from public.toowee_connections where (teacher_id=who and student_id=other) or (student_id=who and teacher_id=other);
 elsif p_action='assign' then
  other:=(p_data->>'student_id')::uuid;
  if me.role not in ('teacher','admin') or not exists(select 1 from public.toowee_connections where teacher_id=who and student_id=other) then raise exception 'Uczeń nie jest połączony z Twoim kontem.';end if;
  if p_data->>'lang' not in ('English','Japanese','Spanish') or p_data->>'lang' is null then raise exception 'Wybierz język.';end if;
  -- Lock the connection: a concurrent disconnect cannot race with an assignment.
  perform 1 from public.toowee_connections where teacher_id=who and student_id=other for update;
  if not found then raise exception 'Połączenie z uczniem zostało usunięte.';end if;
  for src in select w.* from public.vocabulary_words w where w.owner_id=who and w.lang=p_data->>'lang' and (nullif(p_data->>'folder_id','') is null or w.folder_id=(p_data->>'folder_id')::uuid)
    and not exists(select 1 from public.toowee_assignments a where a.teacher_id=who and a.student_id=other and a.source_word_id=w.id) limit 500
  loop
   if folder is null then insert into public.vocabulary_folders(owner_id,name,lang) values(other,left('Od: '||me.display_name||' · '||coalesce(nullif(p_data->>'name',''),'Materiały z lekcji'),200),p_data->>'lang') returning id into folder;end if;
   insert into public.vocabulary_words(owner_id,lang,word,reading,translation,example,folder_id) values(other,src.lang,src.word,src.reading,src.translation,src.example,folder) returning id into copied;
   insert into public.toowee_assignments(teacher_id,student_id,source_word_id,word_id) values(who,other,src.id,copied);
   n:=n+1;
  end loop;
  return jsonb_build_object('assigned',n);
 elsif p_action='progress' then
  other:=(p_data->>'student_id')::uuid;
  if me.role not in ('teacher','admin') or not exists(select 1 from public.toowee_connections where teacher_id=who and student_id=other) then raise exception 'Brak dostępu do postępu tego ucznia.';end if;
  select coalesce(jsonb_agg(jsonb_build_object('word',w.word,'reading',w.reading,'translation',w.translation,'lang',w.lang,'stage',coalesce(vp.stage,0),'reviews',coalesce(vp.reviews,0),'due_at',vp.due_at,'last_reviewed_at',vp.last_reviewed_at) order by w.word),'[]') into result
  from public.toowee_assignments a join public.vocabulary_words w on w.id=a.word_id and w.owner_id=other left join public.vocabulary_progress vp on vp.owner_id=other and vp.word_id=a.word_id where a.teacher_id=who and a.student_id=other;
  return jsonb_build_object('words',result);
 elsif p_action<>'load' then raise exception 'Nieznana operacja.';end if;
 return jsonb_build_object('account',to_jsonb(me)-'id',
  'students',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',a.display_name)),'[]') from public.toowee_connections c join public.toowee_accounts a on a.id=c.student_id where c.teacher_id=who),
  'teachers',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',a.display_name)),'[]') from public.toowee_connections c join public.toowee_accounts a on a.id=c.teacher_id where c.student_id=who),
  'sources',(select coalesce(jsonb_agg(jsonb_build_object('word_id',s.word_id,'teacher_id',s.teacher_id,'teacher_name',a.display_name)),'[]') from public.toowee_assignments s join public.toowee_accounts a on a.id=s.teacher_id where s.student_id=who));
end $$;
revoke all on function public.toowee_portal(text,jsonb) from public;
grant execute on function public.toowee_portal(text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
