-- Şiir dizeleri yetki testi: çocuk kendi dizesini yazar ve görür, değiştiremez ve silemez, kardeşi adına yazamaz;
-- veli görür ama yazamaz; Türkçe'si olmayan öğretmen ve kardeş göremez. Sonuç hata mesajıyla döner; her şey geri alınır.
-- beklenen: {"cocuk_yazdi":true,"cocuk_goruyor":1,"kardes_adina":"reddedildi","cocuk_degistirdi":"reddedildi","cocuk_sildi":"reddedildi","veli_goruyor":1,"veli_yazdi":"reddedildi","ogretmen_goruyor":0,"kardes_goruyor":0}
do $$
declare
  kid uuid := (select id from public.profiles where display_name = 'IrfTest' and role = 'student');
  sibling uuid := (select id from public.profiles where role = 'student' and id <> kid order by created_at limit 1);
  parent uuid := (select parent_id from public.family_links where student_id = kid and relation = 'parent' limit 1);
  teacher uuid := (select parent_id from public.family_links where student_id = kid and relation = 'teacher' limit 1);
  lid uuid;
  r jsonb := '{}';
  n int;
begin
  -- Çocuk yazar ve görür
  perform set_config('request.jwt.claims', json_build_object('sub', kid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  insert into public.poem_lines (student_id, poem_key, line, result) values (kid, 'dandini', 'Gelmesin bu yanayı', 'kafiyeli') returning id into lid;
  r := r || jsonb_build_object('cocuk_yazdi', lid is not null);
  select count(*) into n from public.poem_lines where id = lid; r := r || jsonb_build_object('cocuk_goruyor', n);
  begin insert into public.poem_lines (student_id, poem_key, line, result) values (sibling, 'dandini', 'sahte', 'serbest'); r := r || '{"kardes_adina": "yazdi"}';
  exception when others then r := r || jsonb_build_object('kardes_adina', 'reddedildi'); end;
  begin update public.poem_lines set line = 'değişti' where id = lid; r := r || '{"cocuk_degistirdi": "evet"}';
  exception when others then r := r || jsonb_build_object('cocuk_degistirdi', 'reddedildi'); end;
  begin delete from public.poem_lines where id = lid; r := r || '{"cocuk_sildi": "evet"}';
  exception when others then r := r || jsonb_build_object('cocuk_sildi', 'reddedildi'); end;

  -- Veli görür, çocuk adına yazamaz
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', parent, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.poem_lines where id = lid; r := r || jsonb_build_object('veli_goruyor', n);
  begin insert into public.poem_lines (student_id, poem_key, line, result) values (kid, 'dandini', 'veliden', 'serbest'); r := r || '{"veli_yazdi": "evet"}';
  exception when others then r := r || jsonb_build_object('veli_yazdi', 'reddedildi'); end;

  -- Matematik + fen öğretmeni görmez
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', teacher, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.poem_lines where id = lid; r := r || jsonb_build_object('ogretmen_goruyor', n);

  -- Kardeş görmez
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', sibling, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.poem_lines where id = lid; r := r || jsonb_build_object('kardes_goruyor', n);

  perform set_config('role', 'postgres', true);
  raise exception 'SONUC %', r;
end $$;
