import { GroupSummary } from "@/types/Group/Group";

export interface ScopePickerProps {
  groups: GroupSummary[];
  // 選中的群組 id（預設群組＝我的驗證碼）
  selected: string;
  onSelect: (gid: string) => void;
  // 有建立群組權限時才會出現「＋ 群組」
  onCreate?: () => void;
}
