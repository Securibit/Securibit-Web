import { TOTP_ALGORITHMS, TOTP_DEFAULTS, TOTP_DIGITS, TOTP_PERIODS, TotpAlgorithm, TotpInput, TotpItem } from '@/types/Totp/Totp';
import { isValidSecret, normalizeSecret } from './crud';
import { normalizeCategories } from './categories';

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
 * 組出顯示名稱：label 可能是「Issuer:account」或只有 account，issuer 參數優先。
 * 結果為「Issuer - account」，只有其中一個就用那個。
 */
export const composeName = (label: string, issuerParam = '') => {
  const separator = label.indexOf(':');
  const labelIssuer = separator >= 0 ? label.slice(0, separator).trim() : '';
  const account = (separator >= 0 ? label.slice(separator + 1) : label).trim();
  const issuer = issuerParam.trim() || labelIssuer;

  if (issuer && account && issuer !== account) return `${issuer} - ${account}`;
  return issuer || account || '未命名';
};

/**
 * 解析 otpauth://totp/Issuer:account?secret=...&issuer=...&digits=6&period=30&algorithm=SHA1
 * （Key URI Format，各服務的綁定 QR Code 內容就是這個）
 */
export const parseOtpauthUri = (text: string): OtpauthResult => {
  const raw = text.trim();

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

  // 名稱裡的 % 編碼不完整（例如手打的連結）時用原本的文字，不要整行失敗
  const rawLabel = url.pathname.replace(/^\//, '');
  let label: string;
  try {
    label = decodeURIComponent(rawLabel).trim();
  } catch {
    label = rawLabel.trim();
  }
  const name = composeName(label, params.get('issuer') ?? '');
  // category 不是標準參數，是本站匯出備份時加上的（多個類別用「,」串起來），其他 App 會忽略
  const category = normalizeCategories(params.get('category'));

  return {
    success: true,
    data: { name, secret, category, digits, period, algorithm },
  };
};

/** 產生 otpauth:// 連結（可轉成 QR Code 給其他驗證器 App 掃） */
export const buildOtpauthUri = (item: TotpItem) => {
  const params = new URLSearchParams({
    secret: normalizeSecret(item.secret),
    algorithm: (item.algorithm ?? TOTP_DEFAULTS.algorithm).replace('-', ''),
    digits: String(item.digits ?? TOTP_DEFAULTS.digits),
    period: String(item.period ?? TOTP_DEFAULTS.period),
  });
  if (item.category) params.set('category', item.category);
  return `otpauth://totp/${encodeURIComponent(item.name)}?${params.toString()}`;
};
