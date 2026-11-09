-- Öğretmenin benzer soru denemesi testi: öğretmen kendi dersinde (matematik) öğrencisi adına 'check' cevabı ve ondan doğan
-- hata maddesi yazabilir; başka tarzda cevap, başka dersin (türkçe) sorusu, başka öğrenci yazamaz; cevabı değiştiremez.
-- Sonuç hata mesajıyla döner; her şey geri alınır.
-- beklenen: {"kendi_dersi":true,"hata_maddesi":true,"baska_tarz":"reddedildi","baska_ders":"reddedildi","baska_ogrenci":"reddedildi","degistirme":"reddedildi"}
do $$
declare
  kid uuid := (select id from public.profiles where display_name = 'IrfTest' and role = 'student');
  sibling uuid := (select id from public.profiles where role = 'student' and id <> kid order by created_at limit 1);
  teacher uuid := (select id from public.profiles where display_name = 'Test Öğretmen' and role = 'teacher');
  mq uuid := (select id from public.questions where subject = 'matematik' and active order by created_at limit 1);
  tq uuid := (select id from public.questions where subject = 'turkce' and active order by created_at limit 1);
  mt text := (select topic_id from public.questions where id = mq);
  rid uuid;
  r jsonb := '{}';
  n int;
begin
  -- Test öğretmeni bu testte IrfTest'e matematik için bağlanır (geri alınır); gerçek bağları ne olursa olsun test aynı çalışır.
  delete from public.family_links where parent_id = teacher and student_id = kid;
  insert into public.family_links (parent_id, student_id, relation, subjects) values (teacher, kid, 'teacher', array['matematik']);
  perform set_config('request.jwt.claims', json_build_object('sub', teacher, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  insert into public.reviews (student_id, question_id, track, answer, correct, duration_sec, hint_used)
    values (kid, mq, 'check', 'A', false, 12, false) returning id into rid;
  r := r || jsonb_build_object('kendi_dersi', rid is not null);
  insert into public.items (student_id, track, topic_id, question_id, step, interval_days, due_date, note)
    values (kid, 'mistake', mt, mq, 0, 1, current_date + 1, 'Veli denemesinde yanlış');
  r := r || '{"hata_maddesi": true}';
  begin insert into public.reviews (student_id, question_id, track, answer, correct, duration_sec, hint_used) values (kid, mq, 'practice', 'A', true, 5, false);
    r := r || '{"baska_tarz": "yazdi"}';
  exception when others then r := r || jsonb_build_object('baska_tarz', 'reddedildi'); end;
  begin insert into public.reviews (student_id, question_id, track, answer, correct, duration_sec, hint_used) values (kid, tq, 'check', 'A', true, 5, false);
    r := r || '{"baska_ders": "yazdi"}';
  exception when others then r := r || jsonb_build_object('baska_ders', 'reddedildi'); end;
  begin insert into public.reviews (student_id, question_id, track, answer, correct, duration_sec, hint_used) values (sibling, mq, 'check', 'A', true, 5, false);
    r := r || '{"baska_ogrenci": "yazdi"}';
  exception when others then r := r || jsonb_build_object('baska_ogrenci', 'reddedildi'); end;
  update public.reviews set correct = true where id = rid;
  get diagnostics n = row_count;
  r := r || jsonb_build_object('degistirme', case when n = 0 then 'reddedildi' else 'degisti' end);
  perform set_config('role', 'postgres', true);
  raise exception 'SONUC %', r;
end $$;
