import { AuditLog, Result } from "@/types/Permission/Permission";

// 操作紀錄列表，往下捲 / 按「載入更多」時用最後一筆的 id 再載入
export interface AuditLogListProps {
  load: (beforeId: number | null) => Promise<Result<AuditLog[]>>;
  pageSize?: number;
}
