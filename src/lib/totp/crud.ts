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

// add TOTP item
export const addTotp = async (uid: string, input: TotpInput): Promise<TotpResult> => {
  const result = await loadTotp(uid);
  if (!result.success) return result;

  return writeTotp(uid, [...result.data, { id: crypto.randomUUID(), ...cleanInput(input) }]);
};

// Update TOTP item
export const updateTotp = async (uid: string, id: string, input: TotpInput): Promise<TotpResult> => {
  const result = await loadTotp(uid);
  if (!result.success) return result;

  if (!result.data.some((item) => item.id === id)) {
    return { success: false, message: '找不到這筆驗證碼，可能已在其他裝置刪除' };
  }
  return writeTotp(
    uid,
    result.data.map((item) => (item.id === id ? { id, ...cleanInput(input) } : item))
  );
};

// Delete TOTP item
export const deleteTotp = async (uid: string, id: string): Promise<TotpResult> => {
  const result = await loadTotp(uid);
  if (!result.success) return result;

  return writeTotp(uid, result.data.filter((item) => item.id !== id));
};

// Clear TOTP items
export const clearTotp = async (uid: string): Promise<TotpResult> => writeTotp(uid, []);
