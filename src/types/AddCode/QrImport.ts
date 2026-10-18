import { TotpInput } from "@/types/Totp/Totp";

export interface QrImportProps {
  onImport: (input: TotpInput) => void;
}
