-- Plan sınırları (velinin isteği, 2026-11-22: "20 soru sınırını yapalım, kullanıcılar unlock yapabilsinler… deneme, kitap
-- yüklemesi yapabilecekler ama onun da bir limiti olsun, mesela ayda 6 deneme, paralıda bile").
--   bedava plan : günde 20 soru, uygulamada haftada bir deneme; haftada 10 soru fotoğrafı ve ayda 1 kâğıt deneme
--                 (velinin isteği, 2026-11-25: "bedavalar haftada en fazla 10 soru yükleyebilsin, fazlasında premium
--                 istesin; deneme yüklemesi ayda 1 tane, sonrasında premium istesin"), kitap yükleme kapalı; soru fotoğrafları sıraya girer, saatlik görev bedavadan günde en çok
--                 process_day fotoğraf işler (velinin isteği, 2026-11-25: "işleyeceğimiz soru sayısı belli olsun; onlar
--                 yükleme yapabilir ama biz işlemeyiz, onlarınki sıraya girer"); 0 yapılırsa bedava işleme durur;
--                 yabancı dil (kelime kartları), klavye dersleri ve oyunu, asker / balerin kahraman kapalı (velinin
--                 isteği, 2026-11-22: "yabancı dil ve klavye, klavye oyununu da paralıya bağlayalım, savaşçı askeri de")
--   aile planı  : soru ve deneme sınırı yok; ayda 6 kâğıt deneme ve 2 yeni kitap yüklenir, soru fotoğrafı serbest;
--                 kelime kartları, klavye ve asker kahraman açık (velinin Günlük plan ayarına göre)
--   hediye      : (subscriptions.source = 'gift'; aile ve yakınlar) hiçbir sınır yok
-- Sayılar yalnızca burada durur (plan_caps); uygulama plan_limits() ile okur, yeni sürüm gerekmeden değişir.
-- Günlük soru ve haftalık deneme sınırını uygulama uygular (gün, çocuğun kendi saatine göre); yüklemeleri veritabanı da
-- denetler, çünkü her yükleme saatlik görevde yapay zekâ işi demektir.
-- Çalıştır: node tools/sb.mjs sql supabase/plan-limits.sql

-- Bir kullanıcının geçerli aboneliğinin kaynağı (hediye öne geçer); aboneliği yoksa null. Aile kuralı plan_of ile aynı.
create or replace function public.plan_source(uid uuid) returns text
language sql stable security definer set search_path to 'public' as $$
  select s.source from subscriptions s
  where uid is not null and s.starts_at <= now() and (s.ends_at is null or s.ends_at > now())
    and (s.parent_id = uid
      or exists (select 1 from family_links f
                 where f.parent_id = s.parent_id and f.student_id = uid and f.relation = 'parent')
      or exists (select 1 from family_links a
                 join family_links b on b.student_id = a.student_id
                 where a.parent_id = s.parent_id and a.relation = 'parent'
                   and b.parent_id = uid and b.relation = 'parent'))
  order by (s.source = 'gift') desc
  limit 1;
$$;
revoke all on function public.plan_source(uuid) from public, anon, authenticated;
grant execute on function public.plan_source(uuid) to service_role;

-- Planın sınırları. null = sınır yok.
create or replace function public.plan_caps(uid uuid) returns jsonb
language sql stable security definer set search_path to 'public' as $$
  select case
    when src is null then jsonb_build_object('plan', 'free', 'gift', false, 'daily_questions', 20, 'exams_week', 1,
      'uploads', false, 'question_week', 10, 'process_day', 200, 'paper_month', 1, 'books_month', 0, 'words', false, 'typing', false, 'army', false)
    when src = 'gift' then jsonb_build_object('plan', 'family', 'gift', true, 'daily_questions', null, 'exams_week', null,
      'uploads', true, 'question_week', null, 'process_day', null, 'paper_month', null, 'books_month', null, 'words', true, 'typing', true, 'army', true)
    else jsonb_build_object('plan', 'family', 'gift', false, 'daily_questions', null, 'exams_week', null,
      'uploads', true, 'question_week', null, 'process_day', null, 'paper_month', 6, 'books_month', 2, 'words', true, 'typing', true, 'army', true)
  end
  from (select public.plan_source(uid) as src) x;
$$;
revoke all on function public.plan_caps(uuid) from public, anon, authenticated;
grant execute on function public.plan_caps(uuid) to service_role;

-- "Kilidi aç" isteği: ödeme altyapısı bağlanana kadar veli isteğini bırakır, abonelik elle yazılır.
create table if not exists public.unlock_requests (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  note text check (note is null or char_length(note) <= 500),
  handled_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists unlock_requests_parent_idx on public.unlock_requests(parent_id, created_at desc);
alter table public.unlock_requests enable row level security;
drop policy if exists own_rows on public.unlock_requests;
create policy own_rows on public.unlock_requests for select to authenticated using (parent_id = auth.uid());
drop policy if exists own_insert on public.unlock_requests;
create policy own_insert on public.unlock_requests for insert to authenticated
  with check (parent_id = auth.uid() and public.is_parent());
revoke all on public.unlock_requests from anon, authenticated;
grant select, insert on public.unlock_requests to authenticated;
grant all on public.unlock_requests to service_role;

-- Bu hafta (pazartesiden beri) gönderilen soru fotoğrafı sayısı: her fotoğraf bir sorudur.
create or replace function public.plan_question_used(student uuid) returns int
language sql stable security definer set search_path to 'public' as $$
  select count(*)::int from submission_photos p join submissions s on s.id = p.submission_id
  where s.student_id = student and s.kind = 'soru' and p.created_at >= date_trunc('week', now());
$$;
revoke all on function public.plan_question_used(uuid) from public, anon, authenticated;
grant execute on function public.plan_question_used(uuid) to service_role;

-- Uygulamanın sorduğu: bir öğrencinin planı, sınırları ve bu ayki kullanımı. Öğrencinin kendisi, velisi ve öğretmeni
-- sorabilir; başkasına null döner. requested_at: soran velinin son "kilidi aç" isteği.
create or replace function public.plan_limits(student uuid) returns jsonb
language sql stable security definer set search_path to 'public' as $$
  select case when not public.can_see_student(student) then null else
    public.plan_caps(student) || jsonb_build_object(
      'paper_used', (select count(*) from submissions s where s.student_id = student and s.kind = 'deneme'
                       and s.status <> 'draft' and s.created_at >= date_trunc('month', now())),
      'question_used', public.plan_question_used(student),
      'books_used', (select count(*) from books b where b.student_id = student and b.created_at >= date_trunc('month', now())),
      'requested_at', (select max(u.created_at) from unlock_requests u where u.parent_id = auth.uid() and u.handled_at is null))
  end;
$$;
revoke all on function public.plan_limits(uuid) from public, anon;
grant execute on function public.plan_limits(uuid) to authenticated;

-- Yeni (katalogda olmayan) kâğıt denemeyi saatlik görev işlemez, güçlü modelle çalışan yazım görevine bırakır
-- (velinin kararı, 2026-11-25): submissions.route = 'yazim'. Böyle bir gönderim saatlik görevin sırasına bir daha girmez.
alter table public.submissions add column if not exists route text check (route is null or route in ('yazim'));

-- Yazım görevinin sıradaki denemesi: ücretli ve hediye planlar önce, sonra en eski. Yoksa null.
create or replace function public.writer_queue() returns uuid
language sql stable security definer set search_path to 'public' as $$
  select s.id from submissions s
  where s.status = 'submitted' and s.kind = 'deneme' and s.route = 'yazim'
  order by ((public.plan_caps(coalesce(s.student_id, s.uploaded_by))->>'process_day') is not null), s.submitted_at, s.id
  limit 1;
$$;
revoke all on function public.writer_queue() from public, anon, authenticated;
grant execute on function public.writer_queue() to service_role;

-- Saatlik görevin işleme sırası (velinin isteği, 2026-11-25: "işleyeceğimiz soru sayısı belli olsun… onlarınki sıraya
-- girer"). Ücretli ve hediye planların yüklemeleri her zaman ve önce işlenir. Bedava planın yüklemeleri (yalnızca soru
-- fotoğrafı olabilir) günde process_day fotoğrafa kadar, en eski önce; fazlası 'submitted' kalır, ertesi gün işlenir.
-- Gün İstanbul saatine göre. Bütçe kaldıysa bir gönderim bütün fotoğraflarıyla alınır (en çok birkaç fotoğraf taşar).
-- Plan işleme anında okunur: sıradaki aile abone olursa yüklemeleri hemen öne geçer.
-- ids: şimdi işlenecek gönderimler, sırasıyla. free_day: günlük sayı, free_done: bugün işlenen (ya da işlenmekte olan)
-- bedava fotoğraf, free_now: bu çalışmada işlenecek, free_waiting: sırada kalan.
create or replace function public.upload_queue() returns jsonb
language sql stable security definer set search_path to 'public' as $$
  with d as (select date_trunc('day', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul' as t0,
                    (public.plan_caps(null)->>'process_day')::int as cap),
  s as (
    select s.id, s.status, s.submitted_at, s.route,
      (public.plan_caps(coalesce(s.student_id, s.uploaded_by))->>'process_day') is not null as free,
      (select count(*) from submission_photos p where p.submission_id = s.id)::int as photos
    from submissions s, d
    where s.status in ('submitted', 'processing') or s.processed_at >= d.t0
  ),
  u as (select coalesce(sum(photos) filter (where free and status <> 'submitted'), 0)::int as used from s),
  w as (
    select s.id, s.free, s.submitted_at, s.photos,
      coalesce(sum(s.photos) filter (where s.free) over (order by s.free, s.submitted_at, s.id
        rows between unbounded preceding and 1 preceding), 0)::int as before
    from s where s.status = 'submitted' and s.route is null
  ),
  pick as (select w.*, (not w.free or d.cap is null or u.used + w.before < d.cap) as ok from w, d, u)
  select jsonb_build_object(
    'ids', coalesce((select jsonb_agg(id order by free, submitted_at, id) from pick where ok), '[]'::jsonb),
    'free_day', (select cap from d), 'free_done', (select used from u),
    'free_now', coalesce((select sum(photos) from pick where ok and free), 0),
    'free_waiting', coalesce((select sum(photos) from pick where not ok), 0));
$$;
revoke all on function public.upload_queue() from public, anon, authenticated;
grant execute on function public.upload_queue() to service_role;

-- Yüklemelerin denetimi. 'uploads' kitap içindir (kitap sayfası, okunan kitap); kâğıt deneme paper_month ile sınırlıdır
-- (0 = kapalı, boş = sınırsız); soru fotoğrafı (kind 'soru') her planda açıktır,
-- question_week varsa haftalık sayısı sınırlıdır (fotoğraf eklenirken denetlenir: guard_plan_photo). Yalnızca uygulamadan gelen (authenticated) yazmalar denetlenir; saatlik görev ve elle işlemler
-- (gizli anahtar) serbesttir. Ortak havuza giden kitap sayfasında (student_id boş) yükleyenin planına bakılır.
create or replace function public.guard_plan_submission() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare caps jsonb; lim int;
begin
  if current_setting('role', true) is distinct from 'authenticated' then return new; end if;
  caps := public.plan_caps(coalesce(new.student_id, auth.uid()));
  if new.kind = 'soru' then
    lim := (caps->>'question_week')::int;
    if lim is not null and public.plan_question_used(new.student_id) >= lim then
      raise exception 'plan_question_limit' using hint = 'Bu haftanın soru fotoğrafı hakkı doldu.';
    end if;
    return new;
  end if;
  if new.kind <> 'deneme' and not (caps->>'uploads')::boolean then
    raise exception 'plan_uploads_closed' using hint = 'Kitap yükleme bu planda kapalı.';
  end if;
  lim := (caps->>'paper_month')::int;
  if new.kind = 'deneme' and lim is not null and (select count(*) from submissions s where s.student_id = new.student_id
      and s.kind = 'deneme' and s.status <> 'draft' and s.created_at >= date_trunc('month', now())) >= lim then
    raise exception 'plan_paper_limit' using hint = 'Bu ayın kâğıt deneme hakkı doldu.';
  end if;
  return new;
end $$;
drop trigger if exists guard_plan_submission on public.submissions;
create trigger guard_plan_submission before insert on public.submissions
  for each row execute function public.guard_plan_submission();

-- Soru fotoğrafı: haftalık hak fotoğraf fotoğraf sayılır (bir gönderimde birden çok soru olabilir).
create or replace function public.guard_plan_photo() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare sub record; lim int;
begin
  if current_setting('role', true) is distinct from 'authenticated' then return new; end if;
  select s.kind, s.student_id into sub from submissions s where s.id = new.submission_id;
  if sub.kind is distinct from 'soru' then return new; end if;
  lim := (public.plan_caps(sub.student_id)->>'question_week')::int;
  if lim is not null and public.plan_question_used(sub.student_id) >= lim then
    raise exception 'plan_question_limit' using hint = 'Bu haftanın soru fotoğrafı hakkı doldu.';
  end if;
  return new;
end $$;
drop trigger if exists guard_plan_photo on public.submission_photos;
create trigger guard_plan_photo before insert on public.submission_photos
  for each row execute function public.guard_plan_photo();

create or replace function public.guard_plan_book() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare caps jsonb; lim int;
begin
  if current_setting('role', true) is distinct from 'authenticated' then return new; end if;
  caps := public.plan_caps(new.student_id);
  if not (caps->>'uploads')::boolean then
    raise exception 'plan_uploads_closed' using hint = 'Kitap yükleme bu planda kapalı.';
  end if;
  lim := (caps->>'books_month')::int;
  if lim is not null and (select count(*) from books b where b.student_id = new.student_id
      and b.created_at >= date_trunc('month', now())) >= lim then
    raise exception 'plan_book_limit' using hint = 'Bu ayın yeni kitap hakkı doldu.';
  end if;
  return new;
end $$;
drop trigger if exists guard_plan_book on public.books;
create trigger guard_plan_book before insert on public.books
  for each row execute function public.guard_plan_book();
