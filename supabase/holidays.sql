-- Okul tatilleri (velinin isteği, 2026-11-16: "tatillerde soru sayısını artırmamız lazım… bu hafta için otomatik 2 kat").
-- Tatil günlerinde günlük plan katlanır (uygulama: dailyPlanToday). Türkiye'de MEB takvimi uygulamada hazır; veli kendi
-- tatil günlerini de ekler. holiday_factor: tatilde kaç kat (boşsa 2; 1 kapalı, en çok 3). holidays: velinin eklediği
-- günler [{"from": "2026-11-26", "to": "2026-11-27"}, …] (en çok 30). Bu ayarları veli değiştirir, öğrenci değiştiremez.
alter table public.profiles add column if not exists holiday_factor numeric;
alter table public.profiles add column if not exists holidays jsonb;
alter table public.profiles drop constraint if exists profiles_holiday_factor_check;
alter table public.profiles add constraint profiles_holiday_factor_check
  check (holiday_factor is null or (holiday_factor >= 1 and holiday_factor <= 3));
alter table public.profiles drop constraint if exists profiles_holidays_check;
alter table public.profiles add constraint profiles_holidays_check
  check (holidays is null or (jsonb_typeof(holidays) = 'array' and jsonb_array_length(holidays) <= 30));

-- Koruma: ayrı tetikleyici (guard_profile_update'in sonraki tanımları bu korumayı silmesin).
create or replace function public.guard_holiday_setting() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.id = auth.uid() and old.role <> 'parent'
     and (new.holiday_factor is distinct from old.holiday_factor or new.holidays is distinct from old.holidays) then
    raise exception 'Bu ayarı veli değiştirir' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_holiday_setting on public.profiles;
create trigger guard_holiday_setting before update on public.profiles
  for each row execute function public.guard_holiday_setting();
