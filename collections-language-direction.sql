-- Kierunek języków w Kolekcjach. Uruchom po collections_live_setup.sql.
-- Nie zmienia istniejących pokoi ani materiałów.
begin;
do $patch$
declare definition text;
begin
 select pg_get_functiondef('public.toowee_collections(text,jsonb)'::regprocedure) into definition;
 if position('-- toowee-language-direction-v1' in definition)=0 then
  if position('if coalesce(jsonb_array_length(wordpool),0)<2' in definition)=0 then
   raise exception 'Najpierw uruchom aktualną konfigurację Kolekcji.';
  end if;
  definition:=replace(definition,'if coalesce(jsonb_array_length(wordpool),0)<2', $code$
  -- toowee-language-direction-v1
  if p_data->>'direction'='toTarget' then
   select jsonb_agg(jsonb_build_object('word',tw_direction_item.value->>'translation','reading','','translation',tw_direction_item.value->>'word')) into wordpool from jsonb_array_elements(wordpool) as tw_direction_item(value);
  end if;
  if coalesce(jsonb_array_length(wordpool),0)<2$code$);
  execute definition;
 end if;
end $patch$;
commit;
