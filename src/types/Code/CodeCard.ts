import { TotpItem } from "@/types/Totp/Totp";

export interface CodeCardProps {
  item: TotpItem;
  onEdit: () => void;
  onDelete: () => void;
}
