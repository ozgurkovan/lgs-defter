-- İlkokul sınıfları: Hayat Bilgisi ve Sosyal Bilgiler dersleri, bir üst sınıfın konularını da
-- işaretleyebilme (extra_grades; örneğin 3. sınıftaki çocuğa 4. sınıf konuları). Üst sınıf konuları
-- yıllık plana göre kendiliğinden açılmaz; veli ya da çocuk Konular sayfasında işaretler.
alter table public.topics drop constraint if exists topics_subject_check;
alter table public.topics add constraint topics_subject_check
  check (subject = any (array['turkce', 'matematik', 'fen', 'inkilap', 'din', 'ingilizce', 'hayat', 'sosyal']));

alter table public.profiles add column if not exists extra_grades int[] not null default '{}';

-- Profil korumasına extra_grades eklendi: öğrenci kendi sınıfını, planını ve ileri müfredatını değiştiremez.
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
          or new.extra_grades is distinct from old.extra_grades) then
    raise exception 'Bu ayarı veli değiştirir' using errcode = '42501';
  end if;
  return new;
end $$;
