-- Ülke ve müfredat ayrımı (velinin isteği, 2026-11-09): konular artık yalnızca sınıfa göre değil, müfredata göre de
-- seçilir. Uygulama başka ülkelerde de kullanılacak; örneğin Pennsylvania'nın 7. sınıf konuları eklenince sınıfı 7 olan
-- bir Türk öğrenciye gelmemeli. curriculum: ülke koduyla başlayan kısa bir kimlik: 'tr' (Türkiye, MEB), ileride 'us-pa'
-- (ABD, Pennsylvania) gibi. Bugünkü bütün konular ve öğrenciler 'tr'; görünen hiçbir şey değişmez.
alter table public.topics add column if not exists curriculum text not null default 'tr';
alter table public.profiles add column if not exists curriculum text not null default 'tr';
alter table public.topics drop constraint if exists topics_curriculum_check;
alter table public.topics add constraint topics_curriculum_check check (curriculum ~ '^[a-z]{2}(-[a-z0-9]{1,12}){0,2}$');
alter table public.profiles drop constraint if exists profiles_curriculum_check;
alter table public.profiles add constraint profiles_curriculum_check check (curriculum ~ '^[a-z]{2}(-[a-z0-9]{1,12}){0,2}$');
create index if not exists topics_curriculum_grade on public.topics (curriculum, grade);

-- Müfredat veli ayarıdır: çocuk kendi profilinde değiştiremez. Ayrı tetikleyici, böylece guard_profile_update'in sonraki
-- tanımları bu korumayı silmez.
create or replace function public.guard_curriculum_setting() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and new.id = auth.uid() and old.role <> 'parent'
     and new.curriculum is distinct from old.curriculum then
    raise exception 'Bu ayarı veli değiştirir' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_curriculum_setting on public.profiles;
create trigger guard_curriculum_setting before update on public.profiles
  for each row execute function public.guard_curriculum_setting();

-- Yıllık plana göre haftası gelen konuları açan iş: konu öğrencinin sınıfından ve müfredatından olmalı. (Öncekiyle aynı;
-- tek fark "t.curriculum = s.curriculum".)
create or replace function public.activate_planned_topics()
returns int language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Europe/Istanbul')::date;
  added int;
begin
  with due as (
    select s.id as student_id, t.id as topic_id,
           (t.lgs_avg is not null and t.lgs_avg < 0.5 and s.rare_factor = 0) as off,
           row_number() over (partition by s.id
                              order by case when t.subject in ('turkce','matematik','fen') then 0 else 1 end,
                                       t.planned_start, t.subject, t.sort) as n
    from profiles s
    join topics t on t.grade = s.grade and t.curriculum = s.curriculum
    where s.role = 'student' and t.planned_start <= today
      and not exists (select 1 from topic_status ts where ts.student_id = s.id and ts.topic_id = t.id)
  ), st as (
    insert into topic_status (student_id, topic_id, status, first_seen)
    select student_id, topic_id, 'active', today from due
    returning topic_id
  )
  insert into items (student_id, track, topic_id, step, interval_days, due_date, state, note)
  select d.student_id, 'topic', d.topic_id, 0, 1, today + 1 + ((d.n - 1) % 7)::int,
         case when d.off then 'paused' else 'active' end,
         case when d.off then 'LGS''de nadir çıkıyor; konu tekrarı kapalı (Konular''dan açılabilir).' end
  from due d
  where not exists (select 1 from items i where i.student_id = d.student_id and i.track = 'topic' and i.topic_id = d.topic_id);
  get diagnostics added = row_count;
  return added;
end $$;
revoke all on function public.activate_planned_topics() from public, anon, authenticated;
grant execute on function public.activate_planned_topics() to service_role;
