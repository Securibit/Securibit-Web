// RFC 4648 Base32（TOTP 金鑰的標準格式），不輸出結尾的 = 補位
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export const base32Encode = (bytes: Uint8Array) => {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
};

// 傳入前請先 normalizeSecret（大寫、無空白、無 =）
export const base32Decode = (input: string) => {
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (const char of input) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error(`不是 Base32 字元：${char}`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(output);
};
