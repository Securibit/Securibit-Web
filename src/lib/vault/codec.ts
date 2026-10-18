import { TotpItem } from '@/types/Totp/Totp';
import { decryptText, encryptText, isEncrypted } from './crypto';

// 讀出來的項目：有加密的金鑰解開；解不開（例如別的裝置用舊密碼寫入）就保留原值，畫面會顯示金鑰錯誤
export const decodeItems = async (items: TotpItem[], key?: CryptoKey) =>
  Promise.all(
    items.map(async (item) => {
      if (!key || !isEncrypted(item.secret)) return item;
      try {
        return { ...item, secret: await decryptText(key, item.secret) };
      } catch {
        return item;
      }
    })
  );

// 寫入前：有啟用加密就把金鑰加密
export const encodeSecret = async (secret: string, key?: CryptoKey) =>
  key ? encryptText(key, secret) : secret;
