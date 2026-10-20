import { NextRequest, NextResponse } from 'next/server';
import { authenticate, serverError } from '@/lib/server/supabaseAdmin';

// 從 user-agent 粗略解析出「OS · 瀏覽器」
function parseDevice(ua: string): string {
  if (!ua) return '未知裝置';
  let os = '未知系統';
  if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Mac OS X/i.test(ua)) os = 'macOS';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser = '未知瀏覽器';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';
  else if (/Chrome\//i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua)) browser = 'Safari';

  return `${os} · ${browser}`;
}

// 用戶端 IP：優先用 Vercel 設定的 x-real-ip（可信）；沒有時取 x-forwarded-for 的「最後」一段
// （最前面幾段是用戶端自己可以塞的，最後一段才是離我們最近的 proxy 加上的）
function clientIp(req: NextRequest): string {
  const realIp = req.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  const hops = (req.headers.get('x-forwarded-for') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return hops[hops.length - 1] ?? '';
}

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof NextResponse) return auth;

  const ua = req.headers.get('user-agent') ?? '';

  const { error } = await auth.admin
    .from('profiles')
    .update({
      last_login_at: new Date().toISOString(),
      last_login_ip: clientIp(req),
      last_login_device: parseDevice(ua),
    })
    .eq('id', auth.user.id);

  if (error) return serverError('記錄登入失敗', error);
  return NextResponse.json({ success: true });
}
