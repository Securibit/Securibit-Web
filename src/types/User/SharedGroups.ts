import { UserPublic } from "@/types/User/UserPublic";

// 個人頁面的「共同群組」：每列可以有群組內的管理選單
export interface SharedGroupsProps {
  target: UserPublic;
  // 操作成功後重新載入頁面資料
  onChanged: () => Promise<void>;
}
