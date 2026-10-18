import { AdminUser } from "@/types/Admin/Admin";

// 修改使用者的名稱與 @ID
export interface UserEditModalProps {
  user: AdminUser;
  onClose: () => void;
  // 修改成功後呼叫（外層重新載入）
  onSaved: () => void | Promise<void>;
}
