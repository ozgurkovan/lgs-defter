-- Yıllık plana göre haftası gelmiş konuları takibe alır. Saatlik görev her çalıştığında çağırır:
--   node tools/sb.mjs post rpc/activate_planned_topics '{}'
-- İlk tekrarlar 7 güne yayılır; katsayısı yüksek dersler önce gelir. Tekrar çağırmak güvenlidir.
create or replace function public.activate_planned_topics()
returns int language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Europe/Istanbul')::date;
  added int;
begin
  with due as (
    select t.id,
           row_number() over (order by case when t.subject in ('turkce','matematik','fen') then 0 else 1 end,
                                       t.planned_start, t.subject, t.sort) as n
    from topics t
    where t.planned_start <= today
      and not exists (select 1 from topic_status s where s.topic_id = t.id)
  ), st as (
    insert into topic_status (topic_id, status, first_seen)
    select id, 'active', today from due
    returning topic_id
  )
  insert into items (track, topic_id, step, interval_days, due_date)
  select 'topic', d.id, 0, 1, today + 1 + ((d.n - 1) % 7)::int
  from due d
  where not exists (select 1 from items i where i.track = 'topic' and i.topic_id = d.id);
  get diagnostics added = row_count;
  return added;
end $$;

revoke all on function public.activate_planned_topics() from public, anon, authenticated;
grant execute on function public.activate_planned_topics() to service_role;
