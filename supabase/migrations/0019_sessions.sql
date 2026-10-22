-- ============================================================
-- 已登入的裝置（0017 之後執行；0018 與這支無關，先後都可以）
-- 1. session_devices：App 記下「這個 session 是哪台裝置」（裝置名稱、平台、App 版本、最後使用時間）。
--    auth.sessions 只有 user_agent，App 的是 Dart 預設值（Dart/3.x (dart:io)），認不出是哪台；
--    網站不寫這張表，瀏覽器的 user_agent 由前端解析出系統與瀏覽器。
--    key 是 session_id（access token 的 session_id claim）。RLS：只能讀自己的、只能寫「目前這個 session」的那一列。
--    不對 auth.sessions 建外鍵（不依賴 auth schema 的 REFERENCES 權限）：session 被刪掉後留下的列
--    在 list_my_sessions 不會出現，下次寫入時由觸發器清掉。
-- 2. list_my_sessions()：自己所有登入中的 session（auth.sessions，過了 not_after 的不列），
--    附上 session_devices 的裝置資料與 current（是不是發出這個請求的 session）。目前的排第一，其餘依最後活動新到舊。
-- 3. revoke_my_session(session_id)：登出自己的某一個 session（目前的 session 不行，請直接登出）。
--    刪掉 auth.sessions 那一列時，auth.refresh_tokens（session_id → sessions.id on delete cascade）與
--    auth.mfa_amr_claims 會跟著刪掉，那台裝置下次換 token 會失敗而回到登入畫面；
--    已經發出去的 access token 仍可用到過期（預設 1 小時）。
--    「登出其他所有裝置」用 Auth API 的 signOut({ scope: 'others' })，不另外寫 RPC。
-- 4. 權限只給 authenticated。可重複執行。
-- ============================================================

-- ============================================================
-- 資料表
-- ============================================================

create table if not exists public.session_devices (
  session_id    uuid primary key default (nullif(auth.jwt() ->> 'session_id', '')::uuid),
  user_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  device_name   text check (char_length(device_name) <= 100),
  -- ios / android / macos / linux / windows
  platform      text check (char_length(platform) <= 32),
  app_version   text check (char_length(app_version) <= 32),
  created_at    timestamptz not null default now(),
  -- App 啟動、登入、換 token 時更新
  last_seen_at  timestamptz not null default now()
);
create index if not exists session_devices_user_idx on public.session_devices (user_id);

alter table public.session_devices enable row level security;

drop policy if exists "session_devices_select_own" on public.session_devices;
create policy "session_devices_select_own"
  on public.session_devices for select
  using (user_id = auth.uid());

-- 只能寫目前這個 session 的那一列（別的 session 的裝置資料改不到）
drop policy if exists "session_devices_insert_own" on public.session_devices;
create policy "session_devices_insert_own"
  on public.session_devices for insert
  with check (user_id = auth.uid() and session_id = (nullif(auth.jwt() ->> 'session_id', '')::uuid));

drop policy if exists "session_devices_update_own" on public.session_devices;
create policy "session_devices_update_own"
  on public.session_devices for update
  using (user_id = auth.uid() and session_id = (nullif(auth.jwt() ->> 'session_id', '')::uuid))
  with check (user_id = auth.uid() and session_id = (nullif(auth.jwt() ->> 'session_id', '')::uuid));

revoke all on table public.session_devices from anon, authenticated;
-- upsert（insert … on conflict do update）要 select、insert、update；刪除由 revoke_my_session 與觸發器處理
grant select, insert, update on table public.session_devices to authenticated;
grant select, insert, update, delete on table public.session_devices to service_role;

-- ============================================================
-- 內部 helper
-- ============================================================

-- 發出這個請求的 session（access token 的 session_id claim）；沒有時 null
create or replace function public.current_session_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(auth.jwt() ->> 'session_id', '')::uuid;
$$;

revoke execute on function public.current_session_id() from public, anon, authenticated;

-- 寫入裝置資料前，順便清掉這位使用者已經不存在的 session 留下的列（登出、被撤銷、過期被清掉）
create or replace function public.session_devices_cleanup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.session_devices d
  where d.user_id = new.user_id
    and d.session_id <> new.session_id
    and not exists (select 1 from auth.sessions s where s.id = d.session_id);
  return new;
end;
$$;

drop trigger if exists session_devices_cleanup on public.session_devices;
create trigger session_devices_cleanup
  before insert on public.session_devices
  for each row execute function public.session_devices_cleanup();

revoke execute on function public.session_devices_cleanup() from public, anon, authenticated;

-- ============================================================
-- RPC
-- ============================================================

-- 自己所有登入中的 session：
-- [{ id, created_at, updated_at, refreshed_at, last_active_at, user_agent, ip, aal, current,
--    device_name, platform, app_version }]
-- last_active_at：換 token、session 更新與 App 回報的最後使用時間取最新的
create or replace function public.list_my_sessions()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := public.require_uid();
  cur uuid := public.current_session_id();
begin
  return (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', x.id,
        'created_at', x.created_at,
        'updated_at', x.updated_at,
        'refreshed_at', x.refreshed_at,
        'last_active_at', x.last_active_at,
        'user_agent', x.user_agent,
        'ip', x.ip,
        'aal', x.aal,
        'current', x.is_current,
        'device_name', x.device_name,
        'platform', x.platform,
        'app_version', x.app_version
      ) order by x.is_current desc, x.last_active_at desc nulls last, x.created_at desc), '[]'::jsonb)
    from (
      select
        s.id,
        s.created_at,
        s.updated_at,
        -- refreshed_at 是不帶時區的 UTC 時間
        (s.refreshed_at at time zone 'UTC') as refreshed_at,
        greatest(s.created_at, s.updated_at, s.refreshed_at at time zone 'UTC', d.last_seen_at) as last_active_at,
        left(s.user_agent, 512) as user_agent,
        host(s.ip) as ip,
        s.aal::text as aal,
        coalesce(s.id = cur, false) as is_current,
        d.device_name,
        d.platform,
        d.app_version
      from auth.sessions s
      left join public.session_devices d on d.session_id = s.id and d.user_id = s.user_id
      where s.user_id = uid
        and (s.not_after is null or s.not_after > now())
    ) x
  );
end;
$$;

-- 登出自己的某一個 session（不能是目前的 session）
create or replace function public.revoke_my_session(session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.require_uid();
  target uuid := revoke_my_session.session_id;
begin
  if target is null then
    raise exception '找不到這個裝置';
  end if;
  if target = public.current_session_id() then
    raise exception '這是目前使用中的裝置，要登出請直接按「登出」';
  end if;

  -- refresh token 由外鍵 on delete cascade 一起刪掉
  delete from auth.sessions s where s.id = target and s.user_id = uid;
  if not found then
    raise exception '找不到這個裝置，可能已經登出了';
  end if;

  delete from public.session_devices d where d.session_id = target and d.user_id = uid;
end;
$$;

revoke execute on function public.list_my_sessions() from public, anon;
revoke execute on function public.revoke_my_session(uuid) from public, anon;
grant execute on function public.list_my_sessions() to authenticated;
grant execute on function public.revoke_my_session(uuid) to authenticated;
