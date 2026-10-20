// /me/activity：一開始顯示哪個分頁
export type ActivityTab = 'login' | 'activity';

export interface ActivityClientProps {
  initialTab: ActivityTab;
}
