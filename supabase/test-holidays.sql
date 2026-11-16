-- Okul tatilleri yetki testi: öğrenci tatil katını ve tatil günlerini değiştiremez; veli değiştirir; kat 1–3 arasında,
-- tatil listesi dizi olmalı. Sonuç hata mesajıyla döner; her şey geri alınır.
-- beklenen: {"cocuk_kat":"reddedildi","cocuk_gunler":"reddedildi","veli_kat":1.5,"veli_gunler":1,"cok_kat":"reddedildi","bozuk_liste":"reddedildi"}
do $$
declare
  kid uuid := (select id from public.profiles where display_name = 'IrfTest' and role = 'student');
  parent uuid := (select parent_id from public.family_links where student_id = kid and relation = 'parent' limit 1);
  r jsonb := '{}';
begin
  update public.profiles set holiday_factor = null, holidays = null where id = kid;

  -- Öğrenci değiştiremez
  perform set_config('request.jwt.claims', json_build_object('sub', kid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin update public.profiles set holiday_factor = 3 where id = kid; r := r || '{"cocuk_kat": "degisti"}';
  exception when others then r := r || jsonb_build_object('cocuk_kat', 'reddedildi'); end;
  begin update public.profiles set holidays = '[{"from": "2026-12-01", "to": "2026-12-31"}]' where id = kid; r := r || '{"cocuk_gunler": "degisti"}';
  exception when others then r := r || jsonb_build_object('cocuk_gunler', 'reddedildi'); end;

  -- Veli değiştirir
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', parent, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  update public.profiles set holiday_factor = 1.5, holidays = '[{"from": "2026-11-26", "to": "2026-11-27"}]' where id = kid;
  r := r || jsonb_build_object('veli_kat', (select holiday_factor from public.profiles where id = kid),
    'veli_gunler', (select jsonb_array_length(holidays) from public.profiles where id = kid));
  begin update public.profiles set holiday_factor = 5 where id = kid; r := r || '{"cok_kat": "kabul"}';
  exception when others then r := r || jsonb_build_object('cok_kat', 'reddedildi'); end;
  begin update public.profiles set holidays = '{"from": "2026-11-26"}' where id = kid; r := r || '{"bozuk_liste": "kabul"}';
  exception when others then r := r || jsonb_build_object('bozuk_liste', 'reddedildi'); end;

  perform set_config('role', 'postgres', true);
  raise exception 'SONUC %', r;
end $$;
