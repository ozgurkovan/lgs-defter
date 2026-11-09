-- Konu durumunun geçmişi (velinin isteği, 2026-11-09): bir konunun durumu her değiştiğinde kimin değiştirdiği yazılır.
-- topic_status yalnızca son durumu tutar; kimin "işledik" ya da "henüz işlemedik" dediği kayboluyordu. Bu kayıt ileride
-- konuların okullarda gerçekte hangi hafta işlendiğini çıkarmak için birikir (varsayılan takvimi kullanıcıların
-- işaretleriyle düzeltmek). Uygulamada görünen hiçbir şey değişmez; kaydı şimdilik yalnızca servis anahtarı okur.
-- source: 'ogrenci' (çocuk kendi hesabıyla: "Bu konuyu okulda henüz işlemedik", ya da oturumdaki konu eksiği),
-- 'veli' (Konular sayfası), 'ogretmen', 'takvim' (girişsiz: yıllık plana göre açan saatlik iş ve servis anahtarı).
create table if not exists public.topic_status_log (
  id bigint generated always as identity primary key,
  student_id uuid not null references public.profiles(id) on delete cascade,
  topic_id text not null,
  status text not null,
  old_status text,
  source text not null check (source in ('ogrenci', 'veli', 'ogretmen', 'takvim')),
  changed_at timestamptz not null default now()
);
create index if not exists topic_status_log_topic on public.topic_status_log (topic_id, changed_at);
create index if not exists topic_status_log_student on public.topic_status_log (student_id, changed_at);
alter table public.topic_status_log enable row level security;
revoke all on public.topic_status_log from anon;
revoke all on public.topic_status_log from authenticated;
grant all on public.topic_status_log to service_role;

-- Durum değişince (yeni satır ya da başka bir duruma geçiş) kayda yazar. Kimin yaptığı girişten anlaşılır: giriş yoksa
-- takvim; kendi satırıysa öğrenci; değilse aile bağındaki ilişkisi (veli ya da öğretmen).
create or replace function public.log_topic_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  who uuid := auth.uid();
  src text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return new; end if;
  if who is null then src := 'takvim';
  elsif who = new.student_id then src := 'ogrenci';
  elsif exists (select 1 from family_links where parent_id = who and student_id = new.student_id and relation = 'teacher') then src := 'ogretmen';
  else src := 'veli';
  end if;
  insert into topic_status_log (student_id, topic_id, status, old_status, source)
  values (new.student_id, new.topic_id, new.status, case when tg_op = 'UPDATE' then old.status end, src);
  return new;
end $$;
drop trigger if exists log_topic_status on public.topic_status;
create trigger log_topic_status after insert or update on public.topic_status
  for each row execute function public.log_topic_status();
