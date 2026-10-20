export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  // 標題上方的小標籤，例如「01 // CODES」
  index?: string;
  // 標題右側的操作區（按鈕等）
  right?: React.ReactNode;
}
