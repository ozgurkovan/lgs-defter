-- Öğretmen de benzer sorularla dener (velinin isteği, 2026-11-09): öğretmen, kendi dersinde öğrencisinin yanlış sorularını
-- görür ve "Benzer sorularla dene" ile öğrencisine çözdürür. Cevaplar öğrencinin adına 'check' tarzıyla yazılır; yanlış
-- yapılan benzer soru hata tekrarına girer. Öğretmen başka tarzda cevap, başka dersin sorusu ya da başka öğrenci için yazamaz;
-- var olan satırları değiştiremez.
drop policy if exists teacher_check_insert on public.reviews;
create policy teacher_check_insert on public.reviews for insert to authenticated
  with check (track = 'check' and item_id is null
    and public.can_see_subject(student_id, public.question_subject(question_id)));

drop policy if exists teacher_check_mistake on public.items;
create policy teacher_check_mistake on public.items for insert to authenticated
  with check (track = 'mistake' and question_id is not null and note = 'Veli denemesinde yanlış'
    and public.can_see_subject(student_id, public.topic_subject(topic_id)));
