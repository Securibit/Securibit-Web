import { callApi, rpc, rpcVoid } from '@/lib/rpc';
import { GroupAccount, GroupCodes, GroupDetail, GroupSummary } from '@/types/Group/Group';
import { AuditLog, Overwrite, OverwriteTargetType, RoleInput } from '@/types/Permission/Permission';
import { TotpInput } from '@/types/Totp/Totp';
import { normalizeSecret } from '@/lib/totp/crud';
import { normalizeCategories } from '@/lib/totp/categories';

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

// ---------- 成員與身分組 ----------

export const kickMember = (gid: string, userId: string) => rpcVoid('group_kick', { gid, user_id: userId });

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

const cleanItem = (input: TotpInput) => ({
  ...input,
  name: input.name.trim(),
  category: normalizeCategories(input.category),
  secret: normalizeSecret(input.secret),
});

export const addGroupAccounts = (gid: string, inputs: TotpInput[]) =>
  rpc<string[]>('group_account_add', { gid, items: inputs.map(cleanItem) });

export const updateGroupAccount = (accountId: string, patch: Partial<TotpInput>) => {
  const cleaned: Partial<TotpInput> = { ...patch };
  if (patch.name !== undefined) cleaned.name = patch.name.trim();
  if (patch.category !== undefined) cleaned.category = normalizeCategories(patch.category);
  if (patch.secret !== undefined) cleaned.secret = normalizeSecret(patch.secret);
  return rpcVoid('group_account_update', { account_id: accountId, patch: cleaned });
};

export const deleteGroupAccount = (accountId: string) =>
  rpcVoid('group_account_delete', { account_id: accountId });

export const reorderGroupAccounts = (gid: string, ids: string[]) =>
  rpcVoid('group_accounts_reorder', { gid, ids });

// 單筆金鑰（需要該筆的「查看金鑰」）
export const loadGroupAccountSecret = (accountId: string) =>
  rpc<string>('group_account_secret', { account_id: accountId });

// 我有「查看金鑰」的全部金鑰 { id: secret }
export const loadGroupAccountSecrets = async (gid: string) => {
  const result = await rpc<Record<string, string> | null>('group_account_secrets', { gid });
  return result.success ? { ...result, data: result.data ?? {} } : result;
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
