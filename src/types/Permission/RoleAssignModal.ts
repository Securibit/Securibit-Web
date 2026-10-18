import { Actor } from "@/lib/permissions/hierarchy";
import { Result, Role } from "@/types/Permission/Permission";

// 指派身分組給某個使用者 / 成員
export interface RoleAssignModalProps {
  isOpen: boolean;
  onClose: () => void;
  // 例如「指派身分組給 @alice」
  title: string;
  // 全部身分組（含 @everyone，元件會自己排除）
  roles: Role[];
  // 目前擁有的身分組 id
  selected: string[];
  actor: Actor;
  // 送出完整的新身分組清單；成功後元件自己關閉
  onSave: (roleIds: string[]) => Promise<Result<null>>;
}
