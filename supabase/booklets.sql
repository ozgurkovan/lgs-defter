-- MEB kitapçıklarından gelen sorular (aile içi, source='meb'): hangi kitapçığın kaçıncı sorusu olduğu saklanır,
-- böylece gerçek bir LGS sınavı uygulamada orijinal sırasıyla deneme olarak çözülebilir.
-- exam_only: gerçek LGS soruları günlük tekrarda kullanılmaz, denemeye saklanır.
alter table public.questions add column if not exists booklet text;
alter table public.questions add column if not exists booklet_no int;
alter table public.questions add column if not exists exam_only boolean not null default false;
create index if not exists questions_booklet_idx on public.questions(booklet, booklet_no) where booklet is not null;

-- Soru havuzu ihtiyacı: denemeye saklanan sorular günlük havuz sayısına girmez.
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
           where q.topic_id = tr.topic_id and q.active and not q.exam_only
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
