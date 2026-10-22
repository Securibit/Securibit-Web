import { supabase } from '@/config/supabase';
import { Result } from '@/types/Permission/Permission';

// 函式不存在（migration 還沒執行）時的提示
const MISSING_FUNCTION = 'PGRST202';
const missingMessage = (fn: string) =>
  `資料庫還沒有「${fn}」功能，請先在 Supabase 執行 0008_accounts.sql 與 0009_groups_permissions.sql。`;

/** 呼叫 RPC，統一回傳 { success, data } / { success: false, message }（message 是資料庫給的中文訊息） */
export const rpc = async <T>(fn: string, args: Record<string, unknown> = {}): Promise<Result<T>> => {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    return { success: false, message: error.code === MISSING_FUNCTION ? missingMessage(fn) : error.message };
  }
  return { success: true, data: data as T };
};

/** 某個 migration 新增的函式還不存在時，把錯誤換成「請先執行哪個 migration」 */
export const withMigrationHint = <T>(fn: string, migration: string, result: Result<T>): Result<T> =>
  result.success || !result.message.includes(`「${fn}」`)
    ? result
    : { success: false, message: `資料庫還沒更新，請先在 Supabase 執行 ${migration}。` };

/** 不需要回傳值的 RPC */
export const rpcVoid = async (fn: string, args: Record<string, unknown> = {}): Promise<Result<null>> => {
  const result = await rpc<unknown>(fn, args);
  return result.success ? { success: true, data: null } : result;
};

/** 帶著目前的登入 token 呼叫自己的 API route */
export const callApi = async <T>(path: string, body: unknown): Promise<Result<T>> => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { success: false, message: '尚未登入' };

  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { success: false, message: json.message || `請求失敗（${res.status}）` };
    return { success: true, data: json as T };
  } catch {
    return { success: false, message: '無法連線到伺服器' };
  }
};
