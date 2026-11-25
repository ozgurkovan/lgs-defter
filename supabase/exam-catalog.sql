-- Deneme kataloğu ve bekletme (velinin isteği, 2026-11-25: "çocuk denemeyi yüklediğinde yeni bir deneme ise bunu
-- belirtmemiz lazım, bu soruları bir süre beklemeye alacağız… Iğdır'da denemeyi alan çocuk da Denizli'de alan çocuk da
-- denemeyi çözmüş olsun"; "denemeyi başka çocuk indirdiyse yalnızca cevap/yanlışlarını not etmekten başka bir şey
-- yapmamıza gerek kalmaz"; "denemeler yeni ise ve soru tipleri güncel ise benzer üretebiliriz").
--   exam_catalog           : bir kez görülen her kâğıt deneme (yayın, ad, kitapçık); ilk yükleme "yeni deneme"dir.
--   exam_catalog_questions : o denemenin anahtarı ve bizim notlarımız (konu, kazanım notu, çözüm). Kaynağın metni YOK.
--   exams.catalog_id       : çocuğun denemesi katalogdaki hangi deneme.
--   questions.catalog_id   : bu soru hangi denemenin notundan yazıldı; questions.hold_until: o güne kadar bekler.
-- Bekletme: katalogdaki denemeden yazılan soru (ya da o denemenin bir sorusunun hata tekrarı sorusu) hold_until gününe
-- kadar yalnızca o denemeyi yüklemiş çocukların ailelerine görünür (private_students); gün gelince ortak havuza açılır
-- (release_held_questions, saatlik görev her çalışmada çağırır). Aynı denemeyi sonradan yükleyen çocuk, bekleyen
-- soruları görenlere eklenir (trigger). Tablolar yalnızca saatlik göreve (gizli anahtar) açıktır.
-- Çalıştır: node tools/sb.mjs sql supabase/exam-catalog.sql

create table if not exists public.exam_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null,                       -- 'Muba 1' gibi, bizim yazdığımız düzgün ad
  publisher text,                           -- yayın / kurum
  grade int,
  curriculum text not null default 'tr',
  season text,                              -- '2026-27'
  booklet text,                             -- 'A' | 'B' | null
  part text check (part is null or part in ('sozel', 'sayisal', 'tam', 'brans', 'okul')),
  fingerprint jsonb,                        -- eşleştirme için: bölüm bölüm soru sayısı ve ilk soruların konusu (kendi sözümüzle)
  is_current boolean,                       -- soru tipleri güncel mi (görevin değerlendirmesi); null = değerlendirilmedi
  style_note text,                          -- güncel olan ne: soru tipleri, uzunluk, bağlam (kendi sözümüzle)
  first_submission_id uuid references public.submissions(id) on delete set null,
  first_seen date not null default current_date,
  hold_until date not null default (current_date + 30),
  uploads int not null default 1,
  created_at timestamptz not null default now()
);
create index if not exists exam_catalog_grade_idx on public.exam_catalog(curriculum, grade, first_seen desc);

create table if not exists public.exam_catalog_questions (
  catalog_id uuid not null references public.exam_catalog(id) on delete cascade,
  subject text not null,
  q_no int not null,
  correct_answer text,
  topic_id text references public.topics(id),
  styles text[] not null default '{}',
  brief text,                               -- konu, kazanım, beceri, soru türü, zorluk: kaynaktan cümle, sayı, isim yok
  hint text,
  solution text,
  wrong_notes jsonb,                        -- {"A": "şu yanılgı", …}: şıkkın arkasındaki yanılgı, kendi sözümüzle
  primary key (catalog_id, subject, q_no)
);

alter table public.exam_catalog enable row level security;
alter table public.exam_catalog_questions enable row level security;
revoke all on public.exam_catalog, public.exam_catalog_questions from anon, authenticated;
grant all on public.exam_catalog, public.exam_catalog_questions to service_role;

alter table public.exams add column if not exists catalog_id uuid references public.exam_catalog(id) on delete set null;
create index if not exists exams_catalog_idx on public.exams(catalog_id) where catalog_id is not null;
alter table public.questions add column if not exists catalog_id uuid references public.exam_catalog(id) on delete set null;
alter table public.questions add column if not exists hold_until date;
create index if not exists questions_hold_idx on public.questions(hold_until) where hold_until is not null;
create index if not exists questions_catalog_idx on public.questions(catalog_id) where catalog_id is not null;

-- Bir denemeyi yüklemiş çocukların aileleri (bekleyen soruları görenler).
create or replace function public.catalog_students(cat uuid) returns uuid[]
language sql stable security definer set search_path to 'public' as $$
  select coalesce(array_agg(distinct x), '{}') from (
    select unnest(public.family_students(e.student_id)) as x from exams e where e.catalog_id = cat and e.student_id is not null
  ) t;
$$;
revoke all on function public.catalog_students(uuid) from public, anon, authenticated;
grant execute on function public.catalog_students(uuid) to service_role;

-- Yeni soru: katalogdaki bir denemeden geliyorsa (catalog_id verilmiş ya da o denemenin bir sorusunun hata tekrarı
-- sorusu) ve bekleme günü geçmediyse beklemeye alınır. Görev unutsa da ortak havuza erken karışmaz.
create or replace function public.questions_hold_default() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare until_day date;
begin
  if new.catalog_id is null and new.variant_of_exam is not null then
    select e.catalog_id into new.catalog_id from exam_questions x join exams e on e.id = x.exam_id where x.id = new.variant_of_exam;
  end if;
  if new.catalog_id is null or new.private_students is not null then return new; end if;
  select c.hold_until into until_day from exam_catalog c where c.id = new.catalog_id;
  if until_day is not null and until_day > current_date then
    new.hold_until := until_day;
    new.private_students := public.catalog_students(new.catalog_id);
  end if;
  return new;
end $$;
drop trigger if exists questions_hold_default on public.questions;
create trigger questions_hold_default before insert on public.questions
  for each row execute function public.questions_hold_default();

-- Aynı denemeyi sonradan yükleyen çocuk: bekleyen soruları görenlere ailesi eklenir.
create or replace function public.exams_catalog_join() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if new.catalog_id is not null and new.student_id is not null
     and (tg_op = 'INSERT' or new.catalog_id is distinct from old.catalog_id) then
    update questions q set private_students = (
        select array_agg(distinct x) from unnest(q.private_students || public.family_students(new.student_id)) x)
      where q.catalog_id = new.catalog_id and q.hold_until is not null and q.private_students is not null;
    update exam_catalog c set uploads = (select count(*) from exams e where e.catalog_id = c.id) where c.id = new.catalog_id;
  end if;
  return new;
end $$;
drop trigger if exists exams_catalog_join on public.exams;
create trigger exams_catalog_join after insert or update of catalog_id on public.exams
  for each row execute function public.exams_catalog_join();

-- Bekleme günü gelen soruları ortak havuza açar; kaç soru açıldığını döndürür. Saatlik görev her çalışmada çağırır.
create or replace function public.release_held_questions() returns int
language plpgsql security definer set search_path to 'public' as $$
declare n int;
begin
  update questions set private_students = null, hold_until = null
    where hold_until is not null and hold_until <= current_date;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.release_held_questions() from public, anon, authenticated;
grant execute on function public.release_held_questions() to service_role;

-- Yükleme sayfasındaki öneri listesi: çocuğun sınıfındaki bilinen denemelerin adları (yalnızca ad ve yayın).
create or replace function public.exam_catalog_names(student uuid) returns jsonb
language sql stable security definer set search_path to 'public' as $$
  select case when not public.can_see_student(student) then '[]'::jsonb else coalesce((
    select jsonb_agg(distinct c.name) from exam_catalog c join profiles p on p.id = student
    where c.grade = p.grade and c.curriculum = coalesce(p.curriculum, 'tr')), '[]'::jsonb) end;
$$;
revoke all on function public.exam_catalog_names(uuid) from public, anon;
grant execute on function public.exam_catalog_names(uuid) to authenticated;

-- Aynı denemenin aynı sorusu (velinin isteği, 2026-11-25: "ben bir soruyu yanlış yaparsam benzer 2 soru gelecek ama 100
-- kişi aldıktan sonra pek yeni soruya gerek kalmayacak"). Her çocuğun deneme sorusu ayrı kayıttır; katalogdaki aynı soruyu
-- (aynı deneme, ders ve soru numarası) yanlış yapan çocukların kayıtları "akraba"dır ve birinin hatası için yazılan tekrar
-- soruları hepsine sayılır. Katalogda olmayan denemede soru yalnızca kendisidir.
create or replace function public.exam_question_kin(eq uuid) returns uuid[]
language sql stable security definer set search_path to 'public' as $$
  select coalesce((
    select array_agg(x.id) from exam_questions me
    join exams mine on mine.id = me.exam_id
    join exams e on e.catalog_id = mine.catalog_id
    join exam_questions x on x.exam_id = e.id and x.subject = me.subject and x.q_no = me.q_no
    where me.id = eq and mine.catalog_id is not null), array[eq]);
$$;
revoke all on function public.exam_question_kin(uuid) from public, anon, authenticated;
grant execute on function public.exam_question_kin(uuid) to service_role;

-- Uygulama için: öğrencinin açık hata maddelerindeki deneme sorularının akrabaları ({ soru: [akraba, …] }; yalnızca kimlik).
create or replace function public.exam_kin(student uuid) returns jsonb
language sql stable security definer set search_path to 'public' as $$
  select case when not public.can_see_student(student) then '{}'::jsonb else coalesce((
    select jsonb_object_agg(i.exam_question_id, to_jsonb(public.exam_question_kin(i.exam_question_id)))
    from (select distinct exam_question_id from items
          where student_id = student and track = 'mistake' and state = 'active' and exam_question_id is not null) i
    where array_length(public.exam_question_kin(i.exam_question_id), 1) > 1), '{}'::jsonb) end;
$$;
revoke all on function public.exam_kin(uuid) from public, anon;
grant execute on function public.exam_kin(uuid) to authenticated;

-- Tekrar sorusu ihtiyacı: deneme sorusunda akrabalar için yazılmış sorular da sayılır; öğrencinin göremediği (başka
-- ailenin bekleyen ya da özel) sorular sayılmaz. Sütunlar eskisiyle aynı.
create or replace view public.mistake_variant_needs as
with m as (
  select i.id as item_id, i.student_id, i.topic_id, i.due_date, i.question_id, i.exam_question_id,
         case when i.question_id is not null then 'soru' else 'deneme' end as source_kind,
         case when i.exam_question_id is not null then public.exam_question_kin(i.exam_question_id) end as kin
  from items i
  where i.track = 'mistake' and i.state = 'active'
    and (i.question_id is not null or i.exam_question_id is not null)
), c as (
  select m.*, (select count(*) from questions q
     where q.active
       and ((m.question_id is not null and q.variant_of = m.question_id)
         or (m.exam_question_id is not null and q.variant_of_exam = any (m.kin)))
       and (q.private_students is null or m.student_id = any (q.private_students))
       and not exists (select 1 from reviews r where r.student_id = m.student_id and r.question_id = q.id)) as unseen_variants
  from m
)
select c.item_id, c.student_id, c.topic_id, t.grade, t.subject, t.name as topic_name, c.due_date, c.source_kind,
       c.question_id, c.exam_question_id,
       coalesce((select r.answer from reviews r where r.student_id = c.student_id and r.question_id = c.question_id
                  order by r.answered_at desc limit 1),
                (select e.student_answer from exam_questions e where e.id = c.exam_question_id)) as student_answer,
       c.unseen_variants,
       greatest(0::bigint, 3 - c.unseen_variants)::integer as need
from c
join topics t on t.id = c.topic_id
where c.unseen_variants < 2
order by c.due_date, t.subject;
