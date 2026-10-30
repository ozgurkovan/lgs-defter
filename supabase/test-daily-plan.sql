-- Profil korumalarının testi: öğrenci olarak ve veli olarak güncelleme dener. Sonuç hata mesajıyla döner;
-- hata yüzünden her değişiklik geri alınır.
-- beklenen: {"veli_plan":1,"ogrenci_rol":"Bu alan değiştirilemez","ogrenci_plan":"Bu ayarı veli değiştirir","veli_kendi_rolu":"Bu alan değiştirilemez","ogrenci_lgs_tarihi":1}
do $$
declare
  kid uuid := (select id from public.profiles where display_name = 'IrfTest' and role = 'student');
  parent uuid := (select parent_id from public.family_links where student_id = kid and relation = 'parent' limit 1);
  r jsonb := '{}';
  n int;
begin
  -- Öğrenci kendisi
  perform set_config('request.jwt.claims', json_build_object('sub', kid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin update public.profiles set role = 'parent' where id = kid; r := r || '{"ogrenci_rol": "degisti"}';
  exception when others then r := r || jsonb_build_object('ogrenci_rol', sqlerrm); end;
  begin update public.profiles set daily_by_subject = '{"matematik": 99}' where id = kid; r := r || '{"ogrenci_plan": "degisti"}';
  exception when others then r := r || jsonb_build_object('ogrenci_plan', sqlerrm); end;
  begin update public.profiles set lgs_date = lgs_date where id = kid; get diagnostics n = row_count; r := r || jsonb_build_object('ogrenci_lgs_tarihi', n);
  exception when others then r := r || jsonb_build_object('ogrenci_lgs_tarihi', sqlerrm); end;

  -- Veli
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', parent, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin update public.profiles set daily_by_subject = '{"matematik": 12}' where id = kid; get diagnostics n = row_count; r := r || jsonb_build_object('veli_plan', n);
  exception when others then r := r || jsonb_build_object('veli_plan', sqlerrm); end;
  begin update public.profiles set role = 'student' where id = parent; r := r || '{"veli_kendi_rolu": "degisti"}';
  exception when others then r := r || jsonb_build_object('veli_kendi_rolu', sqlerrm); end;
  perform set_config('role', 'postgres', true);
  raise exception 'SONUC %', r;
end $$;
