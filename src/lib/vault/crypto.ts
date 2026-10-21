import { VaultInfo } from '@/types/Vault/Vault';

/**
 * 金鑰加密：使用者密碼 → PBKDF2-SHA256 → AES-GCM 256。
 * 全部在瀏覽器（Web Crypto）完成，密碼與解開的金鑰都不會送到伺服器。
 */

const PREFIX = 'enc:v1:';
// OWASP 建議 PBKDF2-SHA256 至少 600,000 次，解鎖約需不到一秒
const ITERATIONS = 600_000;
const CHECK_TEXT = 'securibit-vault-check';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

export const isEncrypted = (value: string) => value.startsWith(PREFIX);

const deriveKey = async (passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number) => {
  const base = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  // extractable = false：金鑰無法被讀出，只能拿來加解密（存進 IndexedDB 也一樣）
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
};

export const encryptText = async (key: CryptoKey, text: string) => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(text));
  return `${PREFIX}${toBase64(iv)}:${toBase64(new Uint8Array(cipher))}`;
};

// 解密失敗（密碼不對、資料損毀）會丟出錯誤
export const decryptText = async (key: CryptoKey, value: string) => {
  const [iv, cipher] = value.slice(PREFIX.length).split(':');
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(iv) },
    key,
    fromBase64(cipher)
  );
  return decoder.decode(plain);
};

// 建立新的加密設定（啟用或改密碼時）
export const createVault = async (passphrase: string): Promise<{ info: VaultInfo; key: CryptoKey }> => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(passphrase, salt, ITERATIONS);
  const check = await encryptText(key, CHECK_TEXT);
  return { info: { v: 1, salt: toBase64(salt), iterations: ITERATIONS, check }, key };
};

// 確認金鑰能解開 check（從裝置讀回來的金鑰也用這個驗證）
export const verifyKey = async (info: VaultInfo, key: CryptoKey) => {
  try {
    return (await decryptText(key, info.check)) === CHECK_TEXT;
  } catch {
    return false;
  }
};

// 用密碼解鎖，密碼錯誤回傳 null
export const unlockVault = async (info: VaultInfo, passphrase: string) => {
  const key = await deriveKey(passphrase, fromBase64(info.salt), info.iterations);
  return (await verifyKey(info, key)) ? key : null;
};
