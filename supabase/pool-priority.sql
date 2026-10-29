-- Soru havuzunu doldurma sırası. Saatlik görev pool_needs'i priority sırasıyla işler:
--   1. bir öğrencinin hiç görmediği soru kalmamış konular (unseen = 0),
--   2. 10'dan az görülmemiş sorusu olan konular,
--   3. hedefe (30) kadar doldurulacak diğer konular;
-- her grupta önce Türkçe ve Matematik, sonra Fen, sonra diğer dersler; eşitlikte tekrarı en yakın konu.
-- to_first: konuyu 10 görülmemiş soruya çıkarmak için gereken sayı (iki konu tekrarına yeter). Görev önce
-- bütün konulara to_first kadar ekler, ancak 10'un altında konu kalmayınca 30'a doldurur.
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
  select p.topic_id, t.subject, t.grade, t.name, t.kazanim, min(p.next_due) as next_due, min(p.unseen) as unseen
  from per_student p
  join topics t on t.id = p.topic_id
  group by p.topic_id, t.subject, t.grade, t.name, t.kazanim
  having min(p.unseen) < 30
)
select topic_id, subject, grade, name, kazanim, next_due, unseen,
       greatest(0::bigint, 30 - unseen) as to_generate,
       greatest(0::bigint, 10 - unseen) as to_first,
       (case when unseen = 0 then 0 when unseen < 10 then 1 else 2 end) * 10
         + case when subject in ('turkce', 'matematik') then 0 when subject = 'fen' then 1 else 2 end as priority
from agg
order by priority, next_due, subject;
