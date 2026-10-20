import { RoleBrief } from "@/types/Permission/Permission";

// 身分組標籤（灰底圓角藥丸，有顏色就當文字色）
export interface RoleChipProps {
  role: RoleBrief;
  // 有傳就顯示移除按鈕
  onRemove?: () => void;
}
