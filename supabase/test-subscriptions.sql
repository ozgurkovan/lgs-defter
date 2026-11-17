-- Abonelik testi: aboneliği olmayan aile 'free'; veliye abonelik yazılınca velisi, çocuğu ve kardeşi 'family' olur;
-- başka ailenin velisi ve çocuğu 'free' kalır; süresi biten abonelik sayılmaz. Çocuk da veli de abonelik satırı
-- yazamaz; veli yalnız kendi satırını görür, çocuk ve başka veli hiçbir satır görmez.
-- Sonuç hata mesajıyla döner; her şey geri alınır.
-- beklenen: {"once_cocuk":"free","cocuk":"family","kardes":"family","veli":"family","baska_cocuk":"free","baska_veli":"free","cocuk_satir":0,"veli_satir":1,"baska_veli_satir":0,"cocuk_yazamaz":"reddedildi","veli_yazamaz":"reddedildi","suresi_bitmis":"free"}
do $$
declare
  kid uuid := (select id from public.profiles where display_name = 'IrfTest' and role = 'student');
  sibling uuid := (select id from public.profiles where display_name = 'test4.sinif' and role = 'student');
  parent uuid := (select id from public.profiles where display_name = 'Test Veli' and role = 'parent');
  other_parent uuid := (select id from public.profiles where display_name = 'ABD Veli' and role = 'parent');
  other_kid uuid := (select student_id from public.family_links where parent_id = other_parent and relation = 'parent' limit 1);
  r jsonb := '{}';
  n int;
begin
  delete from public.subscriptions where parent_id in (parent, other_parent);

  perform set_config('request.jwt.claims', json_build_object('sub', kid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  r := r || jsonb_build_object('once_cocuk', public.my_plan());

  perform set_config('role', 'postgres', true);
  insert into public.subscriptions (parent_id, source, note) values (parent, 'gift', 'test');

  perform set_config('role', 'authenticated', true);
  r := r || jsonb_build_object('cocuk', public.my_plan());
  select count(*) into n from public.subscriptions; r := r || jsonb_build_object('cocuk_satir', n);
  begin insert into public.subscriptions (parent_id) values (parent); r := r || '{"cocuk_yazamaz": "yazdi"}';
  exception when others then r := r || '{"cocuk_yazamaz": "reddedildi"}'; end;

  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', sibling, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  r := r || jsonb_build_object('kardes', public.my_plan());

  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', parent, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  r := r || jsonb_build_object('veli', public.my_plan());
  select count(*) into n from public.subscriptions; r := r || jsonb_build_object('veli_satir', n);

  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', other_kid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  r := r || jsonb_build_object('baska_cocuk', public.my_plan());

  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', other_parent, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  r := r || jsonb_build_object('baska_veli', public.my_plan());
  select count(*) into n from public.subscriptions; r := r || jsonb_build_object('baska_veli_satir', n);
  begin insert into public.subscriptions (parent_id) values (other_parent); r := r || '{"veli_yazamaz": "yazdi"}';
  exception when others then r := r || '{"veli_yazamaz": "reddedildi"}'; end;

  perform set_config('role', 'postgres', true);
  update public.subscriptions set ends_at = now() - interval '1 day' where parent_id = parent;
  perform set_config('request.jwt.claims', json_build_object('sub', kid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  r := r || jsonb_build_object('suresi_bitmis', public.my_plan());

  perform set_config('role', 'postgres', true);
  raise exception 'SONUC %', r;
end $$;
