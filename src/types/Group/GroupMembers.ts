import { GroupTabProps } from "@/types/Group/GroupTab";

export interface GroupMembersProps extends GroupTabProps {
  // 後台頁才顯示「新增成員」（不用邀請直接加入）
  adminMode?: boolean;
}
