import { TOTP_DEFAULTS, TotpAlgorithm, TotpInput, TotpItem } from '@/types/Totp/Totp';
import { base32Decode, base32Encode } from './base32';
import { normalizeSecret } from './crud';
import { composeName } from './otpauth';

/**
 * Google Authenticator「匯出帳戶」的 QR Code：otpauth-migration://offline?data=<base64>
 * data 是 protobuf 編碼的 MigrationPayload：
 *   1 otp_parameters（重複）  2 version  3 batch_size  4 batch_index  5 batch_id
 * OtpParameters：
 *   1 secret（bytes）  2 name  3 issuer  4 algorithm  5 digits  6 type  7 counter
 * Google Authenticator 不記錄週期，一律 30 秒。
 */

const ALGORITHMS: Record<number, TotpAlgorithm> = { 1: 'SHA-1', 2: 'SHA-256', 3: 'SHA-512' };
const DIGITS: Record<number, number> = { 1: 6, 2: 8 };
const TYPE_HOTP = 1;
const TYPE_TOTP = 2;

// 一張 QR Code 放幾筆（與 Google Authenticator 自己匯出時相同，太多 QR Code 會密到掃不出來）
export const MIGRATION_BATCH_SIZE = 10;

// ---------- 最小的 protobuf 讀寫 ----------

type Field = { field: number; varint?: number; bytes?: Uint8Array };

const readVarint = (buf: Uint8Array, pos: number): [number, number] => {
  let result = 0;
  let shift = 0;
  let byte: number;
  do {
    if (pos >= buf.length) throw new Error('資料不完整');
    byte = buf[pos++];
    result += (byte & 0x7f) * 2 ** shift;
    shift += 7;
  } while (byte & 0x80);
  return [result, pos];
};

const readFields = (buf: Uint8Array): Field[] => {
  const fields: Field[] = [];
  let pos = 0;
  while (pos < buf.length) {
    let key: number;
    [key, pos] = readVarint(buf, pos);
    const field = Math.floor(key / 8);
    const wire = key % 8;

    if (wire === 0) {
      let varint: number;
      [varint, pos] = readVarint(buf, pos);
      fields.push({ field, varint });
    } else if (wire === 2) {
      let length: number;
      [length, pos] = readVarint(buf, pos);
      if (pos + length > buf.length) throw new Error('資料不完整');
      fields.push({ field, bytes: buf.subarray(pos, pos + length) });
      pos += length;
    } else if (wire === 1) {
      pos += 8;
    } else if (wire === 5) {
      pos += 4;
    } else {
      throw new Error('不支援的資料格式');
    }
  }
  return fields;
};

const writeVarint = (out: number[], value: number) => {
  let v = value;
  while (v >= 0x80) {
    out.push((v % 0x80) | 0x80);
    v = Math.floor(v / 0x80);
  }
  out.push(v);
};

const writeVarintField = (out: number[], field: number, value: number) => {
  writeVarint(out, field * 8);
  writeVarint(out, value);
};

const writeBytesField = (out: number[], field: number, bytes: Uint8Array) => {
  writeVarint(out, field * 8 + 2);
  writeVarint(out, bytes.length);
  out.push(...bytes);
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// ---------- 解析 ----------

export type MigrationResult =
  | {
      success: true;
      data: TotpInput[];
      // HOTP 等不支援的項目數
      skipped: number;
      // 分好幾張 QR Code 匯出時，這是第幾張（從 1 開始）
      batch?: { index: number; size: number };
    }
  | { success: false; message: string };

const fromBase64 = (value: string) => {
  // 網址參數裡的 + 有時會被當成空白
  const binary = atob(value.replace(/ /g, '+'));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

const parseOtpParameters = (buf: Uint8Array): TotpInput | null => {
  let secret: Uint8Array = new Uint8Array();
  let name = '';
  let issuer = '';
  let algorithm = 1;
  let digits = 1;
  let type = TYPE_TOTP;

  for (const f of readFields(buf)) {
    if (f.field === 1 && f.bytes) secret = f.bytes;
    if (f.field === 2 && f.bytes) name = decoder.decode(f.bytes);
    if (f.field === 3 && f.bytes) issuer = decoder.decode(f.bytes);
    if (f.field === 4 && f.varint !== undefined) algorithm = f.varint;
    if (f.field === 5 && f.varint !== undefined) digits = f.varint;
    if (f.field === 6 && f.varint !== undefined) type = f.varint;
  }

  // HOTP（計數型）與 MD5 不支援；0 代表未指定，視為預設值
  if (type === TYPE_HOTP || secret.length === 0) return null;
  if (algorithm !== 0 && !ALGORITHMS[algorithm]) return null;

  return {
    name: composeName(name, issuer),
    secret: base32Encode(secret),
    category: '',
    digits: DIGITS[digits] ?? TOTP_DEFAULTS.digits,
    period: TOTP_DEFAULTS.period,
    algorithm: ALGORITHMS[algorithm] ?? TOTP_DEFAULTS.algorithm,
  };
};

export const parseMigrationUri = (text: string): MigrationResult => {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return { success: false, message: '不是有效的 Google Authenticator 匯出連結' };
  }
  const data = url.searchParams.get('data');
  if (url.protocol !== 'otpauth-migration:' || !data) {
    return { success: false, message: '不是有效的 Google Authenticator 匯出連結' };
  }

  try {
    const items: TotpInput[] = [];
    let skipped = 0;
    let batchSize = 1;
    let batchIndex = 0;

    for (const f of readFields(fromBase64(data))) {
      if (f.field === 1 && f.bytes) {
        const item = parseOtpParameters(f.bytes);
        if (item) items.push(item);
        else skipped++;
      }
      if (f.field === 3 && f.varint !== undefined) batchSize = f.varint;
      if (f.field === 4 && f.varint !== undefined) batchIndex = f.varint;
    }

    if (items.length === 0) {
      return {
        success: false,
        message: skipped > 0 ? '裡面只有 HOTP（計數型）驗證碼，目前不支援' : '這個匯出 QR Code 裡沒有驗證碼',
      };
    }
    return {
      success: true,
      data: items,
      skipped,
      batch: batchSize > 1 ? { index: batchIndex + 1, size: batchSize } : undefined,
    };
  } catch {
    return { success: false, message: '無法解析匯出資料，QR Code 可能不完整' };
  }
};

// ---------- 產生 ----------

// Google Authenticator 只支援 30 秒週期，其他週期的無法匯出到它
export const canExportToGoogle = (item: TotpItem) =>
  (item.period ?? TOTP_DEFAULTS.period) === TOTP_DEFAULTS.period;

const encodeOtpParameters = (item: TotpItem) => {
  const out: number[] = [];
  writeBytesField(out, 1, base32Decode(normalizeSecret(item.secret)));
  writeBytesField(out, 2, encoder.encode(item.name));
  const algorithm = Object.entries(ALGORITHMS).find(([, value]) => value === (item.algorithm ?? TOTP_DEFAULTS.algorithm));
  writeVarintField(out, 4, Number(algorithm?.[0] ?? 1));
  writeVarintField(out, 5, (item.digits ?? TOTP_DEFAULTS.digits) === 8 ? 2 : 1);
  writeVarintField(out, 6, TYPE_TOTP);
  return new Uint8Array(out);
};

/** 產生可讓 Google Authenticator「匯入帳戶」掃描的連結，每 MIGRATION_BATCH_SIZE 筆一張 */
export const buildMigrationUris = (items: TotpItem[]) => {
  const batches: TotpItem[][] = [];
  for (let i = 0; i < items.length; i += MIGRATION_BATCH_SIZE) {
    batches.push(items.slice(i, i + MIGRATION_BATCH_SIZE));
  }
  const batchId = Math.floor(Math.random() * 0x7fffffff);

  return batches.map((batch, index) => {
    const out: number[] = [];
    for (const item of batch) writeBytesField(out, 1, encodeOtpParameters(item));
    writeVarintField(out, 2, 1);
    writeVarintField(out, 3, batches.length);
    writeVarintField(out, 4, index);
    writeVarintField(out, 5, batchId);
    return `otpauth-migration://offline?data=${encodeURIComponent(toBase64(new Uint8Array(out)))}`;
  });
};
