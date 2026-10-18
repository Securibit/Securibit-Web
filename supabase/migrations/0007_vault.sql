-- ============================================================
-- 金鑰加密（使用者自行啟用）
-- vault：加密設定 { v, salt, iterations, check }，null 代表未啟用。
--   金鑰在瀏覽器裡用使用者的密碼加密後才存進 totp[].secret（格式 enc:v1:<iv>:<密文>），
--   資料庫只看得到密文；密碼本身不會送到伺服器。
-- ============================================================

alter table public.profiles
  add column if not exists vault jsonb;

-- 一次更新 vault 與多筆金鑰（啟用、改密碼、停用時重新加密 / 解密）
-- secrets：{ "<item id>": "<新的 secret>" }；不在裡面的項目維持原樣
create or replace function public.totp_set_vault(new_vault jsonb, secrets jsonb)
returns jsonb
language sql
security invoker
set search_path = public
as $$
  update public.profiles
  set vault = nullif(new_vault, 'null'::jsonb),
      totp = (
        select coalesce(
          jsonb_agg(
            case when secrets ? (e.item ->> 'id')
                 then jsonb_set(e.item, '{secret}', secrets -> (e.item ->> 'id'))
                 else e.item
            end
            order by e.ord
          ),
          '[]'::jsonb
        )
        from jsonb_array_elements(totp) with ordinality as e(item, ord)
      ),
      updated_at = now()
  where id = auth.uid()
  returning totp;
$$;

revoke execute on function public.totp_set_vault(jsonb, jsonb) from public, anon;
grant execute on function public.totp_set_vault(jsonb, jsonb) to authenticated;
