// 全站身分組與群組身分組共用的格式（欄位對應 RPC 回傳的 snake_case）
export interface Role {
  id: string;
  name: string;
  // '#rrggbb' 或空字串（無顏色）
  color: string;
  // 越大越高；@everyone 是 0
  position: number;
  permissions: number;
  // @everyone
  is_default: boolean;
  member_count: number;
}

export type RoleBrief = Pick<Role, 'id' | 'name' | 'color' | 'position'>;

// 編輯身分組時送出的內容
export interface RoleInput {
  name: string;
  color: string;
  permissions: number;
}

// 使用者的基本資料（成員列表、邀請人、紀錄的操作者）
export interface UserBrief {
  id: string;
  name: string;
  username: string | null;
  photo_url: string | null;
  email?: string | null;
}

// 單筆驗證碼的權限覆寫
export type OverwriteTargetType = 'role' | 'member';

export interface Overwrite {
  target_type: OverwriteTargetType;
  target_id: string;
  allow: number;
  deny: number;
}

// 操作紀錄
export interface AuditLog {
  id: number;
  actor: UserBrief | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  detail: Record<string, unknown>;
  created_at: string;
  // 全站操作紀錄裡，網站管理員在某個群組查看金鑰的紀錄附上那個群組
  group?: { id: string; name: string } | null;
}

// lib 裡所有 RPC 包裝的回傳格式；code 是自己的 API route 給的錯誤代碼（例如 reauth_required）
export type Result<T> = { success: true; data: T } | { success: false; message: string; code?: string };
