import { GroupSummary } from "@/types/Group/Group";
import { CodeCardSort } from "@/types/Code/CodeCard";

export interface GroupCardProps {
  group: GroupSummary;
  onOpen: () => void;
  // 排序模式：顯示上下移按鈕，整列不能按
  sort?: CodeCardSort;
}
