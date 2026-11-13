-- Asker kahraman (velinin isteği, 2026-11-13): kahramanın göğsünde bir forma numarası var, çalıştıkça artar; 100'e
-- ulaşınca çocuk asker olur, kendi ülkesinin kollarından birini kendisi seçer (Türkiye: Kara, Deniz, Hava; ABD: Army,
-- Navy, Air Force, Marines, Space Force), üniforması değişir ve numara arttıkça rütbe alır. Numara hiç azalmaz.
-- Numaranın hesabı (velinin seçimi): hata tekrarında her 10 doğru +1, öteki sorularda (konu tekrarı, ek çalışma, deneme,
-- kitap, konu çalışması, kâğıt deneme) her 20 doğru +1; ilk denemede doğru 8 kelime kartı ve yıldızlı her klavye dersi
-- birer "öteki doğru" sayılır. Sayım 2026-11-13'ten (yayın günü) başlar: kimse ilk gün yığınla başlamaz.
-- Veli çocuk başına açıp kapatır (profiles.hero_army; boşsa 7. sınıfa kadar açık). Kapatıp açmak numarayı silmez.
-- Kolu çocuk bir kez seçer (set_hero_corps, numara 100 olunca); veli sıfırlarsa yeniden seçer.
alter table public.profiles add column if not exists hero_army boolean;
alter table public.profiles add column if not exists hero_corps text;
alter table public.profiles add column if not exists hero_corps_at timestamptz;
alter table public.profiles drop constraint if exists profiles_hero_corps_check;
alter table public.profiles add constraint profiles_hero_corps_check
  check (hero_corps is null or hero_corps in ('kara', 'deniz', 'hava', 'army', 'navy', 'airforce', 'marines', 'spaceforce'));

-- Numara: since ile upto arasındaki çalışmadan. Yalnızca bu dosyadaki fonksiyonlar çağırır (dışarıya açık değil).
create or replace function public.hero_army_points(sid uuid, since timestamptz, upto timestamptz)
returns int language sql stable security definer set search_path = public as $$
  select (floor((2 * r.mistake + r.other + p.paper + floor(w.words / 8.0) + t.lessons) / 20.0))::int
  from (select count(*) filter (where track = 'mistake') as mistake, count(*) filter (where track <> 'mistake') as other
        from reviews where student_id = sid and correct and not voided and answered_at >= since and answered_at < upto) r,
       (select count(*) as paper from exam_questions eq join exams e on e.id = eq.exam_id
        where eq.student_id = sid and eq.outcome = 'dogru' and e.kind <> 'uygulama' and e.created_at >= since and e.created_at < upto) p,
       (select count(*) as words from word_answers
        where student_id = sid and correct and not again and answered_at >= since and answered_at < upto) w,
       (select count(*) as lessons from typing_results
        where student_id = sid and stars > 0 and lesson <> 'oyun' and created_at >= since and created_at < upto) t;
$$;
revoke all on function public.hero_army_points(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.hero_army_points(uuid, timestamptz, timestamptz) to service_role;

-- Çocuğun numarası: şimdiki ve bugünden önceki (bugün kaç arttığı için; gün Türkiye saatiyle), seçtiği kol. Yalnızca
-- çocuğun kendisi ve velisi çağırabilir; başkasına null.
create or replace function public.hero_army_state(sid uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.can_edit_student(sid) is not true then null else jsonb_build_object(
    'points', public.hero_army_points(sid, '2026-11-13T00:00:00+03:00', now() + interval '1 minute'),
    'before', public.hero_army_points(sid, '2026-11-13T00:00:00+03:00',
      ((now() at time zone 'Europe/Istanbul')::date)::timestamp at time zone 'Europe/Istanbul'),
    'corps', (select hero_corps from profiles where id = sid),
    'corps_at', (select hero_corps_at from profiles where id = sid)) end;
$$;
revoke all on function public.hero_army_state(uuid) from public, anon;
grant execute on function public.hero_army_state(uuid) to authenticated, service_role;

-- Kol seçimi: yalnızca öğrenci kendisi için, asker kahraman açıkken, numarası 100 olunca ve daha önce seçmediyse.
-- Kol ülkesine uygun olmalı (ABD müfredatı ABD kolları, öteki Türkiye kolları).
create or replace function public.set_hero_corps(corps text)
returns text language plpgsql security definer set search_path = public as $$
declare
  me profiles%rowtype;
begin
  select * into me from profiles where id = auth.uid();
  if me.id is null or me.role <> 'student' then raise exception 'Kolu öğrenci seçer' using errcode = '42501'; end if;
  if not coalesce(me.hero_army, coalesce(me.grade, 8) <= 7) then raise exception 'Asker kahraman kapalı' using errcode = '42501'; end if;
  if me.hero_corps is not null then raise exception 'Kol zaten seçildi' using errcode = '42501'; end if;
  if corps is null or not (corps = any (case when coalesce(me.curriculum, '') ~ '^us'
      then array['army', 'navy', 'airforce', 'marines', 'spaceforce'] else array['kara', 'deniz', 'hava'] end)) then
    raise exception 'Bu kol seçilemez' using errcode = '22023';
  end if;
  if public.hero_army_points(me.id, '2026-11-13T00:00:00+03:00', now() + interval '1 minute') < 100 then
    raise exception 'Numara henüz 100 değil' using errcode = '42501';
  end if;
  perform set_config('defter.hero_corps', 'secim', true);
  update profiles set hero_corps = corps, hero_corps_at = now() where id = me.id;
  perform set_config('defter.hero_corps', '', true);
  return corps;
end $$;
revoke all on function public.set_hero_corps(text) from public, anon;
grant execute on function public.set_hero_corps(text) to authenticated;

-- Koruma: asker kahramanı açıp kapatmak veli ayarı; kol yalnızca set_hero_corps ile seçilir, veli yalnızca sıfırlar
-- (boşaltır). Ayrı tetikleyici, böylece guard_profile_update'in sonraki tanımları bu korumayı silmez.
create or replace function public.guard_hero_army_setting() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.id = auth.uid() and old.role <> 'parent' and new.hero_army is distinct from old.hero_army then
    raise exception 'Bu ayarı veli değiştirir' using errcode = '42501';
  end if;
  if (new.hero_corps is distinct from old.hero_corps or new.hero_corps_at is distinct from old.hero_corps_at)
     and coalesce(current_setting('defter.hero_corps', true), '') <> 'secim'
     and not (new.hero_corps is null and new.id <> auth.uid() and public.can_edit_student(new.id)) then
    raise exception 'Kol böyle değiştirilemez' using errcode = '42501';
  end if;
  if new.hero_corps is null then new.hero_corps_at := null; end if;
  return new;
end $$;
drop trigger if exists guard_hero_army_setting on public.profiles;
create trigger guard_hero_army_setting before update on public.profiles
  for each row execute function public.guard_hero_army_setting();
