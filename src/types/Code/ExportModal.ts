import { TotpItem } from "@/types/Totp/Totp";

export interface ExportModalProps {
  items: TotpItem[];
  onClose: () => void;
}
