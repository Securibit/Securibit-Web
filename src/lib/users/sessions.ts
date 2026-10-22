import { supabase } from '@/config/supabase';
import { rpc, rpcVoid } from '@/lib/rpc';
import { parseUserAgent } from '@/lib/users/userAgent';
import { SessionDisplay, SessionRecord } from '@/types/Activity/Session';
import { Result } from '@/types/Permission/Permission';

// 已登入的裝置

// ---------- RPC ----------

export const loadMySessions = async (): Promise<Result<SessionRecord[]>> => {
  const result = await rpc<SessionRecord[] | null>('list_my_sessions');
  return result.success ? { success: true, data: result.data ?? [] } : result;
};

// 登出某一台裝置（不能是這台）
export const revokeMySession = async (sessionId: string) =>
  rpcVoid('revoke_my_session', { session_id: sessionId });

// 登出這台以外的所有裝置（Auth API，這台的 session 保留）
export const signOutOtherSessions = async (): Promise<Result<null>> => {
  const { error } = await supabase.auth.signOut({ scope: 'others' });
  return error ? { success: false, message: error.message } : { success: true, data: null };
};

// ---------- 顯示 ----------

// App 回報的平台（同 App 的 session_models.dart）
const PLATFORM_TEXT: Record<string, string> = {
  ios: 'iOS',
  android: 'Android',
  macos: 'macOS',
  linux: 'Linux',
  windows: 'Windows',
};

/**
 * 裝置名稱、平台、App／瀏覽器：
 * App 有回報裝置資料就用回報的；否則（網站、舊版 App）從 user-agent 解析
 */
export const sessionDisplay = (session: SessionRecord): SessionDisplay => {
  const ua = parseUserAgent(session.user_agent ?? '');
  if (session.platform || session.device_name || session.app_version) {
    const platform = session.platform ? (PLATFORM_TEXT[session.platform] ?? session.platform) : ua.os;
    return {
      name: session.device_name || platform,
      platform,
      client: session.app_version ? `Securibit App ${session.app_version}` : 'Securibit App',
    };
  }
  return { name: ua.device, platform: ua.os, client: ua.browser };
};
