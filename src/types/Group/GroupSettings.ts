import { GroupTabProps } from "@/types/Group/GroupTab";

export interface GroupSettingsProps extends GroupTabProps {
  // 離開或刪除群組後要回到的頁面（一般是 /groups，後台是 /admin/groups）
  exitHref: string;
}
