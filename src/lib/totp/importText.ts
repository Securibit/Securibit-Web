import { TotpInput } from '@/types/Totp/Totp';
import { parseMigrationUri } from './migration';
import { parseOtpauthUri } from './otpauth';

export interface ImportTextResult {
  items: TotpInput[];
  // 無法匯入的行與原因（HOTP、格式錯誤等）
  errors: string[];
  // Google Authenticator 分批匯出時，這是第幾批
  batch?: { index: number; size: number };
}

/**
 * 解析貼上的文字、QR Code 內容或備份檔：
 * 每行一個 otpauth:// 或 otpauth-migration:// 連結，空行與 # 開頭的註解略過。
 */
export const parseImportText = (text: string): ImportTextResult => {
  const result: ImportTextResult = { items: [], errors: [] };
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

  for (const line of lines) {
    if (line.startsWith('otpauth-migration://')) {
      const parsed = parseMigrationUri(line);
      if (parsed.success) {
        result.items.push(...parsed.data);
        if (parsed.skipped > 0) result.errors.push(`略過 ${parsed.skipped} 筆 HOTP（計數型）驗證碼`);
        result.batch = parsed.batch;
      } else {
        result.errors.push(parsed.message);
      }
      continue;
    }

    const parsed = parseOtpauthUri(line);
    if (parsed.success) {
      result.items.push(parsed.data);
    } else {
      result.errors.push(lines.length > 1 ? `${line.length > 40 ? `${line.slice(0, 40)}…` : line}：${parsed.message}` : parsed.message);
    }
  }

  if (lines.length === 0) result.errors.push('沒有可匯入的內容');
  return result;
};
