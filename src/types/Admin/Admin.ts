import { UserBrief } from "@/types/Permission/Permission";
import { TotpAlgorithm } from "@/types/Totp/Totp";

// admin_users() / admin_user() 的使用者
export interface AdminUser {
  id: string;
  email: string;
  name: string;
  username: string | null;
  photo_url: string | null;
  creation_time: string;
  last_login_at: string | null;
  last_login_ip: string | null;
  last_login_device: string | null;
  // 最後活動：這位使用者所有登入中裝置的最後活動取最新的；沒有登入中的裝置是 null（0020）
  last_active_at?: string | null;
  role_ids: string[];
  top_position: number;
  totp_count: number;
  vault_enabled: boolean;
  // 全站擁有者（只有擁有者自己能管理）
  is_owner?: boolean;
}

export interface AdminUserDetail extends AdminUser {
  groups: { id: string; name: string; is_owner: boolean }[];
}

export interface AdminUserPage {
  total: number;
  users: AdminUser[];
  // 全站擁有者的 id（還沒有擁有者時 null）
  site_owner_id?: string | null;
}

// admin_user_totp() 的一筆：已加密的 secret 是 null
export interface AdminTotpItem {
  id: string;
  name: string;
  category: string;
  digits: number;
  period: number;
  algorithm: TotpAlgorithm;
  pinned: boolean;
  secret: string | null;
  encrypted: boolean;
}

// admin_groups() 的一筆
export interface AdminGroup {
  id: string;
  name: string;
  description: string;
  owner: UserBrief | null;
  member_count: number;
  account_count: number;
  created_at: string;
}
