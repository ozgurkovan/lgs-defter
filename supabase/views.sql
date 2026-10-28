-- Saatlik görevin kullandığı görünümler (sadece gizli anahtarla erişilir).

-- Takipteki her konu için havuzda en az 30 görülmemiş soru olmalı.
-- Tekrarı en yakın olan konu önce gelir; to_generate > 0 olan konulara yeni soru eklenmeli.
drop view if exists public.pool_needs;
create view public.pool_needs as
with tracked as (
  select i.topic_id, min(i.due_date) as next_due
  from public.items i
  join public.topic_status s on s.topic_id = i.topic_id and s.status in ('active', 'gap')
  where i.state = 'active'
  group by i.topic_id
), unseen as (
  select q.topic_id, count(*) as unseen
  from public.questions q
  where q.active and not exists (select 1 from public.reviews r where r.question_id = q.id)
  group by q.topic_id
)
select tr.topic_id, t.subject, t.name, t.kazanim, tr.next_due,
       coalesce(u.unseen, 0) as unseen,
       greatest(0, 30 - coalesce(u.unseen, 0)) as to_generate
from tracked tr
join public.topics t on t.id = tr.topic_id
left join unseen u on u.topic_id = tr.topic_id
where coalesce(u.unseen, 0) < 30
order by tr.next_due, t.subject;

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
