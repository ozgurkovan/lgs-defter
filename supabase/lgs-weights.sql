-- LGS'de konu başına ortalama soru sayısı (2024–2026 sınavları; kaynak supabase/lgs-weights.json,
-- değerleri tools/seed-lgs-weights.mjs yazar). Kullanım:
--   * ortalaması 0,5'in altındaki konularda (LGS'de nadir) konu tekrarı kapalı başlar; veli ya da öğrenci
--     Konular'dan açabilir. Denemedeki yanlıştan gelen hata tekrarı yine çalışır.
--   * yılda 2+ soru gelen konular oturumda öne geçer ve 21 günden uzun aralığa düşmez (uygulama).
--   * soru havuzu aynı öncelik grubunda sık çıkan konuyu önce doldurur.
alter table public.topics add column if not exists lgs_avg numeric;

-- Yıllık plana göre açılan konu, LGS'de nadirse tekrarı kapalı (paused) başlar.
create or replace function public.activate_planned_topics() returns integer
language plpgsql security definer set search_path to 'public' as $function$
declare
  today date := (now() at time zone 'Europe/Istanbul')::date;
  added int;
begin
  with due as (
    select s.id as student_id, t.id as topic_id, (t.lgs_avg is not null and t.lgs_avg < 0.5) as rare,
           row_number() over (partition by s.id
                              order by case when t.subject in ('turkce','matematik','fen') then 0 else 1 end,
                                       t.planned_start, t.subject, t.sort) as n
    from profiles s
    join topics t on t.grade = s.grade
    where s.role = 'student' and t.planned_start <= today
      and not exists (select 1 from topic_status ts where ts.student_id = s.id and ts.topic_id = t.id)
  ), st as (
    insert into topic_status (student_id, topic_id, status, first_seen)
    select student_id, topic_id, 'active', today from due
    returning topic_id
  )
  insert into items (student_id, track, topic_id, step, interval_days, due_date, state, note)
  select d.student_id, 'topic', d.topic_id, 0, 1, today + 1 + ((d.n - 1) % 7)::int,
         case when d.rare then 'paused' else 'active' end,
         case when d.rare then 'LGS''de nadir çıkıyor; konu tekrarı kapalı (Konular''dan açılabilir).' end
  from due d
  where not exists (select 1 from items i where i.student_id = d.student_id and i.track = 'topic' and i.topic_id = d.topic_id);
  get diagnostics added = row_count;
  return added;
end $function$;

-- Soru havuzu: aynı öncelik grubunda LGS'de sık çıkan konu önce.
create or replace view public.pool_needs as
with tracked as (
  select i.student_id, i.topic_id, min(i.due_date) as next_due
  from items i
  join topic_status s on s.student_id = i.student_id and s.topic_id = i.topic_id and s.status = any (array['active', 'gap'])
  where i.state = 'active'
  group by i.student_id, i.topic_id
), per_student as (
  select tr.topic_id, tr.next_due,
         (select count(*) from questions q
           where q.topic_id = tr.topic_id and q.active
             and not exists (select 1 from reviews r where r.question_id = q.id and r.student_id = tr.student_id)) as unseen
  from tracked tr
), agg as (
  select p.topic_id, t.subject, t.grade, t.name, t.kazanim, t.lgs_avg, min(p.next_due) as next_due, min(p.unseen) as unseen
  from per_student p
  join topics t on t.id = p.topic_id
  group by p.topic_id, t.subject, t.grade, t.name, t.kazanim, t.lgs_avg
  having min(p.unseen) < 30
)
select topic_id, subject, grade, name, kazanim, next_due, unseen,
       greatest(0::bigint, 30 - unseen) as to_generate,
       greatest(0::bigint, 10 - unseen) as to_first,
       (case when unseen = 0 then 0 when unseen < 10 then 1 else 2 end) * 10
         + case when subject in ('turkce', 'matematik') then 0 when subject = 'fen' then 1 else 2 end as priority,
       lgs_avg
from agg
order by priority, coalesce(lgs_avg, 1) desc, next_due, subject;
