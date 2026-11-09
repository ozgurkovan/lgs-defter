-- Kahramanı besleme yetki testi: çocuk kendi yemeğini yazar, kardeşi adına yazamaz, besleme ayarını kendisi
-- değiştiremez, bronz sayımını görür; veli görür, çocuk adına yediremez, ayarı o değiştirir; öğretmen ve kardeş ne
-- yemekleri ne sayımı görür. Sonuç hata mesajıyla döner; her şey geri alınır.
-- beklenen: {"cocuk_yazdi":true,"kardes_adina":"reddedildi","cocuk_ayar":"reddedildi","cocuk_sayim":7,"veli_goruyor":1,"veli_yazdi":"reddedildi","veli_ayar":false,"veli_sayim":7,"ogretmen_goruyor":0,"ogretmen_sayim":"yok","kardes_goruyor":0,"kardes_sayim":"yok"}
do $$
declare
  kid uuid := (select id from public.profiles where display_name = 'IrfTest' and role = 'student');
  sibling uuid := (select id from public.profiles where role = 'student' and id <> kid order by created_at limit 1);
  parent uuid := (select parent_id from public.family_links where student_id = kid and relation = 'parent' limit 1);
  teacher uuid := (select id from public.profiles where display_name = 'Test Öğretmen' and role = 'teacher');
  since timestamptz := now() - interval '1 minute';
  rid uuid;
  r jsonb := '{}';
  n int;
  s jsonb;
begin
  -- Test öğretmeni bu testte IrfTest'e matematik ve fen için bağlanır (geri alınır); gerçek bağları ne olursa olsun test aynı çalışır.
  delete from public.family_links where parent_id = teacher and student_id = kid;
  insert into public.family_links (parent_id, student_id, relation, subjects) values (teacher, kid, 'teacher', array['matematik', 'fen']);
  -- Çocuk yedirir; kardeşi adına yediremez, besleme ayarını değiştiremez, kendi sayımını görür
  perform set_config('request.jwt.claims', json_build_object('sub', kid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  insert into public.hero_meals (student_id, food, price, value, after) values (kid, 'sut', 7, 10, 60) returning id into rid;
  r := r || jsonb_build_object('cocuk_yazdi', rid is not null);
  begin insert into public.hero_meals (student_id, food, price, value, after) values (sibling, 'sut', 1, 10, 10); r := r || '{"kardes_adina": "yazdi"}';
  exception when others then r := r || jsonb_build_object('kardes_adina', 'reddedildi'); end;
  begin update public.profiles set hero_feed = true, hero_pauses = '[]' where id = kid; r := r || '{"cocuk_ayar": "degisti"}';
  exception when others then r := r || jsonb_build_object('cocuk_ayar', 'reddedildi'); end;
  s := public.hero_feed_stats(kid, since); r := r || jsonb_build_object('cocuk_sayim', (s->>'spent')::int);

  -- Veli görür, çocuk adına yediremez, ayarı o değiştirir
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', parent, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.hero_meals where id = rid; r := r || jsonb_build_object('veli_goruyor', n);
  begin insert into public.hero_meals (student_id, food, price, value, after) values (kid, 'elma', 1, 6, 66); r := r || '{"veli_yazdi": "evet"}';
  exception when others then r := r || jsonb_build_object('veli_yazdi', 'reddedildi'); end;
  update public.profiles set hero_feed = false, hero_pauses = '[]' where id = kid;
  r := r || jsonb_build_object('veli_ayar', (select hero_feed from public.profiles where id = kid));
  s := public.hero_feed_stats(kid, since); r := r || jsonb_build_object('veli_sayim', (s->>'spent')::int);

  -- Öğretmen görmez (dersi değil)
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', teacher, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.hero_meals where id = rid; r := r || jsonb_build_object('ogretmen_goruyor', n);
  s := public.hero_feed_stats(kid, since); r := r || jsonb_build_object('ogretmen_sayim', coalesce(s->>'spent', 'yok'));

  -- Kardeş görmez
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', sibling, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.hero_meals where id = rid; r := r || jsonb_build_object('kardes_goruyor', n);
  s := public.hero_feed_stats(kid, since); r := r || jsonb_build_object('kardes_sayim', coalesce(s->>'spent', 'yok'));

  perform set_config('role', 'postgres', true);
  raise exception 'SONUC %', r;
end $$;
