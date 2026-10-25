import { rpc, rpcVoid } from '@/lib/rpc';
import { Result } from '@/types/Permission/Permission';
import {
  AdminChangeNotify,
  BroadcastFilter,
  BroadcastKind,
  BroadcastPreview,
  BroadcastRecord,
  BroadcastResult,
  MinAppVersion,
  SiteSettings,
} from '@/types/Notification/Notification';

// 後台：發送通知與通知設定（權限在 RPC 裡檢查：發送與紀錄要「發送通知」，讀設定要「進入後台」，改設定要「管理使用者」）

export const previewBroadcast = (filter: BroadcastFilter) =>
  rpc<BroadcastPreview>('admin_broadcast_preview', { p_filter: filter });

export const sendBroadcast = (kind: BroadcastKind, title: string, body: string, link: string | null, filter: BroadcastFilter) =>
  rpc<BroadcastResult>('admin_broadcast_send', {
    p_kind: kind,
    p_title: title.trim(),
    p_body: body.trim(),
    p_link: link?.trim() || null,
    p_filter: filter,
  });

export const BROADCAST_PAGE_SIZE = 50;

export const loadBroadcasts = async (beforeId: number | null = null): Promise<Result<BroadcastRecord[]>> => {
  const result = await rpc<BroadcastRecord[] | null>('admin_broadcasts_list', { p_before: beforeId, p_limit: BROADCAST_PAGE_SIZE });
  return result.success ? { success: true, data: result.data ?? [] } : result;
};

const DEFAULT_ADMIN_NOTIFY: AdminChangeNotify = { role: true, username: true, codes: true };

export const loadSiteSettings = async (): Promise<Result<SiteSettings>> => {
  const result = await rpc<Partial<SiteSettings> | null>('admin_site_settings_get');
  if (!result.success) return result;
  const notify = result.data?.notify_admin_changes;
  const minVersion = result.data?.min_app_version;
  return {
    success: true,
    data: {
      notify_admin_changes: { ...DEFAULT_ADMIN_NOTIFY, ...(notify && typeof notify === 'object' ? notify : {}) },
      min_app_version:
        minVersion && typeof minVersion === 'object' && typeof minVersion.version === 'string'
          ? { version: minVersion.version, message: typeof minVersion.message === 'string' ? minVersion.message : '' }
          : null,
    },
  };
};

export const saveAdminChangeNotify = (value: AdminChangeNotify) =>
  rpcVoid('admin_site_settings_set', { p_key: 'notify_admin_changes', p_value: value });

/** null 表示清除（不限制版本） */
export const saveMinAppVersion = (value: MinAppVersion | null) =>
  rpcVoid('admin_site_settings_set', { p_key: 'min_app_version', p_value: value });

/** 版本號（semver）：1.5.0、1.5.0-beta.1；+build 也接受（比較時忽略） */
export const isValidVersion = (value: string) =>
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/.test(value.trim());
