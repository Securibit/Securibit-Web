-- ============================================================
-- 記錄最後登入資訊：時間 / IP / 裝置
-- ============================================================
alter table public.profiles
  add column if not exists last_login_at   timestamptz,
  add column if not exists last_login_ip   text,
  add column if not exists last_login_device text;
