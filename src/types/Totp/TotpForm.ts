import { TotpErrors } from "@/lib/totp/validate";
import { TotpInput } from "./Totp";

export interface TotpFormProps {
  value: TotpInput;
  onChange: (value: TotpInput) => void;
  // 既有類別，給類別欄位當建議選項
  categories: string[];
  errors?: TotpErrors;
  // 進階設定預設展開（匯入的資料不是預設值時）
  advancedOpen?: boolean;
}
