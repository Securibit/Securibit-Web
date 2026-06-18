-- ============================================================
-- Securibit-Web：Firebase → Supabase 初始 schema
-- 在 Supabase 後台 SQL Editor 執行，或用 supabase CLI 套用
-- ============================================================

-- 預設背景圖（沿用原 Firebase 邏輯）
-- 使用者個人資料表，主鍵對應 auth.users.id
create table if not exists public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  email              text,
  name               text,
  photo_url          text,
  bg_photo_url       text default 'https://img.freepik.com/free-photo/abstract-luxury-plain-blur-grey-black-gradient-used-as-background-studio-wall-display-your-products_1258-63747.jpg?w=2000',
  email_verified     boolean default false,
  phone_number       text default '',
  creation_time      text default '',
  last_sign_in_time  text default '',
  totp               jsonb not null default '[]'::jsonb,
  updated_at         timestamptz default now()
);

-- 從 Firestore 匯入的暫存資料，以 email 為對應鍵（Google uid 在 Supabase 會是全新 uuid）
create table if not exists public.legacy_import (
  email         text primary key,
  name          text,
  photo_url     text,
  bg_photo_url  text,
  phone_number  text,
  totp          jsonb not null default '[]'::jsonb
);

-- ---------- Row Level Security ----------
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

-- legacy_import 啟用 RLS 但不建任何 policy → 一般使用者（anon / authenticated）完全無法存取，
-- 只有 service_role 與 security definer 函式能讀取。
alter table public.legacy_import enable row level security;

-- ---------- Table 權限（GRANT）----------
-- 部分 Supabase 專案不會自動把表權限授予 API 角色，需明確授權。
-- profiles：登入使用者可讀寫（RLS 仍限制只能動自己那列）；service_role 完整權限。
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on table public.profiles to authenticated, service_role;
-- legacy_import：只有 service_role（匯入腳本）能存取，一般使用者不行。
grant select, insert, update, delete on table public.legacy_import to service_role;

-- ---------- 新使用者註冊時自動建立 profile，並依 email 接回 Firestore 舊資料 ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  legacy public.legacy_import%rowtype;
begin
  select * into legacy from public.legacy_import where email = new.email;

  insert into public.profiles (
    id, email, name, photo_url, bg_photo_url,
    email_verified, phone_number, creation_time, last_sign_in_time, totp
  )
  values (
    new.id,
    new.email,
    coalesce(legacy.name, new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(legacy.photo_url, new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'),
    coalesce(legacy.bg_photo_url, 'https://img.freepik.com/free-photo/abstract-luxury-plain-blur-grey-black-gradient-used-as-background-studio-wall-display-your-products_1258-63747.jpg?w=2000'),
    (new.email_confirmed_at is not null),
    coalesce(legacy.phone_number, ''),
    coalesce(new.created_at::text, ''),
    coalesce(new.last_sign_in_at::text, ''),
    coalesce(legacy.totp, '[]'::jsonb)
  )
  on conflict (id) do nothing;

  -- 舊資料一次性接回後即刪除，避免重複套用
  if legacy.email is not null then
    delete from public.legacy_import where email = new.email;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
