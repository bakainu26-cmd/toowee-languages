-- TooWee: run in Supabase SQL Editor. All statements are read-only.
-- No deletion, recovery, renaming, policy changes or reassignment is performed.
BEGIN TRANSACTION READ ONLY;

-- 1. All pupils, all teachers and languages: physical links, independently of UI filters.
SELECT p.owner_id AS teacher_id,p.id AS profile_id,p.first_name,p.last_name,
       m.lang,m.id AS material_folder_id,m.name AS folder_name,
       v.id AS list_id,v.name AS list_name,v.lang AS list_language,
       count(w.id) AS word_count,min(w.created_at) AS first_word,max(w.created_at) AS last_word,
       bool_or(w.owner_id IS DISTINCT FROM p.owner_id) AS mismatched_word_owner,
       bool_or(w.lang IS DISTINCT FROM v.lang) AS mismatched_word_language
FROM public.toowee_student_profiles p
LEFT JOIN public.toowee_material_folders m ON m.profile_id=p.id
LEFT JOIN public.toowee_material_sets ms ON ms.folder_id=m.id
LEFT JOIN public.vocabulary_folders v ON v.id=ms.set_id
LEFT JOIN public.vocabulary_words w ON w.folder_id=v.id
GROUP BY p.owner_id,p.id,p.first_name,p.last_name,m.lang,m.id,m.name,v.id,v.name,v.lang
ORDER BY p.first_name,p.last_name,m.lang,m.name,v.name;

-- 2. Lists with no pupil link (also includes legitimate private/group materials).
-- Names and creation times allow identification; do NOT automatically assign by similar names.
SELECT v.owner_id AS teacher_id,v.id AS list_id,v.name,v.lang,v.created_at,
       ms.folder_id AS material_folder_id,m.name AS material_folder_name,
       to_jsonb(m)->>'group_id' AS group_id,count(w.id) AS word_count,
       min(w.created_at) AS first_word,max(w.created_at) AS last_word
FROM public.vocabulary_folders v
LEFT JOIN public.toowee_material_sets ms ON ms.set_id=v.id
LEFT JOIN public.toowee_material_folders m ON m.id=ms.folder_id
LEFT JOIN public.vocabulary_words w ON w.folder_id=v.id
WHERE m.profile_id IS NULL
GROUP BY v.id,v.owner_id,v.name,v.lang,v.created_at,ms.folder_id,m.id,m.name
ORDER BY v.created_at DESC;

-- 3. Words genuinely without a list, grouped by teacher and language.
SELECT owner_id AS teacher_id,lang,count(*) AS word_count,
       min(created_at) AS first_word,max(created_at) AS last_word
FROM public.vocabulary_words WHERE folder_id IS NULL GROUP BY owner_id,lang;

-- 4. Robert candidates and their default-list mapping (keeps duplicate profile IDs visible).
SELECT p.id,p.owner_id,p.first_name,p.last_name,to_jsonb(p)->'languages' AS profile_languages,
       pf.lang,pf.folder_id AS default_list_id,v.name AS default_list_name
FROM public.toowee_student_profiles p
LEFT JOIN public.toowee_profile_folders pf ON pf.profile_id=p.id
LEFT JOIN public.vocabulary_folders v ON v.id=pf.folder_id
WHERE p.first_name ILIKE '%Robert%' ORDER BY p.owner_id,p.id,pf.lang;

-- 5. RLS and backend version evidence, without changing either.
SELECT tablename,policyname,roles,cmd,qual,with_check FROM pg_policies
WHERE schemaname='public' AND tablename IN
('vocabulary_words','vocabulary_folders','toowee_material_folders','toowee_material_sets','toowee_student_profiles','toowee_profile_folders')
ORDER BY tablename,policyname;
SELECT c.relname,c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('vocabulary_words','vocabulary_folders','toowee_material_folders','toowee_material_sets');
SELECT p.proname,pg_get_function_identity_arguments(p.oid) AS signature,md5(p.prosrc) AS version_hash,
       position('set_id' IN p.prosrc)>0 AS mentions_explicit_list,
       position('Słówka bez zestawu' IN p.prosrc)>0 AS has_legacy_bootstrap
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('toowee_portal','toowee_teacher','toowee_word_access');
SELECT to_regclass('public.toowee_cleanup_archive') AS possible_cleanup_archive;
ROLLBACK;
