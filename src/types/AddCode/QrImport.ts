import { ImportTextResult } from "@/lib/totp/importText";
import { TotpInput } from "@/types/Totp/Totp";

export interface QrImportProps {
  // 只有一筆：帶入表單讓使用者確認
  onImport: (input: TotpInput) => void;
  // 多筆（Google Authenticator 匯出、備份檔）：交給父層開整批匯入
  onImportMany: (result: ImportTextResult) => void;
}
