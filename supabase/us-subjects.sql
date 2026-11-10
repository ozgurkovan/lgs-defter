-- ABD dersleri (velinin isteği, 2026-11-10: "diğer konuları da yükler misin?"): İngilizce Dil Sanatları (ELA) için yeni ders
-- anahtarı 'ela'; Fen 'fen', Sosyal 'sosyal' anahtarlarını kullanır (ekranda Science, Social Studies). Konular müfredata göre
-- ayrıldığı için Türk öğrenciye ABD dersi gelmez. Öncelik listelerinde ELA Türkçe'nin yanında: okuma ve matematik önce.
alter table public.topics drop constraint if exists topics_subject_check;
alter table public.topics add constraint topics_subject_check
  check (subject = any (array['turkce', 'matematik', 'fen', 'inkilap', 'din', 'ingilizce', 'hayat', 'sosyal', 'ela']));

-- Soru havuzu ihtiyacı: ELA, Türkçe ve Matematik gibi öncelikli.
create or replace view public.pool_needs as
WITH tracked AS (
         SELECT i.student_id,
            i.topic_id,
            min(i.due_date) AS next_due
           FROM items i
             JOIN topic_status s ON s.student_id = i.student_id AND s.topic_id = i.topic_id AND (s.status = ANY (ARRAY['active'::text, 'gap'::text]))
          WHERE i.state = 'active'::text
          GROUP BY i.student_id, i.topic_id
        ), per_student AS (
         SELECT tr.topic_id,
            tr.next_due,
            ( SELECT count(*) AS count
                   FROM questions q
                  WHERE q.topic_id = tr.topic_id AND q.active AND NOT q.exam_only AND NOT (EXISTS ( SELECT 1
                           FROM reviews r
                          WHERE r.question_id = q.id AND r.student_id = tr.student_id))) AS unseen
           FROM tracked tr
        ), agg AS (
         SELECT p.topic_id,
            t.subject,
            t.grade,
            t.name,
            t.kazanim,
            t.lgs_avg,
            min(p.next_due) AS next_due,
            min(p.unseen) AS unseen
           FROM per_student p
             JOIN topics t ON t.id = p.topic_id
          GROUP BY p.topic_id, t.subject, t.grade, t.name, t.kazanim, t.lgs_avg
         HAVING min(p.unseen) < 30
        )
 SELECT topic_id,
    subject,
    grade,
    name,
    kazanim,
    next_due,
    unseen,
    GREATEST(0::bigint, 30 - unseen) AS to_generate,
    GREATEST(0::bigint, 10 - unseen) AS to_first,
        CASE
            WHEN unseen = 0 THEN 0
            WHEN unseen < 10 THEN 1
            ELSE 2
        END * 10 +
        CASE
            WHEN subject = ANY (ARRAY['turkce'::text, 'ela'::text, 'matematik'::text]) THEN 0
            WHEN subject = 'fen'::text THEN 1
            ELSE 2
        END AS priority,
    lgs_avg
   FROM agg
  ORDER BY (
        CASE
            WHEN unseen = 0 THEN 0
            WHEN unseen < 10 THEN 1
            ELSE 2
        END * 10 +
        CASE
            WHEN subject = ANY (ARRAY['turkce'::text, 'ela'::text, 'matematik'::text]) THEN 0
            WHEN subject = 'fen'::text THEN 1
            ELSE 2
        END), (COALESCE(lgs_avg, 1::numeric)) DESC, next_due, subject;
