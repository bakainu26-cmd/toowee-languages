begin;
-- Additive: no existing vocabulary, cards, images or account preferences are rewritten.
create table public.toowee_media_assets (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id),
 content_hash text not null check(content_hash ~ '^[a-f0-9]{64}$'),
 path text not null unique,
 mime text not null check(mime in ('image/jpeg','image/png','image/webp')),
 bytes integer not null check(bytes between 1 and 5242880),
 source text not null check(source in ('pixabay','upload','clipboard','url')),
 source_id text,source_url text,author text,
 created_at timestamptz not null default now(),
 unique(owner_id,content_hash)
);
alter table public.toowee_media_assets enable row level security;
revoke all on public.toowee_media_assets from public,anon,authenticated;
grant select on public.toowee_media_assets to authenticated;
create policy media_owner_read on public.toowee_media_assets for select to authenticated using(owner_id=(select auth.uid()));
grant all on public.toowee_media_assets to service_role;
create table public.toowee_media_search_cache (
 cache_key text primary key,payload jsonb not null,expires_at timestamptz not null
);
create table public.toowee_media_usage (
 subject text not null,kind text not null,window_start timestamptz not null,n integer not null default 0,
 primary key(subject,kind,window_start)
);
alter table public.toowee_media_search_cache enable row level security;
alter table public.toowee_media_usage enable row level security;
revoke all on public.toowee_media_search_cache,public.toowee_media_usage from public,anon,authenticated;
grant all on public.toowee_media_search_cache,public.toowee_media_usage to service_role;
create function public.toowee_media_take_budget(p_subject text,p_kind text,p_limit integer) returns boolean
language plpgsql security invoker set search_path=public,pg_temp as $$
declare v integer;w timestamptz:=date_trunc('minute',clock_timestamp());
begin
 insert into public.toowee_media_usage(subject,kind,window_start,n) values(p_subject,p_kind,w,1)
 on conflict(subject,kind,window_start) do update set n=toowee_media_usage.n+1 returning n into v;
 return v<=p_limit;
end $$;
revoke all on function public.toowee_media_take_budget(text,text,integer) from public,anon,authenticated;
grant execute on function public.toowee_media_take_budget(text,text,integer) to service_role;
-- Private files; only server-checked, short-lived signed URLs are returned by the API.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('toowee-media','toowee-media',false,5242880,array['image/jpeg','image/png','image/webp']);
notify pgrst,'reload schema';
commit;
