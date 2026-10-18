import { ImportTextResult } from "@/lib/totp/importText";
import { TotpInput } from "@/types/Totp/Totp";

export interface AddGroupCodeModalProps {
  categories: string[];
  onClose: () => void;
  // 新增一筆；回傳是否成功
  onAdd: (inputs: TotpInput[]) => Promise<boolean>;
  // 匯入到多筆（Google Authenticator 匯出、備份檔）：交給父層開整批匯入
  onImportMany: (result: ImportTextResult) => void;
}
