/** @type {import('next').NextConfig} */

// 全站安全標頭。網站存放 2FA 金鑰，至少要擋掉被別人用 iframe 嵌入騙點擊（clickjacking）
const securityHeaders = [
  // 不允許任何網站用 iframe 嵌入本站（舊瀏覽器看 X-Frame-Options）。
  // 頁面完整的 CSP（含每次請求的 script nonce）由 src/proxy.ts 設定並取代這一條；API 與靜態檔只帶這條
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

// Supabase 專案網址只從環境變數讀，不寫死在程式裡
const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  // 上傳的大頭照與背景圖：/media/<uid>/<檔名> 轉給 Supabase Storage 的公開 bucket「avatars」，
  // 對外的網址都是本站（https://<site>/media/...），換 Supabase 專案也不用改資料庫裡的網址
  async rewrites() {
    if (!supabaseUrl) return [];
    return [{ source: '/media/:path*', destination: `${supabaseUrl}/storage/v1/object/public/avatars/:path*` }];
  },
}

module.exports = nextConfig
