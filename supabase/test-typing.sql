-- Klavye dersleri yetki testi: çocuk kendi sonucunu yazar, kardeşi adına yazamaz, günlük ders sayısını kendisi
-- değiştiremez; veli görür, adına yazamaz, ders sayısını o seçer; öğretmen ve kardeş göremez. Sonuç hata mesajıyla
-- döner; her şey geri alınır.
-- beklenen: {"cocuk_yazdi":true,"kardes_adina":"reddedildi","cocuk_ayar":"reddedildi","veli_goruyor":1,"veli_yazdi":"reddedildi","veli_ayar":3,"ogretmen_goruyor":0,"kardes_goruyor":0}
do $$
declare
  kid uuid := (select id from public.profiles where display_name = 'IrfTest' and role = 'student');
  sibling uuid := (select id from public.profiles where role = 'student' and id <> kid order by created_at limit 1);
  parent uuid := (select parent_id from public.family_links where student_id = kid and relation = 'parent' limit 1);
  teacher uuid := (select parent_id from public.family_links where student_id = kid and relation = 'teacher' limit 1);
  rid uuid;
  r jsonb := '{}';
  n int;
begin
  -- Çocuk yazar; kardeşi adına yazamaz, ders sayısını değiştiremez
  perform set_config('request.jwt.claims', json_build_object('sub', kid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  insert into public.typing_results (student_id, lesson, chars, errors, seconds, stars, misses)
    values (kid, 'fj', 66, 2, 70, 2, '{"f": 1, "j": 1}') returning id into rid;
  r := r || jsonb_build_object('cocuk_yazdi', rid is not null);
  begin insert into public.typing_results (student_id, lesson, chars, errors, seconds, stars) values (sibling, 'fj', 10, 0, 10, 3); r := r || '{"kardes_adina": "yazdi"}';
  exception when others then r := r || jsonb_build_object('kardes_adina', 'reddedildi'); end;
  begin update public.profiles set daily_typing = 9 where id = kid; r := r || '{"cocuk_ayar": "degisti"}';
  exception when others then r := r || jsonb_build_object('cocuk_ayar', 'reddedildi'); end;

  -- Veli görür, çocuk adına yazamaz, ders sayısını seçer
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', parent, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.typing_results where id = rid; r := r || jsonb_build_object('veli_goruyor', n);
  begin insert into public.typing_results (student_id, lesson, chars, errors, seconds, stars) values (kid, 'dk', 10, 0, 10, 3); r := r || '{"veli_yazdi": "evet"}';
  exception when others then r := r || jsonb_build_object('veli_yazdi', 'reddedildi'); end;
  update public.profiles set daily_typing = 3 where id = kid;
  r := r || jsonb_build_object('veli_ayar', (select daily_typing from public.profiles where id = kid));

  -- Öğretmen görmez (dersi değil, çocuğun kendi çalışması)
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', teacher, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.typing_results where id = rid; r := r || jsonb_build_object('ogretmen_goruyor', n);

  -- Kardeş görmez
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', sibling, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.typing_results where id = rid; r := r || jsonb_build_object('kardes_goruyor', n);

  perform set_config('role', 'postgres', true);
  raise exception 'SONUC %', r;
end $$;
