import { UnreadCounts } from "@/types/Notification/Notification";

export interface NotificationsProviderProps {
  children: React.ReactNode;
}

export interface NotificationsContextValue {
  // 未讀數；未登入、或資料庫還沒有通知功能時是 null
  counts: UnreadCounts | null;
  // 通知有變動就加一（即時同步或定時重抓），列表看到它變了就重新讀
  signal: number;
  // 群組邀請有變動就加一
  invitationsSignal: number;
  // 自己標為已讀之後呼叫，重新讀未讀數並通知列表
  refresh: () => void;
}
