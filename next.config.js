/** @type {import('next').NextConfig} */

// 全站安全標頭。網站存放 2FA 金鑰，至少要擋掉被別人用 iframe 嵌入騙點擊（clickjacking）
const securityHeaders = [
  // 不允許任何網站用 iframe 嵌入本站（舊瀏覽器看 X-Frame-Options）
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'X-Frame-Options', value: 'DENY' },
  // 不讓瀏覽器猜檔案類型
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // 連到外站時只帶網域，不帶完整網址
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // 只有本站能用相機（掃 QR Code），其他權限一律關閉
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
}

module.exports = nextConfig
