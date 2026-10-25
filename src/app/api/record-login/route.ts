import { NextRequest, NextResponse } from 'next/server';
import { authenticate, jsonError, serverError } from '@/lib/server/supabaseAdmin';
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

// 每位使用者一小時內最多新增幾筆登入紀錄（擋住一直打這支 API 灌紀錄）
const HOURLY_LIMIT = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof NextResponse) return auth;
  const { admin } = auth;
  const uid = auth.user.id;

  const ua = req.headers.get('user-agent') ?? '';
  const ip = clientIp(req);
  const device = deviceText(ua);
  const now = new Date().toISOString();

  // 同一個 session（access token 的 session_id）只記一筆登入紀錄；重新整理、換分頁再呼叫只更新最後登入
  const sessionId = typeof auth.claims.session_id === 'string' && UUID.test(auth.claims.session_id) ? auth.claims.session_id : null;

  const updateProfile = () =>
    admin
      .from('profiles')
      .update({ last_login_at: now, last_login_ip: ip, last_login_device: device, last_sign_in_time: now })
      .eq('id', uid);

  if (sessionId) {
    const { data: existing, error: existingError } = await admin
      .from('login_history')
      .select('id')
      .eq('user_id', uid)
      .eq('session_id', sessionId)
      .limit(1);
    if (existingError) return serverError('讀取登入紀錄失敗', existingError);
    if ((existing ?? []).length > 0) {
      const { error } = await updateProfile();
      if (error) return serverError('記錄登入失敗', error);
      return NextResponse.json({ success: true, recorded: false });
    }
  }

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await admin
    .from('login_history')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', uid)
    .gte('created_at', hourAgo);
  if (countError) return serverError('讀取登入紀錄失敗', countError);
  if ((count ?? 0) >= HOURLY_LIMIT) return jsonError('登入太頻繁，請稍後再試', 429);

  const { error } = await updateProfile();
  if (error) return serverError('記錄登入失敗', error);

  // 每次登入另外留一筆登入紀錄（login_history）；刪除帳號後仍保留，email 用來辨識是誰
  const { error: historyError } = await admin.from('login_history').insert({
    user_id: uid,
    session_id: sessionId,
    email: auth.user.email ?? null,
    ip: ip || null,
    device,
    user_agent: ua.slice(0, 512) || null,
    provider: loginProvider(auth.user.app_metadata?.provider),
  });

  if (historyError) return serverError('記錄登入紀錄失敗', historyError);

  // 只有真的新增紀錄時才清：一年前的登入紀錄，以及帳號刪除滿一年的託管密文（prune_retention）；
  // 刪不掉只是晚點清，不影響登入
  const { error: pruneError } = await admin.rpc('prune_retention');
  if (pruneError) console.error('清除過期的紀錄失敗', pruneError);

  return NextResponse.json({ success: true, recorded: true });
}
