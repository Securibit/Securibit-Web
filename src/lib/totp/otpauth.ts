import { TOTP_ALGORITHMS, TOTP_DEFAULTS, TOTP_DIGITS, TOTP_PERIODS, TotpAlgorithm, TotpInput } from '@/types/Totp/Totp';
import { isValidSecret, normalizeSecret } from './crud';

export type OtpauthResult =
  | { success: true; data: TotpInput }
  | { success: false; message: string };

const fail = (message: string): OtpauthResult => ({ success: false, message });

// otpauth 的 algorithm 參數寫作 SHA1 / SHA256 / SHA512
const toAlgorithm = (value: string | null): TotpAlgorithm | undefined => {
  if (!value) return TOTP_DEFAULTS.algorithm;
  const normalized = value.toUpperCase().replace(/^SHA-?/, 'SHA-');
  return TOTP_ALGORITHMS.find((algorithm) => algorithm === normalized);
};

/**
 * 解析 otpauth://totp/Issuer:account?secret=...&issuer=...&digits=6&period=30&algorithm=SHA1
 * （Key URI Format，各服務的綁定 QR Code 內容就是這個）
 */
export const parseOtpauthUri = (text: string): OtpauthResult => {
  const raw = text.trim();

  if (raw.startsWith('otpauth-migration://')) {
    return fail('這是 Google Authenticator 的「匯出帳戶」格式，目前不支援，請改用各服務的綁定 QR Code');
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return fail('不是有效的 otpauth:// 連結');
  }

  if (url.protocol !== 'otpauth:') {
    return fail('不是有效的 otpauth:// 連結');
  }
  if (url.host === 'hotp') {
    return fail('目前只支援 TOTP（時間型）驗證碼，不支援 HOTP（計數型）');
  }
  if (url.host !== 'totp') {
    return fail('不是有效的 otpauth:// 連結');
  }

  const params = url.searchParams;
  const secret = normalizeSecret(params.get('secret') ?? '');
  if (!secret) return fail('連結裡沒有金鑰（secret）');
  if (!isValidSecret(secret)) return fail('連結裡的金鑰不是 Base32 格式');

  const digits = Number(params.get('digits') ?? TOTP_DEFAULTS.digits);
  if (!TOTP_DIGITS.includes(digits)) return fail(`不支援 ${digits} 位數的驗證碼`);

  const period = Number(params.get('period') ?? TOTP_DEFAULTS.period);
  if (!TOTP_PERIODS.includes(period)) return fail(`不支援 ${period} 秒的週期`);

  const algorithm = toAlgorithm(params.get('algorithm'));
  if (!algorithm) return fail(`不支援 ${params.get('algorithm')} 演算法`);

  // label 可能是「Issuer:account」或只有 account
  const label = decodeURIComponent(url.pathname.replace(/^\//, '')).trim();
  const separator = label.indexOf(':');
  const labelIssuer = separator >= 0 ? label.slice(0, separator).trim() : '';
  const account = separator >= 0 ? label.slice(separator + 1).trim() : label;
  const issuer = params.get('issuer')?.trim() || labelIssuer;

  const name = issuer && account ? `${issuer} - ${account}` : issuer || account || '未命名';

  return {
    success: true,
    data: { name, secret, category: '', digits, period, algorithm },
  };
};
