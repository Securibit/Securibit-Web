import { TOTP } from 'totp-generator';
import { TOTP_DEFAULTS, TotpItem } from '@/types/Totp/Totp';
import { isBase32, normalizeSecret } from './crud';

type OtpParams = Pick<TotpItem, 'secret' | 'digits' | 'period' | 'algorithm'>;

// 產生目前的驗證碼；金鑰不合法時回傳 null（totp-generator v2 的 generate 是 async）
export const generateOtp = async (item: OtpParams, timestamp = Date.now()) => {
  const secret = normalizeSecret(item.secret);
  if (!isBase32(secret)) return null;

  try {
    const result = await TOTP.generate(secret, {
      digits: item.digits ?? TOTP_DEFAULTS.digits,
      period: item.period ?? TOTP_DEFAULTS.period,
      algorithm: item.algorithm ?? TOTP_DEFAULTS.algorithm,
      timestamp,
    });
    return result.otp;
  } catch {
    return null;
  }
};
