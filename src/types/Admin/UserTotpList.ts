import { AdminUser } from "@/types/Admin/Admin";

// 使用者詳情的 2FA 清單（有 VIEW_USER_TOTP 才掛上）
export interface UserTotpListProps {
  user: AdminUser;
  // 有 MANAGE_USER_TOTP：可以編輯、刪除
  canManage: boolean;
}
