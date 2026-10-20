-- ============================================================
-- 預設群組與加密群組（0008～0010 之後執行；規格見 docs/groups-and-permissions.md 第 7 節）
-- 1. 「我的驗證碼」改成一個群組：每個使用者都有一個預設群組（profiles.default_group_id，只能指向自己擁有的群組）。
--    新使用者建立 profile 時自動建立「我的」；既有使用者在這裡建立，並把個人驗證碼（totp_accounts.owner_id）
--    搬進去（group_id = 預設群組、owner_id = null；金鑰、順序、釘選、類別都不動）。
--    之後 totp_accounts.owner_id 一律為 null（加 check 約束），個人路徑只剩相容用的 totp_* RPC（改成操作預設群組）。
-- 2. 預設群組不能刪；自己擁有的群組只剩一個也不能刪；轉移預設群組時自動把預設改到自己擁有的另一個群組，沒有就擋。
-- 3. 加密改成套用在群組上（groups.encrypted）：只有擁有者能切換，用擁有者自己的 vault（profiles.vault）加解密。
--    加密的群組只能有擁有者一個成員：不能建立邀請、Email / @ID 邀請、加入、接受邀請；有其他成員時不能開啟加密。
--    原本有 vault 的使用者，預設群組直接標成 encrypted（金鑰本來就是 enc:v1 密文）。
--    /api/groups/codes 不對加密群組產碼（group_codes_permitted 回傳空陣列）。
-- 4. totp_set_vault 改成作用在「自己擁有且已加密的群組」，沿用 0010 的 expected_check、涵蓋全部、明文 / 密文檢查。
-- 5. 刪除帳號：只擋「還擁有有其他成員的群組」；只有自己一個人的群組（含預設群組）跟著帳號一起刪除。
-- 6. 從 Firebase 接回的舊資料（legacy_import → profiles.totp）直接放進預設群組；預設群組已加密時另外建立一個沒加密的群組。
-- 資料搬移不可逆（之後沒有個人驗證碼），執行前請先備份。可重複執行。
-- ============================================================

-- ============================================================
-- 欄位
-- ============================================================
alter table public.groups add column if not exists encrypted boolean not null default false;

-- 預設群組：不加 FK（群組刪除時由 RPC 處理預設；也避免刪帳號時 FK 動作改到正在刪除的 profile）
alter table public.profiles add column if not exists default_group_id uuid;

-- ============================================================
-- 內部 helper
-- ============================================================

-- 建立群組（含 @everyone 與擁有者成員），回傳群組 id；不檢查權限，給 group_create 與預設群組共用
create or replace function public.group_insert(p_owner uuid, p_name text, p_desc text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  gid uuid;
begin
  insert into groups (name, description, owner_id) values (p_name, coalesce(p_desc, ''), p_owner) returning id into gid;
  insert into group_roles (group_id, name, color, position, permissions, is_default)
  values (gid, '@everyone', '', 0, 2, true);
  insert into group_members (group_id, user_id) values (gid, p_owner);
  perform audit(gid, p_owner, 'group.create', 'group', gid::text, jsonb_build_object('name', p_name));
  return gid;
end;
$$;

-- 使用者的預設群組；沒有（或指到的群組已不是自己的）就建立一個「我的」並設成預設。沒有 profile 時回傳 null
create or replace function public.ensure_default_group(p_uid uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  gid uuid;
begin
  if p_uid is null then
    return null;
  end if;
  select p.default_group_id into gid from profiles p where p.id = p_uid for update;
  if not found then
    return null;
  end if;
  if gid is not null and exists (select 1 from groups g where g.id = gid and g.owner_id = p_uid) then
    return gid;
  end if;
  gid := group_insert(p_uid, '我的', '');
  update profiles set default_group_id = gid where id = p_uid;
  return gid;
end;
$$;

-- 使用者目前的預設群組（不建立；沒有或無效時 null）
create or replace function public.default_group_of(p_uid uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.default_group_id from profiles p
  join groups g on g.id = p.default_group_id and g.owner_id = p.id
  where p.id = p_uid;
$$;

-- 寫進群組的金鑰格式要和群組的加密狀態一致：加密的群組只收 enc:v1: 密文，沒加密的不收密文
create or replace function public.group_assert_secret_format(p_gid uuid, p_secrets text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  enc boolean;
begin
  -- 鎖住群組列（共享鎖）：和 group_set_encrypted / totp_set_vault 互斥，避免切換加密的同時寫入另一種格式
  select g.encrypted into enc from groups g where g.id = p_gid for share;
  if enc is null or p_secrets is null then
    return;
  end if;
  if enc and exists (select 1 from unnest(p_secrets) s where coalesce(s, '') not like 'enc:v1:%') then
    raise exception '這個群組已加密，請重新整理並解鎖後再試';
  end if;
  if not enc and exists (select 1 from unnest(p_secrets) s where coalesce(s, '') like 'enc:v1:%') then
    raise exception '這個群組沒有加密，不能存入加密後的金鑰，請重新整理後再試';
  end if;
end;
$$;

-- items（TotpInput 陣列）裡的金鑰
create or replace function public.totp_items_secrets(p_items jsonb)
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(coalesce(e ->> 'secret', '')), '{}')
  from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end) e
  where jsonb_typeof(e) = 'object';
$$;

-- 群組清單（TotpItem[]，含金鑰，依 position 排序）：給相容用的 totp_* RPC 回傳
create or replace function public.totp_group_items_json(p_gid uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', a.id, 'name', a.name, 'secret', coalesce(s.secret, ''), 'category', a.category,
        'digits', a.digits, 'period', a.period, 'algorithm', a.algorithm, 'pinned', a.pinned
      )
      order by a.position, a.created_at, a.id
    ),
    '[]'::jsonb
  )
  from totp_accounts a
  left join totp_secrets s on s.account_id = a.id
  where a.group_id = p_gid;
$$;

-- 新增驗證碼到群組（不檢查權限）：檢查金鑰格式、匯入、記錄；回傳新增的 id
create or replace function public.group_add_items(p_gid uuid, p_items jsonb, p_uid uuid)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  ids uuid[];
begin
  perform group_assert_secret_format(p_gid, totp_items_secrets(p_items));
  ids := totp_import_items(null, p_gid, p_items, p_uid);
  insert into audit_logs (group_id, actor_id, action, target_type, target_id, detail)
  select p_gid, p_uid, 'group.account.create', 'account', a.id::text, jsonb_build_object('name', a.name)
  from totp_accounts a where a.id = any (ids);
  return ids;
end;
$$;

revoke execute on function public.group_insert(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.ensure_default_group(uuid) from public, anon, authenticated;
revoke execute on function public.default_group_of(uuid) from public, anon, authenticated;
revoke execute on function public.group_assert_secret_format(uuid, text[]) from public, anon, authenticated;
revoke execute on function public.totp_items_secrets(jsonb) from public, anon, authenticated;
revoke execute on function public.totp_group_items_json(uuid) from public, anon, authenticated;
revoke execute on function public.group_add_items(uuid, jsonb, uuid) from public, anon, authenticated;

-- ============================================================
-- 約束（trigger）
-- ============================================================

-- profiles.default_group_id 只能指向自己擁有的群組
create or replace function public.profiles_default_group_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.default_group_id is not null
     and not exists (select 1 from groups g where g.id = new.default_group_id and g.owner_id = new.id) then
    raise exception '只能把自己擁有的群組設為預設';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_default_group_guard on public.profiles;
create trigger profiles_default_group_guard
  before insert or update of default_group_id on public.profiles
  for each row execute function public.profiles_default_group_guard();

-- 新 profile 自動建立預設群組（handle_new_user、ensure_profile 都會 insert profile）
create or replace function public.profiles_create_default_group()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform ensure_default_group(new.id);
  return null;
end;
$$;

drop trigger if exists profiles_create_default_group on public.profiles;
create trigger profiles_create_default_group
  after insert on public.profiles
  for each row execute function public.profiles_create_default_group();

-- 群組換擁有者時，不能是原擁有者的預設群組（group_transfer 會先把預設改走）
create or replace function public.groups_owner_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_id is distinct from old.owner_id
     and exists (select 1 from profiles p where p.id = old.owner_id and p.default_group_id = old.id) then
    raise exception '這是擁有者的預設群組，請先把其他群組設為預設再轉移';
  end if;
  return new;
end;
$$;

drop trigger if exists groups_owner_guard on public.groups;
create trigger groups_owner_guard
  before update of owner_id on public.groups
  for each row execute function public.groups_owner_guard();

-- 刪除 profile（刪帳號）前，先刪掉只有自己一個成員的群組（groups.owner_id 沒有 cascade）。
-- 還有其他成員的群組不動：can_delete_self / admin_can_delete_user 會先擋，漏網時由 FK 擋下整筆刪除
create or replace function public.profiles_delete_owned_groups()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from groups g
  where g.owner_id = old.id
    and not exists (select 1 from group_members m where m.group_id = g.id and m.user_id <> old.id);
  return old;
end;
$$;

drop trigger if exists profiles_delete_owned_groups on public.profiles;
create trigger profiles_delete_owned_groups
  before delete on public.profiles
  for each row execute function public.profiles_delete_owned_groups();

revoke execute on function public.profiles_default_group_guard() from public, anon, authenticated;
revoke execute on function public.profiles_create_default_group() from public, anon, authenticated;
revoke execute on function public.groups_owner_guard() from public, anon, authenticated;
revoke execute on function public.profiles_delete_owned_groups() from public, anon, authenticated;

-- ============================================================
-- 搬資料：每個使用者建立預設群組，個人驗證碼搬進去；有 vault 的預設群組標成加密
-- （只在這次新建預設群組時標加密：重複執行時不會把使用者之後關掉的加密又打開）
-- ============================================================
do $$
declare
  p record;
  gid uuid;
begin
  for p in select id, vault, default_group_id from public.profiles loop
    gid := public.ensure_default_group(p.id);
    update public.totp_accounts a set group_id = gid, owner_id = null where a.owner_id = p.id;
    if p.vault is not null and p.default_group_id is distinct from gid then
      update public.groups set encrypted = true where id = gid;
    end if;
  end loop;
end;
$$;

-- 之後不能再有個人驗證碼（owner_id 一律 null）
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'totp_accounts_group_only') then
    alter table public.totp_accounts add constraint totp_accounts_group_only check (owner_id is null);
  end if;
end;
$$;

-- ============================================================
-- 接回 Firebase 舊資料：寫進 profiles.totp 的資料轉存到預設群組
-- ============================================================

-- 舊資料要放的群組：預設群組；預設群組已加密（舊資料是明文）就另外建立一個沒加密的群組
create or replace function public.legacy_target_group(p_uid uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  gid uuid := ensure_default_group(p_uid);
begin
  if gid is not null and exists (select 1 from groups g where g.id = gid and g.encrypted) then
    gid := group_insert(p_uid, '舊版驗證碼', '從舊版網站接回的驗證碼');
  end if;
  return gid;
end;
$$;

create or replace function public.profiles_totp_to_accounts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.totp is not null and jsonb_typeof(new.totp) = 'array' and jsonb_array_length(new.totp) > 0 then
    perform totp_import_items(null, legacy_target_group(new.id), new.totp, new.id);
    update profiles set totp = '[]'::jsonb where id = new.id;
  end if;
  return null;
end;
$$;

revoke execute on function public.legacy_target_group(uuid) from public, anon, authenticated;
revoke execute on function public.profiles_totp_to_accounts() from public, anon, authenticated;

-- 登入時自我修復：同 0010，最後確保有預設群組（例如預設群組被管理員刪掉）
create or replace function public.ensure_profile()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  u auth.users%rowtype;
begin
  if uid is null then
    return;
  end if;

  select * into u from auth.users where id = uid;
  if u.id is null then
    return;
  end if;

  insert into public.profiles (
    id, email, name, photo_url, bg_photo_url,
    email_verified, phone_number, creation_time, last_sign_in_time
  )
  values (
    uid,
    u.email,
    coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
    coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture'),
    'https://img.freepik.com/free-photo/abstract-luxury-plain-blur-grey-black-gradient-used-as-background-studio-wall-display-your-products_1258-63747.jpg?w=2000',
    (u.email_confirmed_at is not null),
    '',
    coalesce(u.created_at::text, ''),
    coalesce(u.last_sign_in_at::text, '')
  )
  on conflict (id) do nothing;

  -- email 與驗證狀態以 auth.users 為準（前端不能直接改這兩個欄位）
  update public.profiles p
  set email = u.email, email_verified = (u.email_confirmed_at is not null)
  where p.id = uid
    and (p.email is distinct from u.email or p.email_verified is distinct from (u.email_confirmed_at is not null));

  perform public.ensure_default_group(uid);
  perform public.claim_verified_email(uid, u.email, u.email_confirmed_at);
end;
$$;

-- ============================================================
-- 相容用的個人驗證碼 RPC：名稱、參數、回傳格式不變，改成操作自己的預設群組
-- ============================================================

-- 自己的預設群組（沒有就建立）；未登入 / 沒有 profile 回傳 null
create or replace function public.totp_default_group()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := totp_current_owner();
begin
  if uid is null then
    return null;
  end if;
  return ensure_default_group(uid);
end;
$$;

revoke execute on function public.totp_default_group() from public, anon, authenticated;

create or replace function public.totp_list()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  gid uuid := totp_default_group();
begin
  if gid is null then
    return null;
  end if;
  return totp_group_items_json(gid);
end;
$$;

create or replace function public.totp_add(items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  gid uuid := totp_default_group();
begin
  if gid is null then
    return null;
  end if;
  perform group_add_items(gid, totp_add.items, auth.uid());
  return totp_group_items_json(gid);
end;
$$;

create or replace function public.totp_update(item_id text, patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  gid uuid := totp_default_group();
  target uuid;
begin
  if gid is null then
    return null;
  end if;
  select a.id into target from totp_accounts a
  where a.group_id = gid and a.id::text = lower(trim(totp_update.item_id));
  if target is null then
    return null;
  end if;
  if jsonb_typeof(totp_update.patch) = 'object' and totp_update.patch ? 'secret' then
    perform group_assert_secret_format(gid, array[coalesce(totp_update.patch ->> 'secret', '')]);
  end if;
  perform totp_apply_patch(target, totp_update.patch);
  return totp_group_items_json(gid);
end;
$$;

create or replace function public.totp_delete(item_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  gid uuid := totp_default_group();
begin
  if gid is null then
    return null;
  end if;
  delete from totp_accounts a
  where a.group_id = gid and a.id::text = lower(trim(totp_delete.item_id));
  return totp_group_items_json(gid);
end;
$$;

create or replace function public.totp_clear()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  gid uuid := totp_default_group();
begin
  if gid is null then
    return null;
  end if;
  delete from totp_accounts a where a.group_id = gid;
  return '[]'::jsonb;
end;
$$;

create or replace function public.totp_reorder(ids text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  gid uuid := totp_default_group();
begin
  if gid is null then
    return null;
  end if;
  perform totp_reorder_items(null, gid, totp_reorder.ids);
  return totp_group_items_json(gid);
end;
$$;

-- ============================================================
-- 加密設定（profiles.vault）：作用在自己擁有且已加密的群組
-- ============================================================

-- 更新 vault 並一次換掉多筆金鑰（secrets：{ "<account id>": "<secret>" }），回傳預設群組的清單。
-- expected_check：呼叫端以為目前的 vault.check（未啟用為 null）；和資料庫不同代表別的裝置改過，raise。
-- 加密設定有變（改密碼、停用）時 secrets 必須涵蓋「自己擁有且已加密的群組」的全部驗證碼；
-- 有加密時金鑰都要是 enc:v1: 密文，停用時都要是明文，且那些群組一起改成沒加密。
-- 啟用（原本沒有 vault）時還沒有加密的群組，只設定密碼；要加密哪個群組另外呼叫 group_set_encrypted。
create or replace function public.totp_set_vault(new_vault jsonb, secrets jsonb, expected_check text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := totp_current_owner();
  s jsonb := case when jsonb_typeof(totp_set_vault.secrets) = 'object' then totp_set_vault.secrets else '{}'::jsonb end;
  v jsonb := nullif(totp_set_vault.new_vault, 'null'::jsonb);
  cur jsonb;
  enc uuid[];
begin
  if uid is null then
    return null;
  end if;
  if v is not null and (jsonb_typeof(v) <> 'object' or coalesce(jsonb_typeof(v -> 'check'), '') <> 'string') then
    raise exception '加密設定格式不正確';
  end if;

  -- 先鎖 profile 再鎖群組（和 group_set_encrypted 同順序）
  select p.vault into cur from profiles p where p.id = uid for update;
  if (cur ->> 'check') is distinct from totp_set_vault.expected_check then
    raise exception '加密設定已在其他裝置變更，請重新整理';
  end if;

  perform 1 from groups g where g.owner_id = uid and g.encrypted order by g.id for update;
  select coalesce(array_agg(g.id), '{}') into enc from groups g where g.owner_id = uid and g.encrypted;

  if (v ->> 'check') is distinct from (cur ->> 'check')
     and exists (select 1 from totp_accounts a where a.group_id = any (enc) and not (s ? a.id::text)) then
    raise exception '驗證碼清單已在其他裝置變更，請重新整理後再試';
  end if;

  if exists (
    select 1 from totp_accounts a
    where a.group_id = any (enc) and s ? a.id::text
      and (jsonb_typeof(s -> a.id::text) <> 'string'
           or (v is not null) <> ((s ->> a.id::text) like 'enc:v1:%'))
  ) then
    raise exception '金鑰格式和加密設定不一致，請重新整理後再試';
  end if;

  update profiles set vault = v, updated_at = now() where id = uid;

  update totp_secrets t
  set secret = s ->> a.id::text
  from totp_accounts a
  where a.id = t.account_id
    and a.group_id = any (enc)
    and s ? a.id::text;

  if v is null and cardinality(enc) > 0 then
    update groups set encrypted = false where id = any (enc);
    insert into audit_logs (group_id, actor_id, action, target_type, target_id, detail)
    select g.id, uid, 'group.encryption.disable', 'group', g.id::text, jsonb_build_object('name', g.name)
    from groups g where g.id = any (enc);
  end if;

  return totp_group_items_json(ensure_default_group(uid));
end;
$$;

-- 忘記加密密碼：刪除自己擁有且已加密的群組裡的驗證碼，這些群組改成沒加密，並停用 vault
create or replace function public.vault_reset()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  enc uuid[];
begin
  perform 1 from profiles p where p.id = uid for update;
  perform 1 from groups g where g.owner_id = uid and g.encrypted order by g.id for update;
  select coalesce(array_agg(g.id), '{}') into enc from groups g where g.owner_id = uid and g.encrypted;

  delete from totp_accounts a where a.group_id = any (enc);
  update groups set encrypted = false where id = any (enc);
  update profiles set vault = null, updated_at = now() where id = uid;

  insert into audit_logs (group_id, actor_id, action, target_type, target_id, detail)
  select g.id, uid, 'group.encryption.disable', 'group', g.id::text, jsonb_build_object('name', g.name, 'reset', true)
  from groups g where g.id = any (enc);
end;
$$;

-- 開啟 / 關閉群組加密（只有擁有者）：secrets 必須涵蓋群組全部驗證碼，開啟時都是 enc:v1: 密文、關閉時都是明文。
-- expected_check：呼叫端用來加解密的 vault.check，和資料庫不同就 raise。
-- 開啟條件：已設定加密密碼、群組只有擁有者一個成員；開啟時撤銷所有邀請連結、刪除 Email / @ID 邀請。
create or replace function public.group_set_encrypted(gid uuid, encrypted boolean, secrets jsonb, expected_check text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_gid uuid := group_set_encrypted.gid;
  p_on boolean := coalesce(group_set_encrypted.encrypted, false);
  s jsonb := case when jsonb_typeof(group_set_encrypted.secrets) = 'object' then group_set_encrypted.secrets else '{}'::jsonb end;
  cur jsonb;
  g groups%rowtype;
begin
  if not exists (select 1 from groups x where x.id = p_gid) then
    raise exception '找不到這個群組';
  end if;
  if not exists (select 1 from groups x where x.id = p_gid and x.owner_id = uid) then
    raise exception '只有群組擁有者可以切換加密';
  end if;

  -- 先鎖 profile 再鎖群組（和 totp_set_vault 同順序）
  select p.vault into cur from profiles p where p.id = uid for update;
  select * into g from groups x where x.id = p_gid for update;
  if g.owner_id <> uid then
    raise exception '只有群組擁有者可以切換加密';
  end if;
  if cur is null then
    raise exception '請先到「帳戶設定」設定加密密碼';
  end if;
  if (cur ->> 'check') is distinct from group_set_encrypted.expected_check then
    raise exception '加密設定已在其他裝置變更，請重新整理';
  end if;
  if g.encrypted = p_on then
    return;
  end if;
  if p_on and exists (select 1 from group_members m where m.group_id = p_gid and m.user_id <> uid) then
    raise exception '群組還有其他成員，請先移除成員再開啟加密';
  end if;

  if exists (select 1 from totp_accounts a where a.group_id = p_gid and not (s ? a.id::text)) then
    raise exception '驗證碼清單已在其他裝置變更，請重新整理後再試';
  end if;
  if exists (
    select 1 from totp_accounts a
    where a.group_id = p_gid
      and (jsonb_typeof(s -> a.id::text) <> 'string' or p_on <> ((s ->> a.id::text) like 'enc:v1:%'))
  ) then
    raise exception '金鑰格式和加密設定不一致，請重新整理後再試';
  end if;

  update totp_secrets t
  set secret = s ->> a.id::text
  from totp_accounts a
  where a.id = t.account_id and a.group_id = p_gid;
  update groups x set encrypted = p_on where x.id = p_gid;

  if p_on then
    update group_invites i set revoked_at = coalesce(i.revoked_at, now()) where i.group_id = p_gid;
    delete from group_email_invites e where e.group_id = p_gid;
  end if;

  perform audit(p_gid, uid, case when p_on then 'group.encryption.enable' else 'group.encryption.disable' end,
                'group', p_gid::text, jsonb_build_object('name', g.name));
end;
$$;

-- ============================================================
-- 預設群組
-- ============================================================

-- 把自己擁有的群組設成預設
create or replace function public.group_set_default(gid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_gid uuid := group_set_default.gid;
begin
  if not exists (select 1 from groups g where g.id = p_gid and g.owner_id = uid) then
    raise exception '只能把自己擁有的群組設為預設';
  end if;
  update profiles set default_group_id = p_gid where id = uid;
end;
$$;

-- 建立群組（全站 CREATE_GROUPS）：同 0009，改用 group_insert
create or replace function public.group_create(name text, description text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_name text := trim(coalesce(group_create.name, ''));
  p_desc text := trim(coalesce(group_create.description, ''));
begin
  perform site_require(uid, 256);
  if p_name = '' then
    raise exception '請輸入群組名稱';
  end if;
  if char_length(p_name) > 50 then
    raise exception '群組名稱最多 50 個字';
  end if;
  if char_length(p_desc) > 300 then
    raise exception '群組說明最多 300 個字';
  end if;
  return group_insert(uid, p_name, p_desc);
end;
$$;

-- 我所在的群組：同 0009，加上 is_default、encrypted；預設群組排第一
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
      'member_count', (select count(*) from group_members x where x.group_id = g.id),
      'account_count', (select count(*) from totp_accounts a where a.group_id = g.id and account_permissions(a.id, uid) & 2 <> 0),
      'permissions', group_permissions(g.id, uid)
    ) order by (g.id = def) desc nulls last, m.joined_at, g.created_at)
    from group_members m join groups g on g.id = m.group_id
    where m.user_id = uid
  ), '[]'::jsonb);
end;
$$;

-- 群組內頁：同 0010，group 加上 encrypted；另外回傳 is_default（是不是我的預設群組）與 owned_count（我擁有幾個群組）
create or replace function public.group_detail(gid uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_gid uuid := group_detail.gid;
  perms bigint := group_require(p_gid, uid, 0);
  show_invites boolean := perms & (16 | 128) <> 0;
  with_email boolean := group_sees_emails(p_gid, uid);
  owner uuid;
begin
  select owner_id into owner from groups where id = p_gid;
  return jsonb_build_object(
    'group', (select jsonb_build_object('id', g.id, 'name', g.name, 'description', g.description,
                                        'owner_id', g.owner_id, 'created_at', g.created_at, 'encrypted', g.encrypted)
              from groups g where g.id = p_gid),
    'is_owner', owner = uid,
    'is_default', default_group_of(uid) is not distinct from p_gid,
    'owned_count', (select count(*) from groups g where g.owner_id = uid),
    'permissions', perms,
    'top_position', group_top_position(p_gid, uid),
    'roles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'name', r.name, 'color', r.color, 'position', r.position, 'permissions', r.permissions,
        'is_default', r.is_default,
        'member_count', case when r.is_default then (select count(*) from group_members m where m.group_id = p_gid)
                             else (select count(*) from group_member_roles mr where mr.role_id = r.id) end
      ) order by r.is_default, r.position desc, r.created_at)
      from group_roles r where r.group_id = p_gid
    ), '[]'::jsonb),
    'members', coalesce((
      select jsonb_agg(
        user_brief(m.user_id, with_email) || jsonb_build_object(
          'role_ids', coalesce((
            select jsonb_agg(mr.role_id order by r.position desc)
            from group_member_roles mr join group_roles r on r.id = mr.role_id
            where mr.group_id = p_gid and mr.user_id = m.user_id and not r.is_default
          ), '[]'::jsonb),
          'joined_at', m.joined_at,
          'is_owner', m.user_id = owner,
          'top_position', group_top_position(p_gid, m.user_id)
        ) order by (m.user_id = owner) desc, group_top_position(p_gid, m.user_id) desc, m.joined_at)
      from group_members m where m.group_id = p_gid
    ), '[]'::jsonb),
    'invites', case when show_invites then coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', i.code, 'created_by', user_brief(i.created_by, with_email), 'created_at', i.created_at,
        'expires_at', i.expires_at, 'max_uses', i.max_uses, 'uses', i.uses
      ) order by i.created_at desc)
      from group_invites i where i.group_id = p_gid and invite_invalid_reason(i) is null
    ), '[]'::jsonb) else '[]'::jsonb end,
    'email_invites', case when show_invites then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'email', e.email, 'invited_by', user_brief(e.invited_by, with_email), 'created_at', e.created_at
      ) order by e.created_at desc)
      from group_email_invites e where e.group_id = p_gid
    ), '[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;

-- 刪除群組（擁有者、全站 ADMINISTRATOR）：擁有者不能刪自己的預設群組、也不能刪唯一擁有的群組；
-- 管理員刪掉別人的預設群組時，幫擁有者把預設改到他擁有的另一個群組（沒有就建立「我的」）
create or replace function public.group_delete(gid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_gid uuid := group_delete.gid;
  g groups%rowtype;
begin
  select * into g from groups where id = p_gid;
  if g.id is null then
    raise exception '找不到這個群組';
  end if;
  if g.owner_id <> uid and site_permissions(uid) & 1 = 0 then
    raise exception '只有群組擁有者可以刪除群組';
  end if;
  if g.owner_id = uid then
    if default_group_of(uid) = p_gid then
      raise exception '這是你的預設群組，請先把其他群組設為預設再刪除';
    end if;
    if (select count(*) from groups x where x.owner_id = uid) <= 1 then
      raise exception '你至少要擁有一個群組，不能刪除唯一的群組';
    end if;
  end if;

  delete from groups where id = p_gid;

  if exists (select 1 from profiles p where p.id = g.owner_id and p.default_group_id = p_gid) then
    update profiles p
    set default_group_id = (select x.id from groups x where x.owner_id = g.owner_id order by x.created_at, x.id limit 1)
    where p.id = g.owner_id;
    perform ensure_default_group(g.owner_id);
  end if;

  perform audit(null, uid, 'group.delete', 'group', p_gid::text, jsonb_build_object('name', g.name, 'owner_id', g.owner_id));
end;
$$;

-- 轉移擁有權（只有擁有者）；新擁有者必須是成員。轉移的是自己的預設群組時，
-- 預設自動改到自己擁有的另一個群組（最早建立的），沒有就擋；新擁有者的預設不受影響
create or replace function public.group_transfer(gid uuid, new_owner uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_gid uuid := group_transfer.gid;
  p_new uuid := group_transfer.new_owner;
  alt uuid;
begin
  if not exists (select 1 from groups where id = p_gid) then
    raise exception '找不到這個群組';
  end if;
  if not exists (select 1 from groups where id = p_gid and owner_id = uid) then
    raise exception '只有群組擁有者可以轉移擁有權';
  end if;
  if p_new is null or p_new = uid then
    raise exception '請選擇其他成員';
  end if;
  if not group_is_member(p_gid, p_new) then
    raise exception '新擁有者必須是群組成員';
  end if;
  if exists (select 1 from groups where id = p_gid and encrypted) then
    raise exception '加密的群組不能轉移擁有權，請先關閉加密';
  end if;

  if exists (select 1 from profiles p where p.id = uid and p.default_group_id = p_gid) then
    select x.id into alt from groups x where x.owner_id = uid and x.id <> p_gid order by x.created_at, x.id limit 1;
    if alt is null then
      raise exception '這是你唯一擁有的群組，請先建立另一個群組再轉移';
    end if;
    update profiles set default_group_id = alt where id = uid;
  end if;

  update groups set owner_id = p_new where id = p_gid;
  perform audit(p_gid, uid, 'group.transfer', 'member', p_new::text,
                jsonb_build_object('name', display_name(p_new), 'group_name', (select name from groups where id = p_gid),
                                   'from', uid, 'to', p_new));
end;
$$;

-- ============================================================
-- 加密群組不能邀請
-- ============================================================

create or replace function public.group_assert_not_encrypted(p_gid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 共享鎖：和 group_set_encrypted 互斥（開啟加密時會檢查成員、撤銷邀請）
  perform 1 from groups g where g.id = p_gid and g.encrypted for share;
  if found then
    raise exception '加密的群組不能邀請其他人加入';
  end if;
end;
$$;

revoke execute on function public.group_assert_not_encrypted(uuid) from public, anon, authenticated;

-- 建立邀請連結：同 0010，加密的群組不行
create or replace function public.group_invite_create(gid uuid, expires_in_hours int, max_uses int)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_gid uuid := group_invite_create.gid;
  p_hours int := coalesce(group_invite_create.expires_in_hours, 168);
  p_max int := group_invite_create.max_uses;
  c text;
begin
  perform group_require(p_gid, uid, 16);
  perform group_assert_not_encrypted(p_gid);
  if p_hours <= 0 then
    raise exception '有效時間必須大於 0';
  end if;
  if p_hours > 720 then
    raise exception '有效時間最長 30 天';
  end if;
  if p_max is not null and p_max <= 0 then
    raise exception '使用次數必須大於 0';
  end if;
  c := new_invite_code();
  insert into group_invites (code, group_id, created_by, expires_at, max_uses)
  values (c, p_gid, uid, now() + make_interval(hours => p_hours), p_max);
  perform audit(p_gid, uid, 'group.invite.create', 'invite', c,
                jsonb_build_object('name', c, 'expires_in_hours', p_hours, 'max_uses', p_max));
  return c;
end;
$$;

-- 用邀請連結加入：同 0009，加密的群組不行
create or replace function public.group_join(code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  i group_invites%rowtype;
  reason text;
begin
  select * into i from group_invites x where x.code = trim(group_join.code) for update;
  if i.code is null then
    raise exception '找不到這個邀請連結';
  end if;
  if group_is_member(i.group_id, uid) then
    return i.group_id;
  end if;
  perform group_assert_not_encrypted(i.group_id);
  reason := invite_invalid_reason(i);
  if reason = 'revoked' then
    raise exception '這個邀請連結已被撤銷';
  elsif reason = 'expired' then
    raise exception '這個邀請連結已過期';
  elsif reason = 'used_up' then
    raise exception '這個邀請連結的使用次數已用完';
  end if;

  insert into group_members (group_id, user_id) values (i.group_id, uid) on conflict do nothing;
  update group_invites x set uses = x.uses + 1 where x.code = i.code;
  delete from group_email_invites e where e.group_id = i.group_id and e.email = user_email(uid);
  perform audit(i.group_id, uid, 'group.member.join', 'member', uid::text, jsonb_build_object('name', display_name(uid), 'code', i.code));
  return i.group_id;
end;
$$;

-- 用 Email 或 @ID 邀請：同 0009，加密的群組不行
create or replace function public.group_invite_user(gid uuid, target text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_gid uuid := group_invite_user.gid;
  t text := trim(coalesce(group_invite_user.target, ''));
  e text;
  target_uid uuid;
  via text;
  new_id uuid;
begin
  perform group_require(p_gid, uid, 16);
  perform group_assert_not_encrypted(p_gid);
  if t = '' then
    raise exception '請輸入 Email 或 @ID';
  end if;

  if t like '@%' or position('@' in t) = 0 then
    via := 'username';
    select p.id into target_uid from profiles p where p.username = username_normalize(t);
    if target_uid is null then
      raise exception '找不到這個 @ID';
    end if;
    e := user_email(target_uid);
    if e is null then
      raise exception '這位使用者沒有 Email，無法邀請';
    end if;
  else
    via := 'email';
    e := lower(t);
    if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'Email 格式不正確';
    end if;
  end if;

  if exists (
    select 1 from group_members m
    where m.group_id = p_gid and (m.user_id = target_uid or user_email(m.user_id) = e)
  ) then
    raise exception '對方已經是群組成員';
  end if;

  insert into group_email_invites (group_id, email, invited_by)
  values (p_gid, e, uid)
  on conflict (group_id, email) do nothing
  returning id into new_id;
  if new_id is not null then
    perform audit(p_gid, uid, 'group.invite.email', 'invite', new_id::text,
                  jsonb_build_object('name', case when via = 'username' then '@' || username_normalize(t) else e end,
                                     'email', e, 'via', via));
  end if;
end;
$$;

-- 回覆邀請：同 0009，接受時群組已加密就不能加入（邀請照樣刪除）
create or replace function public.respond_invitation(invite_id uuid, accept boolean)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  i group_email_invites%rowtype;
begin
  select * into i from group_email_invites x where x.id = respond_invitation.invite_id;
  if i.id is null or i.email is distinct from user_email(uid) then
    raise exception '找不到這個邀請';
  end if;
  delete from group_email_invites x where x.id = i.id;
  if not coalesce(respond_invitation.accept, false) then
    return null;
  end if;
  if not group_is_member(i.group_id, uid) then
    perform group_assert_not_encrypted(i.group_id);
    insert into group_members (group_id, user_id) values (i.group_id, uid) on conflict do nothing;
    perform audit(i.group_id, uid, 'group.member.join', 'member', uid::text,
                  jsonb_build_object('name', display_name(uid), 'via', 'email', 'invited_by', i.invited_by));
  end if;
  return i.group_id;
end;
$$;

-- ============================================================
-- 群組驗證碼：金鑰格式要和加密狀態一致；加密的群組不由伺服器產碼
-- ============================================================

create or replace function public.group_account_add(gid uuid, items jsonb)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_gid uuid := group_account_add.gid;
begin
  perform group_require(p_gid, uid, 8);
  return group_add_items(p_gid, group_account_add.items, uid);
end;
$$;

create or replace function public.group_account_update(account_id uuid, patch jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_account uuid := group_account_update.account_id;
  p_patch jsonb := group_account_update.patch;
  fields jsonb;
begin
  perform account_require(p_account, uid, 8);
  if jsonb_typeof(p_patch) = 'object' and p_patch ? 'secret' then
    perform group_assert_secret_format(account_group(p_account), array[coalesce(p_patch ->> 'secret', '')]);
  end if;
  perform totp_apply_patch(p_account, p_patch);
  select coalesce(jsonb_agg(k), '[]'::jsonb) into fields
  from jsonb_object_keys(case when jsonb_typeof(p_patch) = 'object' then p_patch else '{}'::jsonb end) k
  where k in ('name', 'category', 'secret', 'digits', 'period', 'algorithm', 'pinned');
  perform audit(account_group(p_account), uid, 'group.account.update', 'account', p_account::text,
                jsonb_build_object('name', (select name from totp_accounts where id = p_account), 'fields', fields));
end;
$$;

-- 清空群組裡我能管理（該筆有 MANAGE_CODES）的驗證碼（群組層級 MANAGE_CODES）；回傳刪除筆數
create or replace function public.group_accounts_clear(gid uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_gid uuid := group_accounts_clear.gid;
  n int;
begin
  perform group_require(p_gid, uid, 8);
  delete from totp_accounts a where a.group_id = p_gid and account_permissions(a.id, uid) & 8 <> 0;
  get diagnostics n = row_count;
  if n > 0 then
    perform audit(p_gid, uid, 'group.account.clear', 'group', p_gid::text,
                  jsonb_build_object('name', (select name from groups where id = p_gid), 'count', n));
  end if;
  return n;
end;
$$;

-- 呼叫者有 VIEW_CODES 的驗證碼 id（給 /api/groups/codes）；加密的群組回傳空陣列（金鑰是密文，由擁有者在瀏覽器解密產碼）
create or replace function public.group_codes_permitted(gid uuid)
returns uuid[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_gid uuid := group_codes_permitted.gid;
begin
  perform group_require(p_gid, uid, 0);
  if exists (select 1 from groups g where g.id = p_gid and g.encrypted) then
    return '{}';
  end if;
  return coalesce((
    select array_agg(a.id order by a.position, a.created_at, a.id)
    from totp_accounts a
    where a.group_id = p_gid and account_permissions(a.id, uid) & 2 <> 0
  ), '{}');
end;
$$;

-- ============================================================
-- 刪除帳號：只擋還擁有「有其他成員」的群組（只有自己的群組會跟著帳號刪除）
-- ============================================================

create or replace function public.can_delete_self()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  n bigint;
begin
  select count(*) into n from groups g
  where g.owner_id = uid
    and exists (select 1 from group_members m where m.group_id = g.id and m.user_id <> uid);
  if n > 0 then
    raise exception '你還是 % 個有其他成員的群組的擁有者，請先轉移擁有權或刪除群組', n;
  end if;
  if site_permissions(uid) & 1 <> 0 and site_admin_count() <= 1 then
    raise exception '你是最後一位管理員，請先把管理員身分組指派給其他人';
  end if;
  return true;
end;
$$;

create or replace function public.admin_can_delete_user(user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_target uuid := admin_can_delete_user.user_id;
begin
  perform site_require(uid, 8);
  if not exists (select 1 from profiles where id = p_target) then
    raise exception '找不到這位使用者';
  end if;
  if p_target = uid then
    raise exception '不能刪除自己的帳號（請到個人設定刪除帳號）';
  end if;
  if not site_can_manage_user(uid, p_target) then
    raise exception '只能管理比你目前最高身分組還低的身分組 / 成員';
  end if;
  if site_permissions(p_target) & 1 <> 0 and site_admin_count() <= 1 then
    raise exception '至少要保留一位擁有「管理員」權限的使用者';
  end if;
  if exists (
    select 1 from groups g
    where g.owner_id = p_target
      and exists (select 1 from group_members m where m.group_id = g.id and m.user_id <> p_target)
  ) then
    raise exception '這位使用者還擁有有其他成員的群組，請先轉移擁有權或刪除群組';
  end if;
  return true;
end;
$$;

-- ============================================================
-- 後台的使用者 2FA：改看使用者的預設群組
-- ============================================================

create or replace function public.admin_user_json(p_uid uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id,
    'email', coalesce(u.email, p.email),
    'name', p.name,
    'username', p.username,
    'photo_url', p.photo_url,
    'creation_time', coalesce(nullif(p.creation_time, ''), u.created_at::text),
    'last_login_at', p.last_login_at,
    'last_login_ip', p.last_login_ip,
    'last_login_device', p.last_login_device,
    'role_ids', coalesce((
      select jsonb_agg(ur.role_id order by r.position desc)
      from site_user_roles ur join site_roles r on r.id = ur.role_id
      where ur.user_id = p.id and not r.is_default
    ), '[]'::jsonb),
    'top_position', site_top_position(p.id),
    'totp_count', (select count(*) from totp_accounts a where a.group_id = default_group_of(p.id)),
    'vault_enabled', p.vault is not null
  )
  from profiles p
  left join auth.users u on u.id = p.id
  where p.id = p_uid;
$$;

revoke execute on function public.admin_user_json(uuid) from public, anon, authenticated;

create or replace function public.admin_user_totp(user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_target uuid := admin_user_totp.user_id;
  result jsonb;
begin
  perform site_require(uid, 16);
  if not exists (select 1 from profiles where id = p_target) then
    raise exception '找不到這位使用者';
  end if;
  if p_target <> uid and not site_can_manage_user(uid, p_target) then
    raise exception '只能管理比你目前最高身分組還低的身分組 / 成員';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'name', a.name, 'category', a.category, 'digits', a.digits, 'period', a.period,
    'algorithm', a.algorithm, 'pinned', a.pinned,
    'secret', case when coalesce(s.secret, '') like 'enc:v1:%' then null else coalesce(s.secret, '') end,
    'encrypted', coalesce(s.secret, '') like 'enc:v1:%'
  ) order by a.position, a.created_at, a.id), '[]'::jsonb)
  into result
  from totp_accounts a
  left join totp_secrets s on s.account_id = a.id
  where a.group_id = default_group_of(p_target);
  perform audit(null, uid, 'site.user.totp.view', 'user', p_target::text,
                jsonb_build_object('name', display_name(p_target), 'count', jsonb_array_length(result)));
  return result;
end;
$$;

create or replace function public.admin_update_user_totp(user_id uuid, item_id uuid, patch jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_target uuid := admin_update_user_totp.user_id;
  p_item uuid := admin_update_user_totp.item_id;
  p_patch jsonb := admin_update_user_totp.patch;
  gid uuid := default_group_of(admin_update_user_totp.user_id);
  fields jsonb;
begin
  perform site_require(uid, 32);
  if gid is null or not exists (select 1 from totp_accounts a where a.id = p_item and a.group_id = gid) then
    raise exception '找不到這筆驗證碼';
  end if;
  if p_target <> uid and not site_can_manage_user(uid, p_target) then
    raise exception '只能管理比你目前最高身分組還低的身分組 / 成員';
  end if;
  if jsonb_typeof(p_patch) = 'object' and p_patch ? 'secret' then
    if exists (select 1 from groups g where g.id = gid and g.encrypted) then
      raise exception '這位使用者的預設群組已加密，無法修改金鑰';
    end if;
    perform group_assert_secret_format(gid, array[coalesce(p_patch ->> 'secret', '')]);
  end if;
  perform totp_apply_patch(p_item, p_patch);
  select coalesce(jsonb_agg(k), '[]'::jsonb) into fields
  from jsonb_object_keys(case when jsonb_typeof(p_patch) = 'object' then p_patch else '{}'::jsonb end) k
  where k in ('name', 'category', 'secret', 'digits', 'period', 'algorithm', 'pinned');
  perform audit(null, uid, 'site.user.totp.update', 'user', p_target::text, jsonb_build_object(
    'name', display_name(p_target), 'item_id', p_item,
    'item_name', (select name from totp_accounts where id = p_item), 'fields', fields));
end;
$$;

create or replace function public.admin_delete_user_totp(user_id uuid, item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_target uuid := admin_delete_user_totp.user_id;
  p_item uuid := admin_delete_user_totp.item_id;
  a totp_accounts%rowtype;
begin
  perform site_require(uid, 32);
  select * into a from totp_accounts x where x.id = p_item and x.group_id = default_group_of(p_target);
  if a.id is null then
    raise exception '找不到這筆驗證碼';
  end if;
  if p_target <> uid and not site_can_manage_user(uid, p_target) then
    raise exception '只能管理比你目前最高身分組還低的身分組 / 成員';
  end if;
  delete from totp_accounts x where x.id = p_item;
  perform audit(null, uid, 'site.user.totp.delete', 'user', p_target::text,
                jsonb_build_object('name', display_name(p_target), 'item_id', p_item, 'item_name', a.name));
end;
$$;

-- ============================================================
-- RPC 權限
-- ============================================================
revoke execute on function public.totp_list() from public, anon;
revoke execute on function public.totp_add(jsonb) from public, anon;
revoke execute on function public.totp_update(text, jsonb) from public, anon;
revoke execute on function public.totp_delete(text) from public, anon;
revoke execute on function public.totp_clear() from public, anon;
revoke execute on function public.totp_reorder(text[]) from public, anon;
revoke execute on function public.totp_set_vault(jsonb, jsonb, text) from public, anon;
revoke execute on function public.vault_reset() from public, anon;
revoke execute on function public.group_set_encrypted(uuid, boolean, jsonb, text) from public, anon;
revoke execute on function public.group_set_default(uuid) from public, anon;
revoke execute on function public.group_create(text, text) from public, anon;
revoke execute on function public.my_groups() from public, anon;
revoke execute on function public.group_detail(uuid) from public, anon;
revoke execute on function public.group_delete(uuid) from public, anon;
revoke execute on function public.group_transfer(uuid, uuid) from public, anon;
revoke execute on function public.group_invite_create(uuid, int, int) from public, anon;
revoke execute on function public.group_join(text) from public, anon;
revoke execute on function public.group_invite_user(uuid, text) from public, anon;
revoke execute on function public.respond_invitation(uuid, boolean) from public, anon;
revoke execute on function public.group_account_add(uuid, jsonb) from public, anon;
revoke execute on function public.group_account_update(uuid, jsonb) from public, anon;
revoke execute on function public.group_accounts_clear(uuid) from public, anon;
revoke execute on function public.group_codes_permitted(uuid) from public, anon;
revoke execute on function public.can_delete_self() from public, anon;
revoke execute on function public.admin_can_delete_user(uuid) from public, anon;
revoke execute on function public.admin_user_totp(uuid) from public, anon;
revoke execute on function public.admin_update_user_totp(uuid, uuid, jsonb) from public, anon;
revoke execute on function public.admin_delete_user_totp(uuid, uuid) from public, anon;

grant execute on function public.totp_list() to authenticated;
grant execute on function public.totp_add(jsonb) to authenticated;
grant execute on function public.totp_update(text, jsonb) to authenticated;
grant execute on function public.totp_delete(text) to authenticated;
grant execute on function public.totp_clear() to authenticated;
grant execute on function public.totp_reorder(text[]) to authenticated;
grant execute on function public.totp_set_vault(jsonb, jsonb, text) to authenticated;
grant execute on function public.vault_reset() to authenticated;
grant execute on function public.group_set_encrypted(uuid, boolean, jsonb, text) to authenticated;
grant execute on function public.group_set_default(uuid) to authenticated;
grant execute on function public.group_create(text, text) to authenticated;
grant execute on function public.my_groups() to authenticated;
grant execute on function public.group_detail(uuid) to authenticated;
grant execute on function public.group_delete(uuid) to authenticated;
grant execute on function public.group_transfer(uuid, uuid) to authenticated;
grant execute on function public.group_invite_create(uuid, int, int) to authenticated;
grant execute on function public.group_join(text) to authenticated;
grant execute on function public.group_invite_user(uuid, text) to authenticated;
grant execute on function public.respond_invitation(uuid, boolean) to authenticated;
grant execute on function public.group_account_add(uuid, jsonb) to authenticated;
grant execute on function public.group_account_update(uuid, jsonb) to authenticated;
grant execute on function public.group_accounts_clear(uuid) to authenticated;
grant execute on function public.group_codes_permitted(uuid) to authenticated;
grant execute on function public.can_delete_self() to authenticated;
grant execute on function public.admin_can_delete_user(uuid) to authenticated;
grant execute on function public.admin_user_totp(uuid) to authenticated;
grant execute on function public.admin_update_user_totp(uuid, uuid, jsonb) to authenticated;
grant execute on function public.admin_delete_user_totp(uuid, uuid) to authenticated;
