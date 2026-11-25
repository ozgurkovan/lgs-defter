-- Deneme kataloğu ve bekletme testi: yeni denemeden yazılan soru (ve o denemenin bir sorusunun hata tekrarı sorusu)
-- bekleme gününe kadar yalnızca denemeyi yükleyen ailenin; başka aile görmez; aynı denemeyi yükleyen ikinci çocuk
-- görenlere eklenir ve yükleme sayısı artar; gün gelince soru ortak havuza açılır; süresi geçmiş katalogdan yazılan soru
-- hiç beklemez; uygulama katalog tablolarını okuyamaz, deneme adlarını yalnızca kendi çocuğu için alır. Aynı denemenin
-- aynı sorusunu yanlış yapan ikinci çocuk için yeni tekrar sorusu istenmez (akraba kayıt), uygulama akrabaları okur.
-- Sonuç hata mesajıyla döner; her şey geri alınır.
-- beklenen: {"bekliyor":true,"hata_sorusu_bekliyor":true,"yukleyen_goruyor":2,"baska_aile_goruyor":0,"ikinci_cocuk_eklendi":true,"yukleme_sayisi":2,"ikinci_aile_goruyor":2,"akraba":2,"ikinci_cocuk_ihtiyac":2,"katalogsuz_ihtiyac":3,"uygulama_akraba":1,"acilan":2,"acildi":true,"eski_katalog_beklemez":true,"tablo_kapali":true,"adlar":true,"baska_aile_adlar":0}
do $$
declare
  kid uuid := (select id from public.profiles where display_name = 'IrfTest' and role = 'student');
  other_parent uuid := (select id from public.profiles where display_name = 'ABD Veli' and role = 'parent');
  other_kid uuid;
  cat uuid; old_cat uuid; ex uuid; ex2 uuid; ex3 uuid; eq uuid; eq2 uuid; eq3 uuid; q1 uuid; q2 uuid; q3 uuid;
  topic text := (select id from public.topics where grade = 8 and coalesce(curriculum, 'tr') = 'tr' order by id limit 1);
  subj text;
  r jsonb := '{}';
  n int;
  closed boolean := false;
begin
  select subject into subj from public.topics where id = topic;
  select f.student_id into other_kid from public.family_links f where f.parent_id = other_parent and f.relation = 'parent' limit 1;

  insert into public.exam_catalog (name, publisher, grade, curriculum, part) values ('Test Yayın 1', 'Test Yayın', 8, 'tr', 'sozel') returning id into cat;
  insert into public.exam_catalog (name, grade, curriculum, first_seen, hold_until) values ('Test Yayın eski', 8, 'tr', current_date - 60, current_date - 30) returning id into old_cat;
  insert into public.exams (student_id, name, catalog_id) values (kid, 'Test Yayın 1', cat) returning id into ex;
  insert into public.exam_questions (student_id, exam_id, subject, q_no, topic_id, outcome) values (kid, ex, subj, 1, topic, 'yanlis') returning id into eq;

  -- Katalog notundan yazılan havuz sorusu ve hata tekrarı sorusu (catalog_id kendiliğinden gelir)
  insert into public.questions (source, subject, topic_id, stem, choices, answer, catalog_id)
    values ('claude', subj, topic, 'test bekleyen 1', '{"A":"1","B":"2","C":"3","D":"4"}', 'A', cat) returning id into q1;
  insert into public.questions (source, subject, topic_id, stem, choices, answer, variant_of_exam)
    values ('claude', subj, topic, 'test bekleyen 2', '{"A":"1","B":"2","C":"3","D":"4"}', 'A', eq) returning id into q2;
  insert into public.questions (source, subject, topic_id, stem, choices, answer, catalog_id)
    values ('claude', subj, topic, 'test eski katalog', '{"A":"1","B":"2","C":"3","D":"4"}', 'A', old_cat) returning id into q3;
  r := r || jsonb_build_object(
    'bekliyor', (select hold_until = current_date + 30 and kid = any (private_students) from public.questions where id = q1),
    'hata_sorusu_bekliyor', (select catalog_id = cat and hold_until is not null and kid = any (private_students) from public.questions where id = q2),
    'eski_katalog_beklemez', (select hold_until is null and private_students is null from public.questions where id = q3));

  perform set_config('request.jwt.claims', json_build_object('sub', kid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.questions where id in (q1, q2); r := r || jsonb_build_object('yukleyen_goruyor', n);
  begin perform 1 from public.exam_catalog limit 1; exception when others then closed := true; end;
  r := r || jsonb_build_object('tablo_kapali', closed, 'adlar', public.exam_catalog_names(kid) ? 'Test Yayın 1');

  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', other_kid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.questions where id in (q1, q2); r := r || jsonb_build_object('baska_aile_goruyor', n);
  r := r || jsonb_build_object('baska_aile_adlar', jsonb_array_length(public.exam_catalog_names(kid)));

  -- İkinci çocuk aynı denemeyi yükler
  perform set_config('role', 'postgres', true);
  insert into public.exams (student_id, name, catalog_id) values (other_kid, 'test yayin deneme 1', cat) returning id into ex2;
  r := r || jsonb_build_object('ikinci_cocuk_eklendi', (select other_kid = any (private_students) and kid = any (private_students) from public.questions where id = q1),
    'yukleme_sayisi', (select uploads from public.exam_catalog where id = cat));
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.questions where id in (q1, q2); r := r || jsonb_build_object('ikinci_aile_goruyor', n);

  -- İkinci çocuk aynı soruyu yanlış yapar: ilk çocuk için yazılan sorular ona da sayılır (1 soru var, 3'e 2 eksik).
  -- Katalogda olmayan bir denemede aynı durum: hiç sorusu yok, 3 istenir.
  perform set_config('role', 'postgres', true);
  insert into public.exam_questions (student_id, exam_id, subject, q_no, topic_id, outcome) values (other_kid, ex2, subj, 1, topic, 'yanlis') returning id into eq2;
  insert into public.items (student_id, track, topic_id, exam_question_id, step, interval_days, due_date)
    values (other_kid, 'mistake', topic, eq2, 0, 1, current_date + 1);
  insert into public.exams (student_id, name) values (other_kid, 'katalogsuz') returning id into ex3;
  insert into public.exam_questions (student_id, exam_id, subject, q_no, topic_id, outcome) values (other_kid, ex3, subj, 1, topic, 'yanlis') returning id into eq3;
  insert into public.items (student_id, track, topic_id, exam_question_id, step, interval_days, due_date)
    values (other_kid, 'mistake', topic, eq3, 0, 1, current_date + 1);
  r := r || jsonb_build_object('akraba', array_length(public.exam_question_kin(eq2), 1),
    'ikinci_cocuk_ihtiyac', (select need from public.mistake_variant_needs where exam_question_id = eq2),
    'katalogsuz_ihtiyac', (select need from public.mistake_variant_needs where exam_question_id = eq3));
  perform set_config('role', 'authenticated', true);
  r := r || jsonb_build_object('uygulama_akraba', (select count(*) from jsonb_object_keys(public.exam_kin(other_kid))));

  -- Bekleme günü gelir
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '{}', true);
  update public.questions set hold_until = current_date where id in (q1, q2);
  update public.questions set hold_until = null, private_students = null where hold_until <= current_date and id not in (q1, q2);
  r := r || jsonb_build_object('acilan', public.release_held_questions());
  r := r || jsonb_build_object('acildi', (select bool_and(hold_until is null and private_students is null) from public.questions where id in (q1, q2)));

  raise exception 'SONUC %', r;
end $$;
