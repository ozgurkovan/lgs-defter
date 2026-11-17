-- Abonelik (velinin isteği, 2026-11-16: "abonelik kısmını ayarlayalım"). Abonelik aileye aittir ve bir veliye yazılır:
--   * abonenin veli bağıyla bağlı olduğu bütün öğrenciler,
--   * o öğrencilerden birine veli bağıyla bağlı öteki veli (eş)
-- aynı plandadır. Öğretmen bağı plan taşımaz. Aboneliği olmayan herkes 'free' plandadır.
-- Satırları yalnızca gizli anahtar (saatlik görev, ödeme bildirimi, elle hediye) yazar; uygulama yalnızca okur.
--   source: 'gift' elle verilen (aile, yakınlar), 'web' / 'play' / 'appstore' ödeme kanalı (ileride)
--   ends_at null: süresiz
-- Bu dosya yalnızca planı tanımlar; bedava planın kısıtları (günlük soru, fotoğraf, oyun) ayrı işlerde bağlanır.
-- Çalıştır: node tools/sb.mjs sql supabase/subscriptions.sql

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.profiles(id) on delete cascade,
  plan text not null default 'family' check (plan in ('family')),
  source text not null default 'gift' check (source in ('gift', 'web', 'play', 'appstore')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists subscriptions_parent_idx on public.subscriptions(parent_id);

alter table public.subscriptions enable row level security;
drop policy if exists own_rows on public.subscriptions;
create policy own_rows on public.subscriptions for select to authenticated using (parent_id = auth.uid());
revoke all on public.subscriptions from anon, authenticated;
grant select on public.subscriptions to authenticated;
grant all on public.subscriptions to service_role;

-- Bir kullanıcının planı: 'family' ya da 'free'.
create or replace function public.plan_of(uid uuid) returns text
language sql stable security definer set search_path to 'public' as $$
  select case when uid is not null and exists (
    select 1 from subscriptions s
    where s.starts_at <= now() and (s.ends_at is null or s.ends_at > now())
      and (s.parent_id = uid
        or exists (select 1 from family_links f
                   where f.parent_id = s.parent_id and f.student_id = uid and f.relation = 'parent')
        or exists (select 1 from family_links a
                   join family_links b on b.student_id = a.student_id
                   where a.parent_id = s.parent_id and a.relation = 'parent'
                     and b.parent_id = uid and b.relation = 'parent'))
  ) then 'family' else 'free' end;
$$;
revoke all on function public.plan_of(uuid) from public, anon, authenticated;
grant execute on function public.plan_of(uuid) to service_role;

-- Uygulamanın sorduğu: giriş yapanın planı.
create or replace function public.my_plan() returns text
language sql stable security definer set search_path to 'public' as $$
  select public.plan_of(auth.uid());
$$;
revoke all on function public.my_plan() from public, anon;
grant execute on function public.my_plan() to authenticated;
