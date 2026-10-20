-- ============================================================
-- @ID 規則補強與「用 @ID 開個人頁面」（/u/<username>；0012 之後執行）
-- 1. @ID 不能看起來像 UUID（32 位十六進位、或含 8-4-4-4-12 的形狀），
--    也不能和網站路由同名（me、admin、api、groups、invite…），避免 /u/<參數> 分不清是 id 還是 @ID。
-- 2. user_public_by_username(name)：用 @ID 查別人的公開資料，回傳和 user_public(uuid) 一樣的 jsonb；
--    0012 的 user_public(uuid) 不變，繼續可用。
-- 3. 重複：profiles.username 有唯一索引（0008 的 profiles_username_key），而且格式約束只允許小寫，
--    寫入前一律經過 username_normalize（trim、轉小寫、去掉開頭的 @），所以大小寫或前後空白不同也算同一個；
--    set_username / admin_update_user 撞到時回「這個 @ID 已被使用」（0008 / 0009 已處理，這裡沿用）。
-- 已經在用、但現在變成保留字的 @ID 不會被清掉（觸發器只在 @ID 改變時檢查）。
-- 可重複執行。
-- ============================================================

-- 看起來像 UUID：整個是 32 位十六進位，或含 8-4-4-4-12 的形狀（格式本來就不允許連字號，保險起見仍檢查）
create or replace function public.username_uuid_like(v text)
returns boolean
language sql
immutable
as $$
  select coalesce(v, '') ~* '^[0-9a-f]{32}$'
      or coalesce(v, '') ~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
$$;

-- 保留字（不能當 @ID）：0008 原本的清單 + 網站路由 + 看起來像 UUID 的名字
create or replace function public.username_reserved(v text)
returns boolean
language sql
immutable
as $$
  select username_uuid_like(v)
      or v = any (array[
        -- 0008 原本的
        'admin', 'administrator', 'root', 'system', 'securibit', 'everyone',
        'here', 'support', 'help', 'null', 'undefined',
        -- 網站路由（src/app）與常見的系統路徑
        'me', 'u', 'api', 'auth', 'about', 'disclaimer', 'code', 'codes', 'addcode',
        'groups', 'group', 'invite', 'invites', 'invitation', 'invitations',
        'settings', 'setting', 'new', 'edit', 'login', 'logout', 'signin', 'signout', 'signup', 'register',
        'user', 'users', 'profile', 'profiles', 'mypage', 'update_info', 'account', 'accounts',
        'notifications', 'roles', 'audit', 'callback', 'static', 'public', 'assets',
        '_next', 'favicon.ico', 'robots.txt', 'sitemap.xml', 'manifest.json'
      ]);
$$;

-- 檢查 @ID 能不能給 p_uid 使用（已正規化、不是 null）；不行就 raise
create or replace function public.username_assert(v text, p_uid uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if v !~ '^[a-z0-9_.]{3,32}$' then
    raise exception '@ID 只能使用 3～32 個英文小寫字母、數字、底線（_）或句點（.）';
  end if;
  if username_uuid_like(v) then
    raise exception '@ID 不能是 UUID 的格式（32 位英數字）';
  end if;
  if username_reserved(v) then
    raise exception '這個 @ID 是保留字，不能使用';
  end if;
  if exists (select 1 from profiles where username = v and id is distinct from p_uid) then
    raise exception '這個 @ID 已被使用';
  end if;
end;
$$;

-- 直接改 profiles 也不能用保留字 / UUID 樣式
create or replace function public.profiles_username_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.username is not null
     and (tg_op = 'INSERT' or new.username is distinct from old.username) then
    if username_uuid_like(new.username) then
      raise exception '@ID 不能是 UUID 的格式（32 位英數字）';
    end if;
    if username_reserved(new.username) then
      raise exception '這個 @ID 是保留字，不能使用';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.username_uuid_like(text) from public, anon, authenticated;
revoke execute on function public.username_reserved(text) from public, anon, authenticated;
revoke execute on function public.username_assert(text, uuid) from public, anon, authenticated;
revoke execute on function public.profiles_username_guard() from public, anon, authenticated;

-- 用 @ID 查別人的公開資料（大小寫、前後空白、開頭的 @ 都不影響）；回傳同 user_public(uuid)
create or replace function public.user_public_by_username(name text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v text := username_normalize(user_public_by_username.name);
  target uuid;
begin
  if uid is null then
    raise exception '請先登入';
  end if;
  if v is not null then
    select p.id into target from profiles p where p.username = v;
  end if;
  if target is null then
    raise exception '找不到這位使用者';
  end if;
  return user_public(target);
end;
$$;

revoke execute on function public.user_public_by_username(text) from public, anon;
grant execute on function public.user_public_by_username(text) to authenticated;
