begin;
-- Service-only, invoker function: caller identity is supplied by the authenticated
-- Edge handler. No changes to existing images, vocabulary or exercise records.
create or replace function public.toowee_media_find_owned(p_owner uuid,p_query text default '',p_page integer default 0)
returns setof public.toowee_media_assets language sql stable security invoker set search_path=''
as $$
select a.* from public.toowee_media_assets a
where a.owner_id=p_owner and (
 coalesce(trim(p_query),'')='' or
 position(lower(left(trim(p_query),100)) in lower(concat_ws(' ',a.author,a.source_url,a.source_id)))>0 or
 exists(select 1 from public.toowee_word_images i join public.vocabulary_words w on w.id=i.word_id
 where i.owner_id=p_owner and w.owner_id=p_owner and i.image='https://bqduwzbcnfujuthefauu.supabase.co/functions/v1/toowee-images?asset='||a.id::text
 and position(lower(left(trim(p_query),100)) in lower(concat_ws(' ',w.word,w.reading,w.translation)))>0) or
 exists(select 1 from public.toowee_exercise_sets e cross join lateral jsonb_array_elements(e.cards) c
 where e.owner_id=p_owner and c->>'image'='https://bqduwzbcnfujuthefauu.supabase.co/functions/v1/toowee-images?asset='||a.id::text
 and position(lower(left(trim(p_query),100)) in lower(concat_ws(' ',e.title,c->>'prompt',c->>'answer')))>0)
) order by a.created_at desc,a.id limit 24 offset greatest(0,least(coalesce(p_page,0),1000))*24
$$;
revoke all on function public.toowee_media_find_owned(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.toowee_media_find_owned(uuid,text,integer) to service_role;
grant select(word_id,owner_id,image) on public.toowee_word_images to service_role;
grant select(id,owner_id,word,reading,translation) on public.vocabulary_words to service_role;
grant select(owner_id,title,cards) on public.toowee_exercise_sets to service_role;
commit;
