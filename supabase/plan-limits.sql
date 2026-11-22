-- Plan sınırları (velinin isteği, 2026-11-22: "20 soru sınırını yapalım, kullanıcılar unlock yapabilsinler… deneme, kitap
-- yüklemesi yapabilecekler ama onun da bir limiti olsun, mesela ayda 6 deneme, paralıda bile").
--   bedava plan : günde 20 soru, uygulamada haftada bir deneme, fotoğraf yükleme (kâğıt deneme, soru, kitap) kapalı;
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
      'uploads', false, 'paper_month', 0, 'books_month', 0, 'words', false, 'typing', false, 'army', false)
    when src = 'gift' then jsonb_build_object('plan', 'family', 'gift', true, 'daily_questions', null, 'exams_week', null,
      'uploads', true, 'paper_month', null, 'books_month', null, 'words', true, 'typing', true, 'army', true)
    else jsonb_build_object('plan', 'family', 'gift', false, 'daily_questions', null, 'exams_week', null,
      'uploads', true, 'paper_month', 6, 'books_month', 2, 'words', true, 'typing', true, 'army', true)
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

-- Uygulamanın sorduğu: bir öğrencinin planı, sınırları ve bu ayki kullanımı. Öğrencinin kendisi, velisi ve öğretmeni
-- sorabilir; başkasına null döner. requested_at: soran velinin son "kilidi aç" isteği.
create or replace function public.plan_limits(student uuid) returns jsonb
language sql stable security definer set search_path to 'public' as $$
  select case when not public.can_see_student(student) then null else
    public.plan_caps(student) || jsonb_build_object(
      'paper_used', (select count(*) from submissions s where s.student_id = student and s.kind = 'deneme'
                       and s.status <> 'draft' and s.created_at >= date_trunc('month', now())),
      'books_used', (select count(*) from books b where b.student_id = student and b.created_at >= date_trunc('month', now())),
      'requested_at', (select max(u.created_at) from unlock_requests u where u.parent_id = auth.uid() and u.handled_at is null))
  end;
$$;
revoke all on function public.plan_limits(uuid) from public, anon;
grant execute on function public.plan_limits(uuid) to authenticated;

-- Yüklemelerin denetimi. Yalnızca uygulamadan gelen (authenticated) yazmalar denetlenir; saatlik görev ve elle işlemler
-- (gizli anahtar) serbesttir. Ortak havuza giden kitap sayfasında (student_id boş) yükleyenin planına bakılır.
create or replace function public.guard_plan_submission() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare caps jsonb; lim int;
begin
  if current_setting('role', true) is distinct from 'authenticated' then return new; end if;
  caps := public.plan_caps(coalesce(new.student_id, auth.uid()));
  if not (caps->>'uploads')::boolean then
    raise exception 'plan_uploads_closed' using hint = 'Fotoğraf yükleme bu planda kapalı.';
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

create or replace function public.guard_plan_book() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare caps jsonb; lim int;
begin
  if current_setting('role', true) is distinct from 'authenticated' then return new; end if;
  caps := public.plan_caps(new.student_id);
  if not (caps->>'uploads')::boolean then
    raise exception 'plan_uploads_closed' using hint = 'Fotoğraf yükleme bu planda kapalı.';
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
