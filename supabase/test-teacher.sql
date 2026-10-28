-- Öğretmen erişim testi. Geçici öğretmen kaydı oluşturur, sonuçları hata mesajıyla döndürür;
-- hata yüzünden her şey geri alınır, veritabanında hiçbir iz kalmaz.
do $$
declare
  t uuid := gen_random_uuid();
  isla uuid := (select id from public.profiles where display_name = 'Isla' and role = 'student');
  other uuid := (select id from public.profiles where role = 'student' and id <> isla order by created_at limit 1);
  r jsonb;
  can_write text;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values (t, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-test-teacher@example.invalid', '', now(), now(), now());
  insert into public.profiles (id, role, display_name) values (t, 'teacher', 'Test Öğretmen');
  insert into public.family_links (parent_id, student_id, relation) values (t, isla, 'teacher');

  perform set_config('request.jwt.claims', json_build_object('sub', t, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select jsonb_build_object(
    'isla_konu', (select count(*) from public.items where student_id = isla),
    'diger_cocuk_konu', (select count(*) from public.items where student_id = other),
    'gordugu_profil', (select string_agg(display_name, ', ') from public.profiles)
  ) into r;
  begin
    update public.items set due_date = due_date where student_id = isla;
    get diagnostics can_write = row_count;
  exception when others then can_write := 'hata';
  end;
  perform set_config('role', 'postgres', true);
  raise exception 'SONUC %', r || jsonb_build_object('isla_kaydini_degistirebildi', can_write);
end $$;
