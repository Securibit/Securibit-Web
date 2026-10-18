export interface DeleteGroupModalProps {
  isOpen: boolean;
  groupName: string;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}
