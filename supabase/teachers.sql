-- Öğretmen rolü: veli seçtiği çocuğu öğretmene açar. Öğretmen sadece okur.
-- family_links artık "yetişkin → öğrenci" bağıdır; relation ile veli mi öğretmen mi olduğu belirtilir.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('student', 'parent', 'teacher'));

alter table public.family_links add column if not exists relation text not null default 'parent'
  check (relation in ('parent', 'teacher'));

-- Görebilir: öğrencinin kendisi, velisi, öğretmeni.
create or replace function public.can_see_student(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select sid is not null and (sid = auth.uid()
    or exists (select 1 from family_links where parent_id = auth.uid() and student_id = sid));
$$;

-- Değiştirebilir: sadece öğrencinin kendisi ve velisi (öğretmen değil).
create or replace function public.can_edit_student(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select sid is not null and (sid = auth.uid()
    or exists (select 1 from family_links where parent_id = auth.uid() and student_id = sid and relation = 'parent'));
$$;
grant execute on function public.can_edit_student(uuid) to authenticated;

create or replace function public.is_parent()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'parent');
$$;

-- Öğrenci tabloları: okuma can_see, yazma can_edit.
do $$
declare t text;
begin
  foreach t in array array['topic_status','exams','exam_results','exam_questions','items','reviews','question_feedback']
  loop
    execute format('drop policy if exists own_rows on public.%I', t);
    execute format('drop policy if exists read_rows on public.%I', t);
    execute format('drop policy if exists write_rows on public.%I', t);
    execute format('create policy read_rows on public.%I for select to authenticated using (public.can_see_student(student_id))', t);
    execute format('create policy write_rows on public.%I for all to authenticated using (public.can_edit_student(student_id)) with check (public.can_edit_student(student_id))', t);
  end loop;
end $$;

-- Profiller: kendi profili, görebildiği öğrenciler; öğrenci velilerini ve öğretmenlerini görebilir;
-- veliler kendi çocuklarına bağlı diğer yetişkinleri (eş, öğretmen) görebilir.
drop policy if exists own_rows on public.profiles;
create policy own_rows on public.profiles for select to authenticated
  using (id = auth.uid() or public.can_see_student(id)
         or exists (select 1 from public.family_links f where f.student_id = auth.uid() and f.parent_id = profiles.id)
         or exists (select 1 from public.family_links mine join public.family_links other on other.student_id = mine.student_id
                    where mine.parent_id = auth.uid() and mine.relation = 'parent' and other.parent_id = profiles.id));
drop policy if exists update_own on public.profiles;
create policy update_own on public.profiles for update to authenticated
  using (id = auth.uid() or public.can_edit_student(id)) with check (id = auth.uid() or public.can_edit_student(id));

drop policy if exists own_rows on public.family_links;
create policy own_rows on public.family_links for select to authenticated
  using (parent_id = auth.uid() or student_id = auth.uid()
         or exists (select 1 from public.family_links mine where mine.parent_id = auth.uid() and mine.relation = 'parent'
                    and mine.student_id = family_links.student_id));

-- Deneme yükleme ve fotoğraflar: sadece öğrenci ve veli yazar; öğretmen fotoğrafları görebilir.
drop policy if exists own_rows on public.submissions;
drop policy if exists read_rows on public.submissions;
drop policy if exists write_rows on public.submissions;
create policy read_rows on public.submissions for select to authenticated
  using ((student_id is not null and public.can_see_student(student_id)) or (student_id is null and uploaded_by = auth.uid()));
create policy write_rows on public.submissions for all to authenticated
  using ((student_id is not null and public.can_edit_student(student_id)) or (student_id is null and uploaded_by = auth.uid()))
  with check ((student_id is not null and public.can_edit_student(student_id)) or (student_id is null and uploaded_by = auth.uid() and public.is_parent()));

drop policy if exists own_rows on public.submission_photos;
drop policy if exists read_rows on public.submission_photos;
drop policy if exists write_rows on public.submission_photos;
create policy read_rows on public.submission_photos for select to authenticated
  using (exists (select 1 from public.submissions s where s.id = submission_id
                 and ((s.student_id is not null and public.can_see_student(s.student_id)) or (s.student_id is null and s.uploaded_by = auth.uid()))));
create policy write_rows on public.submission_photos for all to authenticated
  using (exists (select 1 from public.submissions s where s.id = submission_id
                 and ((s.student_id is not null and public.can_edit_student(s.student_id)) or (s.student_id is null and s.uploaded_by = auth.uid()))))
  with check (exists (select 1 from public.submissions s where s.id = submission_id
                 and ((s.student_id is not null and public.can_edit_student(s.student_id)) or (s.student_id is null and s.uploaded_by = auth.uid()))));

drop policy if exists photos_access on storage.objects;
drop policy if exists photos_read on storage.objects;
drop policy if exists photos_write on storage.objects;
create policy photos_read on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (
    ((storage.foldername(name))[1] = 'books' and public.is_parent())
    or ((storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' and public.can_see_student(((storage.foldername(name))[1])::uuid))));
create policy photos_write on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (
    ((storage.foldername(name))[1] = 'books' and public.is_parent())
    or ((storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' and public.can_edit_student(((storage.foldername(name))[1])::uuid))));
drop policy if exists photos_update on storage.objects;
create policy photos_update on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' and public.can_edit_student(((storage.foldername(name))[1])::uuid));

-- Bildirilen soruyu çekme: sadece soruyu çözmüş öğrenci ya da velisi.
create or replace function public.retire_reported_question(qid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from reviews where question_id = qid and can_edit_student(student_id)) then
    update questions set active = false where id = qid;
  end if;
end $$;
