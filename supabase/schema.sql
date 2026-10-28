-- LGS Defter veritabanı yapısı
-- Aile uygulaması: sadece profiles tablosunda kaydı olan kullanıcılar (öğrenci ve veli) veriye erişir.
-- Yeni kayıt (sign-up) kapalıdır; kullanıcılar Supabase panelinden eklenir.

create extension if not exists pgcrypto;

-- Kullanıcılar ve ayarlar --------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('student', 'parent')),
  display_name text not null default '',
  mistake_minutes int not null default 30,   -- hata tekrarı günlük süre
  topic_minutes int not null default 60,     -- konu tekrarı günlük üst sınır
  lgs_date date not null default '2027-06-13',
  created_at timestamptz not null default now()
);

create or replace function public.is_family()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid());
$$;

create or replace function public.student_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.profiles where role = 'student' order by created_at limit 1;
$$;

-- Konular (saatlik görev denemelerden çıkardıkça ekler) ------------------------

create table if not exists public.topics (
  id text primary key,                 -- örn. 'fen.dna-ve-genetik-kod.dna-yapisi'
  subject text not null check (subject in ('turkce','matematik','fen','inkilap','din','ingilizce')),
  unit text not null default '',
  name text not null,
  kazanim text not null default '',    -- MEB kazanım kodu ve metni
  created_at timestamptz not null default now()
);

create table if not exists public.topic_status (
  topic_id text primary key references public.topics(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'maybe_not_taught', 'not_taught', 'gap')),
  first_seen date not null default current_date,
  gap_since date,
  lesson text,              -- konu eksiği için kısa anlatım
  tutor_note text,          -- özel ders öğretmeni için not
  youtube_query text,       -- YouTube arama ifadesi
  updated_at timestamptz not null default now()
);

-- Denemeler ve yüklemeler ---------------------------------------------------

create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  name text not null,                  -- örn. 'Hız Yayınları 3. Deneme'
  kind text not null default 'tam' check (kind in ('tam', 'brans', 'okul')),
  exam_date date not null default current_date,
  time_note text,                      -- "süre yetti mi" notu
  created_at timestamptz not null default now()
);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('deneme', 'kitap')),
  exam_id uuid references public.exams(id) on delete cascade,
  uploaded_by uuid references public.profiles(id),
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'processing', 'done', 'error')),
  note text,
  submitted_at timestamptz,
  processed_at timestamptz,
  result_note text,                    -- görevin kısa özeti veya hata mesajı
  created_at timestamptz not null default now()
);

create table if not exists public.submission_photos (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  storage_path text not null,
  photo_role text not null default 'kitapcik'
    check (photo_role in ('kitapcik', 'cevap_anahtari', 'optik', 'kitap_sayfa')),
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.exam_results (
  exam_id uuid not null references public.exams(id) on delete cascade,
  subject text not null,
  correct int not null default 0,
  wrong int not null default 0,
  blank int not null default 0,
  primary key (exam_id, subject)
);

-- Denemedeki her soru (görev doldurur) ---------------------------------------

create table if not exists public.exam_questions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  subject text not null,
  q_no int not null,
  topic_id text references public.topics(id),
  styles text[] not null default '{}',     -- grafik, oncullu, degildir, paragraf, islem, deney, tablo
  student_answer text,                     -- A/B/C/D, boşsa null
  correct_answer text,
  outcome text not null check (outcome in ('dogru', 'yanlis', 'bos')),
  marked_guess boolean not null default false,
  marked_skipped boolean not null default false,
  coding_error boolean not null default false,  -- kitapçıkta doğru, optikte yanlış
  image_path text,                         -- kırpılmış soru görseli
  -- Claude'un teşhisi: öğrenci nedenini seçene kadar uygulamada gizli
  diagnosis_cause text check (diagnosis_cause in ('konu', 'dikkat', 'islem', 'okuma', 'sure', 'tahmin', 'kodlama')),
  diagnosis_text text,
  misconception text,
  scratch_note text,                       -- karalamadan okunan
  hint text,
  solution text,
  -- Öğrencinin kendi cevabı
  student_reason text check (student_reason in ('bilmiyordum', 'yanlis_okudum', 'islem_hatasi', 'iki_sik', 'sure_yetmedi', 'tahmin', 'hic_bakmadim')),
  student_confident boolean,
  reason_at timestamptz,
  created_at timestamptz not null default now(),
  unique (exam_id, subject, q_no)
);

-- Soru havuzu ----------------------------------------------------------------

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('meb', 'kitap', 'deneme', 'claude')),
  source_note text,
  subject text not null,
  topic_id text not null references public.topics(id),
  styles text[] not null default '{}',
  stem text not null,                      -- soru metni (düz metin)
  image_path text,                         -- varsa şekil / soru görseli
  choices jsonb not null,                  -- {"A": "...", "B": "...", "C": "...", "D": "..."}
  answer text not null check (answer in ('A', 'B', 'C', 'D')),
  hint text,
  solution text,
  target_seconds int not null default 90,
  verified boolean not null default false, -- Claude iki yoldan doğruladı
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists questions_topic_idx on public.questions(topic_id) where active;

-- Tekrar takvimi -------------------------------------------------------------

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  track text not null check (track in ('mistake', 'topic')),
  topic_id text not null references public.topics(id),
  exam_question_id uuid references public.exam_questions(id) on delete cascade,
  step int not null default 0,
  interval_days int not null default 1,
  ease real not null default 1.0,
  due_date date not null default (current_date + 1),
  consecutive_wrong int not null default 0,
  state text not null default 'active' check (state in ('active', 'done', 'paused')),
  last_reviewed_at timestamptz,
  note text,                               -- takvim neden değişti
  created_at timestamptz not null default now()
);
create index if not exists items_due_idx on public.items(due_date) where state = 'active';
create unique index if not exists items_topic_track_uq on public.items(topic_id) where track = 'topic';

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references public.items(id) on delete set null,
  question_id uuid not null references public.questions(id),
  track text not null,
  answer text,
  correct boolean not null,
  duration_sec int not null,
  confident boolean,
  hint_used boolean not null default false,
  answered_at timestamptz not null default now()
);
create index if not exists reviews_question_idx on public.reviews(question_id);

-- Görevin çalışma kaydı ------------------------------------------------------

create table if not exists public.job_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  summary text
);

-- Erişim kuralları: aile üyeleri her şeyi okur ve yazar -----------------------

do $$
declare t text;
begin
  foreach t in array array['profiles','topics','topic_status','exams','submissions','submission_photos',
                           'exam_results','exam_questions','questions','items','reviews','job_runs']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists family_all on public.%I', t);
    execute format('create policy family_all on public.%I for all to authenticated using (public.is_family()) with check (public.is_family())', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

grant execute on function public.is_family() to authenticated;
grant execute on function public.student_id() to authenticated;

-- Fotoğraf depoları (gizli) ----------------------------------------------------

insert into storage.buckets (id, name, public)
values ('photos', 'photos', false), ('questions', 'questions', false)
on conflict (id) do nothing;

drop policy if exists family_photos on storage.objects;
create policy family_photos on storage.objects for all to authenticated
  using (bucket_id in ('photos', 'questions') and public.is_family())
  with check (bucket_id in ('photos', 'questions') and public.is_family());
