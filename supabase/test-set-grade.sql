-- Sınıf değiştirme testi (set_student_grade): veli test4'ün sınıfını 3 yapınca 3. sınıfın konuları hemen açılır, 4. sınıfın
-- konu tekrarları duraklar; 4'e dönünce duraklayanlar yeniden açılır ve yeni konu açılmaz. Çocuk ve öğretmen
-- değiştiremez, geçersiz sınıf reddedilir. Sonuç hata mesajıyla döner; her şey geri alınır.
-- beklenen: {"cocuk":"reddedildi","ogretmen":"reddedildi","gecersiz":"reddedildi","uce_acilan":true,"uce_duran":true,"uc_sinif":3,"dorde_donen":true,"dorde_yeni":0,"dort_sinif":4,"dort_aktif_ayni":true}
do $$
declare
  kid uuid := (select id from public.profiles where display_name = 'test4.sinif' and role = 'student');
  parent uuid := (select id from public.profiles where display_name = 'Test Veli' and role = 'parent');
  teacher uuid := (select id from public.profiles where display_name = 'Test Öğretmen' and role = 'teacher');
  before_active int := (select count(*) from public.items where student_id = kid and track = 'topic' and state = 'active');
  r jsonb := '{}';
  x jsonb;
begin
  delete from public.family_links where parent_id = teacher and student_id = kid;
  insert into public.family_links (parent_id, student_id, relation, subjects) values (teacher, kid, 'teacher', null);

  -- Çocuk kendi sınıfını değiştiremez
  perform set_config('request.jwt.claims', json_build_object('sub', kid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin perform public.set_student_grade(kid, 3); r := r || '{"cocuk": "degisti"}';
  exception when others then r := r || '{"cocuk": "reddedildi"}'; end;

  -- Öğretmen değiştiremez
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', teacher, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin perform public.set_student_grade(kid, 3); r := r || '{"ogretmen": "degisti"}';
  exception when others then r := r || '{"ogretmen": "reddedildi"}'; end;

  -- Veli: geçersiz sınıf reddedilir; 3'e alır, sonra 4'e döner
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', parent, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin perform public.set_student_grade(kid, 9); r := r || '{"gecersiz": "kabul"}';
  exception when others then r := r || '{"gecersiz": "reddedildi"}'; end;
  x := public.set_student_grade(kid, 3);
  r := r || jsonb_build_object('uce_acilan', (x->>'opened')::int > 0, 'uce_duran', (x->>'paused')::int > 0,
    'uc_sinif', (select grade from public.profiles where id = kid));
  x := public.set_student_grade(kid, 4);
  r := r || jsonb_build_object('dorde_donen', (x->>'resumed')::int > 0, 'dorde_yeni', (x->>'opened')::int,
    'dort_sinif', (select grade from public.profiles where id = kid));
  perform set_config('role', 'postgres', true);
  r := r || jsonb_build_object('dort_aktif_ayni',
    (select count(*) from public.items i join public.topics t on t.id = i.topic_id
      where i.student_id = kid and i.track = 'topic' and i.state = 'active' and t.grade = 4) >= before_active - 0
    and (select count(*) from public.items where student_id = kid and track = 'topic' and state = 'active' and note = 'Sınıf değişti') = 0);
  raise exception 'SONUC %', r;
end $$;
