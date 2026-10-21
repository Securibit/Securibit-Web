import { AdminTotpItem } from "@/types/Admin/Admin";
import { TotpInput } from "@/types/Totp/Totp";

// 管理員編輯使用者的一筆 2FA
export interface AdminTotpEditModalProps {
  item: AdminTotpItem;
  // 使用者的預設群組已加密（或這筆已加密）時不能改金鑰
  secretLocked: boolean;
  categories: string[];
  onClose: () => void;
  // 只送出有變動的欄位；回傳是否成功，成功才關閉
  onSave: (patch: Partial<TotpInput>) => Promise<boolean>;
}
