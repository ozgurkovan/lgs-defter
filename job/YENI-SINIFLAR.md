# One-off: first questions for the newly opened grades (Türkiye 2, 5, 6, 7)

A one-time job, run by hand with a strong model (velinin kararı, 2026-11-25). The topics of grades 2,
5, 6 and 7 (Türkiye curriculum) were loaded on 2026-11-25 and have no questions. Give every topic that
has started, or starts within the next 30 days, its first 10 questions, so that a child who joins one
of these grades can work from the first day. Filling up to 30 is the WRITER task's job later; do not
go beyond 10 per topic here.

Work in the project folder (the one holding `tools/` and `.secrets/`). Talk to the database only
through `node tools/sb.mjs` (`get`, `post`, `patch`). Never print or copy anything from `.secrets/`.
Never delete rows. Do not process uploads, do not touch students, plans, items or any table other
than `questions` (insert only) and `job_runs` (your own log row).

## 1. Read the rules first

Read `job/INSTRUCTIONS.md` and follow these parts of it exactly; they are the same rules every pool
question obeys:
- the introduction (languages, tone, primary-school rules: grades 1–3 three choices A–C, short
  sentences, everyday contexts; grade 4 and up four choices A–D);
- "Content rules for everything you write";
- "Original questions only" (every question is your own, written from the topic and its kazanım;
  never copy or adapt a question from a book, a deneme or the web);
- section 2 "Keep the question pool stocked": the format, the fields, the styles, and the rule that
  every Matematik and Fen question is solved twice by independent methods before it is saved.
Do not do anything else that file describes. You are not the ROUTINE or the WRITER task.

Grade notes: grades 5–7 are written in the LGS format (one stem, four choices A–D, one correct
answer, distractors built on typical misconceptions) at the level of the topic's grade; do not
mention LGS in the text. Grade 2 follows the primary-school rules and never mentions exams. English
(`ingilizce`) questions test English; their hints and solutions are in Turkish at the child's level.
Grade 7 English follows the previous programme's ten units, as its topics say. `target_seconds`: 90
for Matematik and Fen, 60 for the other subjects in grade 2; for grades 5–7 use the time table in
section 1b of the instructions.

## 2. Log the run

```
node tools/sb.mjs post job_runs '{"summary":"yeni sınıflar: başladı"}'
```
Keep the `id`; patch `finished_at` and the final summary at the end.

## 3. Find the work (run this again whenever you need the current state)

```
node tools/sb.mjs get "topics?curriculum=eq.tr&grade=in.(2,5,6,7)&planned_start=lte.<today + 30 days>&select=id,grade,subject,unit,name,kazanim,planned_start,sort&order=grade,subject,sort"
```
Skip the old placeholder topic of grade 2 (its id does not have the form `g2.<subject>.<slug>` with
one of the subjects below, or it has no `kazanim`). For each topic count what it already has:
```
node tools/sb.mjs get "questions?topic_id=eq.<id>&active=eq.true&select=id"
```
A topic needs `10 - count` questions; skip it when that is 0 or less. This makes the job resumable:
if you stop and are started again, you continue where the counts say.

Order: Türkçe and Matematik first, then Fen (Hayat Bilgisi in grade 2), then the other subjects;
inside a subject by `planned_start`. Go grade by grade in this order: 5, 6, 7, 2. Finish a topic
before starting the next one; do not spread half-filled topics around.

## 4. Write

For each topic write the questions it needs (normally 10):
- Read the topic's `name`, `unit` and `kazanim`. The kazanım sentence is a short summary; stay inside
  what it and the topic name cover for that grade, and do not use knowledge the child meets only in a
  later topic of the same grade (look at the topics before it in `sort` order).
- Spread the ten over difficulty (about 3 easier, 5 at grade level, 2 harder) and over styles
  (`styles`: grafik, tablo, oncullu, degildir, paragraf, islem, deney, gorsel, kavram; write tables as
  text; skip any question that would need a drawing that text cannot describe precisely).
- Ten different questions: different contexts, numbers and wording, not one frame with new numbers.
- Spread the correct answers over the letters.
- Each row: `source: "claude"`, `subject`, `topic_id`, `styles`, `stem`, `choices` (JSON object, keys
  A–C for grade 2, A–D for grades 5–7), `answer`, `hint`, `solution`, `target_seconds`,
  `verified: true`. Do not set `catalog_id`, `private_students`, `hold_until`, `variant_of` or
  `source_note`.
- Check before saving: reread each question as the child would. One and only one choice is correct;
  the stem cannot be read two ways; the hint does not give the answer away; the solution reaches the
  stored `answer`. Matematik and Fen: your two independent solutions agree, otherwise drop the question.

Save one topic at a time: write its array to `.work/yeni-siniflar/<topic_id>.json` and run
`node tools/sb.mjs post questions .work/yeni-siniflar/<topic_id>.json`. If the post fails, fix the
file and post again; never post the same file twice (count first, as in step 3).

## 5. Limits and finish

There is no question limit for this job, but stop cleanly when you are running out of room: finish
the topic you are on, do not start one you cannot finish. Quality comes before count; a topic with 8
good questions is better than 10 with two doubtful ones (the WRITER task tops it up later).

At the end patch your `job_runs` row with `finished_at` and a Turkish summary, and give the same
summary as your last message: per grade, how many topics now have 10 questions, how many questions
you wrote, which topics are still short and why, and any topic whose name or kazanım looked wrong or
unclear (the topic list was taken from MEB's 2026-27 draft yearly plans and has not been checked
line by line; list such topics instead of guessing).
