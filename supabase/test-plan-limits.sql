-- Plan sınırları testi: bedava çocuk günde 20 soru sınırını görür, fotoğraf yükleyemez, kitap ekleyemez; ücretli ailede
-- ayda 6 kâğıt deneme ve 2 yeni kitap geçer, fazlası reddedilir, soru fotoğrafı serbest; hediye abonelikte sınır yok;
-- başka aile planı soramaz; "kilidi aç" isteğini yalnızca veli bırakır ve yalnız kendi isteğini görür.
-- Sonuç hata mesajıyla döner; her şey geri alınır.
-- beklenen: {"bedava_plan":"free","bedava_gunluk":20,"bedava_deneme_hafta":1,"bedava_ozellik":"false/false/false","ucretli_ozellik":"true/true/true","bedava_yukleme":"reddedildi","bedava_kitap":"reddedildi","ucretli_plan":"family","ucretli_gunluk":null,"ucretli_deneme_ay":6,"alti_deneme":6,"yedinci_deneme":"reddedildi","soru_fotografi":"acti","iki_kitap":2,"ucuncu_kitap":"reddedildi","kullanim":"6/2","hediye_sinirsiz":true,"hediye_yedinci":"acti","baska_aile":true,"cocuk_istek":"reddedildi","veli_istek":"yazdi","veli_istegi_goruyor":true,"baska_veli_istek_goruyor":0}
do $$
declare
  kid uuid := (select id from public.profiles where display_name = 'IrfTest' and role = 'student');
  parent uuid := (select id from public.profiles where display_name = 'Test Veli' and role = 'parent');
  other_parent uuid := (select id from public.profiles where display_name = 'ABD Veli' and role = 'parent');
  r jsonb := '{}';
  j jsonb;
  n int;
  i int;
begin
  delete from public.subscriptions where parent_id in (parent, other_parent);
  -- Bu ayın sayımı temiz başlasın (geri alınır).
  update public.submissions set created_at = now() - interval '3 months' where student_id = kid;
  update public.books set created_at = now() - interval '3 months' where student_id = kid;

  -- Bedava
  perform set_config('request.jwt.claims', json_build_object('sub', kid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  j := public.plan_limits(kid);
  r := r || jsonb_build_object('bedava_plan', j->>'plan', 'bedava_gunluk', j->'daily_questions', 'bedava_deneme_hafta', j->'exams_week');
  r := r || jsonb_build_object('bedava_ozellik', (j->>'words') || '/' || (j->>'typing') || '/' || (j->>'army'));
  begin insert into public.submissions (kind, student_id, uploaded_by) values ('soru', kid, kid); r := r || '{"bedava_yukleme": "acti"}';
  exception when others then r := r || '{"bedava_yukleme": "reddedildi"}'; end;
  begin insert into public.books (student_id, title, created_by) values (kid, 'Test kitabı', kid); r := r || '{"bedava_kitap": "ekledi"}';
  exception when others then r := r || '{"bedava_kitap": "reddedildi"}'; end;

  -- Ücretli aile
  perform set_config('role', 'postgres', true);
  insert into public.subscriptions (parent_id, source, note) values (parent, 'web', 'test');
  perform set_config('role', 'authenticated', true);
  j := public.plan_limits(kid);
  r := r || jsonb_build_object('ucretli_plan', j->>'plan', 'ucretli_gunluk', j->'daily_questions', 'ucretli_deneme_ay', j->'paper_month');
  r := r || jsonb_build_object('ucretli_ozellik', (j->>'words') || '/' || (j->>'typing') || '/' || (j->>'army'));
  n := 0;
  for i in 1..6 loop
    insert into public.submissions (kind, student_id, uploaded_by, status) values ('deneme', kid, kid, 'submitted');
    n := n + 1;
  end loop;
  r := r || jsonb_build_object('alti_deneme', n);
  begin insert into public.submissions (kind, student_id, uploaded_by, status) values ('deneme', kid, kid, 'submitted'); r := r || '{"yedinci_deneme": "acti"}';
  exception when others then r := r || '{"yedinci_deneme": "reddedildi"}'; end;
  begin insert into public.submissions (kind, student_id, uploaded_by) values ('soru', kid, kid); r := r || '{"soru_fotografi": "acti"}';
  exception when others then r := r || '{"soru_fotografi": "reddedildi"}'; end;
  insert into public.books (student_id, title, created_by) values (kid, 'Test kitabı 1', kid);
  insert into public.books (student_id, title, created_by) values (kid, 'Test kitabı 2', kid);
  select count(*) into n from public.books where student_id = kid and created_at >= date_trunc('month', now());
  r := r || jsonb_build_object('iki_kitap', n);
  begin insert into public.books (student_id, title, created_by) values (kid, 'Test kitabı 3', kid); r := r || '{"ucuncu_kitap": "ekledi"}';
  exception when others then r := r || '{"ucuncu_kitap": "reddedildi"}'; end;
  j := public.plan_limits(kid);
  r := r || jsonb_build_object('kullanim', (j->>'paper_used') || '/' || (j->>'books_used'));

  -- Hediye abonelik: sınır yok
  perform set_config('role', 'postgres', true);
  update public.subscriptions set source = 'gift' where parent_id = parent;
  perform set_config('role', 'authenticated', true);
  j := public.plan_limits(kid);
  r := r || jsonb_build_object('hediye_sinirsiz', (j->>'gift')::boolean and j->'paper_month' = 'null'::jsonb and j->'books_month' = 'null'::jsonb);
  begin insert into public.submissions (kind, student_id, uploaded_by, status) values ('deneme', kid, kid, 'submitted'); r := r || '{"hediye_yedinci": "acti"}';
  exception when others then r := r || '{"hediye_yedinci": "reddedildi"}'; end;

  -- Çocuk "kilidi aç" isteği bırakamaz
  begin insert into public.unlock_requests (parent_id) values (kid); r := r || '{"cocuk_istek": "yazdi"}';
  exception when others then r := r || '{"cocuk_istek": "reddedildi"}'; end;

  -- Veli isteğini bırakır ve plan_limits'te görür
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', parent, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin insert into public.unlock_requests (note) values ('test'); r := r || '{"veli_istek": "yazdi"}';
  exception when others then r := r || '{"veli_istek": "reddedildi"}'; end;
  r := r || jsonb_build_object('veli_istegi_goruyor', (public.plan_limits(kid)->>'requested_at') is not null);

  -- Başka aile: planı soramaz, isteği göremez
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', other_parent, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  r := r || jsonb_build_object('baska_aile', public.plan_limits(kid) is null);
  select count(*) into n from public.unlock_requests; r := r || jsonb_build_object('baska_veli_istek_goruyor', n);

  perform set_config('role', 'postgres', true);
  raise exception 'SONUC %', r;
end $$;
