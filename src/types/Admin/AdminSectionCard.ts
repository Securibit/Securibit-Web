// 後台總覽的區塊入口（一列規格表）
export interface AdminSectionCardProps {
  href: string;
  // 列左邊的編號，例如「01」
  index: string;
  title: string;
  description: string;
  // 列右邊的讀數（例如使用者總數），沒有就不顯示
  count?: number;
}
