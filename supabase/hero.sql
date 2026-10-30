-- Kelime kahramanı (İngilizce sekmesi): öğrendikçe güçlenen bir çocuk çizimi ve kelime altınıyla alınan eşyalar.
-- Kız ya da erkek oluşunu veli seçer. Altın cevaplardan hesaplanır (ilk denemede doğru her kart 1, günün kartları
-- bitince 5); burada yalnızca harcananlar (purchases) tutulur.
alter table public.profiles add column if not exists avatar text;
alter table public.profiles drop constraint if exists profiles_avatar_check;
alter table public.profiles add constraint profiles_avatar_check check (avatar is null or avatar in ('kiz', 'erkek'));

-- Oturum sonunda tekrar sorulan kart (altın vermez).
alter table public.word_answers add column if not exists again boolean not null default false;

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  item text not null check (char_length(item) between 1 and 40),
  price int not null check (price between 0 and 100000),
  created_at timestamptz not null default now(),
  unique (student_id, item)
);
alter table public.purchases enable row level security;
drop policy if exists purchases_read on public.purchases;
create policy purchases_read on public.purchases for select to authenticated
  using (public.can_see_subject(student_id, 'ingilizce'));
drop policy if exists purchases_insert on public.purchases;
create policy purchases_insert on public.purchases for insert to authenticated
  with check (student_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'student'));
revoke all on public.purchases from anon;
revoke all on public.purchases from authenticated;
grant select, insert on public.purchases to authenticated;
grant all on public.purchases to service_role;

-- Profil koruması: kahramanın kız ya da erkek oluşu da veli ayarıdır.
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
          or new.daily_words is distinct from old.daily_words
          or new.avatar is distinct from old.avatar) then
    raise exception 'Bu ayarı veli değiştirir' using errcode = '42501';
  end if;
  return new;
end $$;
