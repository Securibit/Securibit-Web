import { NextRequest, NextResponse } from 'next/server';
import { authenticate, serverError } from '@/lib/server/supabaseAdmin';
import { deviceText } from '@/lib/users/userAgent';

// 用戶端 IP：優先用 Vercel 設定的 x-real-ip（可信）；沒有時取 x-forwarded-for 的「最後」一段
// （最前面幾段是用戶端自己可以塞的，最後一段才是離我們最近的 proxy 加上的）
function clientIp(req: NextRequest): string {
  const realIp = req.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  const hops = (req.headers.get('x-forwarded-for') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return hops[hops.length - 1] ?? '';
}

// 登入方式：auth user 的 app_metadata.provider（google / email…），只留安全的字元
function loginProvider(provider: unknown): string | null {
  return typeof provider === 'string' && /^[a-z0-9_-]{1,32}$/i.test(provider) ? provider.toLowerCase() : null;
}

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof NextResponse) return auth;

  const ua = req.headers.get('user-agent') ?? '';
  const ip = clientIp(req);
  const device = deviceText(ua);

  const { error } = await auth.admin
    .from('profiles')
    .update({
      last_login_at: new Date().toISOString(),
      last_login_ip: ip,
      last_login_device: device,
    })
    .eq('id', auth.user.id);

  if (error) return serverError('記錄登入失敗', error);

  // 每次登入另外留一筆登入紀錄（login_history）；刪除帳號後仍保留，email 用來辨識是誰
  const { error: historyError } = await auth.admin.from('login_history').insert({
    user_id: auth.user.id,
    email: auth.user.email ?? null,
    ip: ip || null,
    device,
    user_agent: ua.slice(0, 512) || null,
    provider: loginProvider(auth.user.app_metadata?.provider),
  });

  if (historyError) return serverError('記錄登入紀錄失敗', historyError);

  // 登入紀錄保留一年：順便刪掉所有人一年前的紀錄（有 created_at 索引）；刪不掉只是晚點清，不影響登入
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  const { error: pruneError } = await auth.admin.from('login_history').delete().lt('created_at', cutoff.toISOString());
  if (pruneError) console.error('清除一年前的登入紀錄失敗', pruneError);
  return NextResponse.json({ success: true });
}
