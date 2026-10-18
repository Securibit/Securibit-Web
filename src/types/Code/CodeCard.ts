import { TotpItem } from "@/types/Totp/Totp";

export interface CodeCardProps {
  item: TotpItem;
  onEdit: () => void;
  onDelete: () => void;
  // 隱藏驗證碼，點一下才顯示
  hidden?: boolean;
}
