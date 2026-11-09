-- Konu durumunun geçmişi testi: durum değişince kimin değiştirdiği yazılır (öğrenci, veli, takvim); aynı durum yeniden
-- yazılınca kayıt eklenmez; kaydı çocuk, veli ve kardeş okuyamaz. Sonuç hata mesajıyla döner; her şey geri alınır.
-- beklenen: {"ogrenci":"not_taught:ogrenci","ayni_durum":1,"veli":"active:veli","takvim":"gap:takvim","eski_durum":"not_taught","cocuk_okur":"reddedildi","veli_okur":"reddedildi","kardes_okur":"reddedildi"}
do $$
declare
  kid uuid := (select id from public.profiles where display_name = 'IrfTest' and role = 'student');
  sibling uuid := (select id from public.profiles where role = 'student' and id <> kid order by created_at limit 1);
  parent uuid := (select parent_id from public.family_links where student_id = kid and relation = 'parent' limit 1);
  topic text := (select topic_id from public.topic_status where student_id = kid and status = 'active' order by topic_id limit 1);
  first_id bigint := coalesce((select max(id) from public.topic_status_log), 0); -- bu testten önceki son kayıt
  r jsonb := '{}';
  n int;
  last record;
begin
  -- Çocuk "henüz işlemedik" der; aynı durumu yeniden yazınca ikinci kayıt oluşmaz
  perform set_config('request.jwt.claims', json_build_object('sub', kid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  update public.topic_status set status = 'not_taught' where student_id = kid and topic_id = topic;
  update public.topic_status set status = 'not_taught', updated_at = now() where student_id = kid and topic_id = topic;
  begin select count(*) into n from public.topic_status_log; r := r || '{"cocuk_okur": "okudu"}';
  exception when others then r := r || jsonb_build_object('cocuk_okur', 'reddedildi'); end;

  -- Veli "işledik" der
  perform set_config('role', 'postgres', true);
  select * into last from public.topic_status_log where student_id = kid and topic_id = topic and id > first_id order by id desc limit 1;
  r := r || jsonb_build_object('ogrenci', last.status || ':' || last.source,
    'ayni_durum', (select count(*) from public.topic_status_log where student_id = kid and topic_id = topic and id > first_id));
  perform set_config('request.jwt.claims', json_build_object('sub', parent, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  update public.topic_status set status = 'active' where student_id = kid and topic_id = topic;
  begin select count(*) into n from public.topic_status_log; r := r || '{"veli_okur": "okudu"}';
  exception when others then r := r || jsonb_build_object('veli_okur', 'reddedildi'); end;

  -- Girişsiz değişiklik (saatlik iş, servis anahtarı) takvim sayılır
  perform set_config('role', 'postgres', true);
  select * into last from public.topic_status_log where student_id = kid and topic_id = topic and id > first_id order by id desc limit 1;
  r := r || jsonb_build_object('veli', last.status || ':' || last.source, 'eski_durum', last.old_status);
  perform set_config('request.jwt.claims', '', true);
  update public.topic_status set status = 'gap' where student_id = kid and topic_id = topic;
  select * into last from public.topic_status_log where student_id = kid and topic_id = topic and id > first_id order by id desc limit 1;
  r := r || jsonb_build_object('takvim', last.status || ':' || last.source);

  -- Kardeş okuyamaz
  perform set_config('request.jwt.claims', json_build_object('sub', sibling, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin select count(*) into n from public.topic_status_log; r := r || '{"kardes_okur": "okudu"}';
  exception when others then r := r || jsonb_build_object('kardes_okur', 'reddedildi'); end;

  perform set_config('role', 'postgres', true);
  raise exception 'SONUC %', r;
end $$;
