import { Result } from "@/types/Permission/Permission";
import { LoginRecord } from "./Activity";

// 登入紀錄列表
export interface LoginHistoryListProps {
  // 用上一頁最後一筆的 id 載入下一頁（null = 第一頁）
  load: (beforeId: number | null) => Promise<Result<LoginRecord[]>>;
  pageSize: number;
  // 顯示「載入更多」；false 時只顯示第一頁（例如個人頁面的最近 5 筆）
  paginate?: boolean;
}
