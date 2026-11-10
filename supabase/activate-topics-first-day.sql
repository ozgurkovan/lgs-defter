-- Yıllık plana göre haftası gelmiş konuları takibe alır (saatlik görev her çalıştığında çağırır:
--   node tools/sb.mjs post rpc/activate_planned_topics '{}').
-- Konular sınıfın ve müfredatın konularıdır (supabase/country-curriculum.sql). İlk konu tekrarları 7 güne yayılır;
-- katsayısı yüksek dersler önce gelir. Yeni öğrencide (henüz hiç konu tekrarı yok) yayılma bugünden başlar, ertesi günden
-- değil (velinin gözlemi, 2026-11-10: yeni ABD hesabının ilk günü boş geliyordu). Tekrar çağırmak güvenlidir.
create or replace function public.activate_planned_topics()
returns int language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Europe/Istanbul')::date;
  added int;
begin
  with fresh as (
    select s.id from profiles s
    where s.role = 'student' and not exists (select 1 from items i where i.student_id = s.id and i.track = 'topic')
  ), due as (
    select s.id as student_id, t.id as topic_id,
           (t.lgs_avg is not null and t.lgs_avg < 0.5 and s.rare_factor = 0) as off,
           s.id in (select id from fresh) as first_day,
           row_number() over (partition by s.id
                              order by case when t.subject in ('turkce','matematik','fen') then 0 else 1 end,
                                       t.planned_start, t.subject, t.sort) as n
    from profiles s
    join topics t on t.grade = s.grade and t.curriculum = s.curriculum
    where s.role = 'student' and t.planned_start <= today
      and not exists (select 1 from topic_status ts where ts.student_id = s.id and ts.topic_id = t.id)
  ), st as (
    insert into topic_status (student_id, topic_id, status, first_seen)
    select student_id, topic_id, 'active', today from due
    returning topic_id
  )
  insert into items (student_id, track, topic_id, step, interval_days, due_date, state, note)
  select d.student_id, 'topic', d.topic_id, 0, 1,
         today + (case when d.first_day then 0 else 1 end) + ((d.n - 1) % 7)::int,
         case when d.off then 'paused' else 'active' end,
         case when d.off then 'LGS''de nadir çıkıyor; konu tekrarı kapalı (Konular''dan açılabilir).' end
  from due d
  where not exists (select 1 from items i where i.student_id = d.student_id and i.track = 'topic' and i.topic_id = d.topic_id);
  get diagnostics added = row_count;
  return added;
end $$;

revoke all on function public.activate_planned_topics() from public, anon, authenticated;
grant execute on function public.activate_planned_topics() to service_role;
