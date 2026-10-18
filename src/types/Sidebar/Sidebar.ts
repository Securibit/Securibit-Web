export interface SidebarProps {
  isDrawerOpen: boolean;
  setIsDrawerOpen: (value: boolean) => void;
}

export interface SidebarListItemProps {
  icon: React.ElementType;
  text: string;
  // 有 link 就換頁；沒有就只執行 onClick（例如登入、登出）
  link?: string;
  onClick?: () => void;
  active?: boolean;
}
