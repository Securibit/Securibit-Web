// profiles.vault：金鑰加密設定（null 代表未啟用）
export interface VaultInfo {
  v: 1;
  // PBKDF2 的 salt（base64）
  salt: string;
  iterations: number;
  // 用來驗證密碼是否正確：加密後的固定字串
  check: string;
}

// off：未啟用；loading：確認這台裝置有沒有記住密碼中；locked：要輸入密碼；unlocked：可以使用
export type VaultStatus = 'off' | 'loading' | 'locked' | 'unlocked';

export type VaultActionResult = { success: true } | { success: false; message: string };

export interface VaultContextValue {
  status: VaultStatus;
  // 解鎖後的加密金鑰（未啟用或鎖定時為 undefined）
  key?: CryptoKey;
  unlock: (passphrase: string, remember: boolean) => Promise<VaultActionResult>;
  lock: () => Promise<void>;
  enable: (passphrase: string, remember: boolean) => Promise<VaultActionResult>;
  changePassphrase: (current: string, next: string) => Promise<VaultActionResult>;
  disable: (passphrase: string) => Promise<VaultActionResult>;
  // 忘記密碼：清空所有驗證碼並停用加密
  reset: () => Promise<VaultActionResult>;
}
