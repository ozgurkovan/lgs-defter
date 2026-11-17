-- Soru beğenisi yetki testi: öğrenci kendi oyunu verir ve değiştirir; başkası adına veremez; 0 oy olmaz; veli görür;
-- aileye bağlı olmayan biri görmez. Sonuç hata mesajıyla döner; her şey geri alınır.
-- beklenen: {"oy_verdi":1,"degistirdi":-1,"not_yazdi":true,"baskasi_adina":"reddedildi","sifir_oy":"reddedildi","veli_goruyor":1,"veli_yazamaz":"reddedildi","yabanci":0}
do $$
declare
  kid uuid := (select id from public.profiles where display_name = 'IrfTest' and role = 'student');
  parent uuid := (select parent_id from public.family_links where student_id = kid and relation = 'parent' limit 1);
  other uuid := (select id from public.profiles where role = 'student' and id <> kid order by created_at limit 1);
  qid uuid := (select id from public.questions where private_students is null order by created_at limit 1);
  r jsonb := '{}';
  n int; t text;
begin
  delete from public.question_votes where student_id in (kid, other) and question_id = qid;
  perform set_config('request.jwt.claims', json_build_object('sub', kid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  insert into public.question_votes (student_id, question_id, vote) values (kid, qid, 1);
  select vote into n from public.question_votes where student_id = kid and question_id = qid; r := r || jsonb_build_object('oy_verdi', n);
  update public.question_votes set vote = -1, note = 'test: çok uzun' where student_id = kid and question_id = qid;
  select vote, note into n, t from public.question_votes where student_id = kid and question_id = qid;
  r := r || jsonb_build_object('degistirdi', n, 'not_yazdi', t is not null);
  begin insert into public.question_votes (student_id, question_id, vote) values (other, qid, 1); r := r || '{"baskasi_adina": "verdi"}';
  exception when others then r := r || jsonb_build_object('baskasi_adina', 'reddedildi'); end;
  begin update public.question_votes set vote = 0 where student_id = kid and question_id = qid; r := r || '{"sifir_oy": "oldu"}';
  exception when others then r := r || jsonb_build_object('sifir_oy', 'reddedildi'); end;

  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', parent, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.question_votes where student_id = kid and question_id = qid; r := r || jsonb_build_object('veli_goruyor', n);
  update public.question_votes set vote = 1 where student_id = kid and question_id = qid;
  get diagnostics n = row_count; r := r || jsonb_build_object('veli_yazamaz', case when n = 0 then 'reddedildi' else 'yazdi' end);

  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.question_votes where question_id = qid; r := r || jsonb_build_object('yabanci', n);

  perform set_config('role', 'postgres', true);
  raise exception 'SONUC %', r;
end $$;
