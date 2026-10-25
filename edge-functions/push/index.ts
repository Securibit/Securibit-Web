// Securibit 推播（Supabase Edge Function：push）
//
// 資料庫有新的通知要推播時，用 pg_net 呼叫這支函式（POST，body 空的 JSON，header x-push-secret）。
// 這支函式：
//   1. 用 push_check_secret 驗證 x-push-secret（不符回 401）
//   2. 用 push_claim 領取要送的通知（每次最多 500 則，連同每則要送的推播 token）
//   3. 用 FCM HTTP v1 送出（Android 頻道 = 通知類別 system / account / feature；重要公告用高優先）
//   4. 用 push_finish 回報送完，並清掉 FCM 說無效的 token
//   還有剩就繼續領，單次最多約 30 秒；沒送完的（標成 sending）資料庫 5 分鐘後會再給一次。
//
// 部署：Supabase Dashboard → Edge Functions → 新增 push → 貼上這個檔案 → 關掉 Verify JWT（改由 x-push-secret 驗證）。
// 環境變數：SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY（Supabase 自動提供）、FCM_SERVICE_ACCOUNT（Firebase 服務帳戶的整個 JSON，
// 在 Edge Functions 的 Secrets 設定）。這個檔案不含任何金鑰。
// 只用 Deno 內建與 Web Crypto，不 import 第三方套件。

type Claimed = {
  id: number;
  category: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  tokens: string[];
};

type ServiceAccount = {
  client_email: string;
  private_key: string;
  project_id: string;
  token_uri?: string;
};

type SendResult = 'ok' | 'bad_token' | 'failed';

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';
const TIME_BUDGET_MS = 25_000; // 單次最多約 30 秒，留時間回報
const CONCURRENCY = 10;

// ---------- 小工具 ----------

function env(name: string): string {
  return (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env.get(name) ?? '';
}

const enc = new TextEncoder();

export function base64url(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? enc.encode(input) : input;
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToDer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN [A-Z ]+-----/g, '')
    .replace(/-----END [A-Z ]+-----/g, '')
    .replace(/\s+/g, '');
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const der = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) der[i] = bin.charCodeAt(i);
  return buf;
}

export function parseServiceAccount(raw: string): ServiceAccount {
  const sa = JSON.parse(raw) as Partial<ServiceAccount>;
  if (!sa || typeof sa.client_email !== 'string' || typeof sa.private_key !== 'string' || typeof sa.project_id !== 'string') {
    throw new Error('FCM_SERVICE_ACCOUNT 格式不正確');
  }
  return sa as ServiceAccount;
}

// Google OAuth 用的 JWT（RS256）：iss = 服務帳戶、scope = FCM、aud = token_uri，一小時有效
export async function signServiceAccountJwt(sa: ServiceAccount, nowSec: number): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: sa.client_email,
    scope: FCM_SCOPE,
    aud: sa.token_uri || DEFAULT_TOKEN_URI,
    iat: nowSec,
    exp: nowSec + 3600,
  };
  const input = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(input)));
  return `${input}.${base64url(sig)}`;
}

// ---------- Google OAuth access token（快取到過期前一分鐘）----------

let cachedToken: { token: string; exp: number } | null = null;
let inflight: Promise<string> | null = null; // 同時送很多則時只換一次 token

async function fetchAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const assertion = await signServiceAccountJwt(sa, now);
  const res = await fetch(sa.token_uri || DEFAULT_TOKEN_URI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
  });
  if (!res.ok) throw new Error(`取得 FCM access token 失敗（${res.status}）`);
  const j = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!j.access_token) throw new Error('取得 FCM access token 失敗');
  cachedToken = { token: j.access_token, exp: now + (typeof j.expires_in === 'number' ? j.expires_in : 3600) };
  return cachedToken.token;
}

async function accessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;
  if (!inflight) inflight = fetchAccessToken(sa).finally(() => { inflight = null; });
  return inflight;
}

// ---------- Supabase RPC（service role）----------

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const headers: Record<string, string> = { apikey: key, 'Content-Type': 'application/json' };
  // 舊式的 service role key 是 JWT；新式的 sb_secret_ 金鑰只放 apikey
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
  const res = await fetch(`${env('SUPABASE_URL').replace(/\/+$/, '')}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`呼叫 ${name} 失敗（${res.status}）`);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

// ---------- FCM ----------

export function fcmMessage(n: Claimed, token: string): Record<string, unknown> {
  return {
    message: {
      token,
      notification: { title: n.title, body: n.body },
      data: { id: String(n.id), category: n.category, type: n.type, link: n.link ?? '' },
      android: {
        priority: n.type === 'announce_important' ? 'high' : 'normal',
        notification: { channel_id: n.category },
      },
    },
  };
}

// FCM 的錯誤：UNREGISTERED、INVALID_ARGUMENT、404 都當作 token 無效
export function isBadToken(status: number, body: unknown): boolean {
  if (status === 404) return true;
  const err = (body as { error?: { status?: string; details?: { errorCode?: string }[] } } | null)?.error;
  const codes = [err?.status, ...(err?.details ?? []).map((d) => d?.errorCode)];
  return codes.includes('UNREGISTERED') || codes.includes('INVALID_ARGUMENT');
}

async function sendOne(sa: ServiceAccount, n: Claimed, token: string): Promise<SendResult> {
  const url = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(sa.project_id)}/messages:send`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await accessToken(sa)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(fcmMessage(n, token)),
    });
    if (res.ok) return 'ok';
    const body = await res.json().catch(() => null);
    if (isBadToken(res.status, body)) return 'bad_token';
    if (res.status === 401) {
      cachedToken = null; // access token 過期或被撤銷：換一個再試
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      continue;
    }
    return 'failed';
  }
  return 'failed';
}

// ---------- 主流程 ----------

async function run(): Promise<{ notifications: number; sent: number; failed: number; bad_tokens: number }> {
  const sa = parseServiceAccount(env('FCM_SERVICE_ACCOUNT'));
  const started = Date.now();
  const stats = { notifications: 0, sent: 0, failed: 0, bad_tokens: 0 };

  while (Date.now() - started < TIME_BUDGET_MS) {
    const batch = (await rpc<Claimed[]>('push_claim', { p_limit: 500 })) ?? [];
    if (batch.length === 0) break;

    const done: number[] = [];
    const bad = new Set<string>();
    const jobs: { n: Claimed; token: string }[] = [];
    for (const n of batch) for (const token of n.tokens ?? []) jobs.push({ n, token });
    const pending = new Map<number, number>(batch.map((n) => [n.id, (n.tokens ?? []).length]));

    let next = 0;
    const worker = async () => {
      while (next < jobs.length && Date.now() - started < TIME_BUDGET_MS) {
        const { n, token } = jobs[next++];
        let result: SendResult;
        try {
          result = await sendOne(sa, n, token);
        } catch {
          result = 'failed';
        }
        if (result === 'ok') stats.sent++;
        else if (result === 'bad_token') { stats.bad_tokens++; bad.add(token); }
        else stats.failed++;
        const left = (pending.get(n.id) ?? 1) - 1;
        pending.set(n.id, left);
        if (left === 0) done.push(n.id);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));

    // 時間到還沒送完的不回報，資料庫 5 分鐘後會再給一次
    stats.notifications += done.length;
    await rpc('push_finish', { p_ids: done, p_bad_tokens: [...bad] });
    if (done.length < batch.length) break;
  }
  return stats;
}

export async function handler(req: Request): Promise<Response> {
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const secret = req.headers.get('x-push-secret') ?? '';
  try {
    if (!secret || !(await rpc<boolean>('push_check_secret', { p_secret: secret }))) {
      return json(401, { error: 'unauthorized' });
    }
  } catch {
    return json(500, { error: 'check_failed' });
  }
  if (!env('FCM_SERVICE_ACCOUNT')) return json(500, { error: 'fcm_not_configured' });

  try {
    return json(200, await run());
  } catch (e) {
    console.error('推播失敗', e instanceof Error ? e.message : e);
    return json(500, { error: 'push_failed' });
  }
}

// Supabase Edge Runtime（Deno）才啟動；本機用 node 測試時只匯入上面的函式
const deno = (globalThis as { Deno?: { serve?: (h: (req: Request) => Promise<Response>) => unknown } }).Deno;
if (deno?.serve) deno.serve(handler);
