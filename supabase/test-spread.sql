-- Toplu hataların günlere yayılması testi: öğrenci (uygulamadaki deneme gibi) bir dersten 30 hata, görev (servis
-- rolü, kâğıt deneme gibi) 12 hata daha ekler. Hiçbir güne o dersin günlük sınırından fazla yeni hata düşmez, hepsi
-- yarından itibaren; bekletilen hata ve konu tekrarı kaydırılmaz. Sonuç hata mesajıyla döner; her şey geri alınır.
-- beklenen: {"gun_en_fazla_sinir_altinda":true,"en_az_gun":true,"yarindan_once_yok":true,"gorev_de_yayildi":true,"bekleyen_kaymaz":true,"konu_kaymaz":true}
do $$
declare
  kid uuid := (select id from public.profiles where display_name = 'IrfTest' and role = 'student');
  topic text := (select id from public.topics where subject = 'fen' and grade = 8 order by sort limit 1);
  -- Konu tekrarı öğrenci başına konuda tekildir: henüz konu tekrarı olmayan bir konu
  free_topic text := (select t.id from public.topics t where t.grade = 8 and not exists (
    select 1 from public.items i where i.student_id = (select id from public.profiles where display_name = 'IrfTest' and role = 'student')
      and i.track = 'topic' and i.topic_id = t.id) order by t.sort limit 1);
  lim int;
  tomorrow date := (now() at time zone 'Europe/Istanbul')::date + 1;
  r jsonb := '{}';
  most int;
  days int;
  first_day date;
begin
  select coalesce((daily_by_subject ->> 'fen')::int, 10) into lim from public.profiles where id = kid;
  -- Öğrenci: uygulamadaki denemenin 30 yanlışı
  perform set_config('request.jwt.claims', json_build_object('sub', kid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  insert into public.items (student_id, track, topic_id, due_date, note)
    select kid, 'mistake', topic, tomorrow, 'zz-test' from generate_series(1, 30);
  perform set_config('role', 'postgres', true);
  -- Görev: kâğıt denemenin 12 yanlışı (servis rolü gibi, kimliksiz)
  perform set_config('request.jwt.claims', '{}', true);
  insert into public.items (student_id, track, topic_id, due_date, note)
    select kid, 'mistake', topic, tomorrow, 'zz-gorev' from generate_series(1, 12);
  -- Bekletilen hata ve konu tekrarı kaydırılmaz
  insert into public.items (student_id, track, topic_id, due_date, state, note) values (kid, 'mistake', topic, tomorrow, 'paused', 'zz-bekle');
  insert into public.items (student_id, track, topic_id, due_date, note) values (kid, 'topic', free_topic, tomorrow, 'zz-konu');

  -- Her gün, o derste sırası gelen bütün hata maddeleri (eskiler dahil) sınırı aşmaz; yeniler yalnızca boş yere düşer.
  select max(c) into most from (
    select count(*) filter (where note in ('zz-test', 'zz-gorev')) c from public.items
     where student_id = kid and track = 'mistake' and state = 'active' and note in ('zz-test', 'zz-gorev') group by due_date) x;
  select count(distinct due_date), min(due_date) into days, first_day from public.items where student_id = kid and note in ('zz-test', 'zz-gorev');
  r := r || jsonb_build_object('gun_en_fazla_sinir_altinda', most <= lim,
                               'en_az_gun', days >= ceil(42.0 / lim),
                               'yarindan_once_yok', first_day >= tomorrow,
                               'gorev_de_yayildi', (select count(distinct due_date) from public.items where student_id = kid and note = 'zz-gorev') >= 1
                                 and (select min(due_date) from public.items where student_id = kid and note = 'zz-gorev')
                                   >= (select max(due_date) from public.items where student_id = kid and note = 'zz-test'),
                               'bekleyen_kaymaz', (select due_date from public.items where student_id = kid and note = 'zz-bekle') = tomorrow,
                               'konu_kaymaz', (select due_date from public.items where student_id = kid and note = 'zz-konu') = tomorrow);
  raise exception 'SONUC %', r;
end $$;
