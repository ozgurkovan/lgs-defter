-- Ülke ve müfredat ayrımı testi: başka müfredatın konusu (aynı sınıf, haftası gelmiş) Türk öğrenciye açılmaz; öğrencinin
-- müfredatı değişince ona açılır; müfredatı çocuk değiştiremez, veli değiştirir; geçersiz kimlik reddedilir. Sonuç hata
-- mesajıyla döner; her şey geri alınır.
-- beklenen: {"varsayilan":"tr","baska_mufredat":0,"kendi_mufredati":1,"cocuk_ayar":"reddedildi","veli_ayar":"us-pa","gecersiz":"reddedildi","tr_konulari_tr":true}
do $$
declare
  kid uuid := (select id from public.profiles where display_name = 'IrfTest' and role = 'student');
  parent uuid := (select parent_id from public.family_links where student_id = kid and relation = 'parent' limit 1);
  g int := (select grade from public.profiles where id = kid);
  r jsonb := '{}';
begin
  r := r || jsonb_build_object('varsayilan', (select curriculum from public.profiles where id = kid),
    'tr_konulari_tr', (select bool_and(curriculum = 'tr') from public.topics));
  -- Aynı sınıfın, haftası gelmiş bir ABD konusu: Türk öğrenciye açılmaz
  insert into public.topics (id, subject, name, grade, planned_start, curriculum)
    values ('zz-test.us-pa.math', 'matematik', 'Test topic', g, current_date - 7, 'us-pa');
  perform public.activate_planned_topics();
  r := r || jsonb_build_object('baska_mufredat', (select count(*) from public.topic_status where topic_id = 'zz-test.us-pa.math'));

  -- Çocuk müfredatını değiştiremez; veli değiştirir
  perform set_config('request.jwt.claims', json_build_object('sub', kid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin update public.profiles set curriculum = 'us-pa' where id = kid; r := r || '{"cocuk_ayar": "degisti"}';
  exception when others then r := r || jsonb_build_object('cocuk_ayar', 'reddedildi'); end;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', parent, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  update public.profiles set curriculum = 'us-pa' where id = kid;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  r := r || jsonb_build_object('veli_ayar', (select curriculum from public.profiles where id = kid));

  -- Müfredatı değişen öğrenciye konu açılır (yalnızca ona)
  perform public.activate_planned_topics();
  r := r || jsonb_build_object('kendi_mufredati', (select count(*) from public.topic_status where topic_id = 'zz-test.us-pa.math'));

  begin update public.profiles set curriculum = 'ABD!' where id = kid; r := r || '{"gecersiz": "kabul edildi"}';
  exception when others then r := r || jsonb_build_object('gecersiz', 'reddedildi'); end;

  raise exception 'SONUC %', r;
end $$;
