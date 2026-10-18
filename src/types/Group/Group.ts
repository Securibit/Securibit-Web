import { Role, UserBrief } from "@/types/Permission/Permission";
import { TotpAlgorithm } from "@/types/Totp/Totp";

// my_groups() 的一筆
export interface GroupSummary {
  id: string;
  name: string;
  description: string;
  owner_id: string;
  is_owner: boolean;
  member_count: number;
  // 我看得到的驗證碼數
  account_count: number;
  // 我在這個群組的基礎權限（已展開）
  permissions: number;
}

export interface GroupInfo {
  id: string;
  name: string;
  description: string;
  owner_id: string;
  created_at: string;
}

export interface GroupMember extends UserBrief {
  role_ids: string[];
  joined_at: string;
  is_owner: boolean;
  top_position: number;
}

export interface GroupInvite {
  code: string;
  created_by: UserBrief | null;
  created_at: string;
  expires_at: string | null;
  max_uses: number | null;
  uses: number;
}

export interface GroupEmailInvite {
  id: string;
  email: string;
  invited_by: UserBrief | null;
  created_at: string;
}

// group_detail()
export interface GroupDetail {
  group: GroupInfo;
  is_owner: boolean;
  permissions: number;
  top_position: number;
  // 由高到低，@everyone 在最後
  roles: Role[];
  members: GroupMember[];
  invites: GroupInvite[];
  email_invites: GroupEmailInvite[];
}

// group_accounts() 的一筆（不含金鑰）
export interface GroupAccount {
  id: string;
  name: string;
  category: string;
  digits: number;
  period: number;
  algorithm: TotpAlgorithm;
  pinned: boolean;
  // 這一筆的有效權限
  permissions: number;
  has_overwrites: boolean;
}

// /api/groups/codes 的回傳
export interface GroupCodes {
  now: number;
  codes: Record<string, { code: string | null; next: string | null }>;
}

export type InviteInvalidReason = 'not_found' | 'revoked' | 'expired' | 'used_up';

export interface GroupBrief {
  id: string;
  name: string;
  description: string;
  member_count: number;
}

// group_invite_info()
export interface InviteInfo {
  valid: boolean;
  reason: InviteInvalidReason | null;
  group: GroupBrief | null;
  inviter: UserBrief | null;
  already_member: boolean;
}

// my_invitations() 的一筆
export interface Invitation {
  id: string;
  group: GroupBrief;
  invited_by: UserBrief | null;
  created_at: string;
}
