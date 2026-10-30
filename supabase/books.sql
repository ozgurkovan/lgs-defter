-- Okuduğu kitap (ilkokul): çocuk okuduğu kitabın sayfalarını fotoğraflar (Yükle → Okuduğum kitap). Saatlik görev
-- sayfaları okuyup kitaptan en az 100 anlama sorusu yazar (source='okuma', book_id). Sorular kitabın sınav tarihine
-- kadar her gün gelir; sınavdan sonra o kitaptan hiçbir soru, hata tekrarı da gelmez. Kitabın metni ve fotoğrafları
-- aile içinde kalır, hiçbir yerde yayımlanmaz.
create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  exam_date date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists books_student_idx on public.books(student_id, created_at desc);
alter table public.books enable row level security;

-- Okuyan: çocuk, velisi, Türkçe'si olan öğretmen. Ekleyen: çocuk ya da velisi. Sınav tarihini sonradan yalnızca veli
-- değiştirir (çocuk tarihi geri çekip soruları erken bitiremesin).
drop policy if exists books_read on public.books;
create policy books_read on public.books for select to authenticated
  using (public.can_see_subject(student_id, 'turkce'));
drop policy if exists books_insert on public.books;
create policy books_insert on public.books for insert to authenticated
  with check (public.can_edit_student(student_id));
drop policy if exists books_update on public.books;
create policy books_update on public.books for update to authenticated
  using (exists (select 1 from public.family_links l where l.parent_id = auth.uid() and l.student_id = books.student_id and l.relation = 'parent'))
  with check (exists (select 1 from public.family_links l where l.parent_id = auth.uid() and l.student_id = books.student_id and l.relation = 'parent'));
revoke all on public.books from anon;
revoke all on public.books from authenticated;
grant select, insert, update on public.books to authenticated;
grant all on public.books to service_role;

-- Yükleme: kind 'okuma', kitabı book_id; fotoğraflar photo_role 'okuma'.
alter table public.submissions add column if not exists book_id uuid references public.books(id) on delete set null;
alter table public.submissions drop constraint if exists submissions_kind_check;
alter table public.submissions add constraint submissions_kind_check check (kind in ('deneme', 'kitap', 'soru', 'okuma'));
alter table public.submissions drop constraint if exists submissions_student_kind;
alter table public.submissions add constraint submissions_student_kind
  check ((kind in ('deneme', 'soru', 'okuma') and student_id is not null) or kind = 'kitap');
alter table public.submission_photos drop constraint if exists submission_photos_photo_role_check;
alter table public.submission_photos add constraint submission_photos_photo_role_check
  check (photo_role in ('kitapcik', 'cevap_anahtari', 'optik', 'kitap_sayfa', 'yapamadim', 'begendim', 'okuma'));

-- Kitabın soruları: source 'okuma', book_id. Hata tekrarı için benzerleri de aynı book_id'yi taşır.
alter table public.questions add column if not exists book_id uuid references public.books(id) on delete set null;
create index if not exists questions_book_idx on public.questions(book_id) where book_id is not null;
alter table public.questions drop constraint if exists questions_source_check;
alter table public.questions add constraint questions_source_check
  check (source in ('meb', 'kitap', 'deneme', 'claude', 'ogrenci', 'okuma'));

-- Kitap sorularının konusu: her ilkokul sınıfı için "Kitap okuma" (Türkçe). Yıllık plana bağlı değildir (planned_start
-- boş: kendiliğinden açılmaz) ve Konular sayfasında görünmez; yalnızca kitap soruları ve onların hata tekrarı kullanır.
insert into public.topics (id, subject, unit, name, kazanim, planned_start, sort, grade) values
  ('g1.turkce.kitap-okuma', 'turkce', 'Kitap okuma', 'Okuduğu kitap', 'Okuduğu kitaptaki kişileri, olayları ve yerleri hatırlar; okuduğunu anlar.', null, 999, 1),
  ('g2.turkce.kitap-okuma', 'turkce', 'Kitap okuma', 'Okuduğu kitap', 'Okuduğu kitaptaki kişileri, olayları ve yerleri hatırlar; okuduğunu anlar.', null, 999, 2),
  ('g3.turkce.kitap-okuma', 'turkce', 'Kitap okuma', 'Okuduğu kitap', 'Okuduğu kitaptaki kişileri, olayları ve yerleri hatırlar; okuduğunu anlar.', null, 999, 3),
  ('g4.turkce.kitap-okuma', 'turkce', 'Kitap okuma', 'Okuduğu kitap', 'Okuduğu kitaptaki kişileri, olayları ve yerleri hatırlar; okuduğunu anlar.', null, 999, 4)
on conflict (id) do nothing;
