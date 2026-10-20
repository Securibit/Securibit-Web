import { Result } from "@/types/Permission/Permission";
import { AccountActivity, ActivityViewer } from "./Activity";

// 帳號操作紀錄列表
export interface AccountActivityListProps {
  // 用上一頁最後一筆的 id 載入下一頁（null = 第一頁）
  load: (beforeId: number | null) => Promise<Result<AccountActivity[]>>;
  pageSize: number;
  // 這些紀錄是誰的（判斷操作者是不是本人）
  subjectId: string;
  viewer: ActivityViewer;
  // 顯示「載入更多」；false 時只顯示第一頁
  paginate?: boolean;
}
