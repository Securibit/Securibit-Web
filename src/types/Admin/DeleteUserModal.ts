import { AdminUser } from "@/types/Admin/Admin";

// 刪除使用者：要輸入對方的 email 才能確認（要刪除時才掛上）
export interface DeleteUserModalProps {
  user: AdminUser;
  onClose: () => void;
  // 刪除成功後呼叫
  onDeleted: () => void;
}
