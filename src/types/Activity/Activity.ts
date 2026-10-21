import { AuditLog } from "@/types/Permission/Permission";

// 一筆登入紀錄（my_login_history / admin_user_login_history，0014）
export interface LoginRecord {
  id: number;
  created_at: string;
  // 管理員管不到對方（階層不比對方高）時是 null
  ip: string | null;
  // 「OS · 瀏覽器」
  device: string | null;
  user_agent: string | null;
  // 登入方式：google / email
  provider: string | null;
}

// 一筆帳號操作紀錄（my_account_activity / admin_user_activity，0014）：audit_logs 的格式再加上所屬群組
export interface AccountActivity extends AuditLog {
  // 群組相關的事（加入 / 離開 / 被移出、群組加密）才有
  group: { id: string; name: string } | null;
}

// 看紀錄的人：本人（「你」）或後台管理員（「他」）
export type ActivityViewer = 'self' | 'admin';
