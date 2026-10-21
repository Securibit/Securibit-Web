-- ============================================================
-- 別人的個人頁面（/u/[id]；0011 之後執行）
-- user_public(user_id)：登入的使用者都能看別人的公開資料：
--   id、名稱、@ID、大頭照、帳號建立時間、全站身分組（不含 @everyone，由高到低）、
--   和呼叫者「同時是成員」的群組（id、名稱）。
-- 不回傳 email、電話、登入紀錄、驗證碼、vault 等任何資訊。
-- 可重複執行。
-- ============================================================

create or replace function public.user_public(user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  result jsonb;
begin
  if uid is null then
    raise exception '請先登入';
  end if;

  select jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'username', p.username,
    'photo_url', p.photo_url,
    -- 從 Firebase 搬來的帳號以 profiles.creation_time 為準，其他用 auth.users.created_at（同 admin_user_json）
    'created_at', coalesce(nullif(p.creation_time, ''), u.created_at::text),
    'site_roles', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'color', r.color, 'position', r.position)
                       order by r.position desc, r.created_at)
      from site_user_roles ur join site_roles r on r.id = ur.role_id
      where ur.user_id = p.id and not r.is_default
    ), '[]'::jsonb),
    -- 只列雙方都是成員的群組
    'shared_groups', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name) order by g.name, g.created_at)
      from groups g
      where exists (select 1 from group_members m where m.group_id = g.id and m.user_id = uid)
        and exists (select 1 from group_members m where m.group_id = g.id and m.user_id = p.id)
    ), '[]'::jsonb)
  )
  into result
  from profiles p
  left join auth.users u on u.id = p.id
  where p.id = user_public.user_id;

  if result is null then
    raise exception '找不到這位使用者';
  end if;
  return result;
end;
$$;

revoke execute on function public.user_public(uuid) from public, anon;
grant execute on function public.user_public(uuid) to authenticated;
