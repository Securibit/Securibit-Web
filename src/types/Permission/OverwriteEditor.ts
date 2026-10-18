import { Actor } from "@/lib/permissions/hierarchy";
import { GroupAccount, GroupMember } from "@/types/Group/Group";
import { Role } from "@/types/Permission/Permission";

// 單筆驗證碼的權限覆寫（Discord 頻道權限），元件自己呼叫 loadOverwrites / setOverwrite
export interface OverwriteEditorProps {
  isOpen: boolean;
  onClose: () => void;
  account: GroupAccount;
  // 群組的全部身分組（含 @everyone）
  roles: Role[];
  members: GroupMember[];
  actor: Actor;
  // 有修改時呼叫（外層重新載入驗證碼清單）
  onChanged: () => void | Promise<void>;
}
