-- Aileye özel soru testi: özel soruyu öğrencisi, kardeşi ve velisi görür; başka ailenin öğrencisi ve aileye bağlı
-- olmayan biri görmez; ortak soruyu herkes görür; yüklenen ('ogrenci') soru kendiliğinden özel olur.
-- Sonuç hata mesajıyla döner; her şey geri alınır.
-- beklenen: {"cocuk_goruyor":1,"veli_goruyor":1,"baska_aile":0,"yabanci":0,"ortak_soru_baska_aile":1,"yuklenen_kendiliginden_ozel":true,"yuklenen_baska_aile":0,"sahipsiz_kimse_gormez":0}
do $$
declare
  kid uuid := (select id from public.profiles where display_name = 'IrfTest' and role = 'student');
  parent uuid := (select parent_id from public.family_links where student_id = kid and relation = 'parent' limit 1);
  other uuid := (select p.id from public.profiles p where p.role = 'student'
                 and not exists (select 1 from public.family_links a join public.family_links b on b.parent_id = a.parent_id
                                 where a.student_id = kid and b.student_id = p.id) and p.id <> kid order by p.created_at limit 1);
  topic text := (select id from public.topics where grade = 8 and subject = 'matematik' order by id limit 1);
  qpriv uuid; qpub uuid; qup uuid; qnone uuid; sid uuid;
  r jsonb := '{}';
  n int;
  ps uuid[];
begin
  insert into public.questions (source, subject, topic_id, stem, choices, answer, verified, private_students)
    values ('claude', 'matematik', topic, 'TEST özel soru', '{"A":"1","B":"2","C":"3","D":"4"}', 'A', true, public.family_students(kid)) returning id into qpriv;
  insert into public.questions (source, subject, topic_id, stem, choices, answer, verified)
    values ('claude', 'matematik', topic, 'TEST ortak soru', '{"A":"1","B":"2","C":"3","D":"4"}', 'A', true) returning id into qpub;
  insert into public.submissions (kind, student_id, uploaded_by, note) values ('soru', kid, kid, 'test') returning id into sid;
  insert into public.questions (source, subject, topic_id, stem, choices, answer, verified, submission_id)
    values ('ogrenci', 'matematik', topic, 'TEST yüklenen soru', '{"A":"1","B":"2","C":"3","D":"4"}', 'A', true, sid) returning id, private_students into qup, ps;
  r := r || jsonb_build_object('yuklenen_kendiliginden_ozel', kid = any (ps));
  insert into public.questions (source, subject, topic_id, stem, choices, answer, verified)
    values ('kitap', 'matematik', topic, 'TEST sahipsiz kitap sorusu', '{"A":"1","B":"2","C":"3","D":"4"}', 'A', true) returning id into qnone;

  perform set_config('request.jwt.claims', json_build_object('sub', kid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.questions where id = qpriv; r := r || jsonb_build_object('cocuk_goruyor', n);
  select count(*) into n from public.questions where id = qnone; r := r || jsonb_build_object('sahipsiz_kimse_gormez', n);

  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', parent, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.questions where id = qpriv; r := r || jsonb_build_object('veli_goruyor', n);

  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.questions where id = qpriv; r := r || jsonb_build_object('baska_aile', n);
  select count(*) into n from public.questions where id = qpub; r := r || jsonb_build_object('ortak_soru_baska_aile', n);
  select count(*) into n from public.questions where id = qup; r := r || jsonb_build_object('yuklenen_baska_aile', n);

  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.questions where id = qpriv; r := r || jsonb_build_object('yabanci', n);

  perform set_config('role', 'postgres', true);
  raise exception 'SONUC %', r;
end $$;
