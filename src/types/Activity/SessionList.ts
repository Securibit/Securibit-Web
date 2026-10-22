import { Result } from "@/types/Permission/Permission";
import { SessionRecord } from "./Session";

// 已登入的裝置列表
export interface SessionListProps {
  // 讀取裝置清單；沒給就是自己的（list_my_sessions）
  load?: () => Promise<Result<SessionRecord[]>>;
  // 只能看：不顯示登出按鈕與「這台裝置」（後台看別人的裝置）
  readOnly?: boolean;
}
