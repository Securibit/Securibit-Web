import { CodeCardSort } from "@/types/Code/CodeCard";
import { GroupAccount } from "@/types/Group/Group";

// 伺服器產生的動態碼（只有「查看驗證碼」、沒有「查看金鑰」時）
export interface GroupServerCode {
  // 伺服器產生時的時間（ms）；code 是這個時間所在週期的碼，next 是下一個週期的碼
  at: number;
  code: string | null;
  next: string | null;
}

export interface GroupCodeCardProps {
  account: GroupAccount;
  // 有「查看金鑰」時的金鑰：瀏覽器自己產碼，也可以匯出 QR Code
  secret?: string;
  // 沒有金鑰時，由伺服器產生的碼
  server?: GroupServerCode;
  // 伺服器時間 − 本機時間（ms）：伺服器產生的碼用校正後的時間判斷週期
  clockOffset: number;
  // 隱藏驗證碼，點一下才顯示
  hidden?: boolean;
  // 以下沒有傳就不顯示該操作
  onEdit?: () => void;
  onDelete?: () => void;
  onTogglePin?: () => void;
  onPermissions?: () => void;
  // 排序模式：顯示上下移動按鈕，取代其他操作
  sort?: CodeCardSort;
}
