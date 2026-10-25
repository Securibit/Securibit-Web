import { TotpInput } from '@/types/Totp/Totp';
import { parseMigrationUri } from './migration';
import { parseOtpauthUri } from './otpauth';

// 無法讀取的一行：line 是原始文字的行號（1 起算）
export interface ImportLineError {
  line: number;
  reason: string;
}

export interface ImportTextResult {
  items: TotpInput[];
  // 無法讀取的行與原因（格式錯誤、HOTP 等）；一行壞掉不影響其他行
  errors: ImportLineError[];
  // 讀得到但有部分略過的說明（例如匯出 QR Code 裡的 HOTP）
  notes: string[];
  // Google Authenticator 分批匯出時，這是第幾批
  batch?: { index: number; size: number };
}

/**
 * 解析貼上的文字、QR Code 內容或備份檔：
 * 每行一個 otpauth:// 或 otpauth-migration:// 連結，空行與 # 開頭的註解略過。
 * 某一行解析失敗（甚至丟出例外）只記下行號與原因，繼續讀下一行。
 */
export const parseImportText = (text: string): ImportTextResult => {
  const result: ImportTextResult = { items: [], errors: [], notes: [] };
  const lines = text
    .split(/\r?\n/)
    .map((line, index) => ({ text: line.trim(), number: index + 1 }))
    .filter((line) => line.text && !line.text.startsWith('#'));

  for (const { text: line, number } of lines) {
    try {
      if (line.startsWith('otpauth-migration://')) {
        const parsed = parseMigrationUri(line);
        if (parsed.success) {
          result.items.push(...parsed.data);
          if (parsed.skipped > 0) result.notes.push(`第 ${number} 行略過 ${parsed.skipped} 筆 HOTP（計數型）驗證碼`);
          result.batch = parsed.batch;
        } else {
          result.errors.push({ line: number, reason: parsed.message });
        }
        continue;
      }

      const parsed = parseOtpauthUri(line);
      if (parsed.success) result.items.push(parsed.data);
      else result.errors.push({ line: number, reason: parsed.message });
    } catch {
      result.errors.push({ line: number, reason: '無法讀取這一行' });
    }
  }

  return result;
};

/** 「第 3 行：原因」一行一筆，給錯誤對話框與匯入視窗顯示 */
export const formatImportErrors = (errors: ImportLineError[]) =>
  errors.map((error) => `第 ${error.line} 行：${error.reason}`).join('\n');

/** 匯入後的摘要 */
export const importSummary = (imported: number, errors: ImportLineError[]) =>
  errors.length > 0 ? `已匯入 ${imported} 筆，${errors.length} 行無法讀取` : `已匯入 ${imported} 筆驗證碼`;
