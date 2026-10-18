import { supabase } from '@/config/supabase';
import { TOTP_DEFAULTS, TotpInput, TotpItem } from '@/types/Totp/Totp';

export type TotpResult =
  | { success: true; data: TotpItem[] }
  | { success: false; message: string };

// 正規化金鑰：去除空白與連字號、轉大寫、去掉結尾的 = 補位（許多 secret 是小寫或分組顯示）
export const normalizeSecret = (secret: string) =>
  secret.replace(/[\s-]/g, '').toUpperCase().replace(/=+$/, '');

// check if the input is a base32 string
export const isBase32 = (input: string) => {
  const regex = /^[A-Z2-7]+=*$/;
  return regex.test(input);
};

// 金鑰是否可用（正規化後為 Base32）
export const isValidSecret = (secret: string) => isBase32(normalizeSecret(secret));

// 存檔前整理欄位：去頭尾空白、正規化金鑰、沒填的進階參數補預設值
const cleanInput = (input: TotpInput): TotpInput => ({
  name: input.name.trim(),
  secret: normalizeSecret(input.secret),
  category: input.category.trim(),
  digits: input.digits ?? TOTP_DEFAULTS.digits,
  period: input.period ?? TOTP_DEFAULTS.period,
  algorithm: input.algorithm ?? TOTP_DEFAULTS.algorithm,
});

const readTotp = async (uid: string): Promise<TotpResult> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('totp')
    .eq('id', uid)
    .maybeSingle();

  if (error) {
    return { success: false, message: error.message };
  }
  if (!data) {
    return { success: false, message: '找不到使用者資料' };
  }
  return { success: true, data: (data.totp ?? []) as TotpItem[] };
};

const writeTotp = async (uid: string, items: TotpItem[]): Promise<TotpResult> => {
  const { error } = await supabase
    .from('profiles')
    .update({ totp: items, updated_at: new Date().toISOString() })
    .eq('id', uid);

  if (error) {
    return { success: false, message: error.message };
  }
  return { success: true, data: items };
};

// 讀取驗證碼；舊資料沒有 id 時補上並立即寫回（0005 migration 執行前接回的資料也能編輯 / 刪除）
export const loadTotp = async (uid: string): Promise<TotpResult> => {
  const result = await readTotp(uid);
  if (!result.success) return result;

  if (result.data.every((item) => item.id)) return result;

  const withIds = result.data.map((item) =>
    item.id ? item : { ...item, id: crypto.randomUUID() }
  );
  return writeTotp(uid, withIds);
};

// RPC 回傳 null：totp_update 代表找不到該筆，其他代表找不到使用者資料
const NOT_FOUND_ITEM = '找不到這筆驗證碼，可能已在其他裝置刪除';
const NOT_FOUND_USER = '找不到使用者資料';

/**
 * 呼叫 0006 migration 的 RPC，在資料庫裡一次完成修改（兩個裝置同時操作也不會互蓋）。
 * 函式還不存在（migration 尚未執行）時，退回舊的「讀出整個陣列 → 修改 → 寫回」。
 */
const callRpc = async (
  uid: string,
  fn: string,
  args: Record<string, unknown>,
  // 退回舊方法時：拿目前的陣列算出新陣列，回傳字串代表失敗訊息
  fallback: (items: TotpItem[]) => TotpItem[] | string,
  notFound = NOT_FOUND_USER
): Promise<TotpResult> => {
  const { data, error } = await supabase.rpc(fn, args);

  if (error?.code === 'PGRST202') {
    const result = await loadTotp(uid);
    if (!result.success) return result;
    const next = fallback(result.data);
    return typeof next === 'string' ? { success: false, message: next } : writeTotp(uid, next);
  }
  if (error) return { success: false, message: error.message };
  if (data === null) return { success: false, message: notFound };
  return { success: true, data: data as TotpItem[] };
};

// 修改時只整理有給的欄位（沒給的保留原值，例如編輯時不會動到釘選狀態）
const cleanPatch = (patch: Partial<TotpInput>): Partial<TotpInput> => {
  const cleaned: Partial<TotpInput> = { ...patch };
  if (patch.name !== undefined) cleaned.name = patch.name.trim();
  if (patch.secret !== undefined) cleaned.secret = normalizeSecret(patch.secret);
  if (patch.category !== undefined) cleaned.category = patch.category.trim();
  return cleaned;
};

// 新增一或多筆 TOTP
export const addTotps = async (uid: string, inputs: TotpInput[]): Promise<TotpResult> => {
  const items = inputs.map((input) => ({ id: crypto.randomUUID(), ...cleanInput(input) }));
  return callRpc(uid, 'totp_add', { items }, (current) => [...current, ...items]);
};

export const addTotp = (uid: string, input: TotpInput) => addTotps(uid, [input]);

// 修改一筆 TOTP（只覆蓋 patch 裡有的欄位）
export const updateTotp = async (
  uid: string,
  id: string,
  patch: Partial<TotpInput>
): Promise<TotpResult> => {
  const cleaned = cleanPatch(patch);
  return callRpc(
    uid,
    'totp_update',
    { item_id: id, patch: cleaned },
    (current) =>
      current.some((item) => item.id === id)
        ? current.map((item) => (item.id === id ? { ...item, ...cleaned } : item))
        : NOT_FOUND_ITEM,
    NOT_FOUND_ITEM
  );
};

// 刪除一筆 TOTP
export const deleteTotp = async (uid: string, id: string): Promise<TotpResult> =>
  callRpc(uid, 'totp_delete', { item_id: id }, (current) =>
    current.filter((item) => item.id !== id)
  );

// 清空所有 TOTP
export const clearTotp = async (uid: string): Promise<TotpResult> =>
  callRpc(uid, 'totp_clear', {}, () => []);

// 依 ids 順序重新排列（ids 裡沒有的接在最後）
export const reorderTotp = async (uid: string, ids: string[]): Promise<TotpResult> =>
  callRpc(uid, 'totp_reorder', { ids }, (current) => {
    const rank = new Map(ids.map((id, index) => [id, index]));
    return [...current].sort(
      (a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity)
    );
  });
