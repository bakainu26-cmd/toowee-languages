begin;
-- The Edge Function reads only the authenticated account ID/role with the server key.
-- BYPASSRLS does not replace ordinary column privileges.
grant select (id,role) on public.toowee_accounts to service_role;
notify pgrst,'reload schema';
commit;
