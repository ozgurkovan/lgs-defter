-- Veliden geri bildirim ve yazışma (velinin isteği, 2026-11-25: "velilerden feedback alabileceğimiz bir alan olsun,
-- oradan gelen tavsiyeleri alıp hatta veliyle diyaloğa girebilelim; Haiku onları işlesin, bize aktarsın").
--   feedback_messages : her velinin tek bir yazışması vardır (parent_id). sender: 'veli' (veli yazdı), 'asistan' (saatlik
--                       görevin kısa karşılığı), 'ekip' (bizim cevabımız). Velinin mesajına saatlik görev sınıf, öncelik ve
--                       tek cümlelik özet yazar (category, priority, summary, triaged_at): "bize aktarma" budur.
--                       needs_team: ekibin cevaplaması gerekiyor mu (velinin kararı, 2026-11-25: "Haiku sınıflandırsın,
--                       basit ise cevap yazsın, bize bildirmesi gereken şeyleri bildirsin, biz cevaplayalım"). Görev basit
--                       soruyu kendi cevaplar ve false yazar; gerisi true. Boş = henüz bakılmadı (ekibi bekliyor sayılır).
--   app_admins        : ekibin hesapları; yalnızca gizli anahtarla yazılır. Yönetici bütün yazışmaları okur ve 'ekip'
--                       olarak cevaplar. Çocuk ve öğretmen bu tabloları hiç görmez.
-- Veli günde en çok 10 mesaj yazar (her mesaj saatlik görevde yapay zekâ işi demektir).
-- Çalıştır: node tools/sb.mjs sql supabase/parent-feedback.sql

create table if not exists public.app_admins (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
revoke all on public.app_admins from anon, authenticated;
grant all on public.app_admins to service_role;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from app_admins a where a.user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create table if not exists public.feedback_messages (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.profiles(id) on delete cascade,
  sender text not null check (sender in ('veli', 'asistan', 'ekip')),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz,          -- velinin okuduğu an (asistan ve ekip mesajlarında)
  team_seen_at timestamptz,     -- ekibin gördüğü an (veli mesajlarında)
  category text check (category is null or category in ('oneri', 'sorun', 'soru', 'tesekkur', 'sikayet', 'hesap')),
  priority int check (priority is null or priority between 1 and 3),   -- 1 acil, 2 önemli, 3 sıradan
  summary text check (summary is null or char_length(summary) <= 300),
  needs_team boolean,           -- ekip cevaplamalı mı; false = asistan cevapladı, yeterli
  triaged_at timestamptz
);
create index if not exists feedback_messages_thread_idx on public.feedback_messages(parent_id, created_at);
create index if not exists feedback_messages_new_idx on public.feedback_messages(created_at) where sender = 'veli' and triaged_at is null;

alter table public.feedback_messages enable row level security;
drop policy if exists read_own on public.feedback_messages;
create policy read_own on public.feedback_messages for select to authenticated
  using (parent_id = auth.uid() or public.is_admin());
drop policy if exists write_own on public.feedback_messages;
create policy write_own on public.feedback_messages for insert to authenticated
  with check ((parent_id = auth.uid() and sender = 'veli' and public.is_parent())
           or (sender = 'ekip' and public.is_admin()));
revoke all on public.feedback_messages from anon, authenticated;
grant select on public.feedback_messages to authenticated;
grant insert (parent_id, sender, body) on public.feedback_messages to authenticated;
grant all on public.feedback_messages to service_role;

-- Veli günde en çok 10 mesaj yazar; sınıf, öncelik ve özet alanlarını uygulama dolduramaz (insert yalnızca üç sütun).
create or replace function public.feedback_guard() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if current_setting('role', true) is distinct from 'authenticated' or new.sender <> 'veli' then return new; end if;
  if (select count(*) from feedback_messages m where m.parent_id = new.parent_id and m.sender = 'veli'
        and m.created_at >= now() - interval '1 day') >= 10 then
    raise exception 'feedback_limit' using hint = 'Bugün çok mesaj yazdınız; yarın yine yazabilirsiniz.';
  end if;
  return new;
end $$;
drop trigger if exists feedback_guard on public.feedback_messages;
create trigger feedback_guard before insert on public.feedback_messages
  for each row execute function public.feedback_guard();

-- Veli yazışmayı açınca gelen cevaplar okundu olur. Kaç mesajın okundu yapıldığını döndürür.
create or replace function public.feedback_mark_read() returns int
language plpgsql security definer set search_path to 'public' as $$
declare n int;
begin
  update feedback_messages set read_at = now()
    where parent_id = auth.uid() and sender <> 'veli' and read_at is null;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.feedback_mark_read() from public, anon;
grant execute on function public.feedback_mark_read() to authenticated;

-- Velinin okumadığı cevap sayısı (Ayarlar'daki kartta "yeni cevap" için).
create or replace function public.feedback_unread() returns int
language sql stable security definer set search_path to 'public' as $$
  select count(*)::int from feedback_messages where parent_id = auth.uid() and sender <> 'veli' and read_at is null;
$$;
revoke all on function public.feedback_unread() from public, anon;
grant execute on function public.feedback_unread() to authenticated;

-- Ekibin gelen kutusu: veli başına bir satır, cevap bekleyenler ve acil olanlar önce. Yönetici değilse boş döner.
create or replace function public.feedback_inbox() returns jsonb
language sql stable security definer set search_path to 'public' as $$
  select case when not public.is_admin() then '[]'::jsonb else coalesce((
    select jsonb_agg(row_to_json(t) order by t.waiting desc, t.priority, t.last_at desc) from (
      select m.parent_id, p.display_name as name,
        max(m.created_at) as last_at,
        count(*) filter (where m.sender = 'veli') as messages,
        count(*) filter (where m.sender = 'veli' and m.team_seen_at is null) as unseen,
        coalesce(min(m.priority) filter (where m.sender = 'veli' and m.team_seen_at is null), 3) as priority,
        -- Ekibi bekliyor: ekibin cevaplaması gereken (ya da henüz bakılmamış) bir veli mesajı var ve ondan sonra ekip yazmamış.
        exists (select 1 from feedback_messages v where v.parent_id = m.parent_id and v.sender = 'veli'
                  and coalesce(v.needs_team, true)
                  and not exists (select 1 from feedback_messages e where e.parent_id = v.parent_id and e.sender = 'ekip'
                                    and e.created_at > v.created_at)) as waiting,
        (select x.sender from feedback_messages x where x.parent_id = m.parent_id and x.sender <> 'veli'
           order by x.created_at desc limit 1) as answered_by,
        (select x.summary from feedback_messages x where x.parent_id = m.parent_id and x.sender = 'veli' and x.summary is not null
           order by x.created_at desc limit 1) as summary,
        (select x.category from feedback_messages x where x.parent_id = m.parent_id and x.sender = 'veli' and x.category is not null
           order by x.created_at desc limit 1) as category,
        (select left(x.body, 140) from feedback_messages x where x.parent_id = m.parent_id and x.sender = 'veli'
           order by x.created_at desc limit 1) as last_text
      from feedback_messages m join profiles p on p.id = m.parent_id
      group by m.parent_id, p.display_name) t), '[]'::jsonb) end;
$$;
revoke all on function public.feedback_inbox() from public, anon;
grant execute on function public.feedback_inbox() to authenticated;

-- Ekip bir yazışmayı açınca velinin mesajları görüldü olur.
create or replace function public.feedback_team_seen(parent uuid) returns int
language plpgsql security definer set search_path to 'public' as $$
declare n int;
begin
  if not public.is_admin() then return 0; end if;
  update feedback_messages set team_seen_at = now() where parent_id = parent and sender = 'veli' and team_seen_at is null;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.feedback_team_seen(uuid) from public, anon;
grant execute on function public.feedback_team_seen(uuid) to authenticated;

-- Ekip paneli: cevap bekleyen "Kilidi aç" istekleri (ödeme elle alınıp abonelik elle yazılana kadar). Yönetici değilse boş.
create or replace function public.admin_unlock_requests() returns jsonb
language sql stable security definer set search_path to 'public' as $$
  select case when not public.is_admin() then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object('id', u.id, 'name', p.display_name, 'created_at', u.created_at, 'note', u.note)
                     order by u.created_at desc)
    from unlock_requests u join profiles p on p.id = u.parent_id where u.handled_at is null), '[]'::jsonb) end;
$$;
revoke all on function public.admin_unlock_requests() from public, anon;
grant execute on function public.admin_unlock_requests() to authenticated;

-- Ekibin kendi sınıflaması (velinin isteği, 2026-11-25: "admin bu gelen feedback'leri Haiku gibi kategorilere
-- ayırabilsin, değişiklik yapmamız gereken bir şey mi onu anlarız oradan"). Yönetici velinin mesajının sınıfını değiştirir
-- ve işaretler: action 'yapilacak' (değişiklik gerekiyor), 'yapildi', 'yok' (gerek yok); boş = karar verilmedi.
-- Sınıfı ekip elle değiştirdiyse saatlik görev bir daha dokunmaz (triaged_at dolu kalır).
alter table public.feedback_messages add column if not exists action text
  check (action is null or action in ('yapilacak', 'yapildi', 'yok'));
create index if not exists feedback_messages_action_idx on public.feedback_messages(created_at) where action = 'yapilacak';

create or replace function public.feedback_set(msg uuid, cat text, act text) returns boolean
language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_admin() then return false; end if;
  update feedback_messages set
      category = coalesce(nullif(cat, ''), category),
      action = nullif(act, ''),
      triaged_at = coalesce(triaged_at, now())
    where id = msg and sender = 'veli';
  return found;
end $$;
revoke all on function public.feedback_set(uuid, text, text) from public, anon;
grant execute on function public.feedback_set(uuid, text, text) to authenticated;

-- Ekip paneli: değişiklik gerektiren (action 'yapilacak') mesajlar, eskiden yeniye. Yönetici değilse boş.
create or replace function public.feedback_todo() returns jsonb
language sql stable security definer set search_path to 'public' as $$
  select case when not public.is_admin() then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object('id', m.id, 'parent_id', m.parent_id, 'name', p.display_name, 'category', m.category,
             'text', coalesce(m.summary, left(m.body, 200)), 'created_at', m.created_at) order by m.created_at)
    from feedback_messages m join profiles p on p.id = m.parent_id
    where m.sender = 'veli' and m.action = 'yapilacak'), '[]'::jsonb) end;
$$;
revoke all on function public.feedback_todo() from public, anon;
grant execute on function public.feedback_todo() to authenticated;
