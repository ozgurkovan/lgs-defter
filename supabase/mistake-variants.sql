-- Hata tekrarı için "benzer sorular".
-- items.question_id: konu tekrarında / ek çalışmada yanlış yapılan soru (denemeden gelen hatalarda exam_question_id dolu).
-- questions.variant_of / variant_of_exam: bu soru, o yanlış sorunun değiştirilmiş hâli ya da benzeri.
-- Hata tekrarı önce bu benzerleri getirir; konu tekrarı onlara dokunmaz.
alter table public.items add column if not exists question_id uuid references public.questions(id) on delete set null;
alter table public.questions add column if not exists variant_of uuid references public.questions(id) on delete set null;
alter table public.questions add column if not exists variant_of_exam uuid references public.exam_questions(id) on delete set null;
create index if not exists questions_variant_of_idx on public.questions(variant_of) where variant_of is not null;
create index if not exists questions_variant_of_exam_idx on public.questions(variant_of_exam) where variant_of_exam is not null;

-- Saatlik görev için: benzer sorusu eksik olan açık hata maddeleri. unseen_variants o öğrencinin görmediği
-- benzer soru sayısı; need hedefe (3) kadar yazılacak sayı. Kaynak soru ve öğrencinin verdiği cevap da gelir.
create or replace view public.mistake_variant_needs as
with m as (
  select i.id as item_id, i.student_id, i.topic_id, i.due_date, i.question_id, i.exam_question_id,
         case when i.question_id is not null then 'soru' else 'deneme' end as source_kind
  from items i
  where i.track = 'mistake' and i.state = 'active'
    and (i.question_id is not null or i.exam_question_id is not null)
)
select m.item_id, m.student_id, m.topic_id, t.grade, t.subject, t.name as topic_name, m.due_date, m.source_kind,
       m.question_id, m.exam_question_id,
       coalesce((select r.answer from reviews r where r.student_id = m.student_id and r.question_id = m.question_id
                  order by r.answered_at desc limit 1),
                (select e.student_answer from exam_questions e where e.id = m.exam_question_id)) as student_answer,
       (select count(*) from questions q
         where q.active
           and ((m.question_id is not null and q.variant_of = m.question_id)
             or (m.exam_question_id is not null and q.variant_of_exam = m.exam_question_id))
           and not exists (select 1 from reviews r where r.student_id = m.student_id and r.question_id = q.id)) as unseen_variants,
       greatest(0, 3 - (select count(*) from questions q
         where q.active
           and ((m.question_id is not null and q.variant_of = m.question_id)
             or (m.exam_question_id is not null and q.variant_of_exam = m.exam_question_id))
           and not exists (select 1 from reviews r where r.student_id = m.student_id and r.question_id = q.id)))::int as need
from m
join topics t on t.id = m.topic_id
where (select count(*) from questions q
        where q.active
          and ((m.question_id is not null and q.variant_of = m.question_id)
            or (m.exam_question_id is not null and q.variant_of_exam = m.exam_question_id))
          and not exists (select 1 from reviews r where r.student_id = m.student_id and r.question_id = q.id)) < 2
order by m.due_date, t.subject;
