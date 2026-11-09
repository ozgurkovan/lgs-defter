-- Kahramanı besleme (velinin isteği, 2026-11-09): çocuk çalışmazsa kahraman acıkır. Doğru cevaplar bronz kazandırır
-- (altından ayrı para), çocuk bronzla yemek alıp kahramana yedirir; kahraman tok kaldıkça kasları diri kalır. Seviye,
-- araçlar ve eşyalar hiç kaybolmaz; yalnızca tokluk düşer. Bronz cevaplardan hesaplanır (hero_feed_stats); burada yalnızca
-- yedirilenler tutulur (hero_meals). Veli çocuk başına açıp kapatır (profiles.hero_feed; boşsa 7. sınıfa kadar açık),
-- hastalıkta ve tatilde açlığı dondurur (profiles.hero_pauses: [[başlangıç, bitiş ya da null], ...]). hero_feed_at:
-- beslemenin o çocuk için başladığı an; bronz ve tokluk o andan sayılır.
alter table public.profiles add column if not exists hero_feed boolean;
alter table public.profiles add column if not exists hero_feed_at timestamptz;
alter table public.profiles add column if not exists hero_pauses jsonb;
alter table public.profiles drop constraint if exists profiles_hero_pauses_check;
alter table public.profiles add constraint profiles_hero_pauses_check
  check (hero_pauses is null or (jsonb_typeof(hero_pauses) = 'array' and octet_length(hero_pauses::text) < 2000));

-- Yedirilen yemekler. price: harcanan bronz; value: doyurduğu kadar; after: yedikten sonraki tokluk (0–100). Şimdiki
-- tokluk son yemeğin "after" değerinden, geçen süre kadar düşülerek bulunur.
create table if not exists public.hero_meals (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  food text not null check (food ~ '^[a-z0-9-]{1,40}$'),
  price int not null check (price between 0 and 100000),
  value int not null check (value between 0 and 100),
  after int not null check (after between 0 and 100),
  fed_at timestamptz not null default now()
);
create index if not exists hero_meals_student on public.hero_meals (student_id, fed_at);
alter table public.hero_meals enable row level security;
drop policy if exists hero_meals_read on public.hero_meals;
create policy hero_meals_read on public.hero_meals for select to authenticated using (public.can_edit_student(student_id));
drop policy if exists hero_meals_insert on public.hero_meals;
create policy hero_meals_insert on public.hero_meals for insert to authenticated
  with check (student_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'student'));
revoke all on public.hero_meals from anon;
revoke all on public.hero_meals from authenticated;
grant select, insert on public.hero_meals to authenticated;
grant all on public.hero_meals to service_role;

-- Besleme ayarları veli ayarıdır: çocuk kendi profilinde değiştiremez. Ayrı tetikleyici, böylece guard_profile_update'in
-- sonraki tanımları bu korumayı silmez.
create or replace function public.guard_hero_feed_setting() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and new.id = auth.uid() and old.role <> 'parent'
     and (new.hero_feed is distinct from old.hero_feed
          or new.hero_feed_at is distinct from old.hero_feed_at
          or new.hero_pauses is distinct from old.hero_pauses) then
    raise exception 'Bu ayarı veli değiştirir' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_hero_feed_setting on public.profiles;
create trigger guard_hero_feed_setting before update on public.profiles
  for each row execute function public.guard_hero_feed_setting();

-- Bronzun hesabı için gün gün sayılar (since'ten beri): plana sayılan cevap (kitap ve konu çalışması dışı), doğru cevap,
-- ilk denemede doğru kelime kartı, yıldızlı klavye dersi, oyunda yazılan harf; bir de harcanan bronz. Satırlar çok
-- olduğu için (günde yüz soru) sayım burada yapılır. Yalnızca çocuğun kendisi ve velisi çağırabilir; başkasına null.
-- Günler Türkiye saatiyle.
create or replace function public.hero_feed_stats(sid uuid, since timestamptz)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.can_edit_student(sid) is not true then null else jsonb_build_object(
    'spent', (select coalesce(sum(price), 0) from hero_meals where student_id = sid and fed_at >= since),
    'days', coalesce((
      select jsonb_agg(jsonb_build_object('day', d, 'answered', coalesce(r.answered, 0), 'correct', coalesce(r.correct, 0),
        'words', coalesce(w.words, 0), 'lessons', coalesce(t.lessons, 0), 'game_chars', coalesce(t.game_chars, 0)) order by d)
      from (select (answered_at at time zone 'Europe/Istanbul')::date as d,
              count(*) filter (where track not in ('book', 'practice')) as answered, count(*) filter (where correct) as correct
            from reviews where student_id = sid and not voided and answered_at >= since group by 1) r
      full join (select (answered_at at time zone 'Europe/Istanbul')::date as d, count(*) filter (where correct and not again) as words
            from word_answers where student_id = sid and answered_at >= since group by 1) w using (d)
      full join (select (created_at at time zone 'Europe/Istanbul')::date as d,
              count(*) filter (where stars > 0 and lesson <> 'oyun') as lessons,
              coalesce(sum(chars) filter (where lesson = 'oyun'), 0) as game_chars
            from typing_results where student_id = sid and created_at >= since group by 1) t using (d)), '[]'::jsonb)) end;
$$;
revoke all on function public.hero_feed_stats(uuid, timestamptz) from public, anon;
grant execute on function public.hero_feed_stats(uuid, timestamptz) to authenticated, service_role;
