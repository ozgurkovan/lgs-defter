-- Müfredat desteği: her konunun yıllık plandaki başlangıç haftası.
alter table public.topics add column if not exists planned_start date;
alter table public.topics add column if not exists sort int not null default 0;
