import { RoleBrief } from "@/types/Permission/Permission";

// 身分組標籤（用身分組顏色的小圓點）
export interface RoleChipProps {
  role: RoleBrief;
  // 有傳就顯示移除按鈕
  onRemove?: () => void;
}
