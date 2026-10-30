-- "Soru ekle": öğrenci testte yapamadığı ya da beğendiği bir sorunun fotoğrafını gönderir (submissions.kind = 'soru',
-- fotoğraf rolü yapamadim | begendim). Saatlik görev soruyu havuza ekler (source = 'ogrenci', submission_id ile),
-- çözümünü yazar; yapamadığı soru hata tekrarına girer, beğendiğinin benzerleri yazılır. Uygulama gönderilen
-- soruların çözümünü Yükle sekmesinde gösterir. Yetkiler deneme yüklemesiyle aynı (öğrenci ve velisi yazar).
alter table public.submissions drop constraint if exists submissions_kind_check;
alter table public.submissions add constraint submissions_kind_check check (kind in ('deneme', 'kitap', 'soru'));
alter table public.submissions drop constraint if exists submissions_student_kind;
alter table public.submissions add constraint submissions_student_kind
  check ((kind in ('deneme', 'soru') and student_id is not null) or kind = 'kitap');

alter table public.submission_photos drop constraint if exists submission_photos_photo_role_check;
alter table public.submission_photos add constraint submission_photos_photo_role_check
  check (photo_role in ('kitapcik', 'cevap_anahtari', 'optik', 'kitap_sayfa', 'yapamadim', 'begendim'));

alter table public.questions drop constraint if exists questions_source_check;
alter table public.questions add constraint questions_source_check
  check (source in ('meb', 'kitap', 'deneme', 'claude', 'ogrenci'));
alter table public.questions add column if not exists submission_id uuid references public.submissions(id) on delete set null;
create index if not exists questions_submission_idx on public.questions(submission_id) where submission_id is not null;
