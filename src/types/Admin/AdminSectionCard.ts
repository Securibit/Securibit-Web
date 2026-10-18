import { IconDefinition } from "@fortawesome/fontawesome-svg-core";

// 後台總覽的區塊入口卡片
export interface AdminSectionCardProps {
  href: string;
  icon: IconDefinition;
  title: string;
  description: string;
  // 卡片右上角的數字（例如使用者總數），沒有就不顯示
  count?: number;
}
