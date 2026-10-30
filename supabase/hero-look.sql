-- Kelime kahramanının görünüşü (velinin isteği): veli Aile bölümünden ten, saç, göz, gözlük, çil seçer (hero_look) ya da
-- vesikalık fotoğraf yükler (hero_photo_at); saatlik iş fotoğrafa bakıp görünüşü yazar (hero_look_at). Kahraman yine
-- çizgi karakter kalır. Fotoğraf ayrı, gizli "kahraman" kovasında <çocuk>/foto.jpg olarak durur: yalnızca çocuğun
-- velileri yükler, görür, siler; çocuk, kardeş ve öğretmen göremez. Yolculuk araçları (araba, denizaltı, hovercraft,
-- uçak, roket) purchases tablosunda; onlar için değişiklik yok.
alter table public.profiles add column if not exists hero_look jsonb;
alter table public.profiles add column if not exists hero_photo_at timestamptz;
alter table public.profiles add column if not exists hero_look_at timestamptz;
alter table public.profiles drop constraint if exists profiles_hero_look_check;
alter table public.profiles add constraint profiles_hero_look_check
  check (hero_look is null or (jsonb_typeof(hero_look) = 'object' and octet_length(hero_look::text) < 1000));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kahraman', 'kahraman', false, 2097152, array['image/jpeg', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists kahraman_photo on storage.objects;
create policy kahraman_photo on storage.objects for all to authenticated
  using (bucket_id = 'kahraman' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
         and public.is_parent_of(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'kahraman' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
              and public.is_parent_of(((storage.foldername(name))[1])::uuid));

-- Profil koruması: kahramanın görünüşü ve fotoğraf tarihleri de veli ayarıdır.
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
          or new.rare_factor is distinct from old.rare_factor
          or new.daily_words is distinct from old.daily_words
          or new.avatar is distinct from old.avatar
          or new.hero_look is distinct from old.hero_look
          or new.hero_photo_at is distinct from old.hero_photo_at
          or new.hero_look_at is distinct from old.hero_look_at) then
    raise exception 'Bu ayarı veli değiştirir' using errcode = '42501';
  end if;
  return new;
end $$;
