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
  role_ids: string[];
  top_position: number;
  totp_count: number;
  vault_enabled: boolean;
}

export interface AdminUserDetail extends AdminUser {
  groups: { id: string; name: string; is_owner: boolean }[];
}

export interface AdminUserPage {
  total: number;
  users: AdminUser[];
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
