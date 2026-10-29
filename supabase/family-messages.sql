-- Veliden çocuğa mesaj: tatlı bir not ya da şaka. Çocuğun ana sayfasında görünür; "okudum" deyince kapanır.
-- Okuyan: çocuğun kendisi ve velileri (öğretmen değil). Yazan: veli, kendi adına, kendi çocuğuna.
create table if not exists public.family_messages (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  from_id uuid references public.profiles(id) on delete set null,
  signature text not null default '' check (char_length(signature) <= 40),
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now(),
  seen_at timestamptz
);
create index if not exists family_messages_student_idx on public.family_messages(student_id, created_at desc);
alter table public.family_messages enable row level security;

drop policy if exists msg_read on public.family_messages;
create policy msg_read on public.family_messages for select to authenticated
  using (student_id = auth.uid() or public.can_edit_student(student_id));
drop policy if exists msg_insert on public.family_messages;
create policy msg_insert on public.family_messages for insert to authenticated
  with check (from_id = auth.uid() and student_id <> auth.uid() and public.can_edit_student(student_id));
-- Çocuk sadece "okudum" işaretini koyar (aşağıda yalnız seen_at sütununa güncelleme izni var).
drop policy if exists msg_seen on public.family_messages;
create policy msg_seen on public.family_messages for update to authenticated
  using (student_id = auth.uid()) with check (student_id = auth.uid());
-- Veli kendi yazdığı mesajı geri alabilir.
drop policy if exists msg_delete on public.family_messages;
create policy msg_delete on public.family_messages for delete to authenticated using (from_id = auth.uid());

revoke all on public.family_messages from anon;
revoke all on public.family_messages from authenticated;
grant select, insert, delete on public.family_messages to authenticated;
grant update (seen_at) on public.family_messages to authenticated;
grant all on public.family_messages to service_role;
