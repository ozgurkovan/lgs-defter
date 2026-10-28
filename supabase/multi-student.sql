-- Çok öğrencili yapı: her kayıt bir öğrenciye bağlı, öğrencinin sınıfı var, veliler öğrencilere bağlanır.
-- Öğrenci sadece kendi verisini, veli sadece bağlı olduğu öğrencilerin verisini görür.
-- Soru havuzu ve konu listesi ortaktır; "görüldü" bilgisi öğrenci başınadır (reviews.student_id).

-- 1. Sınıf ve aile bağları ------------------------------------------------------

alter table public.profiles add column if not exists grade int check (grade between 1 and 12);
update public.profiles set grade = 8 where role = 'student' and grade is null;

create table if not exists public.family_links (
  parent_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (parent_id, student_id)
);
insert into public.family_links (parent_id, student_id)
select p.id, s.id from public.profiles p cross join public.profiles s
where p.role = 'parent' and s.role = 'student'
on conflict do nothing;

create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid());
$$;

create or replace function public.is_parent()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'parent');
$$;

create or replace function public.can_see_student(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select sid is not null and (sid = auth.uid()
    or exists (select 1 from family_links where parent_id = auth.uid() and student_id = sid));
$$;

grant execute on function public.is_member(), public.is_parent(), public.can_see_student(uuid) to authenticated;

-- 2. Konulara sınıf -------------------------------------------------------------

alter table public.topics add column if not exists grade int not null default 8;

-- 3. Öğrenci sütunları; mevcut kayıtlar ilk öğrenciye bağlanır ---------------------

do $$
declare
  first_student uuid := (select id from public.profiles where role = 'student' order by created_at limit 1);
  t text;
begin
  foreach t in array array['exams','submissions','exam_results','exam_questions','items','reviews','topic_status','question_feedback']
  loop
    execute format('alter table public.%I add column if not exists student_id uuid references public.profiles(id) on delete cascade', t);
    if t <> 'submissions' then
      execute format('update public.%I set student_id = $1 where student_id is null', t) using first_student;
      execute format('alter table public.%I alter column student_id set not null', t);
    else
      execute 'update public.submissions set student_id = $1 where student_id is null and kind = ''deneme''' using first_student;
    end if;
    execute format('create index if not exists %I on public.%I(student_id)', t || '_student_idx', t);
  end loop;
end $$;

-- Kitap yüklemeleri ortak havuz içindir (öğrencisiz); deneme yüklemeleri bir öğrenciye aittir.
alter table public.submissions drop constraint if exists submissions_student_kind;
alter table public.submissions add constraint submissions_student_kind
  check ((kind = 'deneme' and student_id is not null) or kind = 'kitap');

-- Konu durumu ve konu tekrarı artık öğrenci başına.
alter table public.topic_status drop constraint if exists topic_status_pkey;
alter table public.topic_status add primary key (student_id, topic_id);
drop index if exists public.items_topic_track_uq;
create unique index if not exists items_student_topic_uq on public.items(student_id, topic_id) where track = 'topic';
create index if not exists items_student_due_idx on public.items(student_id, due_date) where state = 'active';
create index if not exists reviews_student_question_idx on public.reviews(student_id, question_id);

-- 4. Erişim kuralları ---------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['profiles','topics','topic_status','exams','submissions','submission_photos','exam_results',
                           'exam_questions','questions','items','reviews','job_runs','question_feedback','family_links']
  loop
    execute format('drop policy if exists family_all on public.%I', t);
    execute format('drop policy if exists own_rows on public.%I', t);
    execute format('drop policy if exists read_members on public.%I', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;

  -- Öğrenciye ait tablolar: öğrenci kendisi, veli bağlı öğrencileri.
  foreach t in array array['topic_status','exams','exam_results','exam_questions','items','reviews','question_feedback']
  loop
    execute format('create policy own_rows on public.%I for all to authenticated using (public.can_see_student(student_id)) with check (public.can_see_student(student_id))', t);
  end loop;
end $$;

-- Profiller: kendi profili ve bağlı öğrencileri; öğrenci velisinin adını görebilir.
create policy own_rows on public.profiles for select to authenticated
  using (id = auth.uid() or public.can_see_student(id)
         or exists (select 1 from public.family_links f where f.student_id = auth.uid() and f.parent_id = profiles.id));
create policy update_own on public.profiles for update to authenticated
  using (id = auth.uid() or public.can_see_student(id)) with check (id = auth.uid() or public.can_see_student(id));
drop policy if exists update_own on public.profiles;
create policy update_own on public.profiles for update to authenticated
  using (id = auth.uid() or public.can_see_student(id)) with check (id = auth.uid() or public.can_see_student(id));

create policy own_rows on public.family_links for select to authenticated
  using (parent_id = auth.uid() or student_id = auth.uid());

-- Ortak içerik: üyeler okur, yazma sadece saatlik görevde (gizli anahtar).
create policy read_members on public.topics for select to authenticated using (public.is_member());
create policy read_members on public.questions for select to authenticated using (public.is_member());
create policy read_members on public.job_runs for select to authenticated using (public.is_parent());

-- Yüklemeler: deneme öğrenciye, kitap yükleyen veliye ait.
create policy own_rows on public.submissions for all to authenticated
  using ((student_id is not null and public.can_see_student(student_id)) or (student_id is null and uploaded_by = auth.uid()))
  with check ((student_id is not null and public.can_see_student(student_id)) or (student_id is null and uploaded_by = auth.uid() and public.is_parent()));
create policy own_rows on public.submission_photos for all to authenticated
  using (exists (select 1 from public.submissions s where s.id = submission_id
                 and ((s.student_id is not null and public.can_see_student(s.student_id)) or (s.student_id is null and s.uploaded_by = auth.uid()))))
  with check (exists (select 1 from public.submissions s where s.id = submission_id
                 and ((s.student_id is not null and public.can_see_student(s.student_id)) or (s.student_id is null and s.uploaded_by = auth.uid()))));

revoke insert, update, delete on public.topics, public.questions, public.job_runs, public.family_links from authenticated;
grant select on public.family_links to authenticated;
grant all on public.family_links to service_role;
revoke insert, delete on public.profiles from authenticated;

-- Eski tek-aile yardımcıları artık kullanılmıyor.
drop function if exists public.student_id();

-- 5. Fotoğraf depoları: öğrencinin klasörü <student_id>/..., kitap sayfaları books/...
drop policy if exists family_photos on storage.objects;
drop policy if exists photos_access on storage.objects;
drop policy if exists questions_read on storage.objects;
create policy photos_access on storage.objects for all to authenticated
  using (bucket_id = 'photos' and (
    ((storage.foldername(name))[1] = 'books' and public.is_parent())
    or ((storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' and public.can_see_student(((storage.foldername(name))[1])::uuid))))
  with check (bucket_id = 'photos' and (
    ((storage.foldername(name))[1] = 'books' and public.is_parent())
    or ((storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' and public.can_see_student(((storage.foldername(name))[1])::uuid))));
create policy questions_read on storage.objects for select to authenticated
  using (bucket_id = 'questions' and public.is_member());

-- 6. Bildirilen soruyu havuzdan çekme: sadece o soruyu görmüş öğrenci ya da veli.
create or replace function public.retire_reported_question(qid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from reviews where question_id = qid and can_see_student(student_id)) or is_parent() then
    update questions set active = false where id = qid;
  end if;
end $$;
revoke all on function public.retire_reported_question(uuid) from public, anon;
grant execute on function public.retire_reported_question(uuid) to authenticated;

-- 7. Yıllık plana göre konu açma: her öğrenci için kendi sınıfının konuları.
create or replace function public.activate_planned_topics()
returns int language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Europe/Istanbul')::date;
  added int;
begin
  with due as (
    select s.id as student_id, t.id as topic_id,
           row_number() over (partition by s.id
                              order by case when t.subject in ('turkce','matematik','fen') then 0 else 1 end,
                                       t.planned_start, t.subject, t.sort) as n
    from profiles s
    join topics t on t.grade = s.grade
    where s.role = 'student' and t.planned_start <= today
      and not exists (select 1 from topic_status ts where ts.student_id = s.id and ts.topic_id = t.id)
  ), st as (
    insert into topic_status (student_id, topic_id, status, first_seen)
    select student_id, topic_id, 'active', today from due
    returning topic_id
  )
  insert into items (student_id, track, topic_id, step, interval_days, due_date)
  select d.student_id, 'topic', d.topic_id, 0, 1, today + 1 + ((d.n - 1) % 7)::int
  from due d
  where not exists (select 1 from items i where i.student_id = d.student_id and i.track = 'topic' and i.topic_id = d.topic_id);
  get diagnostics added = row_count;
  return added;
end $$;
revoke all on function public.activate_planned_topics() from public, anon, authenticated;
grant execute on function public.activate_planned_topics() to service_role;

-- 8. Görevin görünümleri: havuz ihtiyacı öğrenci başına hesaplanır, en çok eksiği olan öğrenci belirler.
drop view if exists public.pool_needs;
create view public.pool_needs as
with tracked as (
  select i.student_id, i.topic_id, min(i.due_date) as next_due
  from public.items i
  join public.topic_status s on s.student_id = i.student_id and s.topic_id = i.topic_id and s.status in ('active', 'gap')
  where i.state = 'active'
  group by i.student_id, i.topic_id
), per_student as (
  select tr.topic_id, tr.next_due,
         (select count(*) from public.questions q
           where q.topic_id = tr.topic_id and q.active
             and not exists (select 1 from public.reviews r where r.question_id = q.id and r.student_id = tr.student_id)) as unseen
  from tracked tr
)
select p.topic_id, t.subject, t.grade, t.name, t.kazanim,
       min(p.next_due) as next_due, min(p.unseen) as unseen,
       greatest(0, 30 - min(p.unseen)) as to_generate
from per_student p
join public.topics t on t.id = p.topic_id
group by p.topic_id, t.subject, t.grade, t.name, t.kazanim
having min(p.unseen) < 30
order by min(p.next_due), t.subject;

drop view if exists public.gap_progress;
create view public.gap_progress as
select ts.student_id, ts.topic_id, t.name, ts.gap_since, ts.lesson is not null as has_lesson,
       (select array_agg(x.correct order by x.answered_at desc)
          from (select r.correct, r.answered_at
                  from public.reviews r join public.questions q on q.id = r.question_id
                 where r.student_id = ts.student_id and q.topic_id = ts.topic_id and not r.voided
                   and r.answered_at::date >= ts.gap_since
                 order by r.answered_at desc limit 3) x) as last3
from public.topic_status ts
join public.topics t on t.id = ts.topic_id
where ts.status = 'gap';

revoke all on public.pool_needs, public.gap_progress from anon, authenticated;
grant select on public.pool_needs, public.gap_progress to service_role;
