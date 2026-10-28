-- family_links kuralı kendi tablosunu sorguladığı için döngüye giriyordu; kontroller
-- RLS'i atlayan yardımcı fonksiyonlara taşındı.

create or replace function public.is_parent_of(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from family_links where parent_id = auth.uid() and student_id = sid and relation = 'parent');
$$;

-- Bu yetişkin, benim velisi olduğum bir çocuğa bağlı mı? (eşim ya da çocuğumun öğretmeni)
create or replace function public.shares_my_child(adult uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from family_links mine join family_links other on other.student_id = mine.student_id
                 where mine.parent_id = auth.uid() and mine.relation = 'parent' and other.parent_id = adult);
$$;

-- Öğrenci, bu yetişkinin bağlı olduğu bir öğrenci mi (öğrenci kendi velisini/öğretmenini görür)?
create or replace function public.is_my_adult(adult uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from family_links where student_id = auth.uid() and parent_id = adult);
$$;

grant execute on function public.is_parent_of(uuid), public.shares_my_child(uuid), public.is_my_adult(uuid) to authenticated;

drop policy if exists own_rows on public.family_links;
create policy own_rows on public.family_links for select to authenticated
  using (parent_id = auth.uid() or student_id = auth.uid() or public.is_parent_of(student_id));

drop policy if exists own_rows on public.profiles;
create policy own_rows on public.profiles for select to authenticated
  using (id = auth.uid() or public.can_see_student(id) or public.is_my_adult(id) or public.shares_my_child(id));
