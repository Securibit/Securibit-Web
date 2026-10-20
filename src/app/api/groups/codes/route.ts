import { NextRequest, NextResponse } from 'next/server';
import { TOTP } from 'totp-generator';
import { authenticate, jsonError, rpcError, serverError } from '@/lib/server/supabaseAdmin';
import { TOTP_DEFAULTS, TotpAlgorithm } from '@/types/Totp/Totp';
import { GroupCodes } from '@/types/Group/Group';

// 每次都要即時產生驗證碼，不能快取
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 與 src/lib/totp/crud.ts 的 normalizeSecret / isBase32 相同；
// 不直接 import 是因為 crud.ts 會帶進瀏覽器用的 Supabase client
const normalizeSecret = (secret: string) => secret.replace(/[\s-]/g, '').toUpperCase().replace(/=+$/, '');
const isBase32 = (input: string) => /^[A-Z2-7]+=*$/.test(input);

interface AccountParams {
  id: string;
  digits: number | null;
  period: number | null;
  algorithm: TotpAlgorithm | null;
}

// 同 src/lib/totp/otp.ts 的 generateOtp：金鑰不合法時回傳 null
const generate = async (secret: string, params: AccountParams, timestamp: number) => {
  const normalized = normalizeSecret(secret);
  if (!isBase32(normalized)) return null;
  try {
    const result = await TOTP.generate(normalized, {
      digits: params.digits ?? TOTP_DEFAULTS.digits,
      period: params.period ?? TOTP_DEFAULTS.period,
      algorithm: params.algorithm ?? TOTP_DEFAULTS.algorithm,
      timestamp,
    });
    return result.otp;
  } catch {
    return null;
  }
};

/**
 * 只有「查看驗證碼」、沒有「查看金鑰」的成員，由伺服器產生目前與下一組動態碼（金鑰不會離開伺服器）。
 * body：{ groupId }；回傳 { now, codes: { [accountId]: { code, next } } }
 */
export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json().catch(() => null)) as { groupId?: unknown } | null;
  const groupId = body?.groupId;
  if (typeof groupId !== 'string' || !UUID.test(groupId)) {
    return jsonError('群組 ID 格式錯誤', 400);
  }

  // 以呼叫者身分查詢看得到哪些驗證碼（權限檢查在資料庫）
  const { data: permitted, error: permittedError } = await auth.asUser.rpc('group_codes_permitted', { gid: groupId });
  if (permittedError) return rpcError('group_codes_permitted 失敗', permittedError, 403);

  const ids = ((permitted ?? []) as string[]).filter(Boolean);
  const now = Date.now();
  const noStore = { headers: { 'Cache-Control': 'no-store' } };
  if (ids.length === 0) {
    return NextResponse.json<GroupCodes>({ now, codes: {} }, noStore);
  }

  // 確認權限後才用 service role 讀金鑰
  const [secretsResult, accountsResult] = await Promise.all([
    auth.admin.from('totp_secrets').select('account_id, secret').in('account_id', ids),
    auth.admin.from('totp_accounts').select('id, digits, period, algorithm').in('id', ids),
  ]);
  if (secretsResult.error || accountsResult.error) {
    return serverError('讀取驗證碼失敗', secretsResult.error ?? accountsResult.error);
  }

  const params = new Map(((accountsResult.data ?? []) as AccountParams[]).map((row) => [row.id, row]));
  const secrets = (secretsResult.data ?? []) as { account_id: string; secret: string }[];

  const entries = await Promise.all(
    secrets.map(async ({ account_id, secret }) => {
      const account = params.get(account_id);
      if (!account) return null;
      const period = account.period ?? TOTP_DEFAULTS.period;
      const [code, next] = await Promise.all([
        generate(secret, account, now),
        generate(secret, account, now + period * 1000),
      ]);
      return [account_id, { code, next }] as const;
    })
  );

  const codes: GroupCodes['codes'] = {};
  for (const entry of entries) {
    if (entry) codes[entry[0]] = entry[1];
  }

  return NextResponse.json<GroupCodes>({ now, codes }, noStore);
}
