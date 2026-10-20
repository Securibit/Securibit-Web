import { IconDefinition } from "@fortawesome/fontawesome-svg-core";

// 後台總覽「管理」群組的一列入口
export interface AdminSectionCardProps {
  href: string;
  title: string;
  icon?: IconDefinition;
  // 列右邊的讀數（例如使用者總數），沒有就不顯示
  count?: number;
}
