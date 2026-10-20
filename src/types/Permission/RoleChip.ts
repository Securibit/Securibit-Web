import { RoleBrief } from "@/types/Permission/Permission";

// 身分組標籤（方形、邊框與文字用身分組顏色）
export interface RoleChipProps {
  role: RoleBrief;
  // 有傳就顯示移除按鈕
  onRemove?: () => void;
}
