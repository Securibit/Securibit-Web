-- ============================================================
-- 讓「從 Firebase 搬過來的使用者」第一次登入時跳一次性提示
-- ============================================================

-- migrated：此帳號第一次登入時有接到 legacy_import 的舊資料
-- migration_notified：是否已經提示過（避免重複跳）
alter table public.profiles
  add column if not exists migrated boolean not null default false,
  add column if not exists migration_notified boolean not null default false;

-- 重新定義觸發器函式：接到舊資料時把 migrated 設為 true
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
    email_verified, phone_number, creation_time, last_sign_in_time, totp,
    migrated
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
    coalesce(legacy.totp, '[]'::jsonb),
    (legacy.email is not null)
  )
  on conflict (id) do nothing;

  if legacy.email is not null then
    delete from public.legacy_import where email = new.email;
  end if;

  return new;
end;
$$;
