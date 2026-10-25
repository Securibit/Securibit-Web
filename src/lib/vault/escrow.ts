import { ESCROW_KEY_ID, ESCROW_PUBLIC_KEY } from '@/config/escrow';

/**
 * 加密密碼的託管密文：用團隊的公鑰把加密密碼包起來存在資料庫，只有團隊離線保管的私鑰能解開
 * （使用者忘記密碼、確認是本人後協助還原）。格式與 scripts/escrow.mjs、App 一致：
 *   esc:v1:<kid>:<epk>:<iv>:<ct>（base64）
 *   shared = ECDH(一次性私鑰, 團隊公鑰)；key = HKDF-SHA256(shared, salt = epk, info = "securibit-escrow-v1")
 *   ct = AES-256-GCM(key, iv, 密碼, AAD = "securibit-escrow-v1:" + 使用者 id)
 */

const INFO = 'securibit-escrow-v1';
const PREFIX = 'esc:v1:';
const encoder = new TextEncoder();

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

export const escrowEnvelope = async (
  userId: string,
  passphrase: string,
  publicKey = ESCROW_PUBLIC_KEY,
  keyId = ESCROW_KEY_ID
) => {
  const team = await crypto.subtle.importKey('raw', fromBase64(publicKey), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const eph = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const epk = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey));
  const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: team }, eph.privateKey, 256);
  const ikm = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: epk, info: encoder.encode(INFO) },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(`${INFO}:${userId}`) },
    key,
    encoder.encode(passphrase)
  );
  return `${PREFIX}${keyId}:${toBase64(epk)}:${toBase64(iv)}:${toBase64(new Uint8Array(ct))}`;
};
