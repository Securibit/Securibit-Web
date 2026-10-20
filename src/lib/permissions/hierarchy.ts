import { Role } from '@/types/Permission/Permission';

/*
 * 前端判斷「能不能管理」，只用來決定按鈕要不要顯示；真正的檢查在資料庫的 RPC。
 * 規則（Discord）：群組擁有者（或全站管理）、全站「最高位身分組的持有者」不受限；
 * 其他人（包含一般的全站 ADMINISTRATOR）只能管理 position 比自己最高身分組低的身分組與成員。
 */

export interface Actor {
  // 群組：擁有者 / 全站 ADMINISTRATOR / MANAGE_GROUPS；全站：最高位身分組的持有者（見 isSiteRoot）
  unrestricted: boolean;
  topPosition: number;
}

/**
 * 全站：是不是「最高位身分組的持有者」（同 SQL 的 site_is_root）。
 * 自己有身分組，而且沒有任何「有人持有」的身分組比自己的最高身分組還高。
 */
export const isSiteRoot = (topPosition: number, roles: Pick<Role, 'position' | 'is_default' | 'member_count'>[]) =>
  topPosition > 0 && !roles.some((role) => !role.is_default && role.member_count > 0 && role.position > topPosition);

/** 指派身分組時：新加入的身分組權限不能超過自己（permissions 是已展開的權限，管理員是全部） */
export const canGrantRole = (actorPermissions: number, role: Pick<Role, 'permissions'>) =>
  (role.permissions & ~actorPermissions) === 0;

/** 能不能編輯 / 刪除 / 指派這個身分組（@everyone 只能改權限，指派另外排除） */
export const canManageRole = (actor: Actor, role: Pick<Role, 'position' | 'is_default'>) =>
  actor.unrestricted || role.is_default || role.position < actor.topPosition;

/** 能不能管理這個成員（踢出、改身分組） */
export const canManageMember = (actor: Actor, member: { top_position: number; is_owner?: boolean }) =>
  !member.is_owner && (actor.unrestricted || member.top_position < actor.topPosition);

/** 使用者擁有的身分組中最高的 position（沒有就 0） */
export const topPositionOf = (roleIds: string[], roles: Pick<Role, 'id' | 'position'>[]) =>
  roles.reduce((top, role) => (roleIds.includes(role.id) ? Math.max(top, role.position) : top), 0);

/** 依 position 由高到低排序（@everyone 在最後） */
export const sortRoles = <T extends Pick<Role, 'position' | 'is_default'>>(roles: T[]) =>
  [...roles].sort((a, b) => Number(a.is_default) - Number(b.is_default) || b.position - a.position);
