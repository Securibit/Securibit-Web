import { TotpItem } from "@/types/Totp/Totp";

export interface ShareToGroupModalProps {
  // 要分享的驗證碼（secret 是解密後的明文）
  item: TotpItem;
  // 來源群組：不列在可選的群組裡
  excludeGroupId?: string;
  // 來源群組有加密：複製到沒加密的群組前要再確認一次
  sourceEncrypted?: boolean;
  onClose: () => void;
}
