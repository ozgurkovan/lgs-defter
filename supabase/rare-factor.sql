-- LGS'de seyrek çıkan konular (topics.lgs_avg < 0,5) yine tekrar edilir; sadece tekrar aralığı rare_factor ile
-- çarpılır (veli ayarı: 1 normal, 1,5, 2 (varsayılan), 3; 0 = bu konuları hiç tekrar etme).
alter table public.profiles add column if not exists rare_factor numeric not null default 2;
alter table public.profiles drop constraint if exists profiles_rare_factor_check;
alter table public.profiles add constraint profiles_rare_factor_check check (rare_factor = 0 or rare_factor between 1 and 4);

-- Öğrenci bu ayarı da kendisi değiştiremez.
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
          or new.rare_factor is distinct from old.rare_factor) then
    raise exception 'Bu ayarı veli değiştirir' using errcode = '42501';
  end if;
  return new;
end $$;

-- Yıllık plana göre açılan konu: seyrekse ve öğrencinin ayarı "tekrar etme" (0) ise kapalı başlar, yoksa açık.
create or replace function public.activate_planned_topics() returns integer
language plpgsql security definer set search_path to 'public' as $function$
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
    join topics t on t.grade = s.grade
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
end $function$;

-- Seyrek oldukları için kapatılan konu tekrarları yeniden açılır (aralıkları uygulamada genişler).
update public.items set state = 'active', note = 'LGS''de nadir çıkıyor; tekrar aralığı geniş.'
where track = 'topic' and state = 'paused' and note like 'LGS''de nadir çıkıyor; konu tekrarı kapalı%';
