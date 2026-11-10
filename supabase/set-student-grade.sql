-- Velinin çocuğun sınıfını değiştirmesi hemen geçerli olsun (velinin isteği, 2026-11-10: "veli hesabından çocuğun hangi
-- sınıfta olduğunu seçebilelim"). Eskiden yalnızca profil güncellenirdi: yeni sınıfın konuları bir sonraki saatlik
-- görevde açılır, eski sınıfın konu tekrarları gelmeye devam ederdi.
-- set_student_grade(sid, g, extra): yalnızca çocuğun velisi (can_edit_student, veli rolü) çağırır.
--   * profil: grade = g, extra_grades = extra
--   * eski sınıf(lar)ın açık konu tekrarları duraklar (note 'Sınıf değişti'); yeni sınıfa dönülünce yeniden açılır
--   * yeni sınıfın, öğrencinin müfredatında haftası gelmiş konuları hemen takibe girer; ilk tekrarlar bugünden 7 güne yayılır
-- Döner: { opened, paused, resumed }.
create or replace function public.set_student_grade(sid uuid, g int, extra int[] default '{}')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Europe/Istanbul')::date;
  grades int[];
  cur text;
  n_paused int := 0;
  n_resumed int := 0;
  n_opened int := 0;
begin
  if can_edit_student(sid) is not true or auth.uid() = sid
     or (select role from profiles where id = auth.uid()) is distinct from 'parent' then
    raise exception 'Bu işlemi yalnızca velisi yapabilir.';
  end if;
  if g is null or g < 1 or g > 8 then raise exception 'Sınıf 1 ile 8 arasında olmalı.'; end if;
  extra := coalesce((select array_agg(x) from unnest(extra) x where x between 1 and 8 and x <> g), '{}');
  grades := array[g] || extra;

  update profiles set grade = g, extra_grades = extra where id = sid and role = 'student' returning curriculum into cur;
  if cur is null then raise exception 'Öğrenci bulunamadı.'; end if;

  -- Artık sınıfında olmayan konuların konu tekrarları duraklar.
  update items i set state = 'paused', note = 'Sınıf değişti'
  from topics t
  where i.student_id = sid and i.track = 'topic' and i.state = 'active' and t.id = i.topic_id and not (t.grade = any(grades));
  get diagnostics n_paused = row_count;

  -- Sınıfa geri dönüldüyse duraklayanlar yeniden açılır (kaldığı yerden).
  update items i set state = 'active', note = null, due_date = greatest(i.due_date, today)
  from topics t
  where i.student_id = sid and i.track = 'topic' and i.state = 'paused' and i.note = 'Sınıf değişti'
    and t.id = i.topic_id and t.grade = any(grades);
  get diagnostics n_resumed = row_count;

  -- Yeni sınıfın haftası gelmiş konuları hemen takibe girer (üst sınıf konuları kendiliğinden açılmaz, veli işaretler).
  with due as (
    select t.id as topic_id,
           row_number() over (order by case when t.subject in ('turkce','ela','matematik','fen') then 0 else 1 end,
                                       t.planned_start, t.subject, t.sort) as n
    from topics t
    where t.grade = g and t.curriculum = cur and t.planned_start <= today
      and not exists (select 1 from topic_status ts where ts.student_id = sid and ts.topic_id = t.id)
  ), st as (
    insert into topic_status (student_id, topic_id, status, first_seen)
    select sid, topic_id, 'active', today from due
    returning topic_id
  )
  insert into items (student_id, track, topic_id, step, interval_days, due_date, state)
  select sid, 'topic', d.topic_id, 0, 1, today + ((d.n - 1) % 7)::int, 'active'
  from due d
  where not exists (select 1 from items i where i.student_id = sid and i.track = 'topic' and i.topic_id = d.topic_id);
  get diagnostics n_opened = row_count;

  return jsonb_build_object('opened', n_opened, 'paused', n_paused, 'resumed', n_resumed);
end $$;

revoke all on function public.set_student_grade(uuid, int, int[]) from public, anon;
grant execute on function public.set_student_grade(uuid, int, int[]) to authenticated;
