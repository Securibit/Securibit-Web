-- ============================================================
-- 每筆 TOTP 補上 id，讓編輯 / 刪除以 id 對應（原本以 secret 比對，同 secret 會一次刪多筆）
-- 前端讀取時也會補 id，此檔讓既有資料一次補齊；可重複執行
-- ============================================================

create or replace function public.totp_with_ids(items jsonb)
returns jsonb
language sql
volatile
as $$
  select coalesce(
    jsonb_agg(
      case when item ? 'id' then item
           else item || jsonb_build_object('id', gen_random_uuid())
      end
      order by ord
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(coalesce(items, '[]'::jsonb)) with ordinality as t(item, ord);
$$;

update public.profiles
set totp = public.totp_with_ids(totp)
where exists (select 1 from jsonb_array_elements(totp) e where not e ? 'id');

update public.legacy_import
set totp = public.totp_with_ids(totp)
where exists (select 1 from jsonb_array_elements(totp) e where not e ? 'id');

drop function public.totp_with_ids(jsonb);
