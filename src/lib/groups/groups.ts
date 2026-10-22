import { callApi, rpc, rpcVoid } from '@/lib/rpc';
import { AddedMember, GroupAccount, GroupCodes, GroupDetail, GroupSummary } from '@/types/Group/Group';
import { AuditLog, Overwrite, OverwriteTargetType, Result, RoleInput } from '@/types/Permission/Permission';
import { TotpInput } from '@/types/Totp/Totp';
import { normalizeSecret } from '@/lib/totp/crud';
import { normalizeCategories } from '@/lib/totp/categories';
import { decryptText, encryptText, isEncrypted } from '@/lib/vault/crypto';

// ---------- 群組 ----------

export const createGroup = (name: string, description: string) =>
  rpc<string>('group_create', { name: name.trim(), description: description.trim() });

export const loadMyGroups = async () => {
  const result = await rpc<GroupSummary[] | null>('my_groups');
  return result.success ? { ...result, data: result.data ?? [] } : result;
};

export const loadGroupDetail = (gid: string) => rpc<GroupDetail>('group_detail', { gid });

export const updateGroup = (gid: string, name: string, description: string) =>
  rpcVoid('group_update', { gid, name: name.trim(), description: description.trim() });

export const deleteGroup = (gid: string) => rpcVoid('group_delete', { gid });

export const transferGroup = (gid: string, newOwner: string) =>
  rpcVoid('group_transfer', { gid, new_owner: newOwner });

export const leaveGroup = (gid: string) => rpcVoid('group_leave', { gid });

// 調整我的群組順序：ids 是我所在的全部群組（由上到下），只影響自己看到的順序
export const reorderMyGroups = (ids: string[]) => rpcVoid('my_groups_reorder', { ids });

// 設為我的預設群組（只能是自己擁有的群組）
export const setDefaultGroup = (gid: string) => rpcVoid('group_set_default', { gid });

/**
 * 開啟 / 關閉群組加密（只有擁有者）。secrets 要涵蓋群組全部驗證碼：開啟時是 enc:v1 密文、關閉時是明文。
 * expectedCheck：用來加解密的 vault.check，和資料庫不同（別的裝置改過密碼）會被拒絕。
 */
export const setGroupEncrypted = (gid: string, encrypted: boolean, secrets: Record<string, string>, expectedCheck: string) =>
  rpcVoid('group_set_encrypted', { gid, encrypted, secrets, expected_check: expectedCheck });

// ---------- 成員與身分組 ----------

export const kickMember = (gid: string, userId: string) => rpcVoid('group_kick', { gid, user_id: userId });

/**
 * 全站管理員（MANAGE_GROUPS / ADMINISTRATOR）直接把使用者加進群組，不用邀請；加入後只有 @everyone 的權限。
 * target：電子郵件、@ID（可帶 @）或使用者 ID
 */
export const addGroupMember = (gid: string, target: string) =>
  rpc<AddedMember>('group_add_member', { gid, target: target.trim() });

export const setMemberRoles = (gid: string, userId: string, roleIds: string[]) =>
  rpcVoid('group_set_member_roles', { gid, user_id: userId, role_ids: roleIds });

export const createGroupRole = (gid: string, input: RoleInput) =>
  rpc<string>('group_role_create', { gid, ...input, name: input.name.trim() });

export const updateGroupRole = (roleId: string, input: RoleInput) =>
  rpcVoid('group_role_update', { role_id: roleId, ...input, name: input.name.trim() });

export const deleteGroupRole = (roleId: string) => rpcVoid('group_role_delete', { role_id: roleId });

// roleIds：由高到低的完整順序（不含 @everyone）
export const reorderGroupRoles = (gid: string, roleIds: string[]) =>
  rpcVoid('group_roles_reorder', { gid, role_ids: roleIds });

// ---------- 驗證碼 ----------

export const loadGroupAccounts = async (gid: string) => {
  const result = await rpc<GroupAccount[] | null>('group_accounts', { gid });
  return result.success ? { ...result, data: result.data ?? [] } : result;
};

/*
 * key：加密群組用的金鑰（擁有者的 vault 解鎖後才有）。有給就先在瀏覽器把金鑰加密成 enc:v1 再送出；
 * 沒加密的群組不要給（資料庫會拒絕存入密文）。
 */
const encode = (secret: string, key?: CryptoKey) => (key ? encryptText(key, secret) : Promise.resolve(secret));

const cleanItem = async (input: TotpInput, key?: CryptoKey) => ({
  ...input,
  name: input.name.trim(),
  category: normalizeCategories(input.category),
  secret: await encode(normalizeSecret(input.secret), key),
});

export const addGroupAccounts = async (gid: string, inputs: TotpInput[], key?: CryptoKey) =>
  rpc<string[]>('group_account_add', { gid, items: await Promise.all(inputs.map((input) => cleanItem(input, key))) });

export const updateGroupAccount = async (accountId: string, patch: Partial<TotpInput>, key?: CryptoKey) => {
  const cleaned: Partial<TotpInput> = { ...patch };
  if (patch.name !== undefined) cleaned.name = patch.name.trim();
  if (patch.category !== undefined) cleaned.category = normalizeCategories(patch.category);
  if (patch.secret !== undefined) cleaned.secret = await encode(normalizeSecret(patch.secret), key);
  return rpcVoid('group_account_update', { account_id: accountId, patch: cleaned });
};

// 清空群組裡我能管理的驗證碼，回傳刪除筆數
export const clearGroupAccounts = (gid: string) => rpc<number>('group_accounts_clear', { gid });

export const deleteGroupAccount = (accountId: string) =>
  rpcVoid('group_account_delete', { account_id: accountId });

export const reorderGroupAccounts = (gid: string, ids: string[]) =>
  rpcVoid('group_accounts_reorder', { gid, ids });

// 調整類別順序（群組層級的「管理驗證碼」）：names 由前到後，回傳資料庫整理過的順序
export const setCategoryOrder = async (gid: string, names: string[]) => {
  const result = await rpc<string[] | null>('group_set_category_order', { gid, names });
  return result.success ? { ...result, data: result.data ?? [] } : result;
};

// 單筆金鑰（需要該筆的「查看金鑰」）
export const loadGroupAccountSecret = (accountId: string) =>
  rpc<string>('group_account_secret', { account_id: accountId });

// 我有「查看金鑰」的全部金鑰 { id: secret }。給 key 時（加密群組）把 enc:v1 密文解開；
// 解不開的（例如別的裝置用舊密碼寫入）保留原值，畫面會顯示金鑰錯誤
export const loadGroupAccountSecrets = async (gid: string, key?: CryptoKey) => {
  const result = await rpc<Record<string, string> | null>('group_account_secrets', { gid });
  if (!result.success) return result;
  const data = result.data ?? {};
  if (!key) return { ...result, data };
  const entries = await Promise.all(
    Object.entries(data).map(async ([id, secret]) => {
      if (!isEncrypted(secret)) return [id, secret] as const;
      try {
        return [id, await decryptText(key, secret)] as const;
      } catch {
        return [id, secret] as const;
      }
    })
  );
  return { ...result, data: Object.fromEntries(entries) };
};

// 只有「查看驗證碼」時，由伺服器產生動態碼（金鑰不會傳到瀏覽器）
export const loadGroupCodes = (gid: string) => callApi<GroupCodes>('/api/groups/codes', { groupId: gid });

// ---------- 權限覆寫 ----------

export const loadOverwrites = async (accountId: string) => {
  const result = await rpc<Overwrite[] | null>('group_account_overwrites', { account_id: accountId });
  return result.success ? { ...result, data: result.data ?? [] } : result;
};

// allow、deny 都是 0 代表刪除這筆覆寫
export const setOverwrite = (
  accountId: string,
  targetType: OverwriteTargetType,
  targetId: string,
  allow: number,
  deny: number
) =>
  rpcVoid('group_set_overwrite', {
    account_id: accountId,
    target_type: targetType,
    target_id: targetId,
    allow,
    deny,
  });

// ---------- 操作紀錄 ----------

export const loadGroupAuditLog = async (gid: string, beforeId: number | null, pageSize = 50) => {
  const result = await rpc<AuditLog[] | null>('group_audit_log', { gid, before_id: beforeId, page_size: pageSize });
  return result.success ? { ...result, data: result.data ?? [] } : result;
};
