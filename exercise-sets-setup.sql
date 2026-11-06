-- TooWee Languages: reusable private/public exercise sets for teachers.
-- Requires accounts_setup.sql and vocabulary_setup.sql, with language support.
begin;
create table if not exists public.toowee_exercise_sets(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id) on delete cascade,
 title text not null,description text not null default '',lang text not null,
 cards jsonb not null default '[]',is_public boolean not null default false,
 source_id uuid references public.toowee_exercise_sets(id) on delete set null,
 revision integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists public.toowee_exercise_materials(
 set_id uuid primary key references public.toowee_exercise_sets(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 folder_id uuid not null references public.vocabulary_folders(id) on delete cascade,revision integer not null
);
alter table public.toowee_exercise_sets enable row level security;
alter table public.toowee_exercise_materials enable row level security;
revoke all on public.toowee_exercise_sets,public.toowee_exercise_materials from public,anon,authenticated;
create index if not exists toowee_exercises_owner_idx on public.toowee_exercise_sets(owner_id,updated_at desc);
create index if not exists toowee_exercises_public_idx on public.toowee_exercise_sets(lang,updated_at desc) where is_public;
create or replace function public.toowee_exercise_sets(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare who uuid:=auth.uid();s public.toowee_exercise_sets; item jsonb; cards jsonb; wrong jsonb; names text[]; result jsonb; fid uuid; req uuid; expected integer; page integer; v_lang text; v_title text; v_description text; v_public boolean;
begin
 if who is null or not exists(select 1 from public.toowee_accounts where id=who and role in ('teacher','admin')) then raise exception 'Zestawy są dostępne dla nauczycieli.';end if;
 if p_action='import_vocabulary' then
  select name,lang into v_title,v_lang from public.vocabulary_folders where id=(p_data->>'folder_id')::uuid and owner_id=who;
  if not found then raise exception 'Brak dostępu do zestawu słówek.';end if;
  select jsonb_agg(jsonb_build_object('id',gen_random_uuid(),'type','vocabulary','prompt',w.word,'answer',w.translation,'reading',w.reading,'wrong','[]'::jsonb,'image','') order by w.created_at,w.id) into cards from public.vocabulary_words w where w.folder_id=(p_data->>'folder_id')::uuid and w.owner_id=who;
  if cards is null then raise exception 'Ten zestaw nie zawiera jeszcze słówek.';end if;
  return public.toowee_exercise_sets('save',jsonb_build_object('id',p_data->>'new_id','revision',0,'title',v_title,'lang',v_lang,'cards',cards,'is_public',false));
 end if;
 if p_action='list' then
  page:=greatest(0,least(1000,coalesce((p_data->>'page')::integer,0)));
  select coalesce(jsonb_agg(to_jsonb(r)),'[]') into result from(
   select e.id,e.title,e.description,e.lang,e.is_public,e.owner_id=who as mine,e.revision,e.updated_at,jsonb_array_length(e.cards) as count,coalesce(nullif(a.display_name,''),'Nauczyciel') as author
   from public.toowee_exercise_sets e join public.toowee_accounts a on a.id=e.owner_id
   where(case when p_data->>'scope'='public' then e.is_public else e.owner_id=who end)
   and(coalesce(p_data->>'lang','')='' or e.lang=p_data->>'lang')
   and(coalesce(p_data->>'query','')='' or e.title ilike '%'||(p_data->>'query')||'%' or e.description ilike '%'||(p_data->>'query')||'%')
   order by e.updated_at desc,e.id limit 24 offset page*24
  )r;return jsonb_build_object('sets',result,'page',page);
 end if;
 if p_action='save' then
  req:=(p_data->>'id')::uuid;if req is null then raise exception 'Brak identyfikatora zestawu.';end if;
  select * into s from public.toowee_exercise_sets where id=req for update;
  if found and s.owner_id<>who then raise exception 'Możesz edytować tylko własny zestaw. Zapisz kopię.';end if;
  if s.id is not null and (p_data->>'revision')::integer is distinct from s.revision then raise exception 'Zestaw zmieniono w innym oknie. Wczytaj jego aktualną wersję przed zapisem.';end if;
  v_title:=trim(p_data->>'title');v_description:=coalesce(p_data->>'description','');v_lang:=p_data->>'lang';cards:=p_data->'cards';v_public:=coalesce((p_data->>'is_public')::boolean,false);
  if coalesce(length(v_title),0) not between 1 and 200 or length(v_description)>2000 or coalesce(v_lang,'') not in ('English','Japanese','Spanish') then raise exception 'Uzupełnij nazwę i język zestawu.';end if;
  if jsonb_typeof(cards) is distinct from 'array' then raise exception 'Nieprawidłowe karty.';end if;
  if jsonb_array_length(cards) not between 1 and 500 or length(cards::text)>4000000 then raise exception 'Zestaw musi zawierać od 1 do 500 kart.';end if;
  names:='{}';
  for item in select value from jsonb_array_elements(cards) loop
   if coalesce(item->>'type','') not in ('vocabulary','question','open','quiz') or coalesce(length(trim(item->>'prompt')),0) not between 1 and 2000 or length(coalesce(item->>'answer',''))>2000 or (item->>'type'<>'open' and coalesce(length(trim(item->>'answer')),0)=0) or length(coalesce(item->>'reading',''))>500 then raise exception 'Uzupełnij zadanie i odpowiedź każdej karty.';end if;
   if coalesce(item->>'id','')!~'^[a-f0-9-]{36}$' or (item->>'id')=any(names) then raise exception 'Nieprawidłowe lub powtórzone identyfikatory kart.';end if;names:=array_append(names,item->>'id');
   if coalesce(item->>'image','')<>'' and (length(item->>'image')>2000 or (item->>'image')!~'^https://[^[:space:]]+$') then raise exception 'Obrazek wymaga adresu HTTPS.';end if;
   wrong:=coalesce(item->'wrong','[]');if jsonb_typeof(wrong) is distinct from 'array' then raise exception 'Nieprawidłowe odpowiedzi.';end if;
   if jsonb_array_length(wrong)>3 or (item->>'type'='quiz' and jsonb_array_length(wrong)<>3) then raise exception 'Quiz ABCD wymaga 3 błędnych odpowiedzi.';end if;
   if exists(select 1 from jsonb_array_elements(wrong) w where jsonb_typeof(w)<>'string' or length(trim(w#>>'{}')) not between 1 and 2000) or (select count(distinct lower(trim(v))) from (select value v from jsonb_array_elements_text(wrong) union all select item->>'answer') a)<>jsonb_array_length(wrong)+1 then raise exception 'Odpowiedzi muszą być różne i niepuste.';end if;
  end loop;
  insert into public.toowee_exercise_sets(id,owner_id,title,description,lang,cards,is_public) values(req,who,v_title,v_description,v_lang,cards,v_public)
  on conflict(id) do update set title=excluded.title,description=excluded.description,lang=excluded.lang,cards=excluded.cards,is_public=excluded.is_public,revision=toowee_exercise_sets.revision+1,updated_at=now() returning * into s;
 else
  select * into s from public.toowee_exercise_sets where id=(p_data->>'id')::uuid for update;
  if not found or(s.owner_id<>who and not s.is_public) then raise exception 'Ten zestaw jest prywatny lub nie jest już dostępny.';end if;
 end if;
 if p_action='copy' then
  req:=(p_data->>'new_id')::uuid;if req is null then raise exception 'Brak identyfikatora kopii.';end if;
  if exists(select 1 from public.toowee_exercise_sets where id=req and owner_id<>who) then raise exception 'Nieprawidłowy identyfikator kopii.';end if;
  insert into public.toowee_exercise_sets(id,owner_id,title,description,lang,cards,is_public,source_id) values(req,who,left(s.title||' — kopia',200),s.description,s.lang,s.cards,false,s.id) on conflict(id) do nothing;
  select * into s from public.toowee_exercise_sets where id=req;
 elsif p_action='prepare_game' then
  if s.owner_id<>who then raise exception 'Najpierw zapisz własną kopię.';end if;
  if exists(select 1 from jsonb_array_elements(s.cards) c where c->>'type'<>'vocabulary' or length(c->>'prompt')>500 or length(c->>'answer')>1000) then raise exception 'Ta gra obsługuje zestawy słówek. Wybierz grę do zadań.';end if;
  select folder_id into fid from public.toowee_exercise_materials where set_id=s.id and owner_id=who;
  if fid is null then
   insert into public.vocabulary_folders(owner_id,name,lang) values(who,s.title,s.lang) returning id into fid;
   insert into public.toowee_exercise_materials values(s.id,who,fid,0);
  end if;
  if (select revision from public.toowee_exercise_materials where set_id=s.id)<>s.revision then
   update public.vocabulary_folders set name=s.title,lang=s.lang where id=fid and owner_id=who;
   delete from public.vocabulary_words where folder_id=fid and owner_id=who;
   insert into public.vocabulary_words(owner_id,lang,folder_id,word,reading,translation) select who,s.lang,fid,c->>'prompt',coalesce(c->>'reading',''),c->>'answer' from jsonb_array_elements(s.cards)c;
   update public.toowee_exercise_materials set revision=s.revision where set_id=s.id;
  end if;
  select coalesce(jsonb_agg(to_jsonb(w)),'[]') into result from public.vocabulary_words w where owner_id=who and folder_id=fid;
  return jsonb_build_object('name',s.title,'lang',s.lang,'folders','[]'::jsonb,'sets',jsonb_build_array(jsonb_build_object('id',fid,'name',s.title,'lang',s.lang)),'words',result);
 elsif p_action not in ('get','save','copy') then raise exception 'Nieznana operacja.';
 end if;
 return jsonb_build_object('id',s.id,'title',s.title,'description',s.description,'lang',s.lang,'cards',s.cards,'is_public',s.is_public,'mine',s.owner_id=who,'revision',s.revision,'source_id',s.source_id,'author',(select coalesce(nullif(display_name,''),'Nauczyciel') from public.toowee_accounts where id=s.owner_id));
end;$$;
revoke all on function public.toowee_exercise_sets(text,jsonb) from public,anon;
grant execute on function public.toowee_exercise_sets(text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
