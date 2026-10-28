-- Öğretmen ders kısıtı: family_links.subjects boşsa (null) bütün dersler, doluysa sadece o dersler.
-- Kısıt veritabanında uygulanır: öğretmen başka dersin sorusuna, cevabına, konusuna erişemez.

alter table public.family_links add column if not exists subjects text[];

-- Bu öğrencinin bu dersteki verisini görebilir miyim? subj null ise "ders bağımsız" (tam erişim) gerekir.
create or replace function public.can_see_subject(sid uuid, subj text)
returns boolean language sql stable security definer set search_path = public as $$
  select sid is not null and (sid = auth.uid()
    or exists (select 1 from family_links f
               where f.parent_id = auth.uid() and f.student_id = sid
                 and (f.relation = 'parent' or f.subjects is null or (subj is not null and subj = any (f.subjects)))));
$$;

create or replace function public.topic_subject(tid text)
returns text language sql stable security definer set search_path = public as $$
  select subject from topics where id = tid;
$$;

create or replace function public.question_subject(qid uuid)
returns text language sql stable security definer set search_path = public as $$
  select subject from questions where id = qid;
$$;

grant execute on function public.can_see_subject(uuid, text), public.topic_subject(text), public.question_subject(uuid) to authenticated;

-- Okuma kuralları derse göre.
drop policy if exists read_rows on public.exam_questions;
create policy read_rows on public.exam_questions for select to authenticated using (public.can_see_subject(student_id, subject));
drop policy if exists read_rows on public.exam_results;
create policy read_rows on public.exam_results for select to authenticated using (public.can_see_subject(student_id, subject));
drop policy if exists read_rows on public.items;
create policy read_rows on public.items for select to authenticated using (public.can_see_subject(student_id, public.topic_subject(topic_id)));
drop policy if exists read_rows on public.topic_status;
create policy read_rows on public.topic_status for select to authenticated using (public.can_see_subject(student_id, public.topic_subject(topic_id)));
drop policy if exists read_rows on public.reviews;
create policy read_rows on public.reviews for select to authenticated using (public.can_see_subject(student_id, public.question_subject(question_id)));
drop policy if exists read_rows on public.question_feedback;
create policy read_rows on public.question_feedback for select to authenticated using (public.can_see_subject(student_id, public.question_subject(question_id)));

-- Fotoğraflar: kırpılmış soru görseli (q-<ders>-<no>.jpg) dersine göre; tam sayfalar sadece ders kısıtı olmayana.
create or replace function public.can_see_photo(path text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  parts text[] := string_to_array(path, '/');
  sid uuid;
  subj text;
begin
  if parts[1] = 'books' then return is_parent(); end if;
  if parts[1] !~ '^[0-9a-f-]{36}$' then return false; end if;
  sid := parts[1]::uuid;
  subj := substring(parts[array_length(parts, 1)] from '^q-([a-z]+)-');
  return can_see_subject(sid, subj);
end $$;
grant execute on function public.can_see_photo(text) to authenticated;

drop policy if exists photos_read on storage.objects;
create policy photos_read on storage.objects for select to authenticated
  using (bucket_id = 'photos' and public.can_see_photo(name));
