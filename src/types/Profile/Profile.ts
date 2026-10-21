import { VaultInfo } from "@/types/Vault/Vault";

// profiles 資料列轉成 App 內部使用的格式（欄位對齊原 Firebase 版本）
export interface Profile {
  uid: string;
  name: string;
  // 使用者自己取的 @ID（不含 @，沒有時為空字串）
  username: string;
  email: string;
  photoURL: string;
  bgPhotoURL: string;
  emailVerified: boolean;
  phoneNumber: string;
  metadata: {
    creationTime: string;
    lastSignInTime: string;
  };
  lastLoginAt?: string;
  lastLoginIp?: string;
  lastLoginDevice?: string;
  // 金鑰加密設定，null 代表未啟用
  vault: VaultInfo | null;
}
