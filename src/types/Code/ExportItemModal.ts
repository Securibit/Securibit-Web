import { TotpItem } from "@/types/Totp/Totp";

export interface ExportItemModalProps {
  item: TotpItem;
  onClose: () => void;
}
