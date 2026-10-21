export interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  // 建立成功，回傳新群組 id
  onCreated: (groupId: string) => void;
}
