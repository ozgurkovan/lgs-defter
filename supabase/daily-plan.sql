-- Günlük plan: velinin belirlediği derse göre günlük soru sayıları ({"turkce": 9, "matematik": 10, ...}).
-- Boşsa uygulama daily_questions'ı LGS ağırlığıyla derslere böler.
alter table public.profiles add column if not exists daily_by_subject jsonb;
alter table public.profiles drop constraint if exists daily_by_subject_object;
alter table public.profiles add constraint daily_by_subject_object
  check (daily_by_subject is null or jsonb_typeof(daily_by_subject) = 'object');

-- Profil güncellemesinde korumalar. Kullanıcılar rolünü değiştiremez (öğrenci kendini veli yapamasın);
-- öğrenci ve öğretmen sınıfını ve günlük planı kendisi değiştiremez, bunları veli ayarlar.
-- Servis anahtarıyla gelen değişiklikler (aile fonksiyonu, saatlik görev) serbesttir: auth.uid() boştur.
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
          or new.daily_questions is distinct from old.daily_questions) then
    raise exception 'Bu ayarı veli değiştirir' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists guard_profile_update on public.profiles;
create trigger guard_profile_update before update on public.profiles
  for each row execute function public.guard_profile_update();
