import { supabase } from '@/config/supabase';
import { TotpItem } from '@/types/Totp/Totp';
import { VaultInfo } from '@/types/Vault/Vault';

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

/*
 * 0011 起「我的驗證碼」是一個群組（預設群組），新增、修改、刪除、排序一律走群組的 RPC（src/lib/groups/groups.ts）。
 * 這裡只剩加密設定（profiles.vault）的 RPC；舊的 totp_* RPC 在資料庫保留給舊版頁面相容，前端不再使用。
 */

// 函式不存在（資料庫還沒更新）
const MISSING_MIGRATION = '資料庫還沒更新，請照最新的 database/init.sql 更新 Supabase。';

/**
 * 更新加密設定，並一次換掉多筆金鑰（設定密碼、改密碼、停用時用）。
 * secrets：{ 驗證碼 id: 新的 secret }；加密設定有變時要涵蓋「我擁有且已加密的群組」的全部驗證碼。
 * 停用（vault 為 null）時那些群組一起改成沒加密。
 * expectedCheck：送出前畫面上的 vault.check（未啟用為 null）；和資料庫不同代表別的裝置改過，資料庫會拒絕。
 */
export const saveVault = async (
  vault: VaultInfo | null,
  secrets: Record<string, string>,
  expectedCheck: string | null
): Promise<TotpResult> => {
  const { data, error } = await supabase.rpc('totp_set_vault', { new_vault: vault, secrets, expected_check: expectedCheck });
  if (error?.code === 'PGRST202') return { success: false, message: MISSING_MIGRATION };
  if (error) return { success: false, message: error.message };
  if (data === null) return { success: false, message: '找不到使用者資料' };
  return { success: true, data: data as TotpItem[] };
};

// 忘記加密密碼：清空我擁有且已加密的群組裡的驗證碼，那些群組改成沒加密，並停用加密
export const resetVault = async (): Promise<{ success: true } | { success: false; message: string }> => {
  const { error } = await supabase.rpc('vault_reset');
  if (error?.code === 'PGRST202') return { success: false, message: MISSING_MIGRATION };
  if (error) return { success: false, message: error.message };
  return { success: true };
};
