/**
 * 加密密碼的託管公鑰（團隊離線保管對應的 P-256 私鑰）。
 *
 * 換金鑰時只改這個檔案：用 `node scripts/escrow.mjs keygen <私鑰路徑>` 在離線電腦產生，
 * 把印出的 publicKey 與 keyId 貼到下面（App 的 lib/features/vault/escrow_key.dart 要一起換）。
 */
export const ESCROW_PUBLIC_KEY = 'BKj7ilk7pBlOGtiu/wAs4Vg+7uGIw10UkXGzpDoAUUOxkryXTvOfEC8/0g7xJTi7qfC9w2IaJEMu9T/rgfBRDhY=';

// 公鑰（65 bytes 未壓縮）SHA-256 的前 16 個十六進位字元
export const ESCROW_KEY_ID = 'c96d275fada1e554';
