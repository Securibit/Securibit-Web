// 權限位元定義（與 docs/groups-and-permissions.md、database/init.sql 一致）
// 資料庫是 bigint，前端用 number；全站用到 bit 0～10、群組用到 bit 0～9，可以直接用位元運算

export interface PermissionDef {
  key: string;
  bit: number;
  name: string;
  description: string;
}

// ---------- 全站權限 ----------

export const SITE = {
  ADMINISTRATOR: 1,
  VIEW_ADMIN: 2,
  VIEW_USERS: 4,
  MANAGE_USERS: 8,
  VIEW_USER_TOTP: 16,
  MANAGE_USER_TOTP: 32,
  MANAGE_ROLES: 64,
  VIEW_AUDIT_LOG: 128,
  CREATE_GROUPS: 256,
  MANAGE_GROUPS: 512,
  SEND_NOTIFICATIONS: 1024,
} as const;

export const SITE_ALL = 2047;

export const SITE_PERMISSIONS: PermissionDef[] = [
  { key: 'ADMINISTRATOR', bit: SITE.ADMINISTRATOR, name: '管理員', description: '擁有所有全站權限。請只給信任的人。' },
  { key: 'VIEW_ADMIN', bit: SITE.VIEW_ADMIN, name: '進入後台', description: '可以開啟後台頁面。' },
  { key: 'VIEW_USERS', bit: SITE.VIEW_USERS, name: '查看使用者', description: '查看使用者列表與基本資料。' },
  { key: 'MANAGE_USERS', bit: SITE.MANAGE_USERS, name: '管理使用者', description: '修改使用者名稱與 @ID、刪除使用者。' },
  { key: 'VIEW_USER_TOTP', bit: SITE.VIEW_USER_TOTP, name: '查看使用者的 2FA', description: '查看使用者的金鑰與驗證碼（已啟用個人加密的看不到）。' },
  { key: 'MANAGE_USER_TOTP', bit: SITE.MANAGE_USER_TOTP, name: '管理使用者的 2FA', description: '修改、刪除使用者的驗證碼。' },
  { key: 'MANAGE_ROLES', bit: SITE.MANAGE_ROLES, name: '管理身分組', description: '建立、編輯、刪除身分組，並指派給使用者。只能管理比自己低的身分組。' },
  { key: 'VIEW_AUDIT_LOG', bit: SITE.VIEW_AUDIT_LOG, name: '查看操作紀錄', description: '查看全站的操作紀錄。' },
  { key: 'CREATE_GROUPS', bit: SITE.CREATE_GROUPS, name: '建立群組', description: '可以建立新的群組。' },
  { key: 'MANAGE_GROUPS', bit: SITE.MANAGE_GROUPS, name: '管理所有群組', description: '查看與管理所有群組，在任何群組內都擁有全部權限。' },
  { key: 'SEND_NOTIFICATIONS', bit: SITE.SEND_NOTIFICATIONS, name: '發送通知', description: '在後台發送公告與推廣通知給指定的使用者或裝置，包括無法關閉的重要公告。' },
];

// ---------- 群組權限 ----------

export const GROUP = {
  ADMINISTRATOR: 1,
  VIEW_CODES: 2,
  VIEW_SECRETS: 4,
  MANAGE_CODES: 8,
  CREATE_INVITE: 16,
  KICK_MEMBERS: 32,
  MANAGE_ROLES: 64,
  MANAGE_GROUP: 128,
  VIEW_AUDIT_LOG: 256,
  BAN_MEMBERS: 512,
} as const;

export const GROUP_ALL = 1023;

// 可以對單筆驗證碼覆寫的權限
export const GROUP_OVERWRITABLE = GROUP.VIEW_CODES | GROUP.VIEW_SECRETS | GROUP.MANAGE_CODES;

export const GROUP_PERMISSIONS: PermissionDef[] = [
  { key: 'ADMINISTRATOR', bit: GROUP.ADMINISTRATOR, name: '群組管理員', description: '擁有所有群組權限，驗證碼的權限覆寫對他無效。' },
  { key: 'VIEW_CODES', bit: GROUP.VIEW_CODES, name: '查看驗證碼', description: '看得到驗證碼與目前的動態碼，但拿不到金鑰。' },
  { key: 'VIEW_SECRETS', bit: GROUP.VIEW_SECRETS, name: '查看金鑰', description: '查看、匯出金鑰（等於可以把驗證碼複製到自己的手機）。' },
  { key: 'MANAGE_CODES', bit: GROUP.MANAGE_CODES, name: '管理驗證碼', description: '新增、編輯、刪除、排序群組的驗證碼。' },
  { key: 'CREATE_INVITE', bit: GROUP.CREATE_INVITE, name: '邀請成員', description: '建立邀請連結，或用 Email / @ID 邀請別人。' },
  { key: 'KICK_MEMBERS', bit: GROUP.KICK_MEMBERS, name: '移除成員', description: '把成員移出群組。只能移除身分組比自己低的成員。' },
  { key: 'MANAGE_ROLES', bit: GROUP.MANAGE_ROLES, name: '管理身分組', description: '建立、編輯、指派身分組，並設定單筆驗證碼的權限。只能管理比自己低的身分組。' },
  { key: 'MANAGE_GROUP', bit: GROUP.MANAGE_GROUP, name: '管理群組', description: '修改群組名稱與說明、撤銷別人建立的邀請。' },
  { key: 'VIEW_AUDIT_LOG', bit: GROUP.VIEW_AUDIT_LOG, name: '查看操作紀錄', description: '查看這個群組的操作紀錄。' },
  { key: 'BAN_MEMBERS', bit: GROUP.BAN_MEMBERS, name: '封鎖成員', description: '封鎖或解除封鎖使用者，被封鎖的人無法再透過邀請加入。只能封鎖身分組比自己低的成員。' },
];

export const GROUP_OVERWRITE_PERMISSIONS = GROUP_PERMISSIONS.filter((p) => (p.bit & GROUP_OVERWRITABLE) !== 0);

// ---------- 工具 ----------

/** 是否擁有某個權限（ADMINISTRATOR 一律通過；兩邊的 ADMINISTRATOR 都是 1） */
export const has = (mask: number, bit: number) => (mask & 1) !== 0 || (mask & bit) === bit;

/** 擁有其中任一個權限 */
export const hasAny = (mask: number, bits: number[]) => bits.some((bit) => has(mask, bit));

export const toggleBit = (mask: number, bit: number, on: boolean) => (on ? mask | bit : mask & ~bit);

/** 已開啟的權限數 */
export const countBits = (mask: number, defs: PermissionDef[]) =>
  defs.filter((def) => (mask & def.bit) !== 0).length;

export const permissionName = (defs: PermissionDef[], bit: number) =>
  defs.find((def) => def.bit === bit)?.name ?? String(bit);
