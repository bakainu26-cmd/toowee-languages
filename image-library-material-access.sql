begin;
-- Durable references stay in the existing image fields; only temporary view URLs expire.
create function public.toowee_media_can_read(p_asset uuid,p_user uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
select p_user is not null and exists(
 select 1 from public.toowee_media_assets m where m.id=p_asset and (
 m.owner_id=p_user
 or exists(select 1 from public.toowee_word_images i where i.image='https://bqduwzbcnfujuthefauu.supabase.co/functions/v1/toowee-images?asset='||m.id::text and (
 i.owner_id=p_user or exists(select 1 from public.toowee_assignments a where a.source_word_id=i.word_id and a.student_id=p_user and not a.access_disabled)))
 or exists(select 1 from public.toowee_exercise_sets e where e.cards @> jsonb_build_array(jsonb_build_object('image','https://bqduwzbcnfujuthefauu.supabase.co/functions/v1/toowee-images?asset='||m.id::text)) and (
 e.owner_id=p_user or (e.is_public and exists(select 1 from public.toowee_accounts a where a.id=p_user and a.role in ('teacher','admin')))
 or exists(select 1 from public.toowee_material_deliveries d join public.toowee_student_profiles p on p.id=d.profile_id where d.kind='exercise' and d.source_id=e.id and d.owner_id=e.owner_id and p.owner_id=e.owner_id and p.student_id=p_user and not p.blocked)
 )))
);
$$;
revoke all on function public.toowee_media_can_read(uuid,uuid) from public,anon,authenticated;
grant execute on function public.toowee_media_can_read(uuid,uuid) to service_role;
commit;
