import { UserPublic } from "@/types/User/UserPublic";

// 個人頁面底部的「管理」（全站權限）
export interface UserAdminActionsProps {
  target: UserPublic;
  // 操作成功後重新載入頁面資料
  onChanged: () => Promise<void>;
}
