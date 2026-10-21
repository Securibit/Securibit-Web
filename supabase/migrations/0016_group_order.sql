-- ============================================================
-- 每個使用者自己排序群組（0015 之後執行）
-- 1. group_members 加 position：同一個群組在每位成員的清單裡可以排在不同位置，只影響自己看到的順序。
-- 2. 既有資料：每位使用者的群組照原本 my_groups 的順序（預設群組第一，其餘依加入時間）編成 0、1、2…；
--    只在這位使用者的群組 position 全都是 0 時才編（排過的不動），所以可重複執行。
-- 3. 新加入的群組（建立群組、邀請連結加入、接受邀請、補建預設群組）排在最後：position = 自己目前最大值 + 1，
--    由 group_members 的 before insert 觸發器處理，不改各個加入群組的 RPC；新使用者的第一個群組（預設群組）自然是 0。
-- 4. my_groups() 依 position、再依原本的次序（預設群組、加入時間、建立時間）排序，回傳多帶 position。
-- 5. my_groups_reorder(ids)：ids 必須剛好是自己所在的全部群組（不多不少、不重複），照順序寫成 0..n-1。
-- 可重複執行。
-- ============================================================

-- ============================================================
-- 欄位
-- ============================================================
alter table public.group_members add column if not exists position int not null default 0;
create index if not exists group_members_user_position_idx on public.group_members (user_id, position);

-- ============================================================
-- 既有資料：position 全是 0 的使用者，照原本 my_groups 的順序編號
-- ============================================================
with pending as (
  select m.user_id
  from public.group_members m
  group by m.user_id
  having count(*) > 1 and bool_and(m.position = 0)
),
ranked as (
  select m.group_id, m.user_id,
         row_number() over (
           partition by m.user_id
           order by (g.id = public.default_group_of(m.user_id)) desc nulls last, m.joined_at, g.created_at, g.id
         ) - 1 as pos
  from public.group_members m
  join pending p on p.user_id = m.user_id
  join public.groups g on g.id = m.group_id
)
update public.group_members m
set position = r.pos
from ranked r
where m.group_id = r.group_id and m.user_id = r.user_id and m.position <> r.pos;

-- ============================================================
-- 新加入的群組排最後
-- ============================================================
create or replace function public.group_members_set_position()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select coalesce(max(m.position), -1) + 1 into new.position
  from group_members m
  where m.user_id = new.user_id;
  return new;
end;
$$;

drop trigger if exists group_members_set_position on public.group_members;
create trigger group_members_set_position
  before insert on public.group_members
  for each row execute function public.group_members_set_position();

-- ============================================================
-- RPC
-- ============================================================

-- 我所在的群組：同 0011，依我自己排的 position 排序，回傳多帶 position
create or replace function public.my_groups()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  def uuid := default_group_of(uid);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', g.id, 'name', g.name, 'description', g.description, 'owner_id', g.owner_id,
      'is_owner', g.owner_id = uid,
      'is_default', g.id = def,
      'encrypted', g.encrypted,
      'position', m.position,
      'member_count', (select count(*) from group_members x where x.group_id = g.id),
      'account_count', (select count(*) from totp_accounts a where a.group_id = g.id and account_permissions(a.id, uid) & 2 <> 0),
      'permissions', group_permissions(g.id, uid)
    ) order by m.position, (g.id = def) desc nulls last, m.joined_at, g.created_at)
    from group_members m join groups g on g.id = m.group_id
    where m.user_id = uid
  ), '[]'::jsonb);
end;
$$;

-- 調整我的群組順序：ids 是自己所在的全部群組（由上到下），照順序寫成 position 0..n-1
create or replace function public.my_groups_reorder(ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_ids uuid[] := coalesce(my_groups_reorder.ids, '{}');
  n int;
begin
  -- 鎖住自己的成員列：和同時加入 / 離開群組互斥
  perform 1 from group_members m where m.user_id = uid for update;

  if exists (select 1 from unnest(p_ids) x where x is null)
     or (select count(distinct x) from unnest(p_ids) x) <> cardinality(p_ids) then
    raise exception '群組順序有重複或空白的項目，請重新整理後再試';
  end if;
  if exists (select 1 from unnest(p_ids) x
             where not exists (select 1 from group_members m where m.group_id = x and m.user_id = uid)) then
    raise exception '只能排序自己所在的群組';
  end if;
  select count(*) into n from group_members m where m.user_id = uid;
  if cardinality(p_ids) <> n then
    raise exception '群組清單已變更，請重新整理後再試';
  end if;

  update group_members m set position = x.ord - 1
  from unnest(p_ids) with ordinality as x(id, ord)
  where m.group_id = x.id and m.user_id = uid and m.position <> x.ord - 1;
end;
$$;

revoke execute on function public.group_members_set_position() from public, anon, authenticated;
revoke execute on function public.my_groups() from public, anon;
revoke execute on function public.my_groups_reorder(uuid[]) from public, anon;
grant execute on function public.my_groups() to authenticated;
grant execute on function public.my_groups_reorder(uuid[]) to authenticated;
