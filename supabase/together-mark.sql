-- "Birlikte baktık" işaretini veli ve öğretmen koyabilir. Öğretmenler başka hiçbir şeyi değiştiremediği için
-- bu iş genel yazma kuralıyla değil, sadece bu iki alanı değiştiren bir fonksiyonla yapılır.
-- Öğretmen sadece gördüğü derslerin sorularını işaretleyebilir; öğrenci kendisi işaretleyemez.
alter table public.reviews add column if not exists together_by uuid references public.profiles(id) on delete set null;

create or replace function public.mark_together(rid uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  r public.reviews;
begin
  select * into r from public.reviews where id = rid;
  if r.id is null then return false; end if;
  if auth.uid() is null or auth.uid() = r.student_id
     or not public.can_see_subject(r.student_id, public.question_subject(r.question_id)) then
    raise exception 'Bu soruyu işaretleme yetkin yok' using errcode = '42501';
  end if;
  update public.reviews set together_at = now(), together_by = auth.uid() where id = rid and together_at is null;
  return true;
end $$;

revoke all on function public.mark_together(uuid) from public, anon;
grant execute on function public.mark_together(uuid) to authenticated;
