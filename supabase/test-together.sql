-- "Birlikte baktık" yetki testi: veli olarak çocuğun bir sorusunu işaretler, öğrenci olarak kardeşinin sorusunu dener.
-- Sonuç hata mesajıyla döner; her değişiklik geri alınır.
do $$
declare
  kid uuid := (select id from public.profiles where display_name = 'IrfTest' and role = 'student');
  sibling uuid := (select id from public.profiles where role = 'student' and id <> kid order by created_at limit 1);
  parent uuid := (select parent_id from public.family_links where student_id = kid and relation = 'parent' limit 1);
  rid uuid := (select id from public.reviews where student_id = kid and needs_help limit 1);
  r jsonb := '{}';
  n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', parent, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  update public.reviews set together_at = now() where id = rid;
  get diagnostics n = row_count; r := r || jsonb_build_object('veli_isaretledi', n);

  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', kid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  update public.reviews set together_at = now() where student_id = sibling;
  get diagnostics n = row_count; r := r || jsonb_build_object('kardesin_sorusu', n);
  perform set_config('role', 'postgres', true);
  raise exception 'SONUC %', r;
end $$;
