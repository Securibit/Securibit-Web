export type TotpAlgorithm = 'SHA-1' | 'SHA-256' | 'SHA-512';

// profiles.totp（jsonb 陣列）裡的一筆驗證碼
export interface TotpItem {
  id: string;
  name: string;
  secret: string;
  category: string;
  // 以下三項舊資料沒有，讀取時以 TOTP_DEFAULTS 補上
  digits?: number;
  period?: number;
  algorithm?: TotpAlgorithm;
  // 釘選的項目排在列表最上面
  pinned?: boolean;
}

// 新增 / 編輯表單送出的內容（id 由資料層產生）
export type TotpInput = Omit<TotpItem, 'id'>;

// 與 Google Authenticator 相同的預設值
export const TOTP_DEFAULTS = {
  digits: 6,
  period: 30,
  algorithm: 'SHA-1',
} as const satisfies Required<Pick<TotpItem, 'digits' | 'period' | 'algorithm'>>;

export const TOTP_DIGITS = [6, 8];
export const TOTP_PERIODS = [30, 60];
export const TOTP_ALGORITHMS: TotpAlgorithm[] = ['SHA-1', 'SHA-256', 'SHA-512'];
