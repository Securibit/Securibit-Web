// 一個登入中的 session（list_my_sessions，0019）
export interface SessionRecord {
  id: string;
  // 首次登入
  created_at: string | null;
  updated_at: string | null;
  refreshed_at: string | null;
  // 最後活動：換 token、session 更新與 App 回報的時間取最新的
  last_active_at: string | null;
  user_agent: string | null;
  ip: string | null;
  // aal1 / aal2
  aal: string | null;
  // 發出請求的這個 session（這台裝置）
  current: boolean;
  // App 回報的裝置資料（session_devices）；網站沒有
  device_name: string | null;
  // ios / android / macos / linux / windows
  platform: string | null;
  app_version: string | null;
}

// 列表上顯示的裝置資訊
export interface SessionDisplay {
  // 裝置名稱
  name: string;
  // 平台（系統）
  platform: string;
  // App／瀏覽器
  client: string;
}
