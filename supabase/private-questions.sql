-- Aileye özel sorular (2026-11-16): uygulama satılacağı için ortak havuzda yalnızca bizim yazdığımız sorular durur.
-- Yüklenen sorular (çocuğun fotoğrafladığı soru, kitap sayfası, eski MEB içe aktarması) silinmez; yalnızca yükleyen
-- ailenin öğrencilerine, velilerine ve öğretmenlerine görünür.
--   questions.private_students = null   : ortak havuz, herkes görür
--   questions.private_students = {…}    : yalnızca bu öğrenciler ve onlara bağlı veli/öğretmenler görür
--   questions.private_students = '{}'   : kimse görmez (sahibi bulunamayan yüklenmiş soru; yalnızca saatlik görev)
-- Çalıştır: node tools/sb.mjs sql supabase/private-questions.sql

alter table public.questions add column if not exists private_students uuid[];
create index if not exists questions_private_idx on public.questions using gin (private_students) where private_students is not null;

-- Bir öğrencinin ailesi: aynı veliye bağlı bütün öğrenciler (öğretmen bağları sayılmaz), kendisi dâhil.
create or replace function public.family_students(sid uuid) returns uuid[]
language sql stable security definer set search_path to 'public' as $$
  select case when sid is null then null else (
    select array_agg(distinct x) from (
      select sid as x
      union
      select f2.student_id
      from family_links f1
      join family_links f2 on f2.parent_id = f1.parent_id and coalesce(f2.relation, 'parent') <> 'teacher'
      where f1.student_id = sid and coalesce(f1.relation, 'parent') <> 'teacher'
    ) t) end;
$$;
revoke all on function public.family_students(uuid) from public, anon, authenticated;

-- Soruyu kim görür: ortak soru herkese; özel soru listedeki öğrenciye ve ona bağlı veli/öğretmene.
create or replace function public.can_see_private(ps uuid[]) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select ps is null or auth.uid() = any (ps)
    or exists (select 1 from family_links where parent_id = auth.uid() and student_id = any (ps));
$$;

alter policy read_members on public.questions
  using (is_member() and (private_students is null or can_see_private(private_students)));

-- Yüklenen sorular kendiliğinden özel olur: saatlik görev unutsa da ortak havuza karışmaz.
create or replace function public.questions_private_default() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare
  owner uuid;
  uploader uuid;
begin
  if new.private_students is not null or new.source not in ('ogrenci', 'kitap', 'meb', 'deneme') then
    return new;
  end if;
  if new.submission_id is not null then
    select student_id, uploaded_by into owner, uploader from submissions where id = new.submission_id;
  end if;
  if owner is not null then
    new.private_students := family_students(owner);
  elsif uploader is not null then
    -- velinin yüklediği kitap sayfası: velinin bütün çocukları
    select array_agg(distinct student_id) into new.private_students
    from family_links where parent_id = uploader and coalesce(relation, 'parent') <> 'teacher';
  end if;
  new.private_students := coalesce(new.private_students, '{}');
  return new;
end $$;

drop trigger if exists questions_private_default on public.questions;
create trigger questions_private_default before insert on public.questions
  for each row execute function public.questions_private_default();

-- Havuz ihtiyacı: bir öğrencinin görmediği sorular sayılırken başka ailenin özel soruları sayılmaz.
create or replace view public.pool_needs as
 with tracked as (
         select i.student_id,
            i.topic_id,
            min(i.due_date) as next_due
           from items i
             join topic_status s on s.student_id = i.student_id and s.topic_id = i.topic_id and (s.status = any (array['active'::text, 'gap'::text]))
          where i.state = 'active'::text
          group by i.student_id, i.topic_id
        ), per_student as (
         select tr.topic_id,
            tr.next_due,
            ( select count(*) as count
                   from questions q
                  where q.topic_id = tr.topic_id and q.active and not q.exam_only
                    and (q.private_students is null or tr.student_id = any (q.private_students))
                    and not (exists ( select 1
                           from reviews r
                          where r.question_id = q.id and r.student_id = tr.student_id))) as unseen
           from tracked tr
        ), agg as (
         select p.topic_id,
            t.subject,
            t.grade,
            t.name,
            t.kazanim,
            t.lgs_avg,
            min(p.next_due) as next_due,
            min(p.unseen) as unseen
           from per_student p
             join topics t on t.id = p.topic_id
          group by p.topic_id, t.subject, t.grade, t.name, t.kazanim, t.lgs_avg
         having min(p.unseen) < 30
        )
 select topic_id,
    subject,
    grade,
    name,
    kazanim,
    next_due,
    unseen,
    greatest(0::bigint, 30 - unseen) as to_generate,
    greatest(0::bigint, 10 - unseen) as to_first,
        case
            when unseen = 0 then 0
            when unseen < 10 then 1
            else 2
        end * 10 +
        case
            when subject = any (array['turkce'::text, 'ela'::text, 'matematik'::text]) then 0
            when subject = 'fen'::text then 1
            else 2
        end as priority,
    lgs_avg
   from agg
  order by (
        case
            when unseen = 0 then 0
            when unseen < 10 then 1
            else 2
        end * 10 +
        case
            when subject = any (array['turkce'::text, 'ela'::text, 'matematik'::text]) then 0
            when subject = 'fen'::text then 1
            else 2
        end), (coalesce(lgs_avg, 1::numeric)) desc, next_due, subject;

-- Soru görselleri: yalnızca görebildiğin bir soruya bağlı görsel okunur (özel sorunun görseli de özeldir).
alter policy questions_read on storage.objects
  using (bucket_id = 'questions' and is_member()
         and exists (select 1 from public.questions q where q.image_path = objects.name));
