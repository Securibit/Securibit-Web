-- ============================================================
-- 登入時自我修復：確保使用者有 profile，並依 email 接回 Firestore 舊資料
-- 不依賴 auth.users 觸發器（該觸發器在 Supabase 常因權限不生效）
-- ============================================================

create or replace function public.ensure_profile()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  u auth.users%rowtype;
  legacy public.legacy_import%rowtype;
begin
  if uid is null then
    return;
  end if;
  if exists (select 1 from public.profiles where id = uid) then
    return;
  end if;

  select * into u from auth.users where id = uid;
  select * into legacy from public.legacy_import where email = u.email;

  insert into public.profiles (
    id, email, name, photo_url, bg_photo_url,
    email_verified, phone_number, creation_time, last_sign_in_time, totp, migrated
  )
  values (
    uid,
    u.email,
    coalesce(legacy.name, u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
    coalesce(legacy.photo_url, u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture'),
    coalesce(legacy.bg_photo_url, 'https://img.freepik.com/free-photo/abstract-luxury-plain-blur-grey-black-gradient-used-as-background-studio-wall-display-your-products_1258-63747.jpg?w=2000'),
    (u.email_confirmed_at is not null),
    coalesce(legacy.phone_number, ''),
    coalesce(u.created_at::text, ''),
    coalesce(u.last_sign_in_at::text, ''),
    coalesce(legacy.totp, '[]'::jsonb),
    (legacy.email is not null)
  )
  on conflict (id) do nothing;

  -- 舊資料一次性接回後刪除
  if legacy.email is not null then
    delete from public.legacy_import where email = u.email;
  end if;
end;
$$;

grant execute on function public.ensure_profile() to authenticated;
