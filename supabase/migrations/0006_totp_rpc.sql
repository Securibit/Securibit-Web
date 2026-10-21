-- ============================================================
-- TOTP 的新增 / 修改 / 刪除 / 排序改在資料庫裡一次完成
-- 原本前端「讀出整個陣列 → 修改 → 整個寫回」，兩個裝置同時操作時後寫的會蓋掉先寫的；
-- 單一 UPDATE 會鎖住該列並以最新內容計算，不會互相覆蓋。
-- security invoker：照樣套用 RLS，只能動自己那列。回傳更新後的整個陣列，查無資料回傳 null。
-- ============================================================

-- 新增（可一次多筆）：items 為 jsonb 陣列
create or replace function public.totp_add(items jsonb)
returns jsonb
language sql
security invoker
set search_path = public
as $$
  update public.profiles
  set totp = coalesce(totp, '[]'::jsonb) || items,
      updated_at = now()
  where id = auth.uid()
  returning totp;
$$;

-- 修改一筆：patch 的欄位覆蓋原本的值（沒給的欄位保留）；找不到該筆回傳 null
create or replace function public.totp_update(item_id text, patch jsonb)
returns jsonb
language sql
security invoker
set search_path = public
as $$
  update public.profiles
  set totp = (
        select coalesce(
          jsonb_agg(
            case when e.item ->> 'id' = item_id then e.item || patch else e.item end
            order by e.ord
          ),
          '[]'::jsonb
        )
        from jsonb_array_elements(totp) with ordinality as e(item, ord)
      ),
      updated_at = now()
  where id = auth.uid()
    and exists (select 1 from jsonb_array_elements(totp) as x(item) where x.item ->> 'id' = item_id)
  returning totp;
$$;

-- 刪除一筆
create or replace function public.totp_delete(item_id text)
returns jsonb
language sql
security invoker
set search_path = public
as $$
  update public.profiles
  set totp = (
        select coalesce(jsonb_agg(e.item order by e.ord), '[]'::jsonb)
        from jsonb_array_elements(totp) with ordinality as e(item, ord)
        where (e.item ->> 'id') is distinct from item_id
      ),
      updated_at = now()
  where id = auth.uid()
  returning totp;
$$;

-- 清空
create or replace function public.totp_clear()
returns jsonb
language sql
security invoker
set search_path = public
as $$
  update public.profiles
  set totp = '[]'::jsonb,
      updated_at = now()
  where id = auth.uid()
  returning totp;
$$;

-- 排序：依 ids 的順序重排；ids 裡沒有的（例如別的裝置剛新增的）依原順序接在最後
create or replace function public.totp_reorder(ids text[])
returns jsonb
language sql
security invoker
set search_path = public
as $$
  update public.profiles
  set totp = (
        select coalesce(
          jsonb_agg(e.item order by coalesce(o.ord, 1000000000 + e.ord)),
          '[]'::jsonb
        )
        from jsonb_array_elements(totp) with ordinality as e(item, ord)
        left join unnest(ids) with ordinality as o(id, ord) on o.id = e.item ->> 'id'
      ),
      updated_at = now()
  where id = auth.uid()
  returning totp;
$$;

revoke execute on function public.totp_add(jsonb) from public, anon;
revoke execute on function public.totp_update(text, jsonb) from public, anon;
revoke execute on function public.totp_delete(text) from public, anon;
revoke execute on function public.totp_clear() from public, anon;
revoke execute on function public.totp_reorder(text[]) from public, anon;

grant execute on function public.totp_add(jsonb) to authenticated;
grant execute on function public.totp_update(text, jsonb) to authenticated;
grant execute on function public.totp_delete(text) to authenticated;
grant execute on function public.totp_clear() to authenticated;
grant execute on function public.totp_reorder(text[]) to authenticated;
