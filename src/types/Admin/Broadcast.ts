import { AdminUser } from "@/types/Admin/Admin";
import { BroadcastRecord } from "@/types/Notification/Notification";
import { Role } from "@/types/Permission/Permission";

// 可以勾選的一列（右邊打勾，像 iOS 設定的選擇列表）
export interface CheckRowProps {
  checked: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  // 第二行灰字
  description?: string;
  disabled?: boolean;
}

// 發送通知：選使用者
export interface BroadcastUserPickerProps {
  selected: AdminUser[];
  onChange: (users: AdminUser[]) => void;
}

// 發送通知：選了使用者後列出他們的裝置
export interface BroadcastDevicePickerProps {
  users: AdminUser[];
  selected: string[];
  onChange: (sessionIds: string[]) => void;
}

// 發送紀錄
export interface BroadcastHistoryProps {
  records: BroadcastRecord[] | null;
  roles: Role[];
}
