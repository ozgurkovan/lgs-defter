-- Kelime kahramanı yetki testi: çocuk kendi alışverişini yapar, aynı eşyayı iki kez alamaz, kardeşi adına alamaz,
-- kahramanını kendisi değiştiremez; veli görür, adına alamaz, kız ya da erkek oluşunu o seçer; İngilizce'si olmayan
-- öğretmen ve kardeş göremez. Sonuç hata mesajıyla döner; her şey geri alınır.
-- beklenen: {"cocuk_aldi":true,"iki_kez":"reddedildi","kardes_adina":"reddedildi","cocuk_kahraman":"reddedildi","veli_goruyor":1,"veli_aldi":"reddedildi","veli_kahraman":"kiz","ogretmen_goruyor":0,"kardes_goruyor":0}
do $$
declare
  kid uuid := (select id from public.profiles where display_name = 'IrfTest' and role = 'student');
  sibling uuid := (select id from public.profiles where role = 'student' and id <> kid order by created_at limit 1);
  parent uuid := (select parent_id from public.family_links where student_id = kid and relation = 'parent' limit 1);
  teacher uuid := (select parent_id from public.family_links where student_id = kid and relation = 'teacher'
                     and subjects is not null and not ('ingilizce' = any(subjects)) limit 1);
  pid uuid;
  r jsonb := '{}';
  n int;
begin
  -- Çocuk alır; aynısını iki kez alamaz, kardeşi adına alamaz, kahramanını değiştiremez
  perform set_config('request.jwt.claims', json_build_object('sub', kid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  insert into public.purchases (student_id, item, price) values (kid, 'zz-test', 20) returning id into pid;
  r := r || jsonb_build_object('cocuk_aldi', pid is not null);
  begin insert into public.purchases (student_id, item, price) values (kid, 'zz-test', 20); r := r || '{"iki_kez": "aldi"}';
  exception when others then r := r || jsonb_build_object('iki_kez', 'reddedildi'); end;
  begin insert into public.purchases (student_id, item, price) values (sibling, 'zz-test2', 20); r := r || '{"kardes_adina": "aldi"}';
  exception when others then r := r || jsonb_build_object('kardes_adina', 'reddedildi'); end;
  begin update public.profiles set avatar = 'erkek' where id = kid; r := r || '{"cocuk_kahraman": "degisti"}';
  exception when others then r := r || jsonb_build_object('cocuk_kahraman', 'reddedildi'); end;

  -- Veli görür, çocuk adına alamaz, kahramanı seçer
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', parent, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.purchases where id = pid; r := r || jsonb_build_object('veli_goruyor', n);
  begin insert into public.purchases (student_id, item, price) values (kid, 'zz-veli', 0); r := r || '{"veli_aldi": "evet"}';
  exception when others then r := r || jsonb_build_object('veli_aldi', 'reddedildi'); end;
  update public.profiles set avatar = 'kiz' where id = kid;
  r := r || jsonb_build_object('veli_kahraman', (select avatar from public.profiles where id = kid));

  -- İngilizce'si olmayan öğretmen görmez
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', teacher, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.purchases where id = pid; r := r || jsonb_build_object('ogretmen_goruyor', n);

  -- Kardeş görmez
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', sibling, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.purchases where id = pid; r := r || jsonb_build_object('kardes_goruyor', n);

  perform set_config('role', 'postgres', true);
  raise exception 'SONUC %', r;
end $$;
