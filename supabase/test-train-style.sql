-- Antrenman türü yetki testi: öğrenci kum torbası/balerin seçimini değiştiremez; veli değiştirir ve boşaltır; yalnızca
-- 'torba' ya da 'balerin'. Sonuç hata mesajıyla döner; her şey geri alınır.
-- beklenen: {"cocuk":"reddedildi","veli":"balerin","bozuk":"reddedildi","bosalt":true}
do $$
declare
  kid uuid := (select id from public.profiles where display_name = 'IrfTest' and role = 'student');
  parent uuid := (select parent_id from public.family_links where student_id = kid and relation = 'parent' limit 1);
  r jsonb := '{}';
begin
  update public.profiles set train_style = null where id = kid;

  -- Öğrenci değiştiremez
  perform set_config('request.jwt.claims', json_build_object('sub', kid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin update public.profiles set train_style = 'balerin' where id = kid; r := r || '{"cocuk": "degisti"}';
  exception when others then r := r || jsonb_build_object('cocuk', 'reddedildi'); end;

  -- Veli değiştirir, boşaltır; başka değer kabul edilmez
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', parent, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  update public.profiles set train_style = 'balerin' where id = kid;
  r := r || jsonb_build_object('veli', (select train_style from public.profiles where id = kid));
  begin update public.profiles set train_style = 'robot' where id = kid; r := r || '{"bozuk": "kabul"}';
  exception when others then r := r || jsonb_build_object('bozuk', 'reddedildi'); end;
  update public.profiles set train_style = null where id = kid;
  r := r || jsonb_build_object('bosalt', (select train_style is null from public.profiles where id = kid));

  perform set_config('role', 'postgres', true);
  raise exception 'SONUC %', r;
end $$;
