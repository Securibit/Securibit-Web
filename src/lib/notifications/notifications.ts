import { rpc, rpcVoid } from '@/lib/rpc';
import { Result } from '@/types/Permission/Permission';
import {
  NotificationCategory,
  NotificationItem,
  NotificationPref,
  UnreadCounts,
} from '@/types/Notification/Notification';

// 自己的通知（收件匣）與通知設定

export const NOTIFICATION_PAGE_SIZE = 30;

export const loadNotifications = async (
  category: NotificationCategory | null,
  beforeId: number | null,
  limit = NOTIFICATION_PAGE_SIZE
): Promise<Result<NotificationItem[]>> => {
  const result = await rpc<NotificationItem[] | null>('notifications_list', {
    p_category: category,
    p_before: beforeId,
    p_limit: limit,
  });
  return result.success ? { success: true, data: result.data ?? [] } : result;
};

const EMPTY_COUNTS: UnreadCounts = { total: 0, system: 0, account: 0, feature: 0 };

export const loadUnreadCounts = async (): Promise<Result<UnreadCounts>> => {
  const result = await rpc<Partial<UnreadCounts> | null>('notifications_unread_counts');
  if (!result.success) return result;
  const data = { ...EMPTY_COUNTS, ...(result.data ?? {}) };
  return { success: true, data };
};

/** 標為已讀：ids 指定幾則；category 指定一類；都不給就是全部（兩個都給是交集） */
export const markNotificationsRead = (ids: number[] | null, category: NotificationCategory | null = null) =>
  rpcVoid('notifications_mark_read', { p_ids: ids, p_category: category });

/** 通知設定：每種一筆（已套用預設值），順序就是畫面顯示的順序 */
export const loadNotificationPrefs = async (): Promise<Result<NotificationPref[]>> => {
  const result = await rpc<NotificationPref[] | null>('notification_prefs_get');
  return result.success ? { success: true, data: result.data ?? [] } : result;
};

/** 改一種通知的開關（資料庫會合併到現有設定，並忽略不認得的種類與關掉重要公告的要求）；回傳最新的設定 */
export const setNotificationPref = async (type: string, enabled: boolean): Promise<Result<NotificationPref[]>> => {
  const result = await rpc<NotificationPref[] | null>('notification_prefs_set', { p_overrides: { [type]: enabled } });
  return result.success ? { success: true, data: result.data ?? [] } : result;
};

/**
 * 通知的連結只接受站內路徑：/ 開頭、不含 // 與 \（//example.com、/\example.com 會變成別的網站），和資料庫的規則一樣。
 * 資料庫已經擋過，這裡再擋一次，不合格就當作沒有連結
 */
export const safeNotificationLink = (link: string | null | undefined) => {
  if (!link || typeof link !== 'string') return null;
  if (!link.startsWith('/') || link.includes('//') || link.includes('\\')) return null;
  // 控制字元與空白
  if (Array.from(link).some((char) => char.charCodeAt(0) < 0x20 || char.trim() === '')) return null;
  return link;
};

/** 「3 分鐘前」這種相對時間；超過 7 天顯示日期 */
export const relativeTime = (value: string, now = Date.now()) => {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return '';
  const seconds = Math.max(0, Math.round((now - time) / 1000));
  if (seconds < 60) return '剛剛';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分鐘前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小時前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  const date = new Date(time);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return sameYear
    ? `${date.getMonth() + 1}月${date.getDate()}日`
    : `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
};
