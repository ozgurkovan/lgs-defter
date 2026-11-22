-- Oyun ayarları yetki testi: öğrenci kahramanın oyunlarını ve Kelime roketini kendisi açıp kapatamaz; veli kapatır ve
-- yeniden açar. Sonuç hata mesajıyla döner; her şey geri alınır.
-- beklenen: {"cocuk_kahraman":"reddedildi","cocuk_roket":"reddedildi","veli_kapatti":"false/false","veli_acti":true}
do $$
declare
  kid uuid := (select id from public.profiles where display_name = 'IrfTest' and role = 'student');
  parent uuid := (select parent_id from public.family_links where student_id = kid and relation = 'parent' limit 1);
  r jsonb := '{}';
begin
  update public.profiles set hero_games = false, typing_game = false where id = kid;

  -- Öğrenci açamaz
  perform set_config('request.jwt.claims', json_build_object('sub', kid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin update public.profiles set hero_games = true where id = kid; r := r || '{"cocuk_kahraman": "degisti"}';
  exception when others then r := r || jsonb_build_object('cocuk_kahraman', 'reddedildi'); end;
  begin update public.profiles set typing_game = true where id = kid; r := r || '{"cocuk_roket": "degisti"}';
  exception when others then r := r || jsonb_build_object('cocuk_roket', 'reddedildi'); end;

  -- Veli kapatır, açar
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '{}', true);
  update public.profiles set hero_games = null, typing_game = null where id = kid;
  perform set_config('request.jwt.claims', json_build_object('sub', parent, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  update public.profiles set hero_games = false, typing_game = false where id = kid;
  r := r || jsonb_build_object('veli_kapatti', (select hero_games::text || '/' || typing_game::text from public.profiles where id = kid));
  update public.profiles set hero_games = true, typing_game = null where id = kid;
  r := r || jsonb_build_object('veli_acti', (select hero_games and typing_game is null from public.profiles where id = kid));

  perform set_config('role', 'postgres', true);
  raise exception 'SONUC %', r;
end $$;
