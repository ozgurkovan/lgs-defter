-- Aile mesajları yetki testi: veli yazar, çocuk okur ve "okudum" der, çocuk metni değiştiremez,
-- kardeş göremez, öğrenci kendine/başkasına mesaj yazamaz. Sonuç hata mesajıyla döner; her şey geri alınır.
-- beklenen: {"veli_yazdi":true,"cocuk_sildi":0,"cocuk_okudum":1,"cocuk_goruyor":1,"kardes_goruyor":0,"veli_baskasi_adina":"reddedildi","cocuk_kendine_yazdi":"reddedildi","cocuk_metin_degistirdi":"reddedildi"}
do $$
declare
  kid uuid := (select id from public.profiles where display_name = 'IrfTest' and role = 'student');
  sibling uuid := (select id from public.profiles where role = 'student' and id <> kid order by created_at limit 1);
  parent uuid := (select parent_id from public.family_links where student_id = kid and relation = 'parent' limit 1);
  mid uuid;
  r jsonb := '{}';
  n int;
begin
  -- Veli yazar
  perform set_config('request.jwt.claims', json_build_object('sub', parent, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  insert into public.family_messages (student_id, from_id, signature, body) values (kid, parent, 'Baban', 'Kolay gelsin şampiyon!') returning id into mid;
  r := r || jsonb_build_object('veli_yazdi', mid is not null);
  begin insert into public.family_messages (student_id, from_id, body) values (kid, kid, 'sahte'); r := r || '{"veli_baskasi_adina": "yazdi"}';
  exception when others then r := r || jsonb_build_object('veli_baskasi_adina', 'reddedildi'); end;

  -- Çocuk okur, okudum der, metni değiştiremez, kendine yazamaz
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', kid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.family_messages where id = mid; r := r || jsonb_build_object('cocuk_goruyor', n);
  update public.family_messages set seen_at = now() where id = mid; get diagnostics n = row_count; r := r || jsonb_build_object('cocuk_okudum', n);
  begin update public.family_messages set body = 'değişti' where id = mid; r := r || '{"cocuk_metin_degistirdi": "evet"}';
  exception when others then r := r || jsonb_build_object('cocuk_metin_degistirdi', 'reddedildi'); end;
  begin insert into public.family_messages (student_id, from_id, body) values (kid, kid, 'kendime'); r := r || '{"cocuk_kendine_yazdi": "evet"}';
  exception when others then r := r || jsonb_build_object('cocuk_kendine_yazdi', 'reddedildi'); end;
  begin delete from public.family_messages where id = mid; get diagnostics n = row_count; r := r || jsonb_build_object('cocuk_sildi', n);
  exception when others then r := r || jsonb_build_object('cocuk_sildi', 'reddedildi'); end;

  -- Kardeş göremez
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', sibling, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.family_messages where id = mid; r := r || jsonb_build_object('kardes_goruyor', n);

  perform set_config('role', 'postgres', true);
  raise exception 'SONUC %', r;
end $$;
