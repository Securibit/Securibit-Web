import { ReactNode } from "react";
import { GroupTabProps } from "@/types/Group/GroupTab";

export interface GroupCodesProps extends GroupTabProps {
  // 標題列左邊的內容；沒給就顯示「驗證碼」（嵌在驗證碼頁時會換成群組名與成員數）
  heading?: ReactNode;
}
