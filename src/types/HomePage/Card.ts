export interface CardProps {
  // 小字的主題名，例如「加密」
  eyebrow: string;
  title: string;
  description: string;
  // 區塊下方的示意畫面（可選）
  children?: React.ReactNode;
}
