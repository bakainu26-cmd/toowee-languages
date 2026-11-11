-- Tablica: prywatna synchronizacja na żywo. Uruchom po platform-update-20261111.sql.
-- Zachowuje istniejące tablice i nie udostępnia ich publicznie.
begin;
create or replace function public.toowee_board_realtime_access(room_topic text) returns boolean
language plpgsql stable security definer set search_path=public as $$
declare board_id uuid;who uuid:=auth.uid();
begin
 if who is null or room_topic is null or room_topic !~ '^toowee-board:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then return false;end if;
 board_id:=substring(room_topic from 14)::uuid;
 return exists(select 1 from public.toowee_boards b left join public.toowee_student_profiles p on p.id=b.profile_id where b.id=board_id and (b.owner_id=who or p.student_id=who and not p.blocked));
end $$;
revoke all on function public.toowee_board_realtime_access(text) from public,anon;
grant execute on function public.toowee_board_realtime_access(text) to authenticated;
drop policy if exists toowee_board_receive on realtime.messages;
create policy toowee_board_receive on realtime.messages for select to authenticated using(extension='broadcast' and public.toowee_board_realtime_access(realtime.topic()));
drop policy if exists toowee_board_send on realtime.messages;
create policy toowee_board_send on realtime.messages for insert to authenticated with check(extension='broadcast' and public.toowee_board_realtime_access(realtime.topic()));
commit;
