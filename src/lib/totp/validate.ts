import { TotpInput } from '@/types/Totp/Totp';
import { isValidSecret, normalizeSecret } from './crud';

export type TotpErrors = Partial<Record<'name' | 'secret', string>>;

// 表單驗證：名稱與金鑰必填、金鑰需為 Base32
export const validateTotpInput = (input: TotpInput): TotpErrors => {
  const errors: TotpErrors = {};

  if (!input.name.trim()) {
    errors.name = '請輸入名稱';
  }

  if (!normalizeSecret(input.secret)) {
    errors.secret = '請輸入金鑰';
  } else if (!isValidSecret(input.secret)) {
    errors.secret = '金鑰格式錯誤，只能包含 A-Z 與 2-7（Base32）';
  }

  return errors;
};
