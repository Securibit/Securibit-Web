import { TotpItem } from "@/types/Totp/Totp";

export interface CodeCardProps {
  item: TotpItem;
  onDelete: () => void;
}
