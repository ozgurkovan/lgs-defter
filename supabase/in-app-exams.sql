-- Uygulama içi deneme: öğrenci soruları uygulamada süreli çözer. Sonuç kâğıt denemeler gibi exams /
-- exam_results / exam_questions tablolarına yazılır (raporlar ve "nedenleri seç" aynı akışı kullanır).
alter table public.exams drop constraint if exists exams_kind_check;
alter table public.exams add constraint exams_kind_check check (kind = any (array['tam', 'brans', 'okul', 'uygulama']));
-- Gerçek LGS kitapçığı çözüldüyse hangisi (ör. lgs-2025-sozel-a); karma denemede boş.
alter table public.exams add column if not exists booklet text;
-- Uygulamada çözülen sorunun havuzdaki karşılığı ve o soruda geçen süre (saniye).
alter table public.exam_questions add column if not exists question_id uuid references public.questions(id) on delete set null;
alter table public.exam_questions add column if not exists time_sec int;
