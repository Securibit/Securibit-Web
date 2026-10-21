import { rpc, rpcVoid } from '@/lib/rpc';
import { Invitation, InviteInfo } from '@/types/Group/Group';

// 邀請連結的完整網址
export const inviteUrl = (code: string) =>
  typeof window === 'undefined' ? `/invite/${code}` : `${window.location.origin}/invite/${code}`;

// expiresInHours：最長 720（30 天），null 由資料庫預設 7 天；maxUses：null 代表不限次數
export const createInvite = (gid: string, expiresInHours: number | null, maxUses: number | null) =>
  rpc<string>('group_invite_create', { gid, expires_in_hours: expiresInHours, max_uses: maxUses });

export const revokeInvite = (code: string) => rpcVoid('group_invite_revoke', { code });

export const loadInviteInfo = (code: string) => rpc<InviteInfo>('group_invite_info', { code });

// 回傳加入的群組 id
export const joinGroup = (code: string) => rpc<string>('group_join', { code });

// target：email 或 @ID
export const inviteUser = (gid: string, target: string) =>
  rpcVoid('group_invite_user', { gid, target: target.trim() });

export const cancelEmailInvite = (inviteId: string) =>
  rpcVoid('group_email_invite_cancel', { invite_id: inviteId });

export const loadMyInvitations = async () => {
  const result = await rpc<Invitation[] | null>('my_invitations');
  return result.success ? { ...result, data: result.data ?? [] } : result;
};

// 接受時回傳群組 id，拒絕回傳 null
export const respondInvitation = (inviteId: string, accept: boolean) =>
  rpc<string | null>('respond_invitation', { invite_id: inviteId, accept });

export const INVITE_REASON_TEXT: Record<string, string> = {
  not_found: '找不到這個邀請連結',
  revoked: '這個邀請連結已被撤銷',
  expired: '這個邀請連結已過期',
  used_up: '這個邀請連結的使用次數已用完',
};
