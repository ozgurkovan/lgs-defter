-- Erişim kuralları testi: kullanıcıların yerine geçip neyi görebildiklerini sayar. Hiçbir şey yazmaz.
-- Çalıştır: node tools/sb.mjs sql supabase/test-rls.sql
create or replace function pg_temp.as_user(uid uuid) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select jsonb_build_object(
    'items', (select count(*) from public.items),
    'topic_status', (select count(*) from public.topic_status),
    'profiles', (select count(*) from public.profiles),
    'questions', (select count(*) from public.questions),
    'topics', (select count(*) from public.topics),
    'links', (select count(*) from public.family_links),
    'word_progress', (select count(*) from public.word_progress),
    'word_answers', (select count(*) from public.word_answers),
    'books', (select count(*) from public.books)
  ) into r;
  perform set_config('role', 'postgres', true);
  return r;
end $$;

select p.display_name, p.role, pg_temp.as_user(p.id) as sees
from public.profiles p
union all
select 'yabancı (aileye bağlı değil)', '-', pg_temp.as_user(gen_random_uuid());
