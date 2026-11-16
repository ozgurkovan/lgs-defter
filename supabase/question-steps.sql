-- Adım adım çözüm (velinin isteği, 2026-11-16: "birisi kısa çözüm, diğeri daha detaylı hatta şekilli anlatım, çocuğa bir bir
-- yavaş yavaş"). questions.steps: [{ "text": "...", "fig": { "type": "numberline", ... } }, …] (1–8 adım). Saatlik görev
-- yazar (job/INSTRUCTIONS.md 1h); uygulama "Adım adım anlat" ile tek tek gösterir (docs/steps.js). Boşsa yalnız kısa çözüm.
alter table public.questions add column if not exists steps jsonb;
alter table public.questions drop constraint if exists questions_steps_check;
alter table public.questions add constraint questions_steps_check
  check (steps is null or (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) between 1 and 8 and pg_column_size(steps) < 16000));
