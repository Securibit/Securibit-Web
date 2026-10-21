import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';

// 只能在 API route（伺服器端）使用：service_role 金鑰切勿外洩到瀏覽器
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

const noSession = { auth: { autoRefreshToken: false, persistSession: false } };

export interface AuthedRequest {
  user: User;
  token: string;
  // service_role：繞過 RLS，只在確認權限後使用
  admin: SupabaseClient;
  // 以呼叫者身分執行（RPC 裡的 auth.uid() 是呼叫者），用來檢查權限
  asUser: SupabaseClient;
}

export const jsonError = (message: string, status: number) => NextResponse.json({ message }, { status });

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

  return { user: data.user, token, admin, asUser };
};
