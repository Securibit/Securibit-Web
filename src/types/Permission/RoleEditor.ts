import { PermissionDef } from "@/lib/permissions/bits";
import { Actor } from "@/lib/permissions/hierarchy";
import { Result, Role, RoleInput } from "@/types/Permission/Permission";

// Discord 式身分組編輯器（全站與群組共用）
export interface RoleEditorProps {
  // 由高到低，@everyone 在最後
  roles: Role[];
  // 要列出的權限（SITE_PERMISSIONS 或 GROUP_PERMISSIONS）
  definitions: PermissionDef[];
  actor: Actor;
  // 操作者自己擁有的權限（已展開）：只能開啟自己有的位元，ADMINISTRATOR 例外
  actorPermissions: number;
  // 有沒有「管理身分組」；沒有時整個編輯器唯讀
  canManage: boolean;
  onCreate: (input: RoleInput) => Promise<Result<string>>;
  onUpdate: (roleId: string, input: RoleInput) => Promise<Result<null>>;
  onDelete: (roleId: string) => Promise<Result<null>>;
  // roleIds：由高到低的完整順序（不含 @everyone）
  onReorder: (roleIds: string[]) => Promise<Result<null>>;
  // 任何修改成功後呼叫，讓外層重新載入
  onChanged: () => void | Promise<void>;
}
