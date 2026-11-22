-- Oyun ayarları (velinin isteği, 2026-11-22: "oyun açmak istemeyebilir veli, 100'den sonraki oyun hoşlarına gitmeyebilir").
-- Veli oyunları çocuk çocuk kapatır; kahraman, dersler ve antrenman sahneleri yerinde kalır.
--   hero_games  : kahramanın oyunları, yani asker olunca oturum ve deneme sonundaki "uzaylı savaşı" ile balerinde
--                 "uzaylıyla dans". false = kapalı; boş ya da true = açık.
--   typing_game : Klavye sayfasındaki "Kelime roketi". false = kapalı; boş ya da true = açık.
-- Bu ayarları veli değiştirir, öğrenci değiştiremez.
-- Çalıştır: node tools/sb.mjs sql supabase/game-settings.sql

alter table public.profiles add column if not exists hero_games boolean;
alter table public.profiles add column if not exists typing_game boolean;

-- Koruma: ayrı tetikleyici (guard_profile_update'in sonraki tanımları bu korumayı silmesin).
create or replace function public.guard_game_settings() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.id = auth.uid() and old.role <> 'parent'
     and (new.hero_games is distinct from old.hero_games or new.typing_game is distinct from old.typing_game) then
    raise exception 'Bu ayarı veli değiştirir' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_game_settings on public.profiles;
create trigger guard_game_settings before update on public.profiles
  for each row execute function public.guard_game_settings();
