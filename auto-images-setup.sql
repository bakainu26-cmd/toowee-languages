-- Additive API: only attach an owned image to an owned material, never replace manual images.
begin;
create or replace function public.toowee_auto_image_save(p_asset uuid,p_word uuid default null,p_set uuid default null,p_card uuid default null,p_revision integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid(); ref text; item record; updated_cards jsonb; pos integer; changed boolean;
begin
 if who is null or not exists(select 1 from public.toowee_accounts where id=who and role in ('teacher','admin')) then raise exception 'Tylko konto nauczyciela.';end if;
 if not exists(select 1 from public.toowee_media_assets where id=p_asset and owner_id=who) then raise exception 'Brak dostępu do obrazu.';end if;
 ref:='https://bqduwzbcnfujuthefauu.supabase.co/functions/v1/toowee-images?asset='||p_asset;
 if p_word is not null and p_set is null then
  perform 1 from public.vocabulary_words where id=p_word and owner_id=who for update;
  if not found then raise exception 'Brak dostępu do słówka.';end if;
  insert into public.toowee_word_images(word_id,owner_id,image) values(p_word,who,ref) on conflict(word_id) do nothing;
  changed:=found;return jsonb_build_object('saved',changed,'image',ref);
 elsif p_word is null and p_set is not null and p_card is not null then
  select * into item from public.toowee_exercise_sets where id=p_set and owner_id=who for update;
  if not found then raise exception 'Brak dostępu do zestawu.';end if;
  if item.revision is distinct from p_revision then return jsonb_build_object('saved',false,'conflict',true);end if;
  select (ordinality-1)::int into pos from jsonb_array_elements(item.cards) with ordinality where value->>'id'=p_card::text and coalesce(value->>'image','')='' and coalesce(value->>'auto_image','true')<>'false' limit 1;
  if pos is null then return jsonb_build_object('saved',false,'revision',item.revision);end if;
  updated_cards:=jsonb_set(item.cards,array[pos::text,'image'],to_jsonb(ref),true);
  update public.toowee_exercise_sets set cards=updated_cards,revision=revision+1,updated_at=now() where id=p_set and owner_id=who;
  return jsonb_build_object('saved',true,'image',ref,'revision',item.revision+1);
 end if;
 raise exception 'Nieprawidłowy materiał.';
end $$;
revoke all on function public.toowee_auto_image_save(uuid,uuid,uuid,uuid,integer) from public,anon;
grant execute on function public.toowee_auto_image_save(uuid,uuid,uuid,uuid,integer) to authenticated;
commit;
