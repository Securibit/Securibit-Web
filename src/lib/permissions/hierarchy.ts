import { Role } from '@/types/Permission/Permission';

/*
 * 前端判斷「能不能管理」，只用來決定按鈕要不要顯示；真正的檢查在資料庫的 RPC。
 * 規則（Discord）：擁有者 / 管理員不受限；其他人只能管理 position 比自己最高身分組低的身分組與成員。
 */

export interface Actor {
  // 擁有者（群組）或全站 ADMINISTRATOR：不受階層限制
  unrestricted: boolean;
  topPosition: number;
}

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
