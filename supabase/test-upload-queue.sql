-- İşleme sırası testi (upload_queue): ücretli ailenin yüklemesi her zaman ve önce işlenir; bedava planın soru
-- fotoğrafları günde process_day (200) fotoğrafa kadar, en eski önce; bütçe bitince kalan sırada bekler; işlenenler günün
-- sayımına girer; sıradaki aile abone olunca yüklemesi hemen alınır; yazım görevine bırakılan deneme (route 'yazim')
-- saatlik sıradan çıkar ve yazım sırasında görünür; uygulama (authenticated) sırayı soramaz.
-- Sonuç hata mesajıyla döner; her şey geri alınır.
-- beklenen: {"gunluk":200,"ilk":"ucretli,A,B","ilk_simdi":240,"ilk_sirada":5,"ilk_islenen":0,"a_bitince":"ucretli,B","a_bitince_islenen":120,"b_bitince":"ucretli","b_bitince_islenen":240,"b_bitince_sirada":5,"abone_olunca":"C,ucretli","abone_olunca_sirada":0,"yazima_gidince":"C","yazim_sirasi":"ucretli","uygulama_soramaz":true}
do $$
declare
  kid uuid := (select id from public.profiles where display_name = 'IrfTest' and role = 'student');
  parent uuid := (select id from public.profiles where display_name = 'Test Veli' and role = 'parent');
  other_parent uuid := (select id from public.profiles where display_name = 'ABD Veli' and role = 'parent');
  other_kid uuid;
  a uuid; b uuid; c uuid; d uuid;
  r jsonb := '{}';
  j jsonb;
  names jsonb;
  function_closed boolean := false;
begin
  select f.student_id into other_kid from public.family_links f where f.parent_id = other_parent and f.relation = 'parent' limit 1;
  delete from public.subscriptions where parent_id in (parent, other_parent);
  insert into public.subscriptions (parent_id, source, note) values (other_parent, 'web', 'test');
  -- Sıra temiz başlasın (geri alınır): bekleyen ve bugün işlenen ne varsa eskiye alınır.
  update public.submissions set status = 'done', processed_at = now() - interval '3 days'
    where status in ('submitted', 'processing') or processed_at >= now() - interval '2 days';

  insert into public.submissions (kind, student_id, uploaded_by, status, submitted_at) values ('soru', kid, kid, 'submitted', now() - interval '3 hours') returning id into a;
  insert into public.submissions (kind, student_id, uploaded_by, status, submitted_at) values ('soru', kid, kid, 'submitted', now() - interval '2 hours') returning id into b;
  insert into public.submissions (kind, student_id, uploaded_by, status, submitted_at) values ('soru', kid, kid, 'submitted', now() - interval '1 hour') returning id into c;
  insert into public.submissions (kind, student_id, uploaded_by, status, submitted_at) values ('deneme', other_kid, other_kid, 'submitted', now()) returning id into d;
  insert into public.submission_photos (submission_id, storage_path, sort) select a, kid || '/test/a' || g || '.jpg', g from generate_series(1, 120) g;
  insert into public.submission_photos (submission_id, storage_path, sort) select b, kid || '/test/b' || g || '.jpg', g from generate_series(1, 120) g;
  insert into public.submission_photos (submission_id, storage_path, sort) select c, kid || '/test/c' || g || '.jpg', g from generate_series(1, 5) g;
  insert into public.submission_photos (submission_id, storage_path, sort) values (d, other_kid || '/test/d1.jpg', 1);
  names := jsonb_build_object(a::text, 'A', b::text, 'B', c::text, 'C', d::text, 'ucretli');

  j := public.upload_queue();
  r := r || jsonb_build_object('gunluk', j->'free_day',
    'ilk', (select string_agg(names->>x, ',' order by o) from jsonb_array_elements_text(j->'ids') with ordinality t(x, o)),
    'ilk_simdi', j->'free_now', 'ilk_sirada', j->'free_waiting', 'ilk_islenen', j->'free_done');

  update public.submissions set status = 'done', processed_at = now() where id = a;
  j := public.upload_queue();
  r := r || jsonb_build_object('a_bitince', (select string_agg(names->>x, ',' order by o) from jsonb_array_elements_text(j->'ids') with ordinality t(x, o)),
    'a_bitince_islenen', j->'free_done');

  update public.submissions set status = 'processing' where id = b;
  j := public.upload_queue();
  r := r || jsonb_build_object('b_bitince', (select string_agg(names->>x, ',' order by o) from jsonb_array_elements_text(j->'ids') with ordinality t(x, o)),
    'b_bitince_islenen', j->'free_done', 'b_bitince_sirada', j->'free_waiting');

  insert into public.subscriptions (parent_id, source, note) values (parent, 'web', 'test');
  j := public.upload_queue();
  r := r || jsonb_build_object('abone_olunca', (select string_agg(names->>x, ',' order by o) from jsonb_array_elements_text(j->'ids') with ordinality t(x, o)),
    'abone_olunca_sirada', j->'free_waiting');

  update public.submissions set route = 'yazim' where id = d;
  j := public.upload_queue();
  r := r || jsonb_build_object('yazima_gidince', (select string_agg(names->>x, ',' order by o) from jsonb_array_elements_text(j->'ids') with ordinality t(x, o)),
    'yazim_sirasi', names->>(public.writer_queue()::text));

  perform set_config('request.jwt.claims', json_build_object('sub', kid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin perform public.upload_queue(); exception when others then function_closed := true; end;
  perform set_config('role', 'postgres', true);
  r := r || jsonb_build_object('uygulama_soramaz', function_closed);

  raise exception 'SONUC %', r;
end $$;
