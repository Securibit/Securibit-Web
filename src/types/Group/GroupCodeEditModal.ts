import { GroupAccount } from "@/types/Group/Group";
import { TotpInput } from "@/types/Totp/Totp";

export interface GroupCodeEditModalProps {
  account: GroupAccount;
  // 有「查看金鑰」時帶入目前的金鑰；沒有時金鑰欄位留空，留空代表不修改
  secret?: string;
  categories: string[];
  onClose: () => void;
  // 只含要修改的欄位；回傳是否儲存成功，成功才關閉
  onSave: (patch: Partial<TotpInput>) => Promise<boolean>;
}
