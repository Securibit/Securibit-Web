import { ImportTextResult } from "@/lib/totp/importText";
import { TotpInput, TotpItem } from "@/types/Totp/Totp";

export interface BulkImportModalProps {
  result: ImportTextResult;
  // 已有的驗證碼，用來標出重複的金鑰
  existing: TotpItem[];
  categories: string[];
  onClose: () => void;
  // 回傳是否匯入成功，成功才關閉
  onConfirm: (inputs: TotpInput[]) => Promise<boolean>;
}
