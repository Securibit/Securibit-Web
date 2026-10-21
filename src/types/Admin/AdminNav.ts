import { IconDefinition } from "@fortawesome/fontawesome-svg-core";

// 後台導覽的一個項目（總覽頁的入口列也用同一份）
export interface AdminNavItem {
  href: string;
  text: string;
  // 區塊的說明
  description: string;
  icon: IconDefinition;
  // 需要的全站權限（見 lib/permissions/bits.ts 的 SITE）；VIEW_ADMIN 已由 AuthGate 擋過
  permission: number;
}
