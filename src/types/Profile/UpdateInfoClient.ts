// /me/update_info：一開始顯示哪個分頁
export type SettingsTab = 'account' | 'notifications';

export interface UpdateInfoClientProps {
  initialTab: SettingsTab;
}
