export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  // 危險操作（刪除）用紅色確認鈕
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}
