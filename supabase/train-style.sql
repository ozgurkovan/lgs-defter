-- Antrenmanın türü (velinin isteği, 2026-11-18: "kızlar için de yapabilir miyiz? … balerin; default olarak kız kahramana
-- balerin, erkeğe kum torbası ama isterse veli değiştirebilsin"). Asker olana kadar cevaptan sonraki sahne:
--   train_style = 'torba'   : kum torbası (70'ten sonra eldivenli uzaylı)
--   train_style = 'balerin' : balerin (70'ten sonra uzaylıyla dans ve oturum sonunda dans oyunu)
--   train_style boş         : kahramanı kız olan çocukta balerin, ötekilerde kum torbası (army.js, trainStyle)
-- Bu ayarı veli değiştirir, öğrenci değiştiremez.
-- Çalıştır: node tools/sb.mjs sql supabase/train-style.sql

alter table public.profiles add column if not exists train_style text;
alter table public.profiles drop constraint if exists profiles_train_style_check;
alter table public.profiles add constraint profiles_train_style_check
  check (train_style is null or train_style in ('torba', 'balerin'));

-- Koruma: ayrı tetikleyici (guard_profile_update'in sonraki tanımları bu korumayı silmesin).
create or replace function public.guard_train_style() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.id = auth.uid() and old.role <> 'parent' and new.train_style is distinct from old.train_style then
    raise exception 'Bu ayarı veli değiştirir' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_train_style on public.profiles;
create trigger guard_train_style before update on public.profiles
  for each row execute function public.guard_train_style();
