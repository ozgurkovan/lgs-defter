-- Yanlış cevaptan sonra öğrencinin kendi beyanı: çözümü anladı mı (true/false), cevaplamadıysa boş.
-- Veli raporunda, sonraki sorulardaki başarıyla birlikte "yanlışı anladı mı?" sorusunu cevaplar.
alter table public.reviews add column if not exists understood boolean;
