-- Kelime kartları yetki testi: çocuk kendi kelime kutusunu yazar ve günceller, cevabını kaydeder, kardeşi adına
-- yazamaz, günlük kelime sayısını kendisi değiştiremez; veli görür ama yazamaz, sayıyı o ayarlar; İngilizce'si olmayan
-- öğretmen ve kardeş göremez. Sonuç hata mesajıyla döner; her şey geri alınır.
-- beklenen: {"cocuk_yazdi":true,"cocuk_guncelledi":1,"cevap_yazdi":true,"kardes_adina":"reddedildi","cocuk_sayi":"reddedildi","veli_goruyor":1,"veli_cevap_goruyor":1,"veli_yazdi":"reddedildi","veli_sayi":12,"ogretmen_goruyor":0,"kardes_goruyor":0}
do $$
declare
  kid uuid := (select id from public.profiles where display_name = 'IrfTest' and role = 'student');
  sibling uuid := (select id from public.profiles where role = 'student' and id <> kid order by created_at limit 1);
  parent uuid := (select parent_id from public.family_links where student_id = kid and relation = 'parent' limit 1);
  teacher uuid := (select parent_id from public.family_links where student_id = kid and relation = 'teacher'
                     and subjects is not null and not ('ingilizce' = any(subjects)) limit 1);
  aid uuid;
  r jsonb := '{}';
  n int;
begin
  -- Çocuk kendi kutusunu yazar, günceller, cevabını kaydeder
  perform set_config('request.jwt.claims', json_build_object('sub', kid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  insert into public.word_progress (student_id, word, box, due_date) values (kid, 'zz-test', 1, current_date + 1);
  r := r || jsonb_build_object('cocuk_yazdi', true);
  update public.word_progress set box = 2, right_count = 1 where student_id = kid and word = 'zz-test';
  get diagnostics n = row_count; r := r || jsonb_build_object('cocuk_guncelledi', n);
  insert into public.word_answers (student_id, word, correct, confidence) values (kid, 'zz-test', true, 75) returning id into aid;
  r := r || jsonb_build_object('cevap_yazdi', aid is not null);
  begin insert into public.word_progress (student_id, word, box, due_date) values (sibling, 'zz-test', 1, current_date); r := r || '{"kardes_adina": "yazdi"}';
  exception when others then r := r || jsonb_build_object('kardes_adina', 'reddedildi'); end;
  begin update public.profiles set daily_words = 30 where id = kid; r := r || '{"cocuk_sayi": "degisti"}';
  exception when others then r := r || jsonb_build_object('cocuk_sayi', 'reddedildi'); end;

  -- Veli görür, çocuk adına yazamaz, günlük sayıyı ayarlar
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', parent, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.word_progress where student_id = kid and word = 'zz-test'; r := r || jsonb_build_object('veli_goruyor', n);
  select count(*) into n from public.word_answers where id = aid; r := r || jsonb_build_object('veli_cevap_goruyor', n);
  begin insert into public.word_progress (student_id, word, box, due_date) values (kid, 'zz-veli', 1, current_date); r := r || '{"veli_yazdi": "evet"}';
  exception when others then r := r || jsonb_build_object('veli_yazdi', 'reddedildi'); end;
  update public.profiles set daily_words = 12 where id = kid;
  r := r || jsonb_build_object('veli_sayi', (select daily_words from public.profiles where id = kid));

  -- İngilizce'si olmayan öğretmen görmez
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', teacher, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.word_progress where student_id = kid and word = 'zz-test'; r := r || jsonb_build_object('ogretmen_goruyor', n);

  -- Kardeş görmez
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', sibling, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.word_progress where student_id = kid and word = 'zz-test'; r := r || jsonb_build_object('kardes_goruyor', n);

  perform set_config('role', 'postgres', true);
  raise exception 'SONUC %', r;
end $$;
