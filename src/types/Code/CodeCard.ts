import { TotpItem } from "@/types/Totp/Totp";

export interface CodeCardProps {
  item: TotpItem;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  // 隱藏驗證碼，點一下才顯示
  hidden?: boolean;
  // 排序模式：顯示上下移動按鈕，取代其他操作
  sort?: CodeCardSort;
}

export interface CodeCardSort {
  canUp: boolean;
  canDown: boolean;
  onUp: () => void;
  onDown: () => void;
}
