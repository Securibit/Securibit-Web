import { GroupSummary } from "@/types/Group/Group";

export interface ScopePickerProps {
  groups: GroupSummary[];
  // 空字串＝我的驗證碼，否則是群組 id
  selected: string;
  onSelect: (gid: string) => void;
  // 有建立群組權限時才會出現「＋ 群組」
  onCreate?: () => void;
}
