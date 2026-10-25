import { Result } from "@/types/Permission/Permission";

// 封鎖 / 修改封鎖原因的對話框
export interface BanReasonModalProps {
  isOpen: boolean;
  title: string;
  description?: React.ReactNode;
  // 編輯時帶入目前的原因
  initialReason?: string;
  confirmLabel: string;
  // 封鎖用紅色確認鈕
  danger?: boolean;
  onClose: () => void;
  // 成功時對話框自己關閉；失敗時顯示錯誤、保留輸入
  onSave: (reason: string) => Promise<Result<null>>;
}
