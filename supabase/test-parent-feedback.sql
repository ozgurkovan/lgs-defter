-- Veli geri bildirimi testi: veli kendi yazışmasına yazar ve yalnız onu görür; 'asistan' ya da 'ekip' adına yazamaz, sınıf ve
-- özet alanlarını dolduramaz; günde 10 mesajdan fazlası reddedilir; çocuk yazamaz ve hiçbir mesajı görmez; başka veli
-- görmez; okunmamış cevap sayılır ve açınca okundu olur; yönetici gelen kutusunu görür, 'ekip' olarak cevaplar, veli
-- yönetici değilken gelen kutusu boştur. Sonuç hata mesajıyla döner; her şey geri alınır.
-- beklenen: {"veli_yazdi":true,"asistan_adina":"reddedildi","ozet_dolduramaz":"reddedildi","veli_goruyor":2,"okunmamis":1,"okundu":1,"okunmamis_sonra":0,"on_bir":"reddedildi","cocuk_yazamaz":"reddedildi","cocuk_goruyor":0,"baska_veli_goruyor":0,"baska_veli_kutu":0,"yonetici_degil":false,"yonetici":true,"kutu":1,"kutu_acil":1,"kutu_bekliyor":true,"asistan_yeterse":false,"asistan_cevapladi":"asistan","ekip_cevabi":"yazdi","goruldu":10,"cevaptan_sonra_bekliyor":false,"istekler":1,"ekip_siniflar":true,"yapilacak":1,"yapilacak_sinif":"oneri","veli_siniflayamaz":false,"veli_istek_goremez":0}
do $$
declare
  kid uuid := (select id from public.profiles where display_name = 'IrfTest' and role = 'student');
  parent uuid := (select id from public.profiles where display_name = 'Test Veli' and role = 'parent');
  other_parent uuid := (select id from public.profiles where display_name = 'ABD Veli' and role = 'parent');
  r jsonb := '{}';
  j jsonb;
  n int;
  i int;
  first_id uuid;
begin
  delete from public.feedback_messages where parent_id in (parent, other_parent);
  delete from public.app_admins;

  -- Veli yazar
  perform set_config('request.jwt.claims', json_build_object('sub', parent, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  insert into public.feedback_messages (parent_id, sender, body) values (parent, 'veli', 'Test: günlük plan ekranı açılmıyor.') returning id into first_id;
  r := r || jsonb_build_object('veli_yazdi', first_id is not null);
  begin insert into public.feedback_messages (parent_id, sender, body) values (parent, 'asistan', 'x'); r := r || '{"asistan_adina": "yazdi"}';
  exception when others then r := r || '{"asistan_adina": "reddedildi"}'; end;
  begin insert into public.feedback_messages (parent_id, sender, body, priority) values (parent, 'veli', 'x', 1); r := r || '{"ozet_dolduramaz": "yazdi"}';
  exception when others then r := r || '{"ozet_dolduramaz": "reddedildi"}'; end;
  r := r || jsonb_build_object('yonetici_degil', public.is_admin());

  -- Saatlik görev sınıflar ve karşılık yazar (gizli anahtar)
  perform set_config('role', 'postgres', true);
  update public.feedback_messages set category = 'sorun', priority = 1, summary = 'Veli: günlük plan ekranı açılmıyor.', triaged_at = now() where id = first_id;
  insert into public.feedback_messages (parent_id, sender, body) values (parent, 'asistan', 'Test karşılık');
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.feedback_messages; r := r || jsonb_build_object('veli_goruyor', n);
  r := r || jsonb_build_object('okunmamis', public.feedback_unread());
  r := r || jsonb_build_object('okundu', public.feedback_mark_read());
  r := r || jsonb_build_object('okunmamis_sonra', public.feedback_unread());

  -- Günde 10 mesaj
  for i in 2..10 loop insert into public.feedback_messages (parent_id, sender, body) values (parent, 'veli', 'Test ' || i); end loop;
  begin insert into public.feedback_messages (parent_id, sender, body) values (parent, 'veli', 'Test 11'); r := r || '{"on_bir": "yazdi"}';
  exception when others then r := r || '{"on_bir": "reddedildi"}'; end;

  -- Çocuk
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', kid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin insert into public.feedback_messages (parent_id, sender, body) values (kid, 'veli', 'x'); r := r || '{"cocuk_yazamaz": "yazdi"}';
  exception when others then r := r || '{"cocuk_yazamaz": "reddedildi"}'; end;
  select count(*) into n from public.feedback_messages; r := r || jsonb_build_object('cocuk_goruyor', n);

  -- Başka veli
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', other_parent, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.feedback_messages; r := r || jsonb_build_object('baska_veli_goruyor', n);
  r := r || jsonb_build_object('baska_veli_kutu', jsonb_array_length(public.feedback_inbox()));

  -- Yönetici (başka veli yönetici yapılır)
  perform set_config('role', 'postgres', true);
  insert into public.app_admins (user_id) values (other_parent);
  perform set_config('role', 'authenticated', true);
  j := public.feedback_inbox();
  r := r || jsonb_build_object('yonetici', public.is_admin(), 'kutu', jsonb_array_length(j),
    'kutu_acil', j->0->'priority', 'kutu_bekliyor', j->0->'waiting');
  -- Asistan hepsini kendi cevapladıysa (needs_team = false) ekibi beklemez
  perform set_config('role', 'postgres', true);
  update public.feedback_messages set needs_team = false, triaged_at = now() where parent_id = parent and sender = 'veli';
  perform set_config('role', 'authenticated', true);
  r := r || jsonb_build_object('asistan_yeterse', public.feedback_inbox()->0->'waiting', 'asistan_cevapladi', public.feedback_inbox()->0->>'answered_by');
  perform set_config('role', 'postgres', true);
  update public.feedback_messages set needs_team = true where id = first_id;
  delete from public.unlock_requests where parent_id = parent;
  insert into public.unlock_requests (parent_id, note) values (parent, 'test');
  perform set_config('role', 'authenticated', true);
  r := r || jsonb_build_object('istekler', jsonb_array_length(public.admin_unlock_requests()));
  begin insert into public.feedback_messages (parent_id, sender, body) values (parent, 'ekip', 'Test ekip cevabı'); r := r || '{"ekip_cevabi": "yazdi"}';
  exception when others then r := r || '{"ekip_cevabi": "reddedildi"}'; end;
  -- Aynı işlemde bütün satırların saati aynıdır; ekip cevabı sonradan yazılmış olsun.
  perform set_config('role', 'postgres', true);
  update public.feedback_messages set created_at = now() + interval '1 second' where parent_id = parent and sender = 'ekip';
  perform set_config('role', 'authenticated', true);
  r := r || jsonb_build_object('ekip_siniflar', public.feedback_set(first_id, 'oneri', 'yapilacak'));
  r := r || jsonb_build_object('yapilacak', jsonb_array_length(public.feedback_todo()), 'yapilacak_sinif', public.feedback_todo()->0->>'category');
  r := r || jsonb_build_object('goruldu', public.feedback_team_seen(parent));
  r := r || jsonb_build_object('cevaptan_sonra_bekliyor', public.feedback_inbox()->0->'waiting');

  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', parent, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  r := r || jsonb_build_object('veli_istek_goremez', jsonb_array_length(public.admin_unlock_requests()),
    'veli_siniflayamaz', public.feedback_set(first_id, 'sorun', 'yok'));
  perform set_config('role', 'postgres', true);
  raise exception 'SONUC %', r;
end $$;
