import { Actor } from "@/lib/permissions/hierarchy";
import { GroupDetail } from "@/types/Group/Group";

// 群組內頁每個分頁共用的 props
export interface GroupTabProps {
  detail: GroupDetail;
  // 我在這個群組的階層（擁有者或全站管理員不受限）
  actor: Actor;
  // 重新載入 group_detail（成員、身分組、邀請有變動時）
  onChanged: () => Promise<void>;
}
