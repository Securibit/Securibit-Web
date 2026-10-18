export interface CameraScanModalProps {
  onClose: () => void;
  // 掃到 QR Code 時回傳內容
  onResult: (text: string) => void;
}
