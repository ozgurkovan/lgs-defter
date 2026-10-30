-- Her öğrenci için hazırlık kontrolü (salt okunur; öğrencinin kendi yetkisiyle sayar, hiçbir şey yazmaz):
-- işlenen konu sayısı, bugün gelecek hata ve konu tekrarları, havuzda henüz görmediği soru, okunmamış mesaj,
-- bekleyen yükleme. tools/regression.mjs çalıştırır; havuz azalan öğrenciyi uyarır.
create or replace function pg_temp.check_student(uid uuid) returns jsonb language plpgsql as $$
declare
  r jsonb;
  today date := (now() at time zone 'Europe/Istanbul')::date;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select jsonb_build_object(
    'aktif_konu', (select count(*) from public.topic_status where student_id = uid and status = 'active'),
    'bugun_hata', (select count(*) from public.items where student_id = uid and track = 'mistake' and state = 'active' and due_date <= today),
    'bugun_konu', (select count(*) from public.items where student_id = uid and track = 'topic' and state = 'active' and due_date <= today),
    'gorulmemis_soru', (select count(*) from public.questions q
      where q.active and not q.exam_only
        and q.topic_id in (select topic_id from public.topic_status where student_id = uid and status = 'active')
        and not exists (select 1 from public.reviews v where v.student_id = uid and v.question_id = q.id)),
    'okunmamis_mesaj', (select count(*) from public.family_messages where student_id = uid and seen_at is null),
    'bekleyen_yukleme', (select count(*) from public.submissions where student_id = uid and status in ('submitted', 'processing'))
  ) into r;
  perform set_config('role', 'postgres', true);
  return r;
end $$;

select p.display_name, p.grade, pg_temp.check_student(p.id) as durum
from public.profiles p
where p.role = 'student'
order by p.grade desc, p.display_name;
