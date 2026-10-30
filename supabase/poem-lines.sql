-- "Şiiri sen tamamla" kartında çocuğun yazdığı dizeler. Veli (ve Türkçe öğretmeni) raporda görür; uygulama da
-- çocuğun daha önce tamamladığı şiirleri sona atar, aynı şiir sık sorulmaz. Yazan: sadece öğrencinin kendisi.
create table if not exists public.poem_lines (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  poem_key text not null check (char_length(poem_key) between 1 and 40),
  line text not null check (char_length(btrim(line)) between 1 and 200),
  result text not null check (result in ('aynen', 'kafiyeli', 'kafiyesiz', 'serbest')),
  created_at timestamptz not null default now()
);
create index if not exists poem_lines_student_idx on public.poem_lines(student_id, created_at desc);
alter table public.poem_lines enable row level security;

drop policy if exists poem_read on public.poem_lines;
create policy poem_read on public.poem_lines for select to authenticated
  using (public.can_see_subject(student_id, 'turkce'));
drop policy if exists poem_insert on public.poem_lines;
create policy poem_insert on public.poem_lines for insert to authenticated
  with check (student_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'student'));

revoke all on public.poem_lines from anon;
revoke all on public.poem_lines from authenticated;
grant select, insert on public.poem_lines to authenticated;
grant all on public.poem_lines to service_role;
