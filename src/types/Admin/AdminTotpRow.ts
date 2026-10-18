import { AdminTotpItem } from "@/types/Admin/Admin";

// 2FA 清單的一筆
export interface AdminTotpRowProps {
  item: AdminTotpItem;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void | Promise<void>;
}
