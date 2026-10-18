import { supabase } from '@/config/supabase';
import { TOTP_DEFAULTS, TotpInput, TotpItem } from '@/types/Totp/Totp';
import { VaultInfo } from '@/types/Vault/Vault';
import { decodeItems, encodeSecret } from '@/lib/vault/codec';

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

/*
 * 以下函式的 key 是金鑰加密用的 CryptoKey（使用者有啟用加密才會有）：
 * 寫入前把金鑰加密，回傳的陣列解密後才交給畫面。沒有 key 就照原樣讀寫。
 * 資料存在 0008 migration 的 totp_accounts / totp_secrets，一律透過 RPC 讀寫（只動自己的資料）。
 * uid 參數保留是為了不改動呼叫端，實際身分以資料庫的 auth.uid() 為準。
 */

const decodeResult = async (result: TotpResult, key?: CryptoKey): Promise<TotpResult> =>
  result.success && key ? { success: true, data: await decodeItems(result.data, key) } : result;

// RPC 回傳 null：totp_update 代表找不到該筆，其他代表找不到使用者資料（未登入）
const NOT_FOUND_ITEM = '找不到這筆驗證碼，可能已在其他裝置刪除';
const NOT_FOUND_USER = '找不到使用者資料';
// 函式不存在（0008 migration 還沒執行）
const MISSING_MIGRATION = '資料庫還沒更新，請先在 Supabase 執行 0008_accounts.sql。';

/** 呼叫個人驗證碼的 RPC，在資料庫裡一次完成修改（兩個裝置同時操作也不會互蓋），回傳整個清單 */
const callRpc = async (
  fn: string,
  args: Record<string, unknown> = {},
  notFound = NOT_FOUND_USER
): Promise<TotpResult> => {
  const { data, error } = await supabase.rpc(fn, args);

  if (error?.code === 'PGRST202') return { success: false, message: MISSING_MIGRATION };
  if (error) return { success: false, message: error.message };
  if (data === null) return { success: false, message: notFound };
  return { success: true, data: data as TotpItem[] };
};

// 讀取資料庫裡的原始內容（金鑰可能是密文）
export const loadRawTotp = async (uid: string): Promise<TotpResult> => callRpc('totp_list');

// 讀取驗證碼
export const loadTotp = async (uid: string, key?: CryptoKey) => decodeResult(await loadRawTotp(uid), key);

// 修改時只整理有給的欄位（沒給的保留原值，例如編輯時不會動到釘選狀態）
const cleanPatch = (patch: Partial<TotpInput>): Partial<TotpInput> => {
  const cleaned: Partial<TotpInput> = { ...patch };
  if (patch.name !== undefined) cleaned.name = patch.name.trim();
  if (patch.secret !== undefined) cleaned.secret = normalizeSecret(patch.secret);
  if (patch.category !== undefined) cleaned.category = patch.category.trim();
  return cleaned;
};

// 新增一或多筆 TOTP
export const addTotps = async (uid: string, inputs: TotpInput[], key?: CryptoKey): Promise<TotpResult> => {
  const items = await Promise.all(
    inputs.map(async (input) => {
      const cleaned = cleanInput(input);
      return { id: crypto.randomUUID(), ...cleaned, secret: await encodeSecret(cleaned.secret, key) };
    })
  );
  return decodeResult(await callRpc('totp_add', { items }), key);
};

export const addTotp = (uid: string, input: TotpInput, key?: CryptoKey) => addTotps(uid, [input], key);

// 修改一筆 TOTP（只覆蓋 patch 裡有的欄位）
export const updateTotp = async (
  uid: string,
  id: string,
  patch: Partial<TotpInput>,
  key?: CryptoKey
): Promise<TotpResult> => {
  const cleaned = cleanPatch(patch);
  if (cleaned.secret !== undefined) cleaned.secret = await encodeSecret(cleaned.secret, key);

  const result = await callRpc('totp_update', { item_id: id, patch: cleaned }, NOT_FOUND_ITEM);
  return decodeResult(result, key);
};

// 刪除一筆 TOTP
export const deleteTotp = async (uid: string, id: string, key?: CryptoKey): Promise<TotpResult> =>
  decodeResult(await callRpc('totp_delete', { item_id: id }), key);

// 清空所有 TOTP
export const clearTotp = async (uid: string): Promise<TotpResult> => callRpc('totp_clear');

// 依 ids 順序重新排列（ids 裡沒有的接在最後）
export const reorderTotp = async (uid: string, ids: string[], key?: CryptoKey): Promise<TotpResult> =>
  decodeResult(await callRpc('totp_reorder', { ids }), key);

/**
 * 更新加密設定，並一次換掉多筆金鑰（啟用、改密碼、停用時用）。
 * secrets：{ 項目 id: 新的 secret }。
 */
export const saveVault = async (vault: VaultInfo | null, secrets: Record<string, string>): Promise<TotpResult> =>
  callRpc('totp_set_vault', { new_vault: vault, secrets });
