-- "Soru ekle" yetki testi: öğrenci kendi adına soru yüklemesi açar ve fotoğraf satırı ekler; kardeşi adına açamaz;
-- öğrencisiz 'soru' yüklemesi olmaz; veli görür; matematik + fen öğretmeni yüklemeyi görür (deneme gibi).
-- Sonuç hata mesajıyla döner; her şey geri alınır.
-- beklenen: {"cocuk_acti":true,"foto_satiri":2,"kardes_adina":"reddedildi","ogrencisiz_soru":"reddedildi","veli_goruyor":1,"ogretmen_goruyor":1,"kardes_goruyor":0}
do $$
declare
  kid uuid := (select id from public.profiles where display_name = 'IrfTest' and role = 'student');
  sibling uuid := (select id from public.profiles where role = 'student' and id <> kid order by created_at limit 1);
  parent uuid := (select parent_id from public.family_links where student_id = kid and relation = 'parent' limit 1);
  teacher uuid := (select parent_id from public.family_links where student_id = kid and relation = 'teacher' limit 1);
  sid uuid;
  r jsonb := '{}';
  n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', kid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  insert into public.submissions (kind, student_id, uploaded_by, note) values ('soru', kid, kid, 'test') returning id into sid;
  r := r || jsonb_build_object('cocuk_acti', sid is not null);
  insert into public.submission_photos (submission_id, storage_path, photo_role, sort) values (sid, kid || '/' || sid || '/001-yapamadim.jpg', 'yapamadim', 1);
  insert into public.submission_photos (submission_id, storage_path, photo_role, sort) values (sid, kid || '/' || sid || '/002-begendim.jpg', 'begendim', 2);
  select count(*) into n from public.submission_photos where submission_id = sid; r := r || jsonb_build_object('foto_satiri', n);
  begin insert into public.submissions (kind, student_id, uploaded_by) values ('soru', sibling, kid); r := r || '{"kardes_adina": "acti"}';
  exception when others then r := r || jsonb_build_object('kardes_adina', 'reddedildi'); end;
  begin insert into public.submissions (kind, student_id, uploaded_by) values ('soru', null, kid); r := r || '{"ogrencisiz_soru": "acti"}';
  exception when others then r := r || jsonb_build_object('ogrencisiz_soru', 'reddedildi'); end;

  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', parent, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.submissions where id = sid; r := r || jsonb_build_object('veli_goruyor', n);

  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', teacher, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.submissions where id = sid; r := r || jsonb_build_object('ogretmen_goruyor', n);

  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', sibling, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.submissions where id = sid; r := r || jsonb_build_object('kardes_goruyor', n);

  perform set_config('role', 'postgres', true);
  raise exception 'SONUC %', r;
end $$;
