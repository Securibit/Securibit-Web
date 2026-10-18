import { TotpItem } from "@/types/Totp/Totp";

export interface ShareToGroupModalProps {
  // 要分享的驗證碼（secret 是解密後的明文）
  item: TotpItem;
  onClose: () => void;
}
