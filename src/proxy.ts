import { NextRequest, NextResponse } from 'next/server';

/**
 * 每個頁面請求產生一次性的 nonce，放進 Content-Security-Policy（只允許帶這個 nonce 的 script 執行）。
 * Next.js 會從請求的 CSP header 讀出 nonce，自動加到框架與頁面的 <script> 上；
 * 所以頁面都要動態產生（root layout 讀 headers()），靜態產生的 HTML 不會有 nonce。
 * 其他安全標頭（frame-ancestors、HSTS…）在 next.config.js，API 與靜態檔也會帶到。
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const isDev = process.env.NODE_ENV === 'development';

  // Supabase 的 REST / Auth 與 Realtime（wss）；網址只從環境變數讀，不寫死在程式裡
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const supabaseHost = supabase.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const supabaseSources = supabaseHost ? `https://${supabaseHost} wss://${supabaseHost}` : '';

  const policy = [
    "default-src 'self'",
    // 'strict-dynamic'：帶 nonce 的 script 再載入的 chunk 也允許；開發時 React 需要 eval 還原伺服器端錯誤的堆疊
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    // HeroUI / framer-motion 與伺服器輸出的 style 屬性需要 inline style（style 無法執行程式）
    "style-src 'self' 'unsafe-inline'",
    // 大頭照：Google 帳號照片與本站 /media（上傳的圖片）；QR Code 是 data: / blob:
    "img-src 'self' data: blob: https://*.googleusercontent.com",
    "font-src 'self'",
    `connect-src 'self' ${supabaseSources}`.trim(),
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // 本機開發是 http，不能把請求升級成 https
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', policy);
  return response;
}

export const config = {
  matcher: [
    // 頁面才需要：略過 API、靜態檔、圖片最佳化、/media 圖片與 link 的預先載入
    {
      source: '/((?!api|_next/static|_next/image|media|favicon.ico|apple-touch-icon.png|imgs|robots.txt|sitemap.xml).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
