import { BroadcastKind, BroadcastPlatform, NotificationCategory, NotificationType } from '@/types/Notification/Notification';

// 通知的種類：帳戶設定「通知」分頁每個開關的名稱與說明（預設值、能不能關以資料庫 notification_prefs_get() 為準，
// 這裡的 defaultOn / locked 只是讀不到時的備用，與 database/init.sql 的 notification_defaults() 一致）。
// 名稱與 App 的通知分頁一致；新增種類時資料庫、網站、App 一起改，見 docs/security-rules.md

export interface NotificationTypeDef {
  type: NotificationType;
  category: NotificationCategory;
  name: string;
  description: string;
  // 預設是否跳通知
  defaultOn: boolean;
  // 不能關（重要公告）
  locked?: boolean;
}

export const NOTIFICATION_CATEGORIES: { key: NotificationCategory; name: string }[] = [
  { key: 'system', name: '系統' },
  { key: 'account', name: '帳戶' },
  { key: 'feature', name: '功能' },
];

export const categoryName = (category: string) =>
  NOTIFICATION_CATEGORIES.find((item) => item.key === category)?.name ?? '其他';

export const NOTIFICATION_TYPES: NotificationTypeDef[] = [
  // 系統
  { type: 'announce_important', category: 'system', name: '重要公告', description: '影響帳戶安全或服務使用的重大事項，無法關閉', defaultOn: true, locked: true },
  { type: 'announce_update', category: 'system', name: '更新公告', description: '新版本與新功能', defaultOn: true },
  { type: 'announce_promo', category: 'system', name: '推廣', description: '活動與推廣訊息', defaultOn: true },
  { type: 'announce_other', category: 'system', name: '其他公告', description: '其他服務公告', defaultOn: true },
  // 帳戶
  { type: 'new_login', category: 'account', name: '新的登入', description: '你的帳戶在新的裝置登入時', defaultOn: true },
  { type: 'vault_changed', category: 'account', name: '金鑰加密密碼變更', description: '設定、變更或關閉金鑰加密的密碼時', defaultOn: true },
  { type: 'admin_changed_role', category: 'account', name: '管理員變更了我的網站身分組', description: '管理員在後台變更你的網站身分組時', defaultOn: true },
  { type: 'admin_changed_username', category: 'account', name: '管理員修改了我的 @ID', description: '管理員在後台修改或清除你的 @ID 時', defaultOn: true },
  { type: 'admin_changed_codes', category: 'account', name: '管理員修改了我的驗證碼', description: '管理員在後台修改或刪除你的驗證碼時', defaultOn: true },
  // 功能
  { type: 'group_invite', category: 'feature', name: '群組邀請', description: '有人用 Email 或 @ID 邀請你加入群組', defaultOn: true },
  { type: 'invite_answered', category: 'feature', name: '邀請被接受或拒絕', description: '你邀請的人接受或拒絕，或有人用你的邀請連結加入', defaultOn: true },
  { type: 'member_added', category: 'feature', name: '被加入群組', description: '有人直接把你加入群組', defaultOn: true },
  { type: 'member_removed', category: 'feature', name: '被移出群組', description: '你被移出群組時', defaultOn: true },
  { type: 'member_banned', category: 'feature', name: '被群組封鎖', description: '你被群組封鎖時', defaultOn: true },
  { type: 'group_roles_changed', category: 'feature', name: '群組身分組變更', description: '你在群組裡的身分組被變更或刪除時', defaultOn: true },
  { type: 'ownership_received', category: 'feature', name: '成為群組擁有者', description: '有人把群組轉移給你', defaultOn: true },
  { type: 'group_deleted', category: 'feature', name: '群組被刪除', description: '你所在的群組被刪除時', defaultOn: true },
  { type: 'group_encryption_changed', category: 'feature', name: '群組加密變更', description: '你所在的群組開啟或關閉加密時', defaultOn: true },
  { type: 'codes_changed', category: 'feature', name: '群組驗證碼有變動', description: '其他成員新增、修改或刪除你看得到的驗證碼時；短時間內的多筆變更合成一則', defaultOn: false },
];

export const notificationTypeDef = (type: string) => NOTIFICATION_TYPES.find((def) => def.type === type);

// ---------- 後台發送 ----------

export const BROADCAST_KINDS: { key: BroadcastKind; name: string; description: string }[] = [
  { key: 'important', name: '重要公告', description: '影響帳戶安全或服務使用的重大事項。使用者無法關閉，一律推播' },
  { key: 'update', name: '更新公告', description: '新版本與新功能' },
  { key: 'promo', name: '推廣', description: '活動與推廣訊息' },
  { key: 'other', name: '其他公告', description: '其他服務公告' },
];

export const broadcastKindName = (kind: string) => BROADCAST_KINDS.find((item) => item.key === kind)?.name ?? kind;

export const BROADCAST_PLATFORMS: { key: BroadcastPlatform; name: string }[] = [
  { key: 'ios', name: 'iOS' },
  { key: 'android', name: 'Android' },
  { key: 'macos', name: 'macOS' },
  { key: 'windows', name: 'Windows' },
  { key: 'linux', name: 'Linux' },
  { key: 'web', name: '只用網站' },
];

export const platformName = (platform: string) => BROADCAST_PLATFORMS.find((item) => item.key === platform)?.name ?? platform;

// 標題、內文、連結的長度上限（和資料庫一致）
export const TITLE_MAX = 100;
export const BODY_MAX = 500;
export const LINK_MAX = 500;
// 最低 App 版本的說明文字
export const MIN_VERSION_MESSAGE_MAX = 500;
