-- "Birlikte baktık" yetki testi. Geçici bir öğretmen (sadece Türkçe) oluşturur; veli, öğretmen ve öğrenci
-- olarak işaretlemeyi dener. Sonuç hata mesajıyla döner; her değişiklik geri alınır.
do $$
declare
  t uuid := gen_random_uuid();
  kid uuid := (select id from public.profiles where display_name = 'IrfTest' and role = 'student');
  sibling uuid := (select id from public.profiles where role = 'student' and id <> kid order by created_at limit 1);
  parent uuid := (select parent_id from public.family_links where student_id = kid and relation = 'parent' limit 1);
  tr_row uuid := (select id from public.reviews where student_id = kid and public.question_subject(question_id) = 'turkce' order by answered_at desc limit 1);
  tr_row2 uuid := (select id from public.reviews where student_id = kid and public.question_subject(question_id) = 'turkce' order by answered_at desc offset 1 limit 1);
  mat_row uuid := (select id from public.reviews where student_id = kid and public.question_subject(question_id) = 'matematik' limit 1);
  r jsonb := '{}';
  n int;
  as_user text;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values (t, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-test-teacher@example.invalid', '', now(), now(), now());
  insert into public.profiles (id, role, display_name) values (t, 'teacher', 'Test Öğretmen');
  insert into public.family_links (parent_id, student_id, relation, subjects) values (t, kid, 'teacher', array['turkce']);

  -- Öğretmen (Türkçe)
  perform set_config('request.jwt.claims', json_build_object('sub', t, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin r := r || jsonb_build_object('ogretmen_turkce_sorusu', public.mark_together(tr_row));
  exception when others then r := r || jsonb_build_object('ogretmen_turkce_sorusu', sqlerrm); end;
  begin r := r || jsonb_build_object('ogretmen_matematik_sorusu', public.mark_together(mat_row));
  exception when others then r := r || jsonb_build_object('ogretmen_matematik_sorusu', sqlerrm); end;
  update public.reviews set together_at = now() where student_id = kid;
  get diagnostics n = row_count; r := r || jsonb_build_object('ogretmen_dogrudan_yazma', n);
  perform set_config('role', 'postgres', true);
  r := r || jsonb_build_object('isaretleyen_ogretmen_mi', (select together_by = t from public.reviews where id = tr_row));

  -- Veli
  perform set_config('request.jwt.claims', json_build_object('sub', parent, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin r := r || jsonb_build_object('veli_matematik_sorusu', public.mark_together(mat_row));
  exception when others then r := r || jsonb_build_object('veli_matematik_sorusu', sqlerrm); end;

  -- Öğrenci kendisi ve kardeşinin sorusu
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', kid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin r := r || jsonb_build_object('ogrenci_kendi_sorusu', public.mark_together(tr_row2));
  exception when others then r := r || jsonb_build_object('ogrenci_kendi_sorusu', sqlerrm); end;
  update public.reviews set together_at = now() where student_id = sibling;
  get diagnostics n = row_count; r := r || jsonb_build_object('ogrenci_kardes_yazma', n);
  perform set_config('role', 'postgres', true);
  raise exception 'SONUC %', r;
end $$;
