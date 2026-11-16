-- Kelime roketi puanı yetki testi: çocuk kendi oyun puanını yazar; eksi, çok büyük ya da ders satırına puan yazılamaz;
-- veli puanı görür; kardeş göremez. Sonuç hata mesajıyla döner; her şey geri alınır.
-- beklenen: {"cocuk_puan":350,"eksi_puan":"reddedildi","cok_buyuk":"reddedildi","derse_puan":"reddedildi","veli_rekor":350,"kardes_rekor":"yok"}
do $$
declare
  kid uuid := (select id from public.profiles where display_name = 'IrfTest' and role = 'student');
  sibling uuid := (select id from public.profiles where role = 'student' and id <> kid order by created_at limit 1);
  parent uuid := (select parent_id from public.family_links where student_id = kid and relation = 'parent' limit 1);
  r jsonb := '{}';
begin
  delete from public.typing_results where student_id = kid and lesson = 'oyun';

  -- Çocuk kendi puanını yazar
  perform set_config('request.jwt.claims', json_build_object('sub', kid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  insert into public.typing_results (student_id, lesson, chars, errors, seconds, stars, score) values (kid, 'oyun', 40, 2, 60, 0, 350);
  r := r || jsonb_build_object('cocuk_puan', (select max(score) from public.typing_results where student_id = kid and lesson = 'oyun'));
  begin insert into public.typing_results (student_id, lesson, chars, errors, seconds, stars, score) values (kid, 'oyun', 1, 0, 1, 0, -5);
    r := r || '{"eksi_puan": "yazildi"}';
  exception when others then r := r || jsonb_build_object('eksi_puan', 'reddedildi'); end;
  begin insert into public.typing_results (student_id, lesson, chars, errors, seconds, stars, score) values (kid, 'oyun', 1, 0, 1, 0, 99999999);
    r := r || '{"cok_buyuk": "yazildi"}';
  exception when others then r := r || jsonb_build_object('cok_buyuk', 'reddedildi'); end;
  begin insert into public.typing_results (student_id, lesson, chars, errors, seconds, stars, score) values (kid, 'tr-f-j', 10, 0, 30, 3, 50);
    r := r || '{"derse_puan": "yazildi"}';
  exception when others then r := r || jsonb_build_object('derse_puan', 'reddedildi'); end;

  -- Veli görür
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', parent, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  r := r || jsonb_build_object('veli_rekor', (select max(score) from public.typing_results where student_id = kid and lesson = 'oyun'));

  -- Kardeş göremez
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', sibling, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  r := r || jsonb_build_object('kardes_rekor', coalesce((select max(score)::text from public.typing_results where student_id = kid and lesson = 'oyun'), 'yok'));

  perform set_config('role', 'postgres', true);
  raise exception 'SONUC %', r;
end $$;
