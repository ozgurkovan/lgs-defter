-- Kelime kahramanı yetki testi: çocuk kendi alışverişini yapar (araç da eşya da), aynı şeyi iki kez alamaz, kardeşi adına
-- alamaz, kahramanını ve görünüşünü kendisi değiştiremez, vesikalık fotoğraf yükleyemez; veli görür, adına alamaz, kız ya
-- da erkek oluşunu ve görünüşünü o seçer, fotoğrafı o yükler ve görür; İngilizce'si olmayan öğretmen ve kardeş alışverişi
-- göremez; fotoğrafı ne öğretmen ne kardeş görür. Sonuç hata mesajıyla döner; her şey geri alınır.
-- beklenen: {"cocuk_aldi":true,"cocuk_arac":true,"iki_kez":"reddedildi","kardes_adina":"reddedildi","cocuk_kahraman":"reddedildi","cocuk_gorunus":"reddedildi","cocuk_foto":"reddedildi","veli_goruyor":2,"veli_aldi":"reddedildi","veli_kahraman":"kiz","veli_gorunus":"3","veli_foto":true,"veli_foto_goruyor":1,"ogretmen_goruyor":0,"ogretmen_foto":0,"kardes_goruyor":0,"kardes_foto":0}
do $$
declare
  kid uuid := (select id from public.profiles where display_name = 'IrfTest' and role = 'student');
  sibling uuid := (select id from public.profiles where role = 'student' and id <> kid order by created_at limit 1);
  parent uuid := (select parent_id from public.family_links where student_id = kid and relation = 'parent' limit 1);
  teacher uuid := (select parent_id from public.family_links where student_id = kid and relation = 'teacher'
                     and subjects is not null and not ('ingilizce' = any(subjects)) limit 1);
  pid uuid;
  rid uuid;
  r jsonb := '{}';
  n int;
begin
  -- Çocuk alır (bir eşya, bir araç); aynısını iki kez alamaz, kardeşi adına alamaz, kahramanını ve görünüşünü
  -- değiştiremez, fotoğraf yükleyemez
  perform set_config('request.jwt.claims', json_build_object('sub', kid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  insert into public.purchases (student_id, item, price) values (kid, 'zz-test', 20) returning id into pid;
  r := r || jsonb_build_object('cocuk_aldi', pid is not null);
  insert into public.purchases (student_id, item, price) values (kid, 'zz-arac', 120) returning id into rid;
  r := r || jsonb_build_object('cocuk_arac', rid is not null);
  begin insert into public.purchases (student_id, item, price) values (kid, 'zz-test', 20); r := r || '{"iki_kez": "aldi"}';
  exception when others then r := r || jsonb_build_object('iki_kez', 'reddedildi'); end;
  begin insert into public.purchases (student_id, item, price) values (sibling, 'zz-test2', 20); r := r || '{"kardes_adina": "aldi"}';
  exception when others then r := r || jsonb_build_object('kardes_adina', 'reddedildi'); end;
  begin update public.profiles set avatar = 'erkek' where id = kid; r := r || '{"cocuk_kahraman": "degisti"}';
  exception when others then r := r || jsonb_build_object('cocuk_kahraman', 'reddedildi'); end;
  begin update public.profiles set hero_look = '{"ten": 1}' where id = kid; r := r || '{"cocuk_gorunus": "degisti"}';
  exception when others then r := r || jsonb_build_object('cocuk_gorunus', 'reddedildi'); end;
  begin insert into storage.objects (bucket_id, name) values ('kahraman', kid || '/foto.jpg'); r := r || '{"cocuk_foto": "yukledi"}';
  exception when others then r := r || jsonb_build_object('cocuk_foto', 'reddedildi'); end;

  -- Veli görür, çocuk adına alamaz; kahramanı ve görünüşünü seçer, fotoğrafı yükler ve görür
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', parent, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.purchases where id in (pid, rid); r := r || jsonb_build_object('veli_goruyor', n);
  begin insert into public.purchases (student_id, item, price) values (kid, 'zz-veli', 0); r := r || '{"veli_aldi": "evet"}';
  exception when others then r := r || jsonb_build_object('veli_aldi', 'reddedildi'); end;
  update public.profiles set avatar = 'kiz', hero_look = '{"ten": 3, "model": "uzun"}' where id = kid;
  r := r || jsonb_build_object('veli_kahraman', (select avatar from public.profiles where id = kid),
                               'veli_gorunus', (select hero_look ->> 'ten' from public.profiles where id = kid));
  begin insert into storage.objects (bucket_id, name) values ('kahraman', kid || '/foto.jpg'); r := r || '{"veli_foto": true}';
  exception when others then r := r || jsonb_build_object('veli_foto', SQLERRM); end;
  select count(*) into n from storage.objects where bucket_id = 'kahraman' and name = kid || '/foto.jpg';
  r := r || jsonb_build_object('veli_foto_goruyor', n);

  -- İngilizce'si olmayan öğretmen alışverişi de fotoğrafı da görmez
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', teacher, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.purchases where id in (pid, rid); r := r || jsonb_build_object('ogretmen_goruyor', n);
  select count(*) into n from storage.objects where bucket_id = 'kahraman'; r := r || jsonb_build_object('ogretmen_foto', n);

  -- Kardeş görmez
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', sibling, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.purchases where id in (pid, rid); r := r || jsonb_build_object('kardes_goruyor', n);
  select count(*) into n from storage.objects where bucket_id = 'kahraman'; r := r || jsonb_build_object('kardes_foto', n);

  perform set_config('role', 'postgres', true);
  raise exception 'SONUC %', r;
end $$;
