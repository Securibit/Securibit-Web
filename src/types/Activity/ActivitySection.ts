// 分組列表的一組：灰色小標題，右邊可以放「全部」連結
export interface ActivitySectionProps {
  title: string;
  // 有給才顯示「全部」
  href?: string;
  children: React.ReactNode;
}
