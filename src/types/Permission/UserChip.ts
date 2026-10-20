import { UserBrief } from "@/types/Permission/Permission";

// 圓頭像 + 名稱 + 灰字的 @ID
export interface UserChipProps {
  user: UserBrief | null;
  size?: 'sm' | 'md' | 'lg';
  // 第二行顯示 email（預設顯示 @ID）
  showEmail?: boolean;
  className?: string;
}
