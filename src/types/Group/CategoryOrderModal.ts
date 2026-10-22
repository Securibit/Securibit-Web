export interface CategoryOrderModalProps {
  // 目前顯示的順序（已套用群組自訂的順序）
  categories: string[];
  onClose: () => void;
  // 儲存新的順序；回傳是否成功，成功才關閉
  onSave: (names: string[]) => Promise<boolean>;
}
