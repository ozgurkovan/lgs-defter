-- Saatlik görevin kullandığı görünümler (sadece gizli anahtarla erişilir).

-- Önümüzdeki 3 günde tekrarı gelecek konular için havuzda yeterli görülmemiş soru var mı?
-- to_generate > 0 olan konulara yeni soru eklenmeli.
create or replace view public.pool_needs as
with due as (
  select topic_id,
         sum(case when track = 'mistake' then 1 else 2 end) as need_soon
  from public.items
  where state = 'active' and due_date <= current_date + 3
  group by topic_id
), unseen as (
  select q.topic_id, count(*) as unseen
  from public.questions q
  where q.active and not exists (select 1 from public.reviews r where r.question_id = q.id)
  group by q.topic_id
)
select d.topic_id, t.subject, t.name, t.kazanim, d.need_soon,
       coalesce(u.unseen, 0) as unseen,
       greatest(0, d.need_soon * 2 - coalesce(u.unseen, 0)) as to_generate
from due d
join public.topics t on t.id = d.topic_id
left join unseen u on u.topic_id = d.topic_id
where coalesce(u.unseen, 0) < d.need_soon * 2;

-- Eksik işaretli konuların son tekrar sonuçları (eksik işaretini kaldırmak için).
create or replace view public.gap_progress as
select ts.topic_id, t.name, ts.gap_since, ts.lesson is not null as has_lesson,
       (select array_agg(x.correct order by x.answered_at desc)
          from (select r.correct, r.answered_at
                  from public.reviews r join public.questions q on q.id = r.question_id
                 where q.topic_id = ts.topic_id and r.answered_at::date >= ts.gap_since
                 order by r.answered_at desc limit 3) x) as last3
from public.topic_status ts
join public.topics t on t.id = ts.topic_id
where ts.status = 'gap';

revoke all on public.pool_needs, public.gap_progress from anon, authenticated;
grant select on public.pool_needs, public.gap_progress to service_role;
