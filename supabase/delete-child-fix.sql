-- Çocuk silinemiyordu ("Database error deleting user"): submissions.uploaded_by profile'a NO ACTION ile bağlıydı.
-- Profil silinirken bu kontrol, çocuğun kendi yüklemeleri (student_id ile CASCADE) silinmeden önce çalışıp işlemi
-- durduruyordu. Yükleyen silinirse alan boşalır; yükleme (ör. kitap sayfası) havuzda kalır.
alter table public.submissions alter column uploaded_by drop not null;
alter table public.submissions drop constraint if exists submissions_uploaded_by_fkey;
alter table public.submissions add constraint submissions_uploaded_by_fkey
  foreign key (uploaded_by) references public.profiles(id) on delete set null;
