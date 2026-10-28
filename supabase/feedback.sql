-- Öğrencinin soru geri bildirimi. Hatalı bulunan soruların sonucu iptal edilir (reviews.voided).

alter table public.reviews add column if not exists voided boolean not null default false;

create table if not exists public.question_feedback (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id),
  review_id uuid references public.reviews(id) on delete set null,
  kind text not null check (kind in ('cevap_yanlis', 'soru_hatali', 'anlasilmiyor', 'konu_disi', 'cok_kolay', 'cok_zor', 'diger')),
  note text,
  status text not null default 'new' check (status in ('new', 'checked')),
  verdict text check (verdict in ('soru_hatali', 'soru_dogru', 'not_alindi')),
  response text,              -- saatlik görevin öğrenciye cevabı
  response_seen boolean not null default false,
  created_at timestamptz not null default now(),
  checked_at timestamptz
);

alter table public.question_feedback enable row level security;
drop policy if exists family_all on public.question_feedback;
create policy family_all on public.question_feedback for all to authenticated
  using (public.is_family()) with check (public.is_family());
grant select, insert, update, delete on public.question_feedback to authenticated;
grant all on public.question_feedback to service_role;
