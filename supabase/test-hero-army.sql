-- Asker kahraman yetki testi: çocuk açma ayarını ve kolunu doğrudan değiştiremez; numarası 100 olmadan kol seçemez;
-- 100 olunca ülkesine uygun kolu bir kez seçer (yanlış ülkenin kolu, ikinci seçim reddedilir); kendi numarasını görür.
-- Veli numarayı görür, kolu yalnızca sıfırlar (bir kol yazamaz), açma ayarını o değiştirir. Öğretmen ve kardeş numarayı
-- göremez, kolu sıfırlayamaz. Numaranın hesabı: 800 hata tekrarı doğrusu (80) + 400 öteki doğru (20) = 100.
-- Sonuç hata mesajıyla döner; her şey geri alınır.
-- beklenen: {"cocuk_ayar":"reddedildi","cocuk_kol_dogrudan":"reddedildi","erken_secim":"reddedildi","cocuk_numara":100,"bugun_oncesi":0,"yanlis_ulke":"reddedildi","secim":"kara","ikinci_secim":"reddedildi","veli_numara":100,"veli_kol_yazdi":"reddedildi","veli_sifirladi":true,"veli_ayar":false,"kapaliyken_secim":"reddedildi","ogretmen_numara":"yok","ogretmen_sifirladi":0,"kardes_numara":"yok"}
do $$
declare
  kid uuid := (select id from public.profiles where display_name = 'IrfTest' and role = 'student');
  sibling uuid := (select id from public.profiles where role = 'student' and id <> kid order by created_at limit 1);
  parent uuid := (select parent_id from public.family_links where student_id = kid and relation = 'parent' limit 1);
  teacher uuid := (select id from public.profiles where display_name = 'Test Öğretmen' and role = 'teacher');
  qid uuid := (select id from public.questions limit 1);
  r jsonb := '{}';
  n int;
  s jsonb;
  c text;
begin
  -- Hazırlık (geri alınır): IrfTest'in asker kahramanı açık, kolu boş, eski cevapları sayılmasın diye bugünkü sayım
  -- yalnızca test satırlarından gelir; test öğretmeni IrfTest'e bağlanır.
  delete from public.family_links where parent_id = teacher and student_id = kid;
  insert into public.family_links (parent_id, student_id, relation, subjects) values (teacher, kid, 'teacher', array['matematik', 'fen']);
  update public.profiles set hero_army = true, hero_corps = null, curriculum = 'tr' where id = kid;
  delete from public.reviews where student_id = kid and answered_at >= '2026-11-13T00:00:00+03:00';
  delete from public.word_answers where student_id = kid and answered_at >= '2026-11-13T00:00:00+03:00';
  delete from public.typing_results where student_id = kid and created_at >= '2026-11-13T00:00:00+03:00';
  delete from public.exam_questions where student_id = kid;

  -- Çocuk: ayarı ve kolu doğrudan değiştiremez, 100 olmadan seçemez
  perform set_config('request.jwt.claims', json_build_object('sub', kid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin update public.profiles set hero_army = false where id = kid; r := r || '{"cocuk_ayar": "degisti"}';
  exception when others then r := r || jsonb_build_object('cocuk_ayar', 'reddedildi'); end;
  begin update public.profiles set hero_corps = 'kara' where id = kid; r := r || '{"cocuk_kol_dogrudan": "degisti"}';
  exception when others then r := r || jsonb_build_object('cocuk_kol_dogrudan', 'reddedildi'); end;
  begin perform public.set_hero_corps('kara'); r := r || '{"erken_secim": "secti"}';
  exception when others then r := r || jsonb_build_object('erken_secim', 'reddedildi'); end;

  -- 800 hata tekrarı doğrusu, 400 öteki doğru, 50 yanlış (sayılmaz)
  perform set_config('role', 'postgres', true);
  insert into public.reviews (student_id, question_id, track, correct, duration_sec)
  select kid, qid, case when i <= 800 then 'mistake' else 'topic' end, i <= 1200, 30 from generate_series(1, 1250) i;

  perform set_config('role', 'authenticated', true);
  s := public.hero_army_state(kid);
  r := r || jsonb_build_object('cocuk_numara', (s->>'points')::int, 'bugun_oncesi', (s->>'before')::int);
  begin perform public.set_hero_corps('navy'); r := r || '{"yanlis_ulke": "secti"}';
  exception when others then r := r || jsonb_build_object('yanlis_ulke', 'reddedildi'); end;
  c := public.set_hero_corps('kara'); r := r || jsonb_build_object('secim', c);
  begin perform public.set_hero_corps('hava'); r := r || '{"ikinci_secim": "secti"}';
  exception when others then r := r || jsonb_build_object('ikinci_secim', 'reddedildi'); end;

  -- Veli: görür, kol yazamaz, sıfırlar, açma ayarını değiştirir
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', parent, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  s := public.hero_army_state(kid); r := r || jsonb_build_object('veli_numara', (s->>'points')::int);
  begin update public.profiles set hero_corps = 'deniz' where id = kid; r := r || '{"veli_kol_yazdi": "yazdi"}';
  exception when others then r := r || jsonb_build_object('veli_kol_yazdi', 'reddedildi'); end;
  update public.profiles set hero_corps = null where id = kid;
  r := r || jsonb_build_object('veli_sifirladi', (select hero_corps is null and hero_corps_at is null from public.profiles where id = kid));
  update public.profiles set hero_army = false where id = kid;
  r := r || jsonb_build_object('veli_ayar', (select hero_army from public.profiles where id = kid));

  -- Kapalıyken çocuk seçemez
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', kid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin perform public.set_hero_corps('kara'); r := r || '{"kapaliyken_secim": "secti"}';
  exception when others then r := r || jsonb_build_object('kapaliyken_secim', 'reddedildi'); end;

  -- Öğretmen: numarayı görmez, kolu sıfırlayamaz (kol önce yeniden yazılır)
  perform set_config('role', 'postgres', true);
  perform set_config('defter.hero_corps', 'secim', true);
  update public.profiles set hero_corps = 'hava' where id = kid;
  perform set_config('defter.hero_corps', '', true);
  perform set_config('request.jwt.claims', json_build_object('sub', teacher, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  s := public.hero_army_state(kid); r := r || jsonb_build_object('ogretmen_numara', coalesce(s->>'points', 'yok'));
  begin update public.profiles set hero_corps = null where id = kid; get diagnostics n = row_count;
  exception when others then n := 0; end;
  r := r || jsonb_build_object('ogretmen_sifirladi', n);

  -- Kardeş görmez
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', sibling, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  s := public.hero_army_state(kid); r := r || jsonb_build_object('kardes_numara', coalesce(s->>'points', 'yok'));

  perform set_config('role', 'postgres', true);
  raise exception 'SONUC %', r;
end $$;
