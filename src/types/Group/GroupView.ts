// 群組內頁主體（/groups/[id] 與後台 /admin/groups/[id] 共用）
export interface GroupViewProps {
  gid: string;
  // 返回連結
  backHref: string;
  backText: string;
  // 返回連結的位置：標題右側（一般頁面）或標題上方（後台詳情頁）
  backPlacement: "right" | "top";
  // 載入失敗、離開或刪除群組後要回到的頁面
  exitHref: string;
  // 一開始顯示的分頁（?tab=），不合法就是驗證碼
  initialTab?: string | null;
  // 後台（/admin/groups/[id]）才有的管理功能，例如直接新增成員；前台群組頁一律走邀請
  adminMode?: boolean;
}
