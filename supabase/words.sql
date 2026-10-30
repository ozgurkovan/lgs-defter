-- Kelime kartları: okuldaki İngilizce dersinden ayrı, ilkokul için İngilizce kelime çalışması. Kelime listesi
-- uygulamada (docs/words.json, kolaydan zora). Burada her çocuğun kelime kutusu ve cevap kaydı tutulur:
-- bilemediği kelime yarın yine gelir, bildikçe 3, 7, 14, 30, 60 gün sonraya ilerler.
-- Yazan: sadece öğrencinin kendisi. Okuyan: kendisi, velisi ve İngilizce'si olan öğretmeni.

-- Günde kaç kelime kartı (veli ayarı). Boşsa uygulama 1–4. sınıfa 10 verir, diğerlerine kapalıdır; 0 kapalı.
alter table public.profiles add column if not exists daily_words int;
alter table public.profiles drop constraint if exists daily_words_range;
alter table public.profiles add constraint daily_words_range check (daily_words is null or daily_words between 0 and 50);

create table if not exists public.word_progress (
  student_id uuid not null references public.profiles(id) on delete cascade,
  word text not null check (char_length(word) between 1 and 40),
  box int not null check (box between 1 and 9),
  due_date date not null,
  right_count int not null default 0 check (right_count >= 0),
  wrong_count int not null default 0 check (wrong_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (student_id, word)
);
alter table public.word_progress enable row level security;

create table if not exists public.word_answers (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  word text not null check (char_length(word) between 1 and 40),
  correct boolean not null,
  reverse boolean not null default false,
  answered_at timestamptz not null default now()
);
create index if not exists word_answers_student_idx on public.word_answers(student_id, answered_at desc);
alter table public.word_answers enable row level security;

drop policy if exists word_progress_read on public.word_progress;
create policy word_progress_read on public.word_progress for select to authenticated
  using (public.can_see_subject(student_id, 'ingilizce'));
drop policy if exists word_progress_insert on public.word_progress;
create policy word_progress_insert on public.word_progress for insert to authenticated
  with check (student_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'student'));
drop policy if exists word_progress_update on public.word_progress;
create policy word_progress_update on public.word_progress for update to authenticated
  using (student_id = auth.uid()) with check (student_id = auth.uid());

drop policy if exists word_answers_read on public.word_answers;
create policy word_answers_read on public.word_answers for select to authenticated
  using (public.can_see_subject(student_id, 'ingilizce'));
drop policy if exists word_answers_insert on public.word_answers;
create policy word_answers_insert on public.word_answers for insert to authenticated
  with check (student_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'student'));

revoke all on public.word_progress from anon;
revoke all on public.word_progress from authenticated;
revoke all on public.word_answers from anon;
revoke all on public.word_answers from authenticated;
grant select, insert, update on public.word_progress to authenticated;
grant select, insert on public.word_answers to authenticated;
grant all on public.word_progress to service_role;
grant all on public.word_answers to service_role;

-- Profil koruması: günlük kelime sayısı da veli ayarıdır (öğrenci kendisi değiştiremez).
create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.id is distinct from old.id or new.role is distinct from old.role or new.created_at is distinct from old.created_at then
    raise exception 'Bu alan değiştirilemez' using errcode = '42501';
  end if;
  if new.id = auth.uid() and old.role <> 'parent'
     and (new.grade is distinct from old.grade
          or new.daily_by_subject is distinct from old.daily_by_subject
          or new.daily_questions is distinct from old.daily_questions
          or new.extra_grades is distinct from old.extra_grades
          or new.rare_factor is distinct from old.rare_factor
          or new.daily_words is distinct from old.daily_words) then
    raise exception 'Bu ayarı veli değiştirir' using errcode = '42501';
  end if;
  return new;
end $$;
