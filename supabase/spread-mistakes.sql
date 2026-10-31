-- Toplu gelen hatalar ilk tekrar günlerine yayılır (velinin isteği, 2026-10-31). Birkaç deneme birlikte yüklenince,
-- uygulamada tam bir LGS çözülünce ya da on soru birden gönderilince hepsi aynı gün gelmesin: bir derse bir günde, o
-- dersin günlük soru sayısından (profiles.daily_by_subject; yoksa 10) fazla hata tekrarı düşmesin. Yeni hata maddesi,
-- dersinde o gün sırası gelen hata maddeleri sınırın altında kalan ilk güne yazılır (en çok 14 gün ileri). İlk gün
-- için daha önceden kalmış (ertelenmiş) maddeler de sayılır. Uygulamanın ve saatlik görevin eklediği bütün hata
-- maddeleri bu tetikten geçer; bekletilen (paused) madde ve konu tekrarı değişmez.
create or replace function public.spread_new_mistake() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  subj text;
  lim int;
  d date;
  n int;
  tries int := 0;
begin
  if new.track <> 'mistake' or new.state <> 'active' or new.due_date is null then return new; end if;
  select subject into subj from topics where id = new.topic_id;
  if subj is null then return new; end if;
  select coalesce((daily_by_subject ->> subj)::int, 10) into lim from profiles where id = new.student_id;
  if coalesce(lim, 0) <= 0 then return new; end if;
  d := new.due_date;
  loop
    select count(*) into n from items i join topics t on t.id = i.topic_id
     where i.student_id = new.student_id and i.track = 'mistake' and i.state = 'active' and t.subject = subj
       and (i.due_date = d or (tries = 0 and i.due_date < d));
    exit when n < lim or tries >= 14;
    d := d + 1;
    tries := tries + 1;
  end loop;
  new.due_date := d;
  new.interval_days := greatest(coalesce(new.interval_days, 1), d - (now() at time zone 'Europe/Istanbul')::date);
  return new;
end $$;

drop trigger if exists spread_new_mistake on public.items;
create trigger spread_new_mistake before insert on public.items
  for each row execute function public.spread_new_mistake();
