import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';

// 只能在 API route（伺服器端）使用：service_role 金鑰切勿外洩到瀏覽器
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

const noSession = { auth: { autoRefreshToken: false, persistSession: false } };

// 上傳的大頭照與背景圖放在這個公開 bucket，網址經過本站 /media/ 轉給 Supabase Storage（next.config.js）
export const AVATAR_BUCKET = 'avatars';

// access token 裡用得到的 claim（token 已經由 auth.getUser 向 Supabase 驗證過才解讀）
export interface TokenClaims {
  session_id?: string;
  // 這個 session 的登入方式與時間（秒）；重新登入會加一筆
  amr?: { method?: string; timestamp?: number }[];
}

export interface AuthedRequest {
  user: User;
  token: string;
  claims: TokenClaims;
  // service_role：繞過 RLS，只在確認權限後使用
  admin: SupabaseClient;
  // 以呼叫者身分執行（RPC 裡的 auth.uid() 是呼叫者），用來檢查權限
  asUser: SupabaseClient;
}

export const jsonError = (message: string, status: number) => NextResponse.json({ message }, { status });

/**
 * 給 App 也會呼叫的 API 用：{ error, code? }（同時帶 message，網站的 callApi 讀這個）
 */
export const apiError = (error: string, status: number, code?: string) =>
  NextResponse.json({ error, message: error, ...(code ? { code } : {}) }, { status });

export const GENERIC_ERROR = '伺服器發生錯誤，請稍後再試';

/**
 * 非預期錯誤：原始內容只記在伺服器 log，前端只拿到一般訊息（避免外洩資料表、欄位或 SQL 細節）
 */
export const serverError = (context: string, error: unknown) => {
  console.error(`${context}:`, error);
  return jsonError(GENERIC_ERROR, 500);
};

/**
 * RPC / PostgREST 錯誤：只有函式主動 raise 的業務訊息（code 'P0001'，例如「你還是群組擁有者」）
 * 才以 status 回給前端；其他錯誤一律當成伺服器錯誤
 */
export const rpcError = (context: string, error: { code?: string; message: string }, status: number) => {
  if (error.code === 'P0001') return jsonError(error.message, status);
  return serverError(context, error);
};

/**
 * 驗證 Authorization: Bearer <access_token>，回傳呼叫者與兩種 client；失敗時回傳要直接回給前端的 NextResponse
 */
export const authenticate = async (req: NextRequest): Promise<AuthedRequest | NextResponse> => {
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return jsonError('伺服器未設定 Supabase service role', 500);
  }

  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return jsonError('未提供授權憑證', 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, noSession);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return jsonError('無效的授權憑證', 401);

  const asUser = createClient(supabaseUrl, anonKey, {
    ...noSession,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  return { user: data.user, token, claims: decodeClaims(token), admin, asUser };
};

// JWT 的 payload（base64url JSON）；格式不對時當成沒有 claim
const decodeClaims = (token: string): TokenClaims => {
  try {
    const payload = token.split('.')[1] ?? '';
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

// 刪除帳號這類操作要求「最近 10 分鐘內登入過」
const REAUTH_WINDOW_MS = 10 * 60 * 1000;
export const REAUTH_MESSAGE = '請重新登入以確認是你本人';

/**
 * 這次 session 最後一次登入（amr 裡最新的 timestamp）超過 10 分鐘就回傳 401 reauth_required，
 * 網站與 App 收到後會讓使用者重新登入再試一次；沒問題回傳 null
 */
export const requireRecentLogin = (auth: AuthedRequest): NextResponse | null => {
  const latest = Math.max(
    0,
    ...(Array.isArray(auth.claims.amr) ? auth.claims.amr : []).map((entry) =>
      typeof entry?.timestamp === 'number' ? entry.timestamp * 1000 : 0
    )
  );
  if (Date.now() - latest <= REAUTH_WINDOW_MS) return null;
  return apiError(REAUTH_MESSAGE, 401, 'reauth_required');
};

/**
 * 刪除帳號後順便刪掉上傳過的大頭照與背景圖（avatars/<uid>/）；盡力而為，失敗只記 log
 */
export const removeUserMedia = async (admin: SupabaseClient, uid: string) => {
  try {
    const bucket = admin.storage.from(AVATAR_BUCKET);
    const { data, error } = await bucket.list(uid, { limit: 1000 });
    if (error) throw error;
    const paths = (data ?? []).map((file) => `${uid}/${file.name}`);
    if (paths.length > 0) {
      const { error: removeError } = await bucket.remove(paths);
      if (removeError) throw removeError;
    }
  } catch (error) {
    console.error('刪除使用者上傳的圖片失敗:', error);
  }
};
