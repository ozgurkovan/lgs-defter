-- Kelime roketi puanı veritabanında (velinin isteği, 2026-11-16: "kullanıcı hem tablet, pc ve phone kullanırsa datasını
-- nasıl doğru görebilir"): her oyunun puanı oyun satırına (lesson 'oyun') yazılır; rekor, çocuğun en yüksek puanıdır, her
-- cihazda aynı. Biri çocuğun yerine oynadıysa o satır silinir (ya da 'oyun-sifir' satırı yazılır: rekor ondan sonraki
-- oyunlardan sayılır). Eski oyunların puanı yok (boş).
alter table public.typing_results add column if not exists score int;
alter table public.typing_results drop constraint if exists typing_results_score_check;
alter table public.typing_results add constraint typing_results_score_check
  check (score is null or (score between 0 and 10000000 and lesson = 'oyun'));
create index if not exists typing_results_game_idx on public.typing_results (student_id, score desc) where lesson = 'oyun';
