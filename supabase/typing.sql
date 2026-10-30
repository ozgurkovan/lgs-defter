-- Klavye dersleri (on parmak klavye, çocuğun Klavye sekmesi): her bitirdiği dersin sonucu. Yıldızlar ve altın
-- sonuçlardan hesaplanır (dersin en iyi sonucu sayılır). Günde kaç ders gelsin veli seçer (profiles.daily_typing;
-- boşsa ilkokulda 2, sonrasında kapalı). Çocuk kendi sonucunu yazar; kendisi ve velileri görür.
alter table public.profiles add column if not exists daily_typing int;
alter table public.profiles drop constraint if exists profiles_daily_typing_check;
alter table public.profiles add constraint profiles_daily_typing_check check (daily_typing is null or daily_typing between 0 and 10);

create table if not exists public.typing_results (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  lesson text not null check (lesson ~ '^[a-z0-9-]{1,40}$'),
  chars int not null check (chars between 0 and 20000),
  errors int not null check (errors between 0 and 20000),
  seconds int not null check (seconds between 0 and 86400),
  stars int not null check (stars between 0 and 3),
  misses jsonb check (misses is null or (jsonb_typeof(misses) = 'object' and pg_column_size(misses) < 2000)),
  created_at timestamptz not null default now()
);
create index if not exists typing_results_student on public.typing_results (student_id, created_at);
alter table public.typing_results enable row level security;
drop policy if exists typing_read on public.typing_results;
create policy typing_read on public.typing_results for select to authenticated using (public.can_edit_student(student_id));
drop policy if exists typing_insert on public.typing_results;
create policy typing_insert on public.typing_results for insert to authenticated
  with check (student_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'student'));
revoke all on public.typing_results from anon;
revoke all on public.typing_results from authenticated;
grant select, insert on public.typing_results to authenticated;
grant all on public.typing_results to service_role;

-- Günlük ders sayısı veli ayarıdır: çocuk kendi profilinde değiştiremez. Ayrı tetikleyici, böylece
-- guard_profile_update'in sonraki tanımları bu korumayı silmez.
create or replace function public.guard_typing_setting() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and new.id = auth.uid() and old.role <> 'parent'
     and new.daily_typing is distinct from old.daily_typing then
    raise exception 'Bu ayarı veli değiştirir' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_typing_setting on public.profiles;
create trigger guard_typing_setting before update on public.profiles
  for each row execute function public.guard_typing_setting();
