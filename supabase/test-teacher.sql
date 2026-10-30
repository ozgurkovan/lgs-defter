-- Öğretmen erişim testi (ders kısıtlı). Geçici öğretmen kaydı oluşturur, sonuçları hata mesajıyla
-- döndürür; hata yüzünden her şey geri alınır, veritabanında hiçbir iz kalmaz.
-- beklenen: {"diger_cocuk":0,"foto_tam_sayfa":false,"foto_ing_kirpik":false,"foto_mat_kirpik":true,"foto_diger_cocuk":false,"ogrenci_konu_takibi":">0","yazabildigi_kayit":"0","ogrenci_konu_dersleri":"matematik"}
do $$
declare
  t uuid := gen_random_uuid();
  kid uuid := (select id from public.profiles where role = 'student' order by created_at limit 1);
  other uuid := (select id from public.profiles where role = 'student' and id <> kid order by created_at limit 1);
  r jsonb;
  can_write text;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values (t, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-test-teacher@example.invalid', '', now(), now(), now());
  insert into public.profiles (id, role, display_name) values (t, 'teacher', 'Test Öğretmen');
  insert into public.family_links (parent_id, student_id, relation, subjects) values (t, kid, 'teacher', array['matematik']);

  perform set_config('request.jwt.claims', json_build_object('sub', t, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select jsonb_build_object(
    'ogrenci_konu_takibi', (select count(*) from public.items where student_id = kid),
    'ogrenci_konu_dersleri', (select string_agg(distinct public.topic_subject(topic_id), ',') from public.topic_status where student_id = kid),
    'diger_cocuk', (select count(*) from public.items where student_id = other),
    'foto_mat_kirpik', public.can_see_photo(kid || '/x/q-matematik-3.jpg'),
    'foto_ing_kirpik', public.can_see_photo(kid || '/x/q-ingilizce-3.jpg'),
    'foto_tam_sayfa', public.can_see_photo(kid || '/x/001-kitapcik.jpg'),
    'foto_diger_cocuk', public.can_see_photo(other || '/x/q-matematik-3.jpg')
  ) into r;
  begin
    update public.items set due_date = due_date where student_id = kid;
    get diagnostics can_write = row_count;
  exception when others then can_write := 'hata';
  end;
  perform set_config('role', 'postgres', true);
  raise exception 'SONUC %', r || jsonb_build_object('yazabildigi_kayit', can_write);
end $$;
