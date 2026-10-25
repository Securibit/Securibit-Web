import { UserBrief } from '@/types/Permission/Permission';

// 通知（notifications_list 等 RPC，見 database/init.sql 的通知段落）

export type NotificationCategory = 'system' | 'account' | 'feature';

// 通知的種類；新增種類時，lib/notifications/types.ts 的 NOTIFICATION_TYPES 也要加
export type NotificationType =
  | 'announce_important'
  | 'announce_update'
  | 'announce_promo'
  | 'announce_other'
  | 'new_login'
  | 'vault_changed'
  | 'admin_changed_role'
  | 'admin_changed_username'
  | 'admin_changed_codes'
  | 'group_invite'
  | 'invite_answered'
  | 'member_added'
  | 'member_removed'
  | 'member_banned'
  | 'group_roles_changed'
  | 'ownership_received'
  | 'group_deleted'
  | 'group_encryption_changed'
  | 'codes_changed';

// 一則通知；標題與內文由資料庫產生，直接顯示
export interface NotificationItem {
  id: number;
  category: NotificationCategory;
  // 舊網站不認得的新種類也照樣顯示，所以用 string
  type: string;
  title: string;
  body: string;
  // 站內路徑（/ 開頭）；沒有就不能點開
  link: string | null;
  // group_id、actor_id、count 等；網站不需要用到
  data?: Record<string, unknown> | null;
  // codes_changed 合併時會更新成最後一次
  created_at: string;
  read_at: string | null;
  // pending | sending | sent | skipped（skipped = 使用者關掉了這種通知）
  push_state?: string;
}

// notifications_unread_counts()
export interface UnreadCounts {
  total: number;
  system: number;
  account: number;
  feature: number;
}

// 通知面板的分頁
export type NotificationTab = 'all' | NotificationCategory;

// notification_prefs_get() 的一筆；順序就是設定頁顯示的順序
export interface NotificationPref {
  type: string;
  category: NotificationCategory;
  enabled: boolean;
  default: boolean;
  // 不能關（重要公告）
  locked: boolean;
}

// ---------- 後台：發送通知 ----------

export type BroadcastKind = 'important' | 'update' | 'promo' | 'other';

export type BroadcastPlatform = 'ios' | 'android' | 'macos' | 'linux' | 'windows' | 'web';

// 發送對象的條件（全部可選，同時符合才算）
export interface BroadcastFilter {
  all_users?: boolean;
  user_ids?: string[];
  site_role_ids?: string[];
  platforms?: BroadcastPlatform[];
  session_ids?: string[];
  version_min?: string;
  version_max?: string;
  last_seen_days?: number;
}

// admin_broadcast_preview()
export interface BroadcastPreview {
  users: number;
  // 會收到的登入中的 App 裝置數（網站沒有裝置數）
  devices: number;
  // 其中收得到推播的裝置數
  push_devices: number;
  // 一次最多的人數
  limit?: number;
}

// admin_broadcast_send() 的結果
export interface BroadcastResult {
  broadcast_id: number;
  users: number;
  devices: number;
  push_devices: number;
}

// admin_broadcasts_list() 的一筆
export interface BroadcastRecord {
  id: number;
  kind: BroadcastKind;
  title: string;
  body: string;
  link: string | null;
  filter: BroadcastFilter;
  // email 只給有「查看使用者」權限的人
  created_by: UserBrief | null;
  created_at: string;
  user_count: number;
  device_count: number;
  // 送出推播的裝置數
  push_count?: number;
}

// ---------- 後台：通知設定 ----------

// 後台修改帳號時是否通知本人
export interface AdminChangeNotify {
  role: boolean;
  username: boolean;
  codes: boolean;
}

// 最低 App 版本（低於它的 App 會被要求強制更新）
export interface MinAppVersion {
  version: string;
  message: string;
}

// admin_site_settings_get()
export interface SiteSettings {
  notify_admin_changes: AdminChangeNotify;
  min_app_version: MinAppVersion | null;
}
