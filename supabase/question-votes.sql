-- Soru beğenisi (velinin isteği, 2026-11-16): öğrenci cevapladıktan sonra soruya 👍 ya da 👎 verir; 👎'de nedenini
-- yazabilir. Soru başına bir oy; değiştirebilir. "Soruda sorun var" bildiriminden (question_feedback) ayrıdır: bu oy
-- soruyu iptal etmez, sonucu değiştirmez; yalnızca soru kalitesini izlemek içindir.
-- Çalıştır: node tools/sb.mjs sql supabase/question-votes.sql

create table if not exists public.question_votes (
  student_id uuid not null references public.profiles(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  vote smallint not null check (vote in (1, -1)),
  note text check (note is null or length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (student_id, question_id)
);
create index if not exists question_votes_question_idx on public.question_votes(question_id);

alter table public.question_votes enable row level security;
drop policy if exists votes_read on public.question_votes;
create policy votes_read on public.question_votes for select to authenticated
  using (public.can_see_student(student_id));
drop policy if exists votes_insert on public.question_votes;
create policy votes_insert on public.question_votes for insert to authenticated
  with check (student_id = auth.uid());
drop policy if exists votes_update on public.question_votes;
create policy votes_update on public.question_votes for update to authenticated
  using (student_id = auth.uid()) with check (student_id = auth.uid());
grant select, insert, update on public.question_votes to authenticated;
grant all on public.question_votes to service_role;

-- Soru başına özet (yalnızca yönetim ve saatlik görev; kullanıcılar göremez).
create or replace view public.question_vote_summary as
  select q.id as question_id, q.source, q.subject, q.topic_id,
         count(*) filter (where v.vote = 1) as up,
         count(*) filter (where v.vote = -1) as down,
         array_remove(array_agg(v.note order by v.updated_at desc) filter (where v.vote = -1), null) as notes,
         left(q.stem, 200) as stem
  from public.question_votes v join public.questions q on q.id = v.question_id
  group by q.id;
revoke all on public.question_vote_summary from anon, authenticated;
grant select on public.question_vote_summary to service_role;
