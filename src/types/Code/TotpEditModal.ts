import { TotpInput, TotpItem } from "@/types/Totp/Totp";

export interface TotpEditModalProps {
  item: TotpItem;
  categories: string[];
  onClose: () => void;
  // 回傳是否儲存成功，成功才關閉對話框
  onSave: (input: TotpInput) => Promise<boolean>;
}
