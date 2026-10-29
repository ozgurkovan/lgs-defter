-- "Bunu birlikte bakalım": öğrenci soruyu anlamadığını söyleyip boş geçer (needs_help).
-- Tahmin ettiği (emin olma %25), boş geçtiği ve yanlıştan sonra "anlamadım" dediği sorular
-- oturum sonunda ve veli/öğretmen raporunda "Birlikte bakılacaklar" listesinde çıkar.
-- Veli birlikte baktıktan sonra işaretler (together_at); öğretmen sadece görür.
alter table public.reviews add column if not exists needs_help boolean not null default false;
alter table public.reviews add column if not exists together_at timestamptz;
