-- Emin olma ölçeği (25 / 50 / 75 / 100) ve bir sonraki tekrarda eklenecek destek sorusu sayısı.
alter table public.reviews add column if not exists confidence int check (confidence in (25, 50, 75, 100));
alter table public.items add column if not exists support int not null default 0;
