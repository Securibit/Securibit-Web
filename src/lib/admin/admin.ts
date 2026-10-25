import { callApi, rpc, rpcVoid } from '@/lib/rpc';
import { AdminGroup, AdminTotpItem, AdminUserDetail, AdminUserPage } from '@/types/Admin/Admin';
import { AuditLog, Result, Role, RoleInput } from '@/types/Permission/Permission';
import { SessionRecord } from '@/types/Activity/Session';
import { TotpInput } from '@/types/Totp/Totp';
import { normalizeSecret } from '@/lib/totp/crud';
import { normalizeCategories } from '@/lib/totp/categories';

// ---------- 使用者 ----------

export const loadAdminUsers = (search: string, offset: number, pageSize: number) =>
  rpc<AdminUserPage>('admin_users', { search: search.trim() || null, page_offset: offset, page_size: pageSize });

export const loadAdminUser = (userId: string) => rpc<AdminUserDetail>('admin_user', { user_id: userId });

// name / username：null 代表不改；username 空字串代表清除
export const updateAdminUser = (userId: string, name: string | null, username: string | null) =>
  rpcVoid('admin_update_user', { user_id: userId, name, username });

// 全站擁有者的使用者 id（需要「進入後台」；還沒有擁有者時 null）
export const loadSiteOwner = () => rpc<string | null>('site_owner');

export const deleteAdminUser = (userId: string) => callApi<{ success: true }>('/api/admin/delete-user', { userId });

// 使用者已登入的裝置（只能看，current 一律是 false）
export const loadAdminUserSessions = async (userId: string): Promise<Result<SessionRecord[]>> => {
  const result = await rpc<SessionRecord[] | null>('admin_user_sessions', { user_id: userId });
  return result.success ? { success: true, data: result.data ?? [] } : result;
};

// ---------- 使用者的 2FA ----------

export const loadAdminUserTotp = async (userId: string) => {
  const result = await rpc<AdminTotpItem[] | null>('admin_user_totp', { user_id: userId });
  return result.success ? { ...result, data: result.data ?? [] } : result;
};

export const updateAdminUserTotp = (userId: string, itemId: string, patch: Partial<TotpInput>) => {
  const cleaned: Partial<TotpInput> = { ...patch };
  if (patch.name !== undefined) cleaned.name = patch.name.trim();
  if (patch.category !== undefined) cleaned.category = normalizeCategories(patch.category);
  if (patch.secret !== undefined) cleaned.secret = normalizeSecret(patch.secret);
  return rpcVoid('admin_update_user_totp', { user_id: userId, item_id: itemId, patch: cleaned });
};

export const deleteAdminUserTotp = (userId: string, itemId: string) =>
  rpcVoid('admin_delete_user_totp', { user_id: userId, item_id: itemId });

// ---------- 全站身分組 ----------

export const loadSiteRoles = async () => {
  const result = await rpc<Role[] | null>('site_roles_list');
  return result.success ? { ...result, data: result.data ?? [] } : result;
};

export const createSiteRole = (input: RoleInput) => rpc<string>('site_role_create', { ...input, name: input.name.trim() });

export const updateSiteRole = (roleId: string, input: RoleInput) =>
  rpcVoid('site_role_update', { role_id: roleId, ...input, name: input.name.trim() });

export const deleteSiteRole = (roleId: string) => rpcVoid('site_role_delete', { role_id: roleId });

// roleIds：由高到低的完整順序（不含 @everyone）
export const reorderSiteRoles = (roleIds: string[]) => rpcVoid('site_roles_reorder', { role_ids: roleIds });

export const setUserSiteRoles = (userId: string, roleIds: string[]) =>
  rpcVoid('site_set_user_roles', { user_id: userId, role_ids: roleIds });

// ---------- 群組與紀錄 ----------

export const loadAdminGroups = async (search: string) => {
  const result = await rpc<AdminGroup[] | null>('admin_groups', { search: search.trim() || null });
  return result.success ? { ...result, data: result.data ?? [] } : result;
};

export const loadAdminAuditLog = async (beforeId: number | null, pageSize = 50) => {
  const result = await rpc<AuditLog[] | null>('admin_audit_log', { before_id: beforeId, page_size: pageSize });
  return result.success ? { ...result, data: result.data ?? [] } : result;
};
