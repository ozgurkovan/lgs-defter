-- Okuduğu kitap yetki testi: çocuk kendi kitabını ekler ve sayfalarını yükler, kardeşi adına ekleyemez, sınav tarihini
-- sonradan değiştiremez; veli görür ve sınav tarihini değiştirir; Türkçe'si olmayan öğretmen ve kardeş göremez.
-- Sonuç hata mesajıyla döner; her şey geri alınır.
-- beklenen: {"cocuk_ekledi":true,"cocuk_yukledi":true,"kardes_adina":"reddedildi","cocuk_tarih":0,"veli_goruyor":1,"veli_tarih":1,"ogretmen_goruyor":0,"kardes_goruyor":0}
do $$
declare
  kid uuid := (select id from public.profiles where display_name = 'IrfTest' and role = 'student');
  sibling uuid := (select id from public.profiles where role = 'student' and id <> kid order by created_at limit 1);
  parent uuid := (select parent_id from public.family_links where student_id = kid and relation = 'parent' limit 1);
  teacher uuid := (select parent_id from public.family_links where student_id = kid and relation = 'teacher'
                     and subjects is not null and not ('turkce' = any(subjects)) limit 1);
  bid uuid;
  sub uuid;
  r jsonb := '{}';
  n int;
begin
  -- Çocuk kitabını ekler, sayfalarını yükler; sınav tarihini sonradan değiştiremez
  perform set_config('request.jwt.claims', json_build_object('sub', kid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  insert into public.books (student_id, title, exam_date, created_by) values (kid, 'Test kitabı', current_date + 10, kid) returning id into bid;
  r := r || jsonb_build_object('cocuk_ekledi', bid is not null);
  insert into public.submissions (kind, student_id, book_id, uploaded_by) values ('okuma', kid, bid, kid) returning id into sub;
  r := r || jsonb_build_object('cocuk_yukledi', sub is not null);
  begin insert into public.books (student_id, title, created_by) values (sibling, 'Sahte', kid); r := r || '{"kardes_adina": "ekledi"}';
  exception when others then r := r || jsonb_build_object('kardes_adina', 'reddedildi'); end;
  update public.books set exam_date = current_date - 1 where id = bid;
  get diagnostics n = row_count; r := r || jsonb_build_object('cocuk_tarih', n);

  -- Veli görür, sınav tarihini değiştirir
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', parent, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.books where id = bid; r := r || jsonb_build_object('veli_goruyor', n);
  update public.books set exam_date = current_date + 20 where id = bid;
  get diagnostics n = row_count; r := r || jsonb_build_object('veli_tarih', n);

  -- Türkçe'si olmayan öğretmen görmez
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', teacher, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.books where id = bid; r := r || jsonb_build_object('ogretmen_goruyor', n);

  -- Kardeş görmez
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', sibling, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.books where id = bid; r := r || jsonb_build_object('kardes_goruyor', n);

  perform set_config('role', 'postgres', true);
  raise exception 'SONUC %', r;
end $$;
